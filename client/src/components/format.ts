import type { HandoffStatus } from '../types';

export function formatDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

export function statusPhrase(status: HandoffStatus): string {
  return ({
    new: 'needs an owner',
    assigned: 'assigned',
    acknowledged: 'acknowledged — not resolved',
    resolved: 'resolved',
    reopened: 'reopened',
  })[status];
}

export function eventTypeLabel(type: string): string {
  if (type === 'button_press') return 'Button press';
  if (type === 'motion_detected') return 'Motion detected';
  if (type === 'manual') return 'Manual handoff';
  return 'Door event';
}

export function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    created_manual: 'created a manual handoff',
    classified_event: 'classified an incoming door event',
    claimed: 'claimed ownership',
    assigned: 'assigned the handoff',
    reassigned: 'reassigned the handoff',
    acknowledged: 'acknowledged the handoff',
    resolved: 'resolved the handoff',
    reopened: 'reopened the handoff',
    ignored_event: 'chose not to create a handoff',
  };
  return labels[action] ?? 'updated the handoff';
}
