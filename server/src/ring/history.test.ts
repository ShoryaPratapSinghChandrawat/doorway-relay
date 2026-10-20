import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestDb } from '../test-support.js';
import { ingestHistoryPayload } from './history.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

describe('legacy Ring Event History adapter', () => {
  it('maps ding and motion.* values to neutral event types and stores only ring_live provenance', () => {
    db = makeTestDb();
    // Synthetic unit input for the legacy ring_live parser; this is not a captured Ring or Playground response.
    const payload = { data: [
      {
        type: 'history-events',
        id: 'opaque-history-ding',
        attributes: { event_type: 'ding', start: 1_792_238_400_000, end: 1_792_238_401_000 },
        relationships: { source: { data: { type: 'devices', id: 'device-doorbell-1' } } },
      },
      {
        type: 'history-events',
        id: 'opaque-history-motion-human',
        attributes: { event_type: 'motion.human', start: '2026-10-17T12:01:00.000Z', end: '2026-10-17T12:01:02.000Z' },
        relationships: { source: { data: { type: 'devices', id: 'device-camera-2' } } },
      },
      {
        type: 'history-events',
        id: 'opaque-history-motion-vehicle',
        attributes: { event_type: 'motion.vehicle', start: '2026-10-17T12:02:00.000Z' },
        relationships: { source: { data: { type: 'devices', id: 'device-camera-3' } } },
      },
      {
        type: 'history-events',
        id: 'opaque-history-live-view',
        attributes: { event_type: 'on_demand', start: 1_792_238_500_000 },
        relationships: { source: { data: { type: 'devices', id: 'device-camera-2' } } },
      },
    ] };

    expect(ingestHistoryPayload(db, payload, '2026-10-17T12:03:00.000Z')).toBe(3);
    expect(ingestHistoryPayload(db, payload, '2026-10-17T12:04:00.000Z')).toBe(0);
    expect(db.prepare(`SELECT provenance, ring_event_type AS eventType, external_event_id AS externalEventId,
      request_id AS requestId, device_id AS deviceId, occurred_at AS occurredAt, received_at AS receivedAt,
      is_synthetic AS isSynthetic
      FROM source_events ORDER BY external_event_id`).all()).toEqual([
      {
        provenance: 'ring_live', eventType: 'button_press', externalEventId: 'opaque-history-ding',
        requestId: null, deviceId: 'device-doorbell-1', occurredAt: '2026-10-17T12:00:00.000Z',
        receivedAt: '2026-10-17T12:03:00.000Z', isSynthetic: 0,
      },
      {
        provenance: 'ring_live', eventType: 'motion_detected', externalEventId: 'opaque-history-motion-human',
        requestId: null, deviceId: 'device-camera-2', occurredAt: '2026-10-17T12:01:00.000Z',
        receivedAt: '2026-10-17T12:03:00.000Z', isSynthetic: 0,
      },
      {
        provenance: 'ring_live', eventType: 'motion_detected', externalEventId: 'opaque-history-motion-vehicle',
        requestId: null, deviceId: 'device-camera-3', occurredAt: '2026-10-17T12:02:00.000Z',
        receivedAt: '2026-10-17T12:03:00.000Z', isSynthetic: 0,
      },
    ]);
    expect((db.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(3);
  });

  it('ignores unsupported history labels and malformed timestamps without partial imports', () => {
    db = makeTestDb();
    const payload = { data: [
      { id: 'live-view', attributes: { event_type: 'on_demand', start: 1_792_238_400_000 } },
      { id: 'bad-time', attributes: { event_type: 'ding', start: 'not-a-time' } },
      { id: 'bad-shape', attributes: { event_type: 'motion' } },
      { id: 'empty-motion-subtype', attributes: { event_type: 'motion.' , start: 1_792_238_400_000 } },
    ] };
    expect(ingestHistoryPayload(db, payload)).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);
  });
});
