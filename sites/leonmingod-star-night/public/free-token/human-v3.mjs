// Human check for the claim page. Asks the server first: a valid pass cookie (2 h)
// means no widget at all. Otherwise renders Turnstile inline in `host` with
// appearance "interaction-only", so it stays invisible unless Cloudflare needs a click.
let loader;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loader) loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.onload = resolve; script.onerror = () => { loader = null; reject(new Error('验证加载失败，请稍后再试。')); };
    document.head.append(script);
  });
  return loader;
}
export async function humanToken(action, host) {
  const response = await fetch('/api/free-token/security', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('暂时无法验证，请稍后再试。');
  const config = await response.json();
  if (config.local && ['localhost', '127.0.0.1'].includes(location.hostname)) return 'local-test';
  if (config.required === false) return '';
  if (!config.siteKey) throw new Error('验证暂时不可用，请稍后再试。');
  await load();
  return new Promise((resolve, reject) => {
    host.replaceChildren();
    host.hidden = false;
    let widget, settled = false;
    const timeout = setTimeout(() => finish(new Error('验证超时，请重试。')), 120000);
    const finish = (error, token) => {
      if (settled) return; settled = true; clearTimeout(timeout);
      if (widget !== undefined) try { window.turnstile.remove(widget); } catch {}
      host.replaceChildren(); host.hidden = true;
      error ? reject(error) : resolve(token);
    };
    widget = window.turnstile.render(host, {
      sitekey: config.siteKey, action, theme: 'dark', size: 'flexible', appearance: 'interaction-only',
      callback: token => finish(null, token),
      'error-callback': () => finish(new Error('人机验证失败，请重试。')),
      'expired-callback': () => finish(new Error('人机验证已过期，请重试。')),
      'timeout-callback': () => finish(new Error('人机验证超时，请重试。')),
    });
  });
}
