import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeWait } from '../public/model-status/time-v1.mjs';

test('cooldown precision uses seconds and minutes below an hour', () => {
  const now = Date.parse('2026-11-05T00:00:00Z');
  const at = seconds => new Date(now + seconds * 1000).toISOString();
  assert.equal(relativeWait(at(300), now), '约 5 分钟后');
  assert.equal(relativeWait(at(30), now), '约 30 秒后');
  assert.equal(relativeWait(at(60), now), '约 1 分钟后');
  assert.equal(relativeWait(at(3540), now), '约 59 分钟后');
  assert.equal(relativeWait(at(3600), now), '约 1 小时后');
  assert.equal(relativeWait(at(86400), now), '1 天后');
  assert.equal(relativeWait(at(300), now + 60000), '约 4 分钟后');
  assert.equal(relativeWait(at(300), now + 300000), '待更新');
  assert.equal(relativeWait('invalid', now), '');
});
