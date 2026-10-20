export type Provenance = 'ring_live' | 'ring_playground' | 'ring_simulated' | 'manual';
export type HandoffStatus = 'new' | 'assigned' | 'acknowledged' | 'resolved' | 'reopened';
export type Category = 'visitor' | 'delivery' | 'access' | 'other';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface User {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
}

export interface Handoff {
  id: string;
  sourceEventId: string | null;
  category: Category;
  summary: string;
  priority: Priority;
  status: HandoffStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  resolutionNote: string | null;
  isStalled: boolean;
  isOverdue: boolean;
  isSynthetic: boolean;
  createdAt: string;
  updatedAt: string;
  provenance: Provenance;
  sourceEventType: string;
  sourceOccurredAt: string;
  sourceReceivedAt: string;
  sourceSummary: string;
  sourceEventSynthetic: boolean;
}

export interface ActivityItem {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  fromStatus: HandoffStatus | null;
  toStatus: HandoffStatus | null;
  fromOwnerId: string | null;
  fromOwnerName: string | null;
  toOwnerId: string | null;
  toOwnerName: string | null;
  note: string | null;
  occurredAt: string;
}

export interface InboxEvent {
  id: string;
  provenance: Provenance;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  summary: string;
  isSynthetic: boolean;
}

export interface Overview {
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
  needsAttention: Handoff[];
  recentActivity: Array<{
    id: string;
    action: string;
    actorName: string;
    handoffId: string | null;
    handoffSummary: string | null;
    sourceEventSummary: string | null;
    occurredAt: string;
  }>;
  stallThresholdHours: number;
}

export interface ApiFailureShape {
  error?: { code?: string; message?: string; details?: unknown };
}
