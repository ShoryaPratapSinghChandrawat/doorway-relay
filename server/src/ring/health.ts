import type { Db } from '../db/index.js';

export function recordRingApiSuccess(db: Db, kind: string, now = new Date().toISOString()): void {
  db.prepare(`UPDATE ring_link_state SET last_api_success_at = ?, last_api_success_kind = ?,
    last_refresh_error = NULL, updated_at = ? WHERE id = 1`).run(now, kind, now);
}
