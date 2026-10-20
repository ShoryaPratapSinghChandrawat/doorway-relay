import type { HandoffStatus, Priority } from '../types';

const statusLabel: Record<HandoffStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  reopened: 'Reopened',
};

export function StatusBadge({ status }: { status: HandoffStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabel[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority priority-${priority}`}>{priority}</span>;
}
