import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestDb, insertTestUser } from '../test-support.js';
import { classifySourceEvent, getActivity } from './handoffs.js';
import { listInboxEvents } from './inbox.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

describe('human event classification', () => {
  it('keeps a simulated motion event neutral until the user creates a handoff', () => {
    db = makeTestDb();
    insertTestUser(db);
    db.prepare(`INSERT INTO source_events
      (id, provenance, ring_event_type, external_event_id, request_id, occurred_at, received_at, summary, created_at)
      VALUES ('event-1', 'ring_simulated', 'motion_detected', 'external-1', 'request-1', ?, ?, ?, ?)`)
      .run('2026-10-17T01:00:00.000Z', '2026-10-17T01:01:00.000Z', 'Motion was detected.', '2026-10-17T01:01:00.000Z');
    expect(listInboxEvents(db)[0]).toMatchObject({ eventType: 'motion_detected', provenance: 'ring_simulated' });

    const handoff = classifySourceEvent(db, 'user-owner', 'event-1', {
      category: 'delivery',
      summary: 'Collect the item after confirming it is a delivery',
      priority: 'normal',
      dueAt: null,
    });
    expect(handoff.category).toBe('delivery');
    expect(handoff.provenance).toBe('ring_simulated');
    expect(listInboxEvents(db)).toHaveLength(0);
    expect(getActivity(db, handoff.id)).toHaveLength(1);
  });
});
