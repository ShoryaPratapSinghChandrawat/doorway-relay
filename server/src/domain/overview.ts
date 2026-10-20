import type { Db } from '../db/index.js';
import type { HandoffView } from './types.js';
import { listHandoffs } from './handoffs.js';

interface OverviewActivity {
  id: string;
  action: string;
  actorName: string;
  handoffId: string | null;
  handoffSummary: string | null;
  sourceEventSummary: string | null;
  occurredAt: string;
}

export interface OverviewData {
  counts: {
    needsAttention: number;
    unassigned: number;
    awaitingAcknowledgement: number;
    assigned: number;
    acknowledged: number;
    overdue: number;
    stalled: number;
    resolved: number;
    inbox: number;
  };
  needsAttention: HandoffView[];
  recentActivity: OverviewActivity[];
  stallThresholdHours: number;
}

export function getOverview(db: Db, stallThresholdHours: number, now = Date.now()): OverviewData {
  const rows = db.prepare(`SELECT
    SUM(CASE WHEN h.status <> 'resolved' THEN 1 ELSE 0 END) AS needsAttention,
    SUM(CASE WHEN h.status = 'new' AND h.owner_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
    SUM(CASE WHEN h.status IN ('assigned', 'reopened') THEN 1 ELSE 0 END) AS awaitingAcknowledgement,
    SUM(CASE WHEN h.status = 'assigned' THEN 1 ELSE 0 END) AS assigned,
    SUM(CASE WHEN h.status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged,
    SUM(CASE WHEN h.status <> 'resolved' AND h.due_at IS NOT NULL AND h.due_at < ? THEN 1 ELSE 0 END) AS overdue,
    SUM(CASE WHEN h.status = 'acknowledged' AND h.acknowledged_at IS NOT NULL AND h.acknowledged_at <= ? THEN 1 ELSE 0 END) AS stalled,
    SUM(CASE WHEN h.status = 'resolved' THEN 1 ELSE 0 END) AS resolved
    FROM handoffs h`)
    .get(new Date(now).toISOString(), new Date(now - stallThresholdHours * 60 * 60 * 1000).toISOString()) as Record<string, number | null>;
  const inboxCount = db.prepare("SELECT COUNT(*) AS count FROM source_events WHERE classification_status = 'pending'")
    .get() as { count: number };
  const totalHandoffs = db.prepare('SELECT COUNT(*) AS count FROM handoffs').get() as { count: number };
  const handoffResult = listHandoffs(db, { page: 1, limit: Math.max(1, totalHandoffs.count), sort: 'updated_desc' }, now, stallThresholdHours);
  const needsAttention = handoffResult.items
    .filter((handoff) => handoff.status !== 'resolved')
    .sort((left, right) => {
      const attention = Number(right.isOverdue || right.isStalled) - Number(left.isOverdue || left.isStalled);
      const priority = ['urgent', 'high', 'normal', 'low'].indexOf(left.priority) - ['urgent', 'high', 'normal', 'low'].indexOf(right.priority);
      return attention || priority || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    }).slice(0, 6);
  const activity = db.prepare(`SELECT a.id, a.action, actor.display_name AS actorName,
    a.handoff_id AS handoffId, h.summary AS handoffSummary, s.summary AS sourceEventSummary,
    a.occurred_at AS occurredAt
    FROM activity a
    JOIN users actor ON actor.id = a.actor_id
    LEFT JOIN handoffs h ON h.id = a.handoff_id
    LEFT JOIN source_events s ON s.id = a.source_event_id
    ORDER BY a.occurred_at DESC, a.rowid DESC LIMIT 8`).all() as OverviewActivity[];
  return {
    counts: {
      needsAttention: rows.needsAttention ?? 0,
      unassigned: rows.unassigned ?? 0,
      awaitingAcknowledgement: rows.awaitingAcknowledgement ?? 0,
      assigned: rows.assigned ?? 0,
      acknowledged: rows.acknowledged ?? 0,
      overdue: rows.overdue ?? 0,
      stalled: rows.stalled ?? 0,
      resolved: rows.resolved ?? 0,
      inbox: inboxCount.count,
    },
    needsAttention,
    recentActivity: activity,
    stallThresholdHours,
  };
}
