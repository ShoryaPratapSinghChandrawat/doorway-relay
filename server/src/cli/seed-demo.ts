import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../db/index.js';
import { DEMO_TEAM } from '../db/seeds.js';
import { hashPassword } from '../auth/password.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seeding is disabled in production.');
}

const db = openDatabase(process.env.DATABASE_PATH ?? './data/doorway-relay.sqlite');
const demoEmail = (process.env.DEMO_EMAIL ?? 'demo@doorway.local').toLowerCase();
const demoPassword = process.env.DEMO_PASSWORD?.trim();
const existingDemo = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(demoEmail) as { id: string } | undefined;
let primaryUserId = existingDemo?.id;

if (!primaryUserId) {
  if (!demoPassword || demoPassword.length < 12 || /replace|placeholder/i.test(demoPassword)) {
    db.close();
    throw new Error('Set DEMO_PASSWORD to a local value of at least 12 characters in .env before seeding a demo login.');
  }
  const credentials = hashPassword(demoPassword);
  primaryUserId = randomUUID();
  db.prepare(`INSERT INTO users (id, email, display_name, password_salt, password_hash, is_demo, login_enabled, created_at)
    VALUES (?, ?, 'Demo coordinator', ?, ?, 1, 1, ?)`)
    .run(primaryUserId, demoEmail, credentials.salt, credentials.hash, new Date().toISOString());
}

for (const member of DEMO_TEAM) {
  db.prepare(`INSERT OR IGNORE INTO users
    (id, email, display_name, password_salt, password_hash, is_demo, login_enabled, created_at)
    VALUES (?, ?, ?, NULL, NULL, 1, 0, ?)`)
    .run(member.id, member.email, member.displayName, new Date().toISOString());
}

const primary = db.prepare('SELECT id FROM users WHERE id = ?').get(primaryUserId) as { id: string };
const owners = [primary.id, ...DEMO_TEAM.map((member) => member.id)];
const now = Date.now();
const timestamp = (offsetHours: number): string => new Date(now + offsetHours * 60 * 60 * 1000).toISOString();

interface SeedHandoff {
  id: string;
  eventId: string;
  provenance: 'manual' | 'ring_simulated';
  eventType: string;
  externalEventId: string | null;
  summary: string;
  category: 'visitor' | 'delivery' | 'access' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'new' | 'assigned' | 'acknowledged' | 'resolved' | 'reopened';
  ownerId: string | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  isSynthetic: 1;
}

const seedHandoffs: SeedHandoff[] = [
  {
    id: 'demo-handoff-unassigned', eventId: 'demo-source-unassigned', provenance: 'manual', eventType: 'manual', externalEventId: null,
    summary: 'Check whether the front step package was brought inside', category: 'delivery', priority: 'high', status: 'new', ownerId: null,
    dueAt: timestamp(8), acknowledgedAt: null, resolutionNote: null, createdAt: timestamp(-1), updatedAt: timestamp(-1), isSynthetic: 1,
  },
  {
    id: 'demo-handoff-assigned', eventId: 'demo-source-assigned', provenance: 'ring_simulated', eventType: 'button_press', externalEventId: 'demo-upstream-assigned',
    summary: 'Meet the visitor at the shared entrance', category: 'visitor', priority: 'normal', status: 'assigned', ownerId: owners[1] ?? primary.id,
    dueAt: timestamp(2), acknowledgedAt: null, resolutionNote: null, createdAt: timestamp(-3), updatedAt: timestamp(-1), isSynthetic: 1,
  },
  {
    id: 'demo-handoff-stalled', eventId: 'demo-source-stalled', provenance: 'ring_simulated', eventType: 'motion_detected', externalEventId: 'demo-upstream-stalled',
    summary: 'Check the side entrance after a motion alert', category: 'access', priority: 'urgent', status: 'acknowledged', ownerId: primary.id,
    dueAt: null, acknowledgedAt: timestamp(-30), resolutionNote: null, createdAt: timestamp(-34), updatedAt: timestamp(-30), isSynthetic: 1,
  },
  {
    id: 'demo-handoff-overdue', eventId: 'demo-source-overdue', provenance: 'manual', eventType: 'manual', externalEventId: null,
    summary: 'Confirm the common-room door is latched', category: 'access', priority: 'high', status: 'assigned', ownerId: owners[2] ?? primary.id,
    dueAt: timestamp(-2), acknowledgedAt: null, resolutionNote: null, createdAt: timestamp(-10), updatedAt: timestamp(-8), isSynthetic: 1,
  },
  {
    id: 'demo-handoff-resolved', eventId: 'demo-source-resolved', provenance: 'ring_simulated', eventType: 'button_press', externalEventId: 'demo-upstream-resolved',
    summary: 'Help a visitor find the correct entrance', category: 'visitor', priority: 'normal', status: 'resolved', ownerId: owners[1] ?? primary.id,
    dueAt: null, acknowledgedAt: timestamp(-6), resolutionNote: 'Visitor was met and guided to the accessible entrance.',
    createdAt: timestamp(-9), updatedAt: timestamp(-5), isSynthetic: 1,
  },
  {
    id: 'demo-handoff-reopened', eventId: 'demo-source-reopened', provenance: 'manual', eventType: 'manual', externalEventId: null,
    summary: 'Follow up on the entryway light', category: 'other', priority: 'low', status: 'reopened', ownerId: owners[2] ?? primary.id,
    dueAt: null, acknowledgedAt: null, resolutionNote: null, createdAt: timestamp(-48), updatedAt: timestamp(-1), isSynthetic: 1,
  },
];

function createActivity(id: string, handoffId: string, actorId: string, action: string, fromStatus: string | null,
  toStatus: string | null, fromOwnerId: string | null, toOwnerId: string | null, note: string | null, at: string): void {
  db.prepare(`INSERT OR IGNORE INTO activity
    (id, handoff_id, source_event_id, actor_id, action, from_status, to_status, from_owner_id, to_owner_id, note, occurred_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, handoffId, actorId, action, fromStatus, toStatus, fromOwnerId, toOwnerId, note, at);
}

const seedRows = db.transaction(() => {
  for (const item of seedHandoffs) {
    db.prepare(`INSERT OR IGNORE INTO source_events
      (id, provenance, ring_event_type, external_event_id, request_id, device_id, occurred_at, received_at,
       summary, classification_status, classified_at, is_synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'classified', ?, 1, ?)`)
      .run(item.eventId, item.provenance, item.eventType, item.externalEventId, `demo-request-${item.id}`,
        item.createdAt, item.createdAt, 'Synthetic seeded source event.', item.createdAt, item.createdAt);
    db.prepare(`INSERT OR IGNORE INTO handoffs
      (id, source_event_id, category, summary, priority, status, owner_id, due_at, acknowledged_at,
       resolution_note, is_synthetic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(item.id, item.eventId, item.category, item.summary, item.priority, item.status, item.ownerId,
        item.dueAt, item.acknowledgedAt, item.resolutionNote, item.createdAt, item.updatedAt);
  }

  createActivity('demo-activity-unassigned', 'demo-handoff-unassigned', primary.id, 'created_manual', null, 'new', null, null, 'Synthetic demo row.', timestamp(-1));
  createActivity('demo-activity-assigned-created', 'demo-handoff-assigned', primary.id, 'classified_event', null, 'new', null, null, 'Synthetic demo row.', timestamp(-3));
  createActivity('demo-activity-assigned', 'demo-handoff-assigned', primary.id, 'assigned', 'new', 'assigned', null, owners[1] ?? primary.id, null, timestamp(-1));
  createActivity('demo-activity-stalled-created', 'demo-handoff-stalled', primary.id, 'classified_event', null, 'new', null, null, 'Synthetic demo row.', timestamp(-34));
  createActivity('demo-activity-stalled-assigned', 'demo-handoff-stalled', primary.id, 'assigned', 'new', 'assigned', null, primary.id, null, timestamp(-32));
  createActivity('demo-activity-stalled-ack', 'demo-handoff-stalled', primary.id, 'acknowledged', 'assigned', 'acknowledged', primary.id, primary.id, null, timestamp(-30));
  createActivity('demo-activity-overdue-created', 'demo-handoff-overdue', primary.id, 'created_manual', null, 'new', null, null, 'Synthetic demo row.', timestamp(-10));
  createActivity('demo-activity-overdue-assigned', 'demo-handoff-overdue', primary.id, 'assigned', 'new', 'assigned', null, owners[2] ?? primary.id, null, timestamp(-8));
  createActivity('demo-activity-resolved-created', 'demo-handoff-resolved', primary.id, 'classified_event', null, 'new', null, null, 'Synthetic demo row.', timestamp(-9));
  createActivity('demo-activity-resolved-assigned', 'demo-handoff-resolved', primary.id, 'assigned', 'new', 'assigned', null, owners[1] ?? primary.id, null, timestamp(-8));
  createActivity('demo-activity-resolved-ack', 'demo-handoff-resolved', primary.id, 'acknowledged', 'assigned', 'acknowledged', owners[1] ?? primary.id, owners[1] ?? primary.id, null, timestamp(-6));
  createActivity('demo-activity-resolved', 'demo-handoff-resolved', primary.id, 'resolved', 'acknowledged', 'resolved', owners[1] ?? primary.id, owners[1] ?? primary.id, 'Visitor was met and guided to the accessible entrance.', timestamp(-5));
  createActivity('demo-activity-reopened-created', 'demo-handoff-reopened', primary.id, 'created_manual', null, 'new', null, null, 'Synthetic demo row.', timestamp(-48));
  createActivity('demo-activity-reopened-assigned', 'demo-handoff-reopened', primary.id, 'assigned', 'new', 'assigned', null, owners[2] ?? primary.id, null, timestamp(-47));
  createActivity('demo-activity-reopened-ack', 'demo-handoff-reopened', primary.id, 'acknowledged', 'assigned', 'acknowledged', owners[2] ?? primary.id, owners[2] ?? primary.id, null, timestamp(-46));
  createActivity('demo-activity-reopened-resolved', 'demo-handoff-reopened', primary.id, 'resolved', 'acknowledged', 'resolved', owners[2] ?? primary.id, owners[2] ?? primary.id, 'Synthetic earlier resolution.', timestamp(-45));
  createActivity('demo-activity-reopened', 'demo-handoff-reopened', primary.id, 'reopened', 'resolved', 'reopened', owners[2] ?? primary.id, owners[2] ?? primary.id, null, timestamp(-1));

  const inboxRows = [
    { id: 'demo-inbox-button', eventId: 'demo-inbox-upstream-button', eventType: 'button_press', summary: 'A doorbell button was pressed. Review the context before creating a handoff.', at: timestamp(-0.1) },
    { id: 'demo-inbox-motion', eventId: 'demo-inbox-upstream-motion', eventType: 'motion_detected', summary: 'Motion was detected. Review the context before creating a handoff.', at: timestamp(-0.25) },
  ];
  for (const event of inboxRows) {
    db.prepare(`INSERT OR IGNORE INTO source_events
      (id, provenance, ring_event_type, external_event_id, request_id, device_id, occurred_at, received_at,
       summary, classification_status, classified_at, is_synthetic, created_at)
      VALUES (?, 'ring_simulated', ?, ?, ?, NULL, ?, ?, ?, 'pending', NULL, 1, ?)`)
      .run(event.id, event.eventType, event.eventId, `demo-request-${event.id}`, event.at, event.at, event.summary, event.at);
  }
});

seedRows();
console.log(`Inserted or preserved explicitly labelled synthetic demo data for ${owners.length} workspace members. No Ring API or event source was used.`);
db.close();
