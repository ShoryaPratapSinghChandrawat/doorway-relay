import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestDb, insertTestTeammate, insertTestUser } from '../test-support.js';
import { createManualHandoff, listHandoffs, transitionHandoff } from './handoffs.js';
import { getOverview } from './overview.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

const input = (summary: string, dueAt: string | null, priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal') => ({
  category: 'other' as const,
  summary,
  priority,
  dueAt,
});

describe('workspace dashboard overview', () => {
  it('returns counts and attention rows from persisted handoff and pending-inbox state', () => {
    db = makeTestDb();
    insertTestUser(db);
    insertTestTeammate(db);
    const now = Date.parse('2026-10-17T12:00:00.000Z');

    createManualHandoff(db, 'user-owner', input('New overdue task', '2026-10-17T11:00:00.000Z', 'high'), '2026-10-17T09:00:00.000Z');

    const assigned = createManualHandoff(db, 'user-owner', input('Assigned task', '2026-10-17T13:00:00.000Z'), '2026-10-17T09:00:00.000Z');
    transitionHandoff(db, assigned.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-17T10:00:00.000Z');

    const acknowledged = createManualHandoff(db, 'user-owner', input('Stalled overdue task', '2026-10-16T11:30:00.000Z', 'urgent'), '2026-10-16T10:00:00.000Z');
    transitionHandoff(db, acknowledged.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-16T10:30:00.000Z');
    transitionHandoff(db, acknowledged.id, 'user-teammate', 'acknowledge', {}, '2026-10-16T11:00:00.000Z');

    const resolved = createManualHandoff(db, 'user-owner', input('Resolved task', '2026-10-16T09:00:00.000Z'), '2026-10-16T08:00:00.000Z');
    transitionHandoff(db, resolved.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-16T08:30:00.000Z');
    transitionHandoff(db, resolved.id, 'user-teammate', 'acknowledge', {}, '2026-10-16T08:45:00.000Z');
    transitionHandoff(db, resolved.id, 'user-teammate', 'resolve', { note: 'Completed.' }, '2026-10-16T09:00:00.000Z');

    const reopened = createManualHandoff(db, 'user-owner', input('Reopened task', null), '2026-10-16T07:00:00.000Z');
    transitionHandoff(db, reopened.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-16T07:30:00.000Z');
    transitionHandoff(db, reopened.id, 'user-teammate', 'acknowledge', {}, '2026-10-16T07:45:00.000Z');
    transitionHandoff(db, reopened.id, 'user-teammate', 'resolve', { note: 'Completed once.' }, '2026-10-16T08:00:00.000Z');
    transitionHandoff(db, reopened.id, 'user-owner', 'reopen', {}, '2026-10-16T08:15:00.000Z');

    db.prepare(`INSERT INTO source_events
      (id, provenance, ring_event_type, external_event_id, request_id, device_id, occurred_at, received_at,
       summary, classification_status, is_synthetic, created_at)
      VALUES ('pending-simulated-event', 'ring_simulated', 'motion_detected', 'dashboard-event-1',
       'dashboard-request-1', 'dashboard-device-1', ?, ?, 'Simulated event awaiting review.', 'pending', 1, ?)`)
      .run('2026-10-17T11:59:00.000Z', '2026-10-17T11:59:01.000Z', '2026-10-17T11:59:01.000Z');

    const overview = getOverview(db, 24, now);
    expect(overview.counts).toEqual({
      needsAttention: 4,
      unassigned: 1,
      awaitingAcknowledgement: 2,
      assigned: 1,
      acknowledged: 1,
      overdue: 2,
      stalled: 1,
      resolved: 1,
      inbox: 1,
    });
    const awaitingAcknowledgement = listHandoffs(db, { status: 'awaiting_acknowledgement', page: 1, limit: 10 }, now, 24);
    expect(awaitingAcknowledgement.total).toBe(2);
    expect(awaitingAcknowledgement.items.map((handoff) => handoff.summary)).toEqual(expect.arrayContaining(['Assigned task', 'Reopened task']));
    expect(overview.needsAttention.map((handoff) => handoff.summary)).toContain('New overdue task');
    expect(overview.needsAttention.map((handoff) => handoff.summary)).toContain('Assigned task');
    expect(overview.needsAttention.map((handoff) => handoff.summary)).toContain('Stalled overdue task');
    expect(overview.needsAttention.map((handoff) => handoff.summary)).toContain('Reopened task');
    expect(overview.needsAttention.map((handoff) => handoff.status)).not.toContain('resolved');
    expect(overview.needsAttention).toHaveLength(4);
    expect(overview.stallThresholdHours).toBe(24);
  });

  it('orders same-timestamp dashboard activity newest-first by insertion order', () => {
    db = makeTestDb();
    insertTestUser(db);
    const handoff = createManualHandoff(db, 'user-owner', input('Same-time history test', null), '2026-10-17T00:00:00.000Z');
    const timestamp = '2026-10-17T01:00:00.000Z';
    const insertActivity = db.prepare(`INSERT INTO activity
      (id, handoff_id, source_event_id, actor_id, action, from_status, to_status,
       from_owner_id, to_owner_id, note, occurred_at)
      VALUES (?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`);
    insertActivity.run('z-dashboard-first', handoff.id, 'user-owner', 'dashboard-same-time-first', timestamp);
    insertActivity.run('a-dashboard-second', handoff.id, 'user-owner', 'dashboard-same-time-second', timestamp);

    const actions = getOverview(db, 24, Date.parse('2026-10-17T02:00:00.000Z')).recentActivity
      .filter((item) => item.action.startsWith('dashboard-same-time-'))
      .map((item) => item.action);
    expect(actions).toEqual(['dashboard-same-time-second', 'dashboard-same-time-first']);
  });
});
