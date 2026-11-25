import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

// One scheduler covers both databases and every async storage transaction.
// Reentrant calls from a DO may use KV without deadlocking or releasing a txn.
export class Scheduler {
  #tail = Promise.resolve(); #context = new AsyncLocalStorage();
  async run(fn) {
    const context = this.#context.getStore();
    if (context?.scheduler === this && context.active) return fn();
    let release; const previous = this.#tail;
    this.#tail = new Promise(resolve => { release = resolve; });
    await previous;
    const token = {scheduler:this,active:true};
    try { return await this.#context.run(token, fn); } finally { token.active=false;release(); }
  }
}

export class Store {
  constructor(path, scheduler = new Scheduler()) {
    this.scheduler = scheduler; this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kv(name TEXT PRIMARY KEY,value BLOB NOT NULL,expiration INTEGER,metadata TEXT);
      CREATE TABLE IF NOT EXISTS objects(scope TEXT NOT NULL,name TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(scope,name));
      CREATE TABLE IF NOT EXISTS alarms(scope TEXT PRIMARY KEY,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS object_names(name TEXT PRIMARY KEY,scope TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) { return this.scheduler.run(async () => {
    this.db.exec('SAVEPOINT storage_txn');
    try { const value = await fn(); this.db.exec('RELEASE storage_txn'); return value; }
    catch (error) { this.db.exec('ROLLBACK TO storage_txn; RELEASE storage_txn'); throw error; }
  }); }
  scopeFor(name, legacy = {}) {
    const existing = this.db.prepare('SELECT scope FROM object_names WHERE name=?').get(name);
    if (existing) return existing.scope;
    const candidate = legacy[name];
    const imported = typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate) && this.db.prepare('SELECT 1 FROM objects WHERE scope=? LIMIT 1').get(candidate);
    const scope = imported ? candidate : 'local:' + createHash('sha256').update(name).digest('hex');
    this.db.prepare('INSERT INTO object_names VALUES (?,?)').run(name, scope);
    return scope;
  }
  storage(scope) {
    const store = this, db = this.db, run = fn => this.scheduler.run(fn);
    const storage = {
      get: key => run(() => {
        if (Array.isArray(key)) return new Map(key.map(k => [k, storage.read(k)]).filter(([,v]) => v !== undefined));
        return storage.read(key);
      }),
      read(key) { const row = db.prepare('SELECT value FROM objects WHERE scope=? AND name=?').get(scope,key); return row ? JSON.parse(row.value) : undefined; },
      put: (key,value) => run(() => {
        const entries = typeof key === 'object' ? Object.entries(key) : [[key,value]];
        const query = db.prepare('INSERT INTO objects VALUES (?,?,?) ON CONFLICT(scope,name) DO UPDATE SET value=excluded.value');
        for (const [name,item] of entries) query.run(scope,name,JSON.stringify(item));
      }),
      delete: keys => run(() => {
        let changes=0; for (const key of Array.isArray(keys)?keys:[keys]) changes += Number(db.prepare('DELETE FROM objects WHERE scope=? AND name=?').run(scope,key).changes);
        return Array.isArray(keys)?changes:changes>0;
      }),
      deleteAll: () => run(() => { db.prepare('DELETE FROM objects WHERE scope=?').run(scope); db.prepare('DELETE FROM alarms WHERE scope=?').run(scope); }),
      list: () => run(() => new Map(db.prepare('SELECT name,value FROM objects WHERE scope=? ORDER BY name').all(scope).map(r=>[r.name,JSON.parse(r.value)]))),
      transaction: fn => store.transaction(() => fn(storage)),
      getAlarm: () => run(() => db.prepare('SELECT at FROM alarms WHERE scope=?').get(scope)?.at ?? null),
      setAlarm: at => run(() => db.prepare('INSERT INTO alarms VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET at=excluded.at').run(scope,Number(at))),
      deleteAlarm: () => run(() => db.prepare('DELETE FROM alarms WHERE scope=?').run(scope)),
    };
    return storage;
  }
  kv() {
    const db=this.db, run=fn=>this.scheduler.run(fn);
    return {
      get: (key,type='text') => run(() => {
        const row=db.prepare('SELECT value FROM kv WHERE name=? AND (expiration IS NULL OR expiration>?)').get(key,Math.floor(Date.now()/1000));
        if(!row)return null;
        const bytes=Buffer.from(row.value);type=typeof type==='object'?type.type:type;
        if(type==='arrayBuffer')return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        if(type==='json')return JSON.parse(bytes.toString());
        if(type==='stream')return new Response(bytes).body;
        return bytes.toString();
      }),
      put: (key,value,options={}) => run(async () => {
        const bytes=typeof value==='string'?Buffer.from(value):value instanceof ReadableStream?Buffer.from(await new Response(value).arrayBuffer()):Buffer.from(value);
        const expiration=options.expiration ?? (options.expirationTtl ? Math.floor(Date.now()/1000)+options.expirationTtl : null);
        db.prepare('INSERT INTO kv VALUES (?,?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,expiration=excluded.expiration,metadata=excluded.metadata').run(key,bytes,expiration,options.metadata===undefined?null:JSON.stringify(options.metadata));
      }),
      delete: key=>run(()=>db.prepare('DELETE FROM kv WHERE name=?').run(key)),
      list: ({prefix='',cursor='',limit=1000}={})=>run(()=>{
        const rows=db.prepare('SELECT name,expiration,metadata FROM kv WHERE name>? AND substr(name,1,?)=? AND (expiration IS NULL OR expiration>?) ORDER BY name LIMIT ?').all(cursor,prefix.length,prefix,Math.floor(Date.now()/1000),limit+1);
        const more=rows.length>limit;const keys=rows.slice(0,limit).map(r=>({name:r.name,...(r.expiration?{expiration:r.expiration}:{}),...(r.metadata?{metadata:JSON.parse(r.metadata)}:{})}));
        return {keys,list_complete:!more,cursor:more?keys.at(-1).name:''};
      }),
    };
  }
}

export class SqlStorage {
  constructor(path) { this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000'); }
  exec(query,...params) {
    const statement=this.db.prepare(query);
    // SQLite accepts DDL, SELECT, PRAGMA and mutations through all(); changes()
    // is read only for DML so CREATE/SELECT never inherit a previous mutation.
    const rows=statement.all(...params);
    const mutation=/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query);
    rows.rowsWritten=mutation?Number(this.db.prepare('SELECT changes() AS n').get().n):0;
    rows.toArray=()=>[...rows]; return rows;
  }
  transactionSync(fn) {
    this.db.exec('SAVEPOINT guard_txn');
    try { const value=fn(); if(value?.then)throw Error('Async callback in sync transaction');this.db.exec('RELEASE guard_txn');return value; }
    catch(error){this.db.exec('ROLLBACK TO guard_txn; RELEASE guard_txn');throw error;}
  }
  close(){this.db.close();}
}
