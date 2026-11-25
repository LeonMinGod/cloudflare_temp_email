import { DatabaseSync } from 'node:sqlite';

const [, , filename, until] = process.argv;
const db = new DatabaseSync(filename, { readOnly: true, timeout: 2000 });
try {
  // The Plus projection contains attribution fields without request bodies.
  // Read in one SQLite snapshot so the coverage and grouped totals agree.
  db.exec('PRAGMA query_only = ON; BEGIN');
  const coverage = db.prepare(`
    SELECT min(timestamp_ms) AS since, max(timestamp_ms) AS latest
    FROM usage_monitoring_event_projection_v1 WHERE timestamp_ms <= ?
  `).get(Number(until));
  const rows = db.prepare(`
    SELECT CAST((timestamp_ms + 28800000) / 86400000 AS INTEGER) AS day,
      lower(provider) AS provider, coalesce(nullif(requested_model, ''), model) AS model,
      lower(coalesce(nullif(auth_provider_snapshot, ''), provider)) AS auth_provider,
      lower(trim(account_snapshot)) AS account, trim(auth_account_id_snapshot) AS upstream_id,
      trim(auth_index) AS auth_index,
      count(*) - sum(CASE WHEN failed <> 0 THEN 1 ELSE 0 END) AS success,
      sum(CASE WHEN failed <> 0 THEN 1 ELSE 0 END) AS failed,
      max(timestamp_ms) AS last_used_ms
    FROM usage_monitoring_event_projection_v1
    WHERE timestamp_ms <= ?
    GROUP BY 1, 2, 3, 4, 5, 6, 7
  `).all(Number(until));
  process.stdout.write(JSON.stringify({ ...coverage, rows }));
} finally {
  db.close();
}
