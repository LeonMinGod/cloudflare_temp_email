import { DatabaseSync } from 'node:sqlite';

export class SqliteStorage {
  constructor(path, scope = 'pool') {
    this.db = typeof path === 'string' ? new DatabaseSync(path) : path;
    this.scope = scope;
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records(scope TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(scope,key))');
    this.read = this.db.prepare('SELECT value FROM records WHERE scope=? AND key=?');
    this.write = this.db.prepare('INSERT INTO records(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value');
    this.remove = this.db.prepare('DELETE FROM records WHERE scope=? AND key=?');
  }
  async get(key) { const row = this.read.get(this.scope, key); return row ? JSON.parse(row.value) : undefined; }
  async put(key, value) {
    if (typeof key === 'object') { for (const [name, item] of Object.entries(key)) await this.put(name, item); return; }
    this.write.run(this.scope, key, JSON.stringify(value));
  }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.remove.run(this.scope, key); }
  async transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await callback(this); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async getAlarm() { return await this.get('__alarm') || null; }
  async setAlarm(time) { await this.put('__alarm', time); this.onAlarm?.(time); }
  async deleteAlarm() { await this.delete('__alarm'); this.onAlarm?.(null); }
  close() { this.db.close(); }
}
