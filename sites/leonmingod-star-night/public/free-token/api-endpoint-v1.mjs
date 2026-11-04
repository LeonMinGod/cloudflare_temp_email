export const API_ORIGIN = 'https://yifu.leonmingod.com';
export const BASE_URL = API_ORIGIN + '/v1';

export function normalizeBaseUrl(value) {
  if (!value) return BASE_URL;
  try {
    const url = new URL(value);
    if (['https://cpa-dhke.onrender.com', 'https://public-cpa.leonmingod.com'].includes(url.origin) && /^\/v1\/?$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash) return BASE_URL;
  } catch {}
  return value;
}
