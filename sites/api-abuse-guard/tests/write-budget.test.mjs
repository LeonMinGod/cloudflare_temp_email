import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes } from 'node:crypto';
import worker, { AbuseState } from '../src/index.mjs';
import { applyAuthorize, limitsFromEnv } from '../src/authorize.mjs';

function database() {
  const db = new DatabaseSync(':memory:');
  let writes = 0;
  const sql = { exec(query, ...params) {
    const statement = db.prepare(query);
    if (/^\s*SELECT/i.test(query)) return statement.all(...params);
    const result = statement.run(...params); writes += Number(result.changes); return [];
  }};
  const ctx = { storage: { sql, transactionSync: fn => {
    db.exec('BEGIN');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }, getAlarm: async () => Date.now() + 3600000, setAlarm: async () => { writes++; } }};
  const state = new AbuseState(ctx, {});
  return { sql, state, ctx, writes: () => writes, close: () => db.close() };
}

test('unknown/revoked keys deny without SQLite; active keys never bypass failed quota storage', async () => {
  let calls = 0, record = null;
  const secret = 'test-secret', env = { SERVICE_SECRET: secret, KEYS: { get: async () => record }, STATE: {
    idFromName: name => name, get: () => ({ fetch: async () => { calls++; throw new Error('storage unavailable'); } }),
  }};
  const request = () => {
    const body = JSON.stringify({ key_sha256: 'a'.repeat(64), path: '/v1/models' });
    const stamp = String(Date.now()), nonce = randomBytes(16).toString('hex');
    const mac = createHmac('sha256', secret).update(`${stamp}\n${nonce}\nPOST\n/v1/authorize\n${body}`).digest('hex');
    return new Request('https://guard/v1/authorize', { method: 'POST', body, headers: { 'X-CPA-Guard': `${stamp}:${nonce}:${mac}` } });
  };
  let response = await worker.fetch(request(), env);
  assert.equal((await response.json()).reason, 'unknown_key'); assert.equal(calls, 0);
  record = JSON.stringify({ status: 'revoked' });
  response = await worker.fetch(request(), env);
  assert.equal((await response.json()).reason, 'revoked'); assert.equal(calls, 0);
  record = JSON.stringify({ status: 'active' });
  response = await worker.fetch(request(), env);
  assert.equal(response.status, 503); assert.equal(calls, 1);
});

test('read-only probes and repeated gateway-denied retries write zero rows while bans remain durable', async () => {
  const db = database();
  const call = async (body, admin = false) => (await db.state.fetch(new Request('https://internal/' + (admin ? 'admin' : 'rpc'), {
    method: 'POST', body: JSON.stringify({ ...body, nonce: randomBytes(16).toString('hex') }),
  }))).json();
  try {
    await call({ action: 'enable' }, true);
    let before = db.writes();
    for (let i = 0; i < 100; i++) assert.equal((await call({ action: 'check', ip: '8.8.8.8' })).action, 'allow');
    for (let i = 0; i < 20; i++) await call({ action: 'status' }, true);
    assert.equal(db.writes() - before, 0);
    for (let i = 0; i < 20; i++) await call({ action: 'observe', ip: '8.8.8.8', status: 404, unknownApiPath: true, pathHash: 'scan' });
    assert.equal((await call({ action: 'check', ip: '8.8.8.8' })).action, 'block');
    before = db.writes();
    for (let i = 0; i < 100; i++) {
      assert.equal((await call({ action: 'check', ip: '8.8.8.8' })).action, 'block');
      await call({ action: 'observe', ip: '8.8.8.8', status: 403, gatewayDenied: true });
    }
    assert.equal(db.writes() - before, 0);
    const status = await call({ action: 'status' }, true);
    assert.equal(status.peers[0].counters['404'], 20);
    assert.equal(status.peers[0].bans.length, 1);
  } finally { db.close(); }
});

test('successful key/email accounting and replay remain durable; denials and clock rollovers do not write', () => {
  const db = database(), now = Date.now();
  const limits = { ...limitsFromEnv(), keyPerMinute: 1, keyPerDay: 1 };
  const base = { hash: 'a'.repeat(64), email: 'test@example.invalid', active: true, limits, now };
  try {
    const request = { ...base, nonce: randomBytes(16).toString('hex') };
    assert.equal(applyAuthorize(db.sql, request).allow, true);
    let before = db.writes();
    assert.equal(applyAuthorize(db.sql, request).allow, true);
    assert.equal(db.writes() - before, 0, 'Replay must not double-consume key/email quotas');
    for (let i = 0; i < 100; i++) {
      const decision = applyAuthorize(db.sql, { ...base, now: now + i * 1000, nonce: randomBytes(16).toString('hex') });
      assert.equal(decision.allow, false);
    }
    assert.equal(db.writes() - before, 0, 'Denials must not persist even when the minute rolls over');
    assert.equal(db.sql.exec("SELECT day_count,allowed FROM quotas WHERE kind='key'")[0].day_count, 1);
    assert.equal(db.sql.exec("SELECT day_count FROM quotas WHERE kind='email'")[0].day_count, 1);
    assert.equal(applyAuthorize(db.sql, { ...base, active: false, reason: 'revoked', nonce: randomBytes(16).toString('hex') }).reason, 'revoked');
    assert.equal(db.writes() - before, 0);
    assert.equal(applyAuthorize(db.sql, { ...base, now: now + 86400001, nonce: randomBytes(16).toString('hex') }).allow, true);
    assert(db.writes() > before, 'A genuinely consumed allowance must persist');
  } finally { db.close(); }
});

test('budget conservation stops diagnostic writes while malicious evidence still produces the original ban', async () => {
  const db = database(), day = new Date().toISOString().slice(0, 10);
  const call = async body => (await db.state.fetch(new Request('https://internal/rpc', {
    method: 'POST', body: JSON.stringify({ ...body, nonce: randomBytes(16).toString('hex') }),
  }))).json();
  try {
    db.sql.exec('INSERT INTO guard_write_budget VALUES (?,?)', day, 72000);
    assert.equal(db.state.budget.level(), 'conserve');
    let before = db.writes();
    for (let i = 0; i < 100; i++) await call({ action: 'observe', ip: '8.8.8.8', status: 503 });
    assert.equal(db.writes() - before, 0, 'Diagnostic server failures must not consume the protected budget');
    for (let i = 0; i < 20; i++) await call({ action: 'observe', ip: '8.8.8.8', status: 404, unknownApiPath: true });
    const row = db.sql.exec('SELECT state FROM peers WHERE ip=?', '8.8.8.8')[0];
    assert.equal(JSON.parse(row.state).bans.length, 1);
    assert(db.writes() > before, 'Security evidence must remain durable in conservation mode');
    const replacement = new AbuseState({ storage: {
      sql: db.sql, transactionSync: fn => fn(), getAlarm: async () => 1, setAlarm: async () => {},
    } }, {});
    assert.equal(replacement.budget.level(), 'conserve', 'Budget must survive object eviction');
  } finally { db.close(); }
});

test('budget KV publication survives 100 object evictions and preserves the separate IP configuration', async () => {
  const db=database(),writes=[],env={KEYS:{put:async(key,value)=>writes.push({key,value:JSON.parse(value)})}};
  let signal={schema:1,day:'2026-11-05',level:'critical',reserved_guard_rows:500736};
  const fresh=()=>{const state=new AbuseState(db.ctx,env);state.budget.signal=()=>({...signal});return state;};
  try{
    const policy=JSON.stringify({enabled:true,allowlist:['8.8.8.8']});
    db.sql.exec('INSERT INTO control (id,value) VALUES (1,?)',policy);
    for(let i=0;i<100;i++)await fresh().publishBudget();
    assert.equal(writes.length,1,'Cold starts must reuse the durable publication marker');
    assert.equal(writes[0].key,'ops:do-write-budget:v1');
    assert.equal(db.sql.exec('SELECT value FROM control WHERE id=1')[0].value,policy);
    signal={...signal,day:'2026-11-06',level:'normal',reserved_guard_rows:1024};
    await fresh().publishBudget();
    signal={...signal,level:'warning',reserved_guard_rows:50176};await fresh().publishBudget();
    signal={...signal,level:'conserve',reserved_guard_rows:70656};await fresh().publishBudget();
    signal={...signal,level:'critical',reserved_guard_rows:90112};await fresh().publishBudget();
    for(let i=0;i<100;i++)await fresh().publishBudget();
    assert.equal(writes.length,5,'One successful KV write per day/level, including next-day recovery');
  }finally{db.close();}
});

test('overlapping budget publications share one KV write and failed writes remain retryable', async () => {
  const db=database();let calls=0,release;
  const gate=new Promise(resolve=>release=resolve);
  const state=new AbuseState(db.ctx,{KEYS:{put:async()=>{calls++;await gate;}}});
  state.budget.signal=()=>({day:'2026-11-05',level:'normal'});
  try{
    const pending=Array.from({length:50},()=>state.publishBudget());
    assert.equal(calls,1);release();await Promise.all(pending);assert.equal(calls,1);
    let fail=true;
    const replacement=new AbuseState(db.ctx,{KEYS:{put:async()=>{calls++;if(fail)throw new Error('temporary failure');}}});
    replacement.budget.signal=()=>({day:'2026-11-06',level:'normal'});
    await replacement.publishBudget();
    assert.equal(db.sql.exec('SELECT value FROM control WHERE id=2')[0].value,'2026-11-05:normal');
    fail=false;await replacement.publishBudget();await replacement.publishBudget();
    assert.equal(calls,3,'One failed attempt and one successful retry; no false success marker');
    assert.equal(db.sql.exec('SELECT value FROM control WHERE id=2')[0].value,'2026-11-06:normal');
  }finally{db.close();}
});
