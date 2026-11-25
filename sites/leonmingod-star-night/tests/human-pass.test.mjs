import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { verifyHuman, humanVerifiedUntil, securityConfig } from '../src/security.js';

const env = { FREE_TOKEN_TURNSTILE_SECRET: 'test-human-secret' };
const TEST_ENC_SECRET = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
const origin = 'https://leonmingod.com';
function request(cookie = '', host = origin, ua = 'mobile-browser', ip = '192.0.2.1') {
  return new Request(host + '/api/free-token/security', { headers: { Cookie: cookie, 'User-Agent': ua, 'CF-Connecting-IP': ip } });
}
test('one real verification grants a fixed two-hour signed browser pass across both paths/hosts', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ success: true, hostname: 'leonmingod.com', action: 'game_start' }); };
  try {
    const headers = new Headers();
    assert.equal(await verifyHuman(request(), env, 'single-use-token', 'game_start', headers), null);
    const setCookie = headers.get('Set-Cookie'), cookie = setCookie.split(';')[0];
    for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=7200', 'Path=/api/free-token', 'Domain=leonmingod.com']) assert.ok(setCookie.includes(attribute));
    const expires = await humanVerifiedUntil(request(cookie), env);
    assert.ok(expires > Date.now() + 7198000 && expires <= Date.now() + 7200000);
    const trusted = request(cookie, 'https://www.leonmingod.com', 'mobile-browser', '198.51.100.8');
    assert.equal(await humanVerifiedUntil(trusted, env), expires, 'Apex/www and mobile IP changes share verification');
    const repeatedHeaders = new Headers();
    assert.equal(await verifyHuman(trusted, env, '', 'oath_claim', repeatedHeaders), null);
    assert.equal(calls, 1, 'No reuse of the Cloudflare single-use token');
    assert.equal(repeatedHeaders.has('Set-Cookie'), false, 'Visits cannot extend the fixed expiry');
    assert.equal(await humanVerifiedUntil(trusted, env, expires - 1), expires);
    assert.equal(await humanVerifiedUntil(trusted, env, expires), 0);
    assert.equal(await humanVerifiedUntil(trusted, env, expires - 7200000 - 31000), 0);
    for (const invalid of [request(), request(cookie + '0'), request(cookie.replace('v1.', 'v2.')), request(cookie, origin, 'other-browser'), request(cookie, 'https://other.example'), request(cookie + '; ' + cookie)]) {
      assert.equal(await humanVerifiedUntil(invalid, env), 0);
    }
    assert.equal(await humanVerifiedUntil(trusted, { FREE_TOKEN_TURNSTILE_SECRET: 'rotated-secret' }), 0);
    assert.equal(await humanVerifiedUntil(trusted, {}), 0);
    const config = await securityConfig(trusted, env);
    assert.equal(config.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await config.json(), { siteKey: '', local: false, required: false, verifiedUntil: expires });
    assert.equal((await (await securityConfig(request(), env)).json()).required, true);
  } finally { globalThis.fetch = original; }
});

test('deployed Worker reuses one human pass while oath issues its separate claim grant', async () => {
  let calls = 0;
  const used = new Set();
  const mf = new Miniflare({ modules: true, scriptPath: 'dist/index.js', compatibilityDate: '2025-04-01',
    bindings: { ...env, FREE_TOKEN_RENDER_KEY: 'test-reward-placeholder', KEY_ENC_SECRET: TEST_ENC_SECRET },
    durableObjects: { GAME_RUNS: { className: 'GameRun', useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response('Not found', { status: 404 }) },
    outboundService: async req => {
      assert.equal(req.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      calls++; const token = new URLSearchParams(await req.text()).get('response');
      const success = token === 'test-start' && !used.has(token); used.add(token);
      return Response.json({ success, hostname: 'leonmingod.com', action: 'game_start' });
    }
  });
  const send = (path, body, cookie = '', host = origin) => mf.dispatchFetch(host + '/api/free-token/' + path, {
    method: 'POST', headers: { Origin: host, 'Content-Type': 'application/json', 'User-Agent': 'mobile-browser', Cookie: cookie }, body: JSON.stringify(body)
  });
  try {
    const first = await send('game/start', { humanToken: 'test-start' }); assert.equal(first.status, 200);
    const cookies = first.headers.getSetCookie(); assert.equal(cookies.length, 2);
    const pass = cookies.find(v => v.startsWith('__Secure-lmg_human=')).split(';')[0];
    const game = cookies.find(v => v.startsWith('lmg_game=')).split(';')[0];
    assert.ok(pass && game); const run = await first.json();
    for (const host of [origin, 'https://www.leonmingod.com']) {
      const config = await mf.dispatchFetch(host + '/api/free-token/security', { headers: { Cookie: pass, 'User-Agent': 'mobile-browser' } });
      assert.equal((await config.json()).required, false);
      const restart = await send('game/start', {}, pass, host); assert.equal(restart.status, 200);
      assert.equal(restart.headers.getSetCookie().length, 1, 'No rolling trust renewal');
      assert.equal((await send('claim', { oath: '义父', confirmed: true }, pass, host)).status, 200);
    }
    assert.equal(calls, 1);
    assert.equal((await send('claim', { oath: 'wrong', confirmed: true }, pass)).status, 400);
    assert.equal((await send('game/finish', { id: run.id, receipt: run.receipt }, pass + '; ' + game)).status, 400, 'Trust alone never wins the game');
    const directOath = await send('claim', { oath: '义父', confirmed: true }, pass + '0');
    assert.equal(directOath.status, 200, 'Oath itself does not trigger another Cloudflare challenge');
    assert.match(directOath.headers.get('Set-Cookie'),/__Secure-lmg_claim=/);
    assert.equal((await send('game/start', {})).status, 403, 'Clearing cookies requires verification');
    assert.equal((await send('game/start', { humanToken: 'test-start' })).status, 403, 'Raw Turnstile tokens remain single-use');
    const beforeOath = calls;
    const oath = await send('claim', { oath: '义父', confirmed: true });
    assert.equal(oath.status, 200); assert.equal(oath.headers.getSetCookie().length, 1);
    assert.match(oath.headers.getSetCookie()[0],/__Secure-lmg_claim=/);
    assert.equal(calls,beforeOath,'Oath never consumes another Turnstile token');
    let limited;
    for (let i = 0; i < 25; i++) { limited = await send('game/start', {}, pass); if (limited.status === 429) break; }
    assert.equal(limited.status, 429, 'Trusted browsers still have rate limits');
  } finally { await mf.dispose(); }
});
