export function relativeWait(value, now = Date.now()) {
  const remaining = Date.parse(value || '') - now;
  if (!Number.isFinite(remaining)) return '';
  if (remaining <= 0) return '待更新';
  if (remaining < 60000) return `约 ${Math.ceil(remaining / 1000)} 秒后`;
  if (remaining < 3600000) return `约 ${Math.ceil(remaining / 60000)} 分钟后`;
  if (remaining < 86400000) return `约 ${Math.ceil(remaining / 3600000)} 小时后`;
  return `${Math.ceil(remaining / 86400000)} 天后`;
}
