export type Provenance = 'ring_live' | 'ring_playground' | 'ring_simulated' | 'manual';
export type HandoffStatus = 'new' | 'assigned' | 'acknowledged' | 'resolved' | 'reopened';
export type HandoffCategory = 'visitor' | 'delivery' | 'access' | 'other';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type RingEventType = 'button_press' | 'motion_detected';

export interface HandoffView {
  id: string;
  sourceEventId: string | null;
  category: HandoffCategory;
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

export interface ActivityView {
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
