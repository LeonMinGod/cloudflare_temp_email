import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { Miniflare } from 'miniflare';

test('all main and free-token pages include the shared Christmas skin engine and preserve classic assets', async () => {
  const pages = [
    'public/index.html',
    'public/free-token/index.html',
    'public/free-token/choose/index.html',
    'public/free-token/claim/index.html',
    'public/free-token/verify/index.html',
    'public/free-token/game/index.html',
    'public/free-token/snake/index.html',
    'public/model-status/index.html',
    'public/hall-of-shame/index.html',
  ];
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    assert.match(html, /\/theme-xmas-v2\.css/, `${page} missing theme-xmas-v2.css`);
    assert.match(html, /\/theme-xmas-v2\.js/, `${page} missing theme-xmas-v2.js`);
  }

  const home = await readFile('public/index.html', 'utf8');
  assert.match(home, /id="skin-toggle"/);
  assert.match(home, /home-hero-desktop-v7\.webp/);
  assert.match(home, /xmas-home-desktop-v1\.webp/);
  assert.match(home, /xmas-home-mobile-v1\.webp/);
  assert.match(home, /xmas-orb-v1\.webp/);

  const token = await readFile('public/free-token/index.html', 'utf8');
  assert.match(token, /welcome-desktop-v5\.webp/);
  assert.match(token, /xmas-welcome-desktop-v1\.webp/);
  assert.match(token, /xmas-welcome-mobile-v1\.webp/);
  assert.match(token, /xmas-token-v1\.webp/);
});

test('built Worker stays well under compressed bundle budget and serves all Christmas assets with immutable caching', async () => {
  const dist = await readFile('dist/index.js');
  const gzipMb = gzipSync(dist).length / (1024 * 1024);
  assert.ok(gzipMb < 9.5, `Expected gzipped dist/index.js < 9.5 MB, got ${gzipMb.toFixed(2)} MB`);

  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/index.js',
    compatibilityDate: '2025-06-01',
    durableObjects: { GAME_RUNS: { className: 'GameRun', useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response('not found', { status: 404 }) },
  });

  try {
    const paths = [
      ['/theme-xmas-v2.css', 'text/css'],
      ['/theme-xmas-v2.js', 'application/javascript'],
      ['/xmas-home-desktop-v1.webp', 'image/webp'],
      ['/xmas-home-mobile-v1.webp', 'image/webp'],
      ['/assets/xmas-orb-v1.webp', 'image/webp'],
      ['/assets/xmas-portal-frame-v1.webp', 'image/webp'],
      ['/free-token/xmas-welcome-desktop-v1.webp', 'image/webp'],
      ['/free-token/xmas-welcome-mobile-v1.webp', 'image/webp'],
      ['/free-token/xmas-token-v1.webp', 'image/webp'],
      ['/free-token/choose-v4.css', 'text/css'],
      ['/free-token/snake/style-v1.css', 'text/css'],
      ['/free-token/snake/engine-v1.mjs', 'application/javascript'],
      ['/free-token/snake/app-v1.mjs', 'application/javascript'],
      ['/free-token/snake/style-v2.css', 'text/css'],
      ['/free-token/snake/engine-v2.mjs', 'application/javascript'],
      ['/free-token/snake/app-v2.mjs', 'application/javascript'],
      ['/free-token/snake/engine-v3.mjs', 'application/javascript'],
      ['/free-token/snake/app-v3.mjs', 'application/javascript'],
      ['/free-token/snake/snake-atlas-classic-v1.webp', 'image/webp'],
      ['/free-token/snake/snake-atlas-xmas-v1.webp', 'image/webp'],
      ['/free-token/verify-flow-v4.mjs', 'application/javascript'],
      ['/free-token/verify-v4.mjs', 'application/javascript'],
      ['/hero-safe-v1.css', 'text/css'],
    ];
    for (const [path, mimePrefix] of paths) {
      const res = await mf.dispatchFetch('https://leonmingod.com' + path);
      assert.equal(res.status, 200, `${path} should return 200`);
      assert.ok((res.headers.get('Content-Type') || '').startsWith(mimePrefix), `${path} mime`);
      assert.match(res.headers.get('Cache-Control') || '', /immutable/, `${path} cache`);
    }
  } finally {
    await mf.dispose();
  }
});
