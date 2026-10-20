import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestDb, insertTestUser, insertTestTeammate } from '../test-support.js';
import { createManualHandoff, getActivity, getHandoff, transitionHandoff } from './handoffs.js';
import { ApiError } from './errors.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

function setup() {
  db = makeTestDb();
  insertTestUser(db);
  insertTestTeammate(db);
  return db;
}

const input = {
  category: 'visitor' as const,
  summary: 'Meet a visitor at the accessible entrance',
  priority: 'high' as const,
  dueAt: null,
};

describe('handoff state machine', () => {
  it('enforces claim, assign, acknowledge, resolve and explicit reopen with one activity per valid change', () => {
    const database = setup();
    const baseTime = Date.now() - 10 * 60 * 1000;
    const at = (minutes: number) => new Date(baseTime + minutes * 60 * 1000).toISOString();
    const created = createManualHandoff(database, 'user-owner', input, at(0));
    expect(created.status).toBe('new');
    expect(getActivity(database, created.id)).toHaveLength(1);

    const claimed = transitionHandoff(database, created.id, 'user-owner', 'claim', {}, at(1));
    expect(claimed.status).toBe('assigned');
    expect(claimed.ownerId).toBe('user-owner');
    expect(getActivity(database, created.id)).toHaveLength(2);

    const reassigned = transitionHandoff(database, created.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, at(2));
    expect(reassigned.status).toBe('assigned');
    expect(reassigned.ownerId).toBe('user-teammate');
    expect(getActivity(database, created.id)).toHaveLength(3);

    const acknowledgedAt = at(3);
    const acknowledged = transitionHandoff(database, created.id, 'user-teammate', 'acknowledge', {}, acknowledgedAt);
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.resolutionNote).toBeNull();
    expect(acknowledged.isStalled).toBe(false);
    expect(getHandoff(database, created.id, Date.parse(acknowledgedAt) + 25 * 60 * 60 * 1000).isStalled).toBe(true);

    const acknowledgedReassignment = transitionHandoff(database, created.id, 'user-teammate', 'assign', { ownerId: 'user-owner' }, at(3.5));
    expect(acknowledgedReassignment).toMatchObject({ status: 'acknowledged', ownerId: 'user-owner', acknowledgedAt });
    expect(getActivity(database, created.id)).toHaveLength(5);

    const resolved = transitionHandoff(database, created.id, 'user-owner', 'resolve', { note: 'Visitor was welcomed.' }, at(4));
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolutionNote).toBe('Visitor was welcomed.');
    const reopened = transitionHandoff(database, created.id, 'user-owner', 'reopen', {}, at(5));
    expect(reopened.status).toBe('reopened');
    expect(reopened.resolutionNote).toBeNull();
    expect(reopened.acknowledgedAt).toBeNull();
    expect(getActivity(database, created.id).map((entry) => entry.action)).toEqual([
      'created_manual', 'claimed', 'reassigned', 'acknowledged', 'reassigned', 'resolved', 'reopened',
    ]);
  });

  it('preserves insertion order for activity entries that share the same timestamp', () => {
    const database = setup();
    const created = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    const timestamp = '2026-10-17T01:00:00.000Z';
    const insertActivity = database.prepare(`INSERT INTO activity
      (id, handoff_id, source_event_id, actor_id, action, from_status, to_status,
       from_owner_id, to_owner_id, note, occurred_at)
      VALUES (?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`);
    insertActivity.run('z-sequence-first', created.id, 'user-owner', 'same-time-first', timestamp);
    insertActivity.run('a-sequence-second', created.id, 'user-owner', 'same-time-second', timestamp);

    const sameTimeActions = getActivity(database, created.id)
      .filter((entry) => entry.action.startsWith('same-time-'))
      .map((entry) => entry.action);
    expect(sameTimeActions).toEqual(['same-time-first', 'same-time-second']);
  });

  it('rejects invalid transitions and leaves both handoff and activity unchanged', () => {
    const database = setup();
    const created = createManualHandoff(database, 'user-owner', input);
    const before = getActivity(database, created.id).length;
    expect(() => transitionHandoff(database, created.id, 'user-owner', 'resolve', { note: 'Not yet.' })).toThrow(ApiError);
    expect(() => transitionHandoff(database, created.id, 'user-owner', 'acknowledge')).toThrow(ApiError);
    expect(getHandoff(database, created.id).status).toBe('new');
    expect(getActivity(database, created.id)).toHaveLength(before);
  });

  it('computes overdue only when a due date exists and not after resolution', () => {
    const database = setup();
    const noDueDate = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    expect(noDueDate.isOverdue).toBe(false);
    const withDueDate = createManualHandoff(database, 'user-owner', { ...input, dueAt: '2026-10-16T00:00:00.000Z' }, '2026-10-17T00:00:00.000Z');
    expect(withDueDate.isOverdue).toBe(true);
    const assigned = transitionHandoff(database, withDueDate.id, 'user-owner', 'assign', { ownerId: 'user-teammate' });
    const ack = transitionHandoff(database, assigned.id, 'user-owner', 'acknowledge');
    expect(ack.isOverdue).toBe(true);
    const resolved = transitionHandoff(database, ack.id, 'user-owner', 'resolve', { note: 'Done.' });
    expect(resolved.status).toBe('resolved');
    expect(resolved.isOverdue).toBe(false);
  });

  it('supports both allowed paths out of REOPENED: assign or acknowledge with the retained owner', () => {
    const database = setup();
    const first = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, first.id, 'user-owner', 'claim', {}, '2026-10-17T01:00:00.000Z');
    transitionHandoff(database, first.id, 'user-owner', 'acknowledge', {}, '2026-10-17T02:00:00.000Z');
    transitionHandoff(database, first.id, 'user-owner', 'resolve', { note: 'First resolution.' }, '2026-10-17T03:00:00.000Z');
    const reopened = transitionHandoff(database, first.id, 'user-owner', 'reopen', {}, '2026-10-17T04:00:00.000Z');
    const acknowledgedAgain = transitionHandoff(database, reopened.id, 'user-owner', 'acknowledge', {}, '2026-10-17T05:00:00.000Z');
    expect(acknowledgedAgain.status).toBe('acknowledged');

    const second = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, second.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-17T01:00:00.000Z');
    transitionHandoff(database, second.id, 'user-owner', 'acknowledge', {}, '2026-10-17T02:00:00.000Z');
    transitionHandoff(database, second.id, 'user-owner', 'resolve', { note: 'Resolved again.' }, '2026-10-17T03:00:00.000Z');
    transitionHandoff(database, second.id, 'user-owner', 'reopen', {}, '2026-10-17T04:00:00.000Z');
    const reassigned = transitionHandoff(database, second.id, 'user-owner', 'assign', { ownerId: 'user-owner' }, '2026-10-17T05:00:00.000Z');
    expect(reassigned).toMatchObject({ status: 'assigned', ownerId: 'user-owner' });
  });

  it('rejects invalid actions from assigned, acknowledged, resolved and reopened states without partial writes', () => {
    const database = setup();
    const assigned = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, assigned.id, 'user-owner', 'claim', {}, '2026-10-17T01:00:00.000Z');
    const acknowledged = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, acknowledged.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-17T01:00:00.000Z');
    transitionHandoff(database, acknowledged.id, 'user-owner', 'acknowledge', {}, '2026-10-17T02:00:00.000Z');
    const resolved = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, resolved.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-17T01:00:00.000Z');
    transitionHandoff(database, resolved.id, 'user-owner', 'acknowledge', {}, '2026-10-17T02:00:00.000Z');
    transitionHandoff(database, resolved.id, 'user-owner', 'resolve', { note: 'Done.' }, '2026-10-17T03:00:00.000Z');
    const reopened = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, reopened.id, 'user-owner', 'claim', {}, '2026-10-17T01:00:00.000Z');
    transitionHandoff(database, reopened.id, 'user-owner', 'acknowledge', {}, '2026-10-17T02:00:00.000Z');
    transitionHandoff(database, reopened.id, 'user-owner', 'resolve', { note: 'Done.' }, '2026-10-17T03:00:00.000Z');
    transitionHandoff(database, reopened.id, 'user-owner', 'reopen', {}, '2026-10-17T04:00:00.000Z');

    const invalids: Array<{ id: string; action: 'claim' | 'assign' | 'acknowledge' | 'resolve' | 'reopen'; options?: { ownerId?: string; note?: string } }> = [
      { id: assigned.id, action: 'claim' },
      { id: assigned.id, action: 'resolve', options: { note: 'Too early.' } },
      { id: acknowledged.id, action: 'claim' },
      { id: acknowledged.id, action: 'acknowledge' },
      { id: acknowledged.id, action: 'reopen' },
      { id: resolved.id, action: 'assign', options: { ownerId: 'user-owner' } },
      { id: resolved.id, action: 'acknowledge' },
      { id: resolved.id, action: 'resolve', options: { note: 'Again.' } },
      { id: reopened.id, action: 'claim' },
      { id: reopened.id, action: 'resolve', options: { note: 'Too early.' } },
      { id: reopened.id, action: 'reopen' },
    ];
    for (const invalid of invalids) {
      const before = getActivity(database, invalid.id).length;
      expect(() => transitionHandoff(database, invalid.id, 'user-owner', invalid.action, invalid.options)).toThrow(ApiError);
      expect(getActivity(database, invalid.id)).toHaveLength(before);
    }
    expect(getHandoff(database, assigned.id).status).toBe('assigned');
    expect(getHandoff(database, acknowledged.id).status).toBe('acknowledged');
    expect(getHandoff(database, resolved.id).status).toBe('resolved');
    expect(getHandoff(database, reopened.id).status).toBe('reopened');
  });

  it('records owner names in the timeline and rejects assigning the same owner', () => {
    const database = setup();
    const created = createManualHandoff(database, 'user-owner', input, '2026-10-17T00:00:00.000Z');
    transitionHandoff(database, created.id, 'user-owner', 'assign', { ownerId: 'user-teammate' }, '2026-10-17T01:00:00.000Z');
    expect(getActivity(database, created.id).at(-1)?.toOwnerName).toBe('Test Teammate');
    expect(() => transitionHandoff(database, created.id, 'user-owner', 'assign', { ownerId: 'user-teammate' })).toThrow(ApiError);
    expect(getActivity(database, created.id)).toHaveLength(2);
  });
});
