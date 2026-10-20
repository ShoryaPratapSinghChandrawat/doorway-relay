import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { ApiError, notFound } from './errors.js';
import type { ActivityView, HandoffCategory, HandoffStatus, HandoffView, Priority, Provenance } from './types.js';

export interface CreateHandoffInput {
  category: HandoffCategory;
  summary: string;
  priority: Priority;
  dueAt: string | null;
}

export interface ListHandoffFilters {
  q?: string;
  status?: HandoffStatus | 'awaiting_acknowledgement';
  ownerId?: string;
  category?: HandoffCategory;
  priority?: Priority;
  provenance?: Provenance;
  sort?: 'updated_desc' | 'due_asc' | 'created_desc';
  page: number;
  limit: number;
}

interface HandoffRow {
  id: string;
  sourceEventId: string;
  category: HandoffCategory;
  summary: string;
  priority: Priority;
  status: HandoffStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  resolutionNote: string | null;
  isSynthetic: number;
  createdAt: string;
  updatedAt: string;
  provenance: Provenance;
  sourceEventType: string;
  sourceOccurredAt: string;
  sourceReceivedAt: string;
  sourceSummary: string;
  sourceEventSynthetic: number;
}

const HANDOFF_SELECT = `SELECT h.id, h.source_event_id AS sourceEventId, h.category, h.summary,
  h.priority, h.status, h.owner_id AS ownerId, owner.display_name AS ownerName,
  h.due_at AS dueAt, h.acknowledged_at AS acknowledgedAt, h.resolution_note AS resolutionNote,
  h.is_synthetic AS isSynthetic, h.created_at AS createdAt, h.updated_at AS updatedAt,
  s.provenance, s.ring_event_type AS sourceEventType, s.occurred_at AS sourceOccurredAt,
  s.received_at AS sourceReceivedAt, s.summary AS sourceSummary,
  s.is_synthetic AS sourceEventSynthetic
  FROM handoffs h
  JOIN source_events s ON s.id = h.source_event_id
  LEFT JOIN users owner ON owner.id = h.owner_id`;

function mapHandoff(row: HandoffRow, now: number, stallThresholdHours: number): HandoffView {
  const dueTimestamp = row.dueAt ? Date.parse(row.dueAt) : Number.NaN;
  const acknowledgedTimestamp = row.acknowledgedAt ? Date.parse(row.acknowledgedAt) : Number.NaN;
  return {
    id: row.id,
    sourceEventId: row.sourceEventId,
    category: row.category,
    summary: row.summary,
    priority: row.priority,
    status: row.status,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    dueAt: row.dueAt,
    acknowledgedAt: row.acknowledgedAt,
    resolutionNote: row.resolutionNote,
    isStalled: row.status === 'acknowledged'
      && Number.isFinite(acknowledgedTimestamp)
      && now - acknowledgedTimestamp >= stallThresholdHours * 60 * 60 * 1000,
    isOverdue: row.status !== 'resolved' && Number.isFinite(dueTimestamp) && dueTimestamp < now,
    isSynthetic: row.isSynthetic === 1 || row.sourceEventSynthetic === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    provenance: row.provenance,
    sourceEventType: row.sourceEventType,
    sourceOccurredAt: row.sourceOccurredAt,
    sourceReceivedAt: row.sourceReceivedAt,
    sourceSummary: row.sourceSummary,
    sourceEventSynthetic: row.sourceEventSynthetic === 1,
  };
}

function selectHandoff(db: Db, handoffId: string): HandoffRow | undefined {
  return db.prepare(`${HANDOFF_SELECT} WHERE h.id = ?`).get(handoffId) as HandoffRow | undefined;
}

export function getHandoff(db: Db, handoffId: string, now = Date.now(), stallThresholdHours = 24): HandoffView {
  const row = selectHandoff(db, handoffId);
  if (!row) throw notFound('Handoff not found.');
  return mapHandoff(row, now, stallThresholdHours);
}

export function listHandoffs(db: Db, filters: ListHandoffFilters, now = Date.now(), stallThresholdHours = 24): { items: HandoffView[]; page: number; limit: number; total: number; pages: number } {
  const where: string[] = ['1 = 1'];
  const parameters: Array<string | number> = [];
  if (filters.q) {
    where.push("(h.summary LIKE ? ESCAPE '!' OR s.summary LIKE ? ESCAPE '!' OR h.id LIKE ? ESCAPE '!')");
    const escaped = filters.q.replace(/[!%_]/g, '!$&');
    const pattern = `%${escaped}%`;
    parameters.push(pattern, pattern, pattern);
  }
  if (filters.status === 'awaiting_acknowledgement') where.push("h.status IN ('assigned', 'reopened')");
  else if (filters.status) { where.push('h.status = ?'); parameters.push(filters.status); }
  if (filters.ownerId) {
    if (filters.ownerId === 'unassigned') where.push('h.owner_id IS NULL');
    else { where.push('h.owner_id = ?'); parameters.push(filters.ownerId); }
  }
  if (filters.category) { where.push('h.category = ?'); parameters.push(filters.category); }
  if (filters.priority) { where.push('h.priority = ?'); parameters.push(filters.priority); }
  if (filters.provenance) { where.push('s.provenance = ?'); parameters.push(filters.provenance); }

  const condition = where.join(' AND ');
  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM handoffs h JOIN source_events s ON s.id = h.source_event_id WHERE ${condition}`)
    .get(...parameters) as { total: number };
  const orderBy = filters.sort === 'due_asc'
    ? 'CASE WHEN h.due_at IS NULL THEN 1 ELSE 0 END, h.due_at ASC, h.created_at DESC'
    : filters.sort === 'created_desc' ? 'h.created_at DESC' : 'h.updated_at DESC';
  const offset = (filters.page - 1) * filters.limit;
  const items = db.prepare(`${HANDOFF_SELECT} WHERE ${condition} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...parameters, filters.limit, offset) as HandoffRow[];
  const total = countRow.total;
  return {
    items: items.map((row) => mapHandoff(row, now, stallThresholdHours)),
    page: filters.page,
    limit: filters.limit,
    total,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

function recordActivity(
  db: Db,
  input: {
    handoffId?: string | null;
    sourceEventId?: string | null;
    actorId: string;
    action: string;
    fromStatus?: HandoffStatus | null;
    toStatus?: HandoffStatus | null;
    fromOwnerId?: string | null;
    toOwnerId?: string | null;
    note?: string | null;
    occurredAt: string;
  },
): void {
  db.prepare(`INSERT INTO activity
    (id, handoff_id, source_event_id, actor_id, action, from_status, to_status, from_owner_id, to_owner_id, note, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      randomUUID(), input.handoffId ?? null, input.sourceEventId ?? null, input.actorId, input.action,
      input.fromStatus ?? null, input.toStatus ?? null, input.fromOwnerId ?? null, input.toOwnerId ?? null,
      input.note ?? null, input.occurredAt,
    );
}

export function createManualHandoff(db: Db, actorId: string, input: CreateHandoffInput, nowIso = new Date().toISOString()): HandoffView {
  const handoffId = randomUUID();
  const sourceEventId = randomUUID();
  const transaction = db.transaction(() => {
    db.prepare(`INSERT INTO source_events
      (id, provenance, ring_event_type, external_event_id, request_id, device_id, occurred_at, received_at,
       summary, classification_status, classified_at, is_synthetic, created_at)
      VALUES (?, 'manual', 'manual', NULL, NULL, NULL, ?, ?, 'Manually created handoff', 'classified', ?, 0, ?)`)
      .run(sourceEventId, nowIso, nowIso, nowIso, nowIso);
    db.prepare(`INSERT INTO handoffs
      (id, source_event_id, category, summary, priority, status, owner_id, due_at, acknowledged_at,
       resolution_note, is_synthetic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'new', NULL, ?, NULL, NULL, 0, ?, ?)`)
      .run(handoffId, sourceEventId, input.category, input.summary, input.priority, input.dueAt, nowIso, nowIso);
    recordActivity(db, {
      handoffId,
      sourceEventId,
      actorId,
      action: 'created_manual',
      toStatus: 'new',
      note: 'Manually created handoff.',
      occurredAt: nowIso,
    });
  });
  transaction();
  return getHandoff(db, handoffId);
}

export function classifySourceEvent(
  db: Db,
  actorId: string,
  eventId: string,
  input: CreateHandoffInput,
  nowIso = new Date().toISOString(),
): HandoffView {
  const handoffId = randomUUID();
  const transaction = db.transaction(() => {
    const event = db.prepare(`SELECT id, classification_status AS classificationStatus, is_synthetic AS isSynthetic
      FROM source_events WHERE id = ?`).get(eventId) as { id: string; classificationStatus: string; isSynthetic: number } | undefined;
    if (!event) throw notFound('Inbox event not found.');
    if (event.classificationStatus !== 'pending') {
      throw new ApiError(409, 'event_already_classified', 'This event has already been classified or ignored.');
    }
    db.prepare(`UPDATE source_events SET classification_status = 'classified', classified_at = ? WHERE id = ?`)
      .run(nowIso, eventId);
    db.prepare(`INSERT INTO handoffs
      (id, source_event_id, category, summary, priority, status, owner_id, due_at, acknowledged_at,
       resolution_note, is_synthetic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'new', NULL, ?, NULL, NULL, ?, ?, ?)`)
      .run(handoffId, eventId, input.category, input.summary, input.priority, input.dueAt, event.isSynthetic, nowIso, nowIso);
    recordActivity(db, {
      handoffId,
      sourceEventId: eventId,
      actorId,
      action: 'classified_event',
      toStatus: 'new',
      note: 'A person classified the incoming door event.',
      occurredAt: nowIso,
    });
  });
  transaction();
  return getHandoff(db, handoffId);
}

export function ignoreSourceEvent(db: Db, actorId: string, eventId: string, nowIso = new Date().toISOString()): void {
  const transaction = db.transaction(() => {
    const event = db.prepare('SELECT id, classification_status AS classificationStatus FROM source_events WHERE id = ?')
      .get(eventId) as { id: string; classificationStatus: string } | undefined;
    if (!event) throw notFound('Inbox event not found.');
    if (event.classificationStatus !== 'pending') {
      throw new ApiError(409, 'event_already_classified', 'This event has already been classified or ignored.');
    }
    db.prepare(`UPDATE source_events SET classification_status = 'ignored', classified_at = ? WHERE id = ?`)
      .run(nowIso, eventId);
    recordActivity(db, {
      sourceEventId: eventId,
      actorId,
      action: 'ignored_event',
      note: 'A person chose not to create a handoff.',
      occurredAt: nowIso,
    });
  });
  transaction();
}

export type HandoffAction = 'claim' | 'assign' | 'acknowledge' | 'resolve' | 'reopen';

export function transitionHandoff(
  db: Db,
  handoffId: string,
  actorId: string,
  action: HandoffAction,
  options: { ownerId?: string; note?: string } = {},
  nowIso = new Date().toISOString(),
): HandoffView {
  const transaction = db.transaction(() => {
    const current = db.prepare(`SELECT id, status, owner_id AS ownerId, acknowledged_at AS acknowledgedAt,
      resolution_note AS resolutionNote FROM handoffs WHERE id = ?`).get(handoffId) as {
        id: string;
        status: HandoffStatus;
        ownerId: string | null;
        acknowledgedAt: string | null;
        resolutionNote: string | null;
      } | undefined;
    if (!current) throw notFound('Handoff not found.');

    let nextStatus = current.status;
    let nextOwner = current.ownerId;
    let actionName: string = action;
    let acknowledgedAt = current.acknowledgedAt;
    let resolutionNote: string | null = current.resolutionNote;

    if (action === 'claim') {
      if (current.status !== 'new' || current.ownerId !== null) {
        throw invalidTransition(action, current.status);
      }
      nextStatus = 'assigned';
      nextOwner = actorId;
      actionName = 'claimed';
    } else if (action === 'assign') {
      if (!options.ownerId) throw new ApiError(400, 'owner_required', 'Choose an owner.');
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(options.ownerId);
      if (!target) throw new ApiError(400, 'owner_not_found', 'The selected owner is not available.');
      if (current.ownerId === options.ownerId) throw new ApiError(409, 'already_owner', 'That person already owns this handoff.');
      if (current.status === 'new' || current.status === 'reopened') {
        nextStatus = 'assigned';
        acknowledgedAt = null;
        resolutionNote = null;
        actionName = 'assigned';
      } else if (current.status === 'assigned' || current.status === 'acknowledged') {
        actionName = 'reassigned';
      } else {
        throw invalidTransition(action, current.status);
      }
      nextOwner = options.ownerId;
    } else if (action === 'acknowledge') {
      if ((current.status !== 'assigned' && current.status !== 'reopened') || current.ownerId === null) {
        throw invalidTransition(action, current.status);
      }
      nextStatus = 'acknowledged';
      acknowledgedAt = nowIso;
      resolutionNote = null;
      actionName = 'acknowledged';
    } else if (action === 'resolve') {
      if (current.status !== 'acknowledged') throw invalidTransition(action, current.status);
      if (!options.note) throw new ApiError(400, 'resolution_note_required', 'Add a short note describing the resolution.');
      nextStatus = 'resolved';
      resolutionNote = options.note;
      actionName = 'resolved';
    } else if (action === 'reopen') {
      if (current.status !== 'resolved') throw invalidTransition(action, current.status);
      nextStatus = 'reopened';
      acknowledgedAt = null;
      resolutionNote = null;
      actionName = 'reopened';
    }

    if (action === 'assign' && (current.status === 'assigned' || current.status === 'acknowledged')) {
      db.prepare(`UPDATE handoffs SET owner_id = ?, updated_at = ? WHERE id = ?`).run(nextOwner, nowIso, handoffId);
    } else {
      db.prepare(`UPDATE handoffs SET status = ?, owner_id = ?, acknowledged_at = ?,
        resolution_note = ?, updated_at = ? WHERE id = ?`)
        .run(nextStatus, nextOwner, acknowledgedAt, resolutionNote, nowIso, handoffId);
    }
    recordActivity(db, {
      handoffId,
      actorId,
      action: actionName,
      fromStatus: current.status,
      toStatus: nextStatus,
      fromOwnerId: current.ownerId,
      toOwnerId: nextOwner,
      note: action === 'resolve' ? options.note ?? null : null,
      occurredAt: nowIso,
    });
  });
  transaction();
  return getHandoff(db, handoffId);
}

function invalidTransition(action: string, status: HandoffStatus): ApiError {
  return new ApiError(409, 'invalid_transition', `Cannot ${action} a handoff while it is ${status}.`, {
    action,
    currentStatus: status,
  });
}

export function getActivity(db: Db, handoffId: string): ActivityView[] {
  if (!selectHandoff(db, handoffId)) throw notFound('Handoff not found.');
  const rows = db.prepare(`SELECT a.id, a.actor_id AS actorId, actor.display_name AS actorName,
    a.action, a.from_status AS fromStatus, a.to_status AS toStatus,
    a.from_owner_id AS fromOwnerId, old_owner.display_name AS fromOwnerName,
    a.to_owner_id AS toOwnerId, new_owner.display_name AS toOwnerName,
    a.note, a.occurred_at AS occurredAt
    FROM activity a
    JOIN users actor ON actor.id = a.actor_id
    LEFT JOIN users old_owner ON old_owner.id = a.from_owner_id
    LEFT JOIN users new_owner ON new_owner.id = a.to_owner_id
    WHERE a.handoff_id = ? ORDER BY a.occurred_at ASC, a.rowid ASC`)
    .all(handoffId) as Array<Omit<ActivityView, 'fromStatus' | 'toStatus'> & { fromStatus: HandoffStatus | null; toStatus: HandoffStatus | null }>;
  return rows;
}
