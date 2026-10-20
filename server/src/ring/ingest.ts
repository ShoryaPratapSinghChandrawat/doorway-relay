import { createHash, randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import type { Provenance } from '../domain/types.js';
import type { NormalizedDoorEvent } from './normalize.js';

export type WebhookIngestResult =
  | { status: 'accepted'; eventId: string }
  | { status: 'duplicate' }
  | { status: 'ignored' };

export function ingestWebhookEvent(
  db: Db,
  rawBody: Buffer,
  provenance: Exclude<Provenance, 'manual'>,
  requestId: string,
  normalizedEvent: NormalizedDoorEvent | null,
  receivedAt = new Date().toISOString(),
): WebhookIngestResult {
  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const eventId = randomUUID();
  const persistedAt = new Date().toISOString();
  const transaction = db.transaction((): WebhookIngestResult => {
    const priorRequest = db.prepare('SELECT payload_sha256 AS payloadHash FROM webhook_receipts WHERE request_id = ?')
      .get(requestId) as { payloadHash: string } | undefined;
    if (priorRequest) return { status: 'duplicate' };

    db.prepare(`INSERT INTO webhook_receipts (request_id, payload_sha256, provenance, received_at)
      VALUES (?, ?, ?, ?)`)
      .run(requestId, payloadHash, provenance, receivedAt);

    if (provenance === 'ring_simulated') {
      db.prepare('UPDATE ring_link_state SET last_simulated_event_at = ?, updated_at = ? WHERE id = 1').run(receivedAt, persistedAt);
    } else {
      db.prepare('UPDATE ring_link_state SET last_signed_event_at = ?, last_signed_event_source = ?, updated_at = ? WHERE id = 1')
        .run(receivedAt, provenance, persistedAt);
    }

    if (!normalizedEvent) return { status: 'ignored' };
    const existingEvent = db.prepare('SELECT id FROM source_events WHERE external_event_id = ? OR request_id = ? LIMIT 1')
      .get(normalizedEvent.externalEventId, normalizedEvent.requestId) as { id: string } | undefined;
    if (existingEvent) return { status: 'duplicate' };

    db.prepare(`INSERT INTO source_events
      (id, provenance, ring_event_type, external_event_id, request_id, device_id, occurred_at, received_at,
       summary, classification_status, classified_at, is_synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0, ?)`)
      .run(eventId, provenance, normalizedEvent.eventType, normalizedEvent.externalEventId,
        normalizedEvent.requestId, normalizedEvent.deviceId, normalizedEvent.occurredAt,
        receivedAt, normalizedEvent.summary, persistedAt);
    return { status: 'accepted', eventId };
  });
  return transaction();
}
