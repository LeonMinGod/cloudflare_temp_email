export const API_ORIGIN = 'https://yifu.leonmingod.com';
export const BASE_URL = API_ORIGIN + '/v1';

export function normalizeBaseUrl(value) {
  if (!value) return BASE_URL;
  try {
    const url = new URL(value);
    if (url.origin === 'https://cpa-dhke.onrender.com' && /^\/v1\/?$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash) return BASE_URL;
  } catch {}
  return value;
}
