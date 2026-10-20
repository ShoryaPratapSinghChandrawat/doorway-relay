import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import type { RingEventType } from '../domain/types.js';

const historySchema = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    attributes: z.object({
      event_type: z.string(),
      start: z.union([z.string(), z.number()]),
    }).passthrough(),
    relationships: z.object({}).passthrough().optional(),
  }).passthrough()),
}).passthrough();

function readHistoryDeviceId(relationships: unknown): string | null {
  if (!relationships || typeof relationships !== 'object' || Array.isArray(relationships)) return null;
  const source = (relationships as Record<string, unknown>).source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const data = (source as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const id = (data as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function normalizeHistoryStart(value: string | number): string | null {
  const milliseconds = typeof value === 'number'
    ? value
    : /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 8_640_000_000_000_000) return null;
  return new Date(milliseconds).toISOString();
}

/**
 * Legacy opt-in `ring_live` Event History adapter. Its response-field and timestamp
 * assumptions have not been live-verified; this is not a Playground adapter or evidence.
 * It maps `ding` and `motion.*` into neutral door-event categories without inferring intent.
 */
export function ingestHistoryPayload(
  db: Db,
  payload: unknown,
  receivedAt = new Date().toISOString(),
): number {
  const parsed = historySchema.safeParse(payload);
  if (!parsed.success) return 0;
  let inserted = 0;
  const transaction = db.transaction(() => {
    for (const item of parsed.data.data) {
      const historyType = item.attributes.event_type;
      const eventType: RingEventType | null = historyType === 'ding' ? 'button_press'
        : historyType === 'motion' || /^motion(?:\.[a-z0-9_]+)+$/.test(historyType) ? 'motion_detected' : null;
      if (!eventType) continue;
      const occurred = normalizeHistoryStart(item.attributes.start);
      if (!occurred) continue;
      const deviceId = readHistoryDeviceId(item.relationships);
      const result = db.prepare(`INSERT OR IGNORE INTO source_events
        (id, provenance, ring_event_type, external_event_id, request_id, device_id, occurred_at, received_at,
         summary, classification_status, classified_at, is_synthetic, created_at)
        VALUES (?, 'ring_live', ?, ?, NULL, ?, ?, ?, ?, 'pending', NULL, 0, ?)`)
        .run(randomUUID(), eventType, item.id, deviceId, occurred, receivedAt,
          eventType === 'button_press' ? 'A doorbell button was pressed. Review the context before creating a handoff.'
            : 'Motion was detected. Review the context before creating a handoff.', receivedAt);
      inserted += result.changes;
    }
  });
  transaction();
  return inserted;
}
