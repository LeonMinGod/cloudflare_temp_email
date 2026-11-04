import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleGame } from './game.js';
import { handleClaimCode, handleClaimVerify, handleLeaderboard, handleLegacyClaim } from './claim.js';
import { securityConfig, operationProbe } from './security.js';
import { staticResponse } from './static.js';
import { handlePoolStatus } from './pool-status.js';
export { GameRun } from './game.js';

const RETIRED_HERO = /^\/(?:home-hero-(?:desktop|mobile)-v[23]\.webp|image|img|bg|wallpaper\.png)$/;

const site = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (RETIRED_HERO.test(url.pathname)) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (url.pathname === '/api/leaderboard') return handleLeaderboard(request, env);
    if (url.pathname === '/api/ops/pool-export') {
      if (request.method !== 'POST' || !await operationProbe(request, env)) return new Response(null, { status: 403 });
      const stub = env.GAME_RUNS.get(env.GAME_RUNS.idFromName('pool-status-cache-v2'));
      return stub.fetch('https://pool.internal/pool-status', { method: 'POST', body: JSON.stringify({ kind: 'export', peek: true }) });
    }
    // Fixed read-only status routes are deliberately outside claim/game limits.
    if (['/api/pool-status', '/api/pool-status/quota'].includes(url.pathname)) return handlePoolStatus(request, env);
    if (url.pathname === '/api/free-token/security') return securityConfig(request, env);
    if (url.pathname === '/api/free-token/status') {
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (!['GET', 'HEAD'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
      const open = Boolean(env.FREE_TOKEN_RENDER_KEY);
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({ open, message: open ? '' : '暂未开放' }), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const page = staticResponse(request);
    if (page) return page;
    if (['/api/free-token/game/start', '/api/free-token/game/progress', '/api/free-token/game/finish'].includes(url.pathname)) {
      return handleGame(request, env);
    }
    if (url.pathname === '/api/free-token/claim') return handleLegacyClaim(request, env);
    if (url.pathname === '/api/free-token/claim/code') return handleClaimCode(request, env);
    if (url.pathname === '/api/free-token/claim/verify') return handleClaimVerify(request, env);
    return env.ASSETS.fetch(request);
  }
};

export default site;

// Service bindings target this entrypoint to invoke page handling before existing assets.
export class Site extends WorkerEntrypoint {
  fetch(request) { return site.fetch(request, this.env); }
}
