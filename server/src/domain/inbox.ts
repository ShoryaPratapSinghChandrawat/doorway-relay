import type { Db } from '../db/index.js';
import type { Provenance } from './types.js';

export interface InboxEventView {
  id: string;
  provenance: Provenance;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  summary: string;
  isSynthetic: boolean;
}

export function listInboxEvents(db: Db, limit = 50): InboxEventView[] {
  const rows = db.prepare(`SELECT id, provenance, ring_event_type AS eventType,
    occurred_at AS occurredAt, received_at AS receivedAt, summary, is_synthetic AS isSynthetic
    FROM source_events WHERE classification_status = 'pending'
    ORDER BY received_at DESC LIMIT ?`).all(limit) as Array<Omit<InboxEventView, 'isSynthetic'> & { isSynthetic: number }>;
  return rows.map((row) => ({ ...row, isSynthetic: row.isSynthetic === 1 }));
}
