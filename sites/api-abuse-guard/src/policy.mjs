// Pure, clock-injected policy. Origin status and gateway denials are distinct.
export const POLICY = Object.freeze({ shortWindow: 300000, shortCount: 20, shortBan: 3600000,
  longWindow: 600000, longCount: 40, longBan: 86400000, repeatWindow: 86400000,
  repeatCount: 3, repeatBan: 604800000, dailyWindow: 86400000, dailyCount: 30, dailyBan: 86400000, retention: 2592000000, sharedDelay: 30000 });

export function initialState() {
  return { events: [], bans: [], active: null, counters: {}, sharedUntil: 0, throttleUntil: 0, backoffUntil: 0, suppressed: 0, credentialThrottles: {} };
}
export function metrics(state, now) {
  const windows={};
  for(const [name,span] of [['minute',60000],['fiveMinutes',300000],['tenMinutes',600000],['day',86400000]]){
    const events=state.events.filter(e=>e.at>now-span),statuses={};
    for(const e of events){const key=e.status>=500?'5xx':String(e.status);statuses[key]=(statuses[key]||0)+1;}
    windows[name]={sampledRequests:events.length,statuses,distinctUnknownPaths:new Set(events.filter(e=>e.reason==='unknown_api_path').map(e=>e.path)).size};
  }
  return windows;
}
export function prune(state, now) {
  state.events = state.events.filter(e => e.at > now - POLICY.dailyWindow);
  state.bans = state.bans.filter(e => e.at > now - POLICY.retention);
  for(const [key,until] of Object.entries(state.credentialThrottles || {}))if(until<=now)delete state.credentialThrottles[key];
  if (state.active && state.active.until <= now) state.active = null;
  return state;
}

export function check(state, now, { trusted = false, exempt = false, credentialHash = '' } = {}) {
  prune(state, now);
  if (exempt) return { action: 'allow' };
  // A verified browser/validated credential proves a legitimate user on a shared
  // address. Never accept a client-supplied boolean or unverified API key here.
  if (trusted) {
    state.sharedUntil = now + POLICY.repeatWindow;
    const until = state.credentialThrottles?.[credentialHash] || 0;
    return until > now ? {action:'throttle',retryAfter:Math.ceil((until-now)/1000),until} : {action:'allow'};
  }
  if (state.active) {
    if (state.sharedUntil > now) return { action: 'throttle', retryAfter: 30, until: now + 30000 };
    return { action: 'block', retryAfter: Math.ceil((state.active.until - now) / 1000), until: state.active.until, reason: state.active.reason };
  }
  if (state.throttleUntil > now) return { action: 'throttle', retryAfter: Math.ceil((state.throttleUntil - now) / 1000), until: state.throttleUntil };
  return { action: 'allow' };
}

export function observe(state, event, now) {
  prune(state, now);
  // Never turn our own 403/429 into a fresh attack or extend a ban on retries.
  if (event.gatewayDenied || event.exempt) { state.suppressed++; return check(state, now, event); }
  const status = Number(event.status);
  const category = status >= 500 ? '5xx' : String(status);
  state.counters[category] = (state.counters[category] || 0) + 1;
  if (event.trusted && status < 400) state.sharedUntil = now + POLICY.repeatWindow;
  const ignoresBackoff = now < state.backoffUntil;
  if (status === 429) state.backoffUntil = Math.max(state.backoffUntil, now + Math.min(300000, Math.max(1000, (event.retryAfter || 1) * 1000)));
  let reason = null;
  if (status === 404 && event.unknownApiPath) reason = 'unknown_api_path';
  else if ([404,405].includes(status) && event.unsupportedMethod) reason = 'unsupported_method';
  else if ([401,403].includes(status) && event.authenticationFailure) reason = 'authentication_failure';
  else if ([400,413,415,422].includes(status) && event.malformed) reason = 'malformed_request';
  // A single throttled response is normal. Only repeated failures to respect an
  // origin's backoff count; server failures are observations, never ban evidence.
  else if (status === 429 && ignoresBackoff) reason = 'backoff_candidate';
  state.events.push({ at: now, status, reason, path: event.pathHash || '', trusted: !!event.trusted });
  // Bounded state: preserve all potential evidence (at most the latest 1000) and
  // compact routine traffic; do not store URL query strings, headers or bodies.
  if (state.events.length > 2000) {
    const evidence = state.events.filter(e => e.reason).slice(-1000);
    const normal = state.events.filter(e => !e.reason).slice(-1000);
    state.events = [...evidence, ...normal].sort((a,b)=>a.at-b.at);
  }
  const recentBackoff=state.events.filter(e=>['backoff_candidate','ignored_backoff'].includes(e.reason)&&e.at>now-60000);
  if(recentBackoff.length>=10)for(const e of recentBackoff)e.reason='ignored_backoff';
  const suspicious = state.events.filter(e=>e.reason && e.reason!=='backoff_candidate');
  const five = suspicious.filter(e=>e.at>now-POLICY.shortWindow).length;
  const ten = suspicious.filter(e=>e.at>now-POLICY.longWindow).length;
  const daily = suspicious.length;
  const duration = daily >= POLICY.dailyCount ? POLICY.dailyBan : ten >= POLICY.longCount ? POLICY.longBan : five >= POLICY.shortCount ? POLICY.shortBan : 0;
  if (!duration) return check(state, now, event);
  if (state.sharedUntil > now || event.trusted) {
    if(event.trusted && event.credentialHash){
      state.credentialThrottles ||= {};
      // A validated key is an accountable identity. Quarantine only that key
      // for the normal ban duration so other users behind the same NAT remain
      // usable; anonymous abuse on a known shared address gets a short pause.
      state.credentialThrottles[event.credentialHash]=now+duration;
      return { action: 'throttle', retryAfter: Math.ceil(duration/1000), until: now+duration, reason: 'credential_abuse' };
    } else state.throttleUntil = now + POLICY.sharedDelay;
    return { action: 'throttle', retryAfter: 30, until: state.throttleUntil, reason: 'shared_ip_protection' };
  }
  const level = ten >= POLICY.longCount ? '40_in_10m' : daily >= POLICY.dailyCount ? '30_in_24h' : '20_in_5m';
  if (state.active) {
    // Genuine responses already in flight may escalate 1h to 24h, not add a
    // repeat strike. Requests blocked by this policy never reach this branch.
    if (duration > state.active.duration) {
      state.active.duration = duration; state.active.until = state.active.at + duration; state.active.reason = level;
      const entry=state.bans.find(b=>b.id===state.active.id);if(entry)Object.assign(entry,state.active);
    }
    return check(state, now);
  }
  const repeat = state.bans.filter(b=>b.at>now-POLICY.repeatWindow).length + 1;
  const banDuration = repeat >= POLICY.repeatCount ? POLICY.repeatBan : duration;
  const ban = { id: `${now}-${state.bans.length}`, at: now, until: now + banDuration, duration: banDuration,
    reason: repeat >= POLICY.repeatCount ? 'third_ban_in_24h' : level,
    evidence: { fiveMinutes: five, tenMinutes: ten, day: daily, categories: Object.fromEntries([...new Set(suspicious.map(e=>e.reason))].map(k=>[k,suspicious.filter(e=>e.reason===k).length])) } };
  state.active = ban; state.bans.push({...ban});
  return check(state, now);
}
