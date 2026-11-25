import { authorizeQuota } from './authorize.mjs';

export const RECOVERY_KEY = 'ops:auth-recovery:v1';
export const RECOVERY_END = Date.parse('2026-11-01T00:00:00Z');
const RECOVERY_START = Date.parse('2026-10-31T00:00:00Z');

// This incident switch cannot be extended into another day through KV alone.
// Registry validation and request/response signatures remain mandatory.
export function recoveryEnabled(value, now) {
  return value?.schema === 1 && value?.scope === 'do-write-quota-20261031'
    && value?.mode === 'registered_keys_memory_limits'
    && value?.expires === RECOVERY_END && now >= RECOVERY_START && now < RECOVERY_END;
}

// Temporary, bounded per-isolate counters, not a distributed quota guarantee.
// They disappear on eviction. Do not use this class for normal quota accounting.
export class RecoveryLimiter {
  constructor({ capacity = 2048 } = {}) {
    this.capacity = capacity;
    this.rows = new Map();
    this.replay = new Map();
  }

  decide({ hash, email, nonce, limits, now }) {
    const replayKey = hash + ':' + nonce;
    for (const [id, entry] of this.replay) if (entry.until <= now) this.replay.delete(id);
    const previous = this.replay.get(replayKey);
    if (previous) return previous.result;
    const keyID = 'key:' + hash, emailID = 'email:' + email;
    const needed = Number(!this.rows.has(keyID)) + Number(Boolean(email) && !this.rows.has(emailID));
    // Refuse new state instead of evicting live counters and resetting limits.
    if (this.rows.size + needed > this.capacity || this.replay.size >= this.capacity) return null;
    const decision = authorizeQuota({ keyRow: this.rows.get(keyID), emailRow: this.rows.get(emailID), hasEmail: Boolean(email), limits, now });
    if (decision.consumed) {
      this.rows.set(keyID, decision.keyRow);
      if (email && decision.emailRow) this.rows.set(emailID, decision.emailRow);
    }
    this.replay.set(replayKey, { until: now + 60000, result: decision.public });
    return decision.public;
  }
}
