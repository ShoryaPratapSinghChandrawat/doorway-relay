import { Clock3, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Handoff } from '../types';
import { ProvenanceBadge } from './ProvenanceBadge';
import { PriorityBadge, StatusBadge } from './StatusBadge';
import { formatDate } from './format';

const categoryLabels = { visitor: 'Visitor', delivery: 'Delivery', access: 'Access', other: 'Other' } as const;

export function HandoffCard({ handoff }: { handoff: Handoff }) {
  return (
    <article className="card mobile-handoff-card">
      <div className="mobile-card-top">
        <ProvenanceBadge provenance={handoff.provenance} isSynthetic={handoff.isSynthetic} />
        <StatusBadge status={handoff.status} />
      </div>
      <Link className="mobile-card-title" to={`/handoffs/${handoff.id}`}>{handoff.summary}</Link>
      <div className="mobile-card-meta">
        <span>{categoryLabels[handoff.category]}</span>
        <PriorityBadge priority={handoff.priority} />
        <span><UserRound size={12} aria-hidden="true" /> {handoff.ownerName ?? 'Unassigned'}</span>
        <span><Clock3 size={12} aria-hidden="true" /> {handoff.dueAt ? `Due ${formatDate(handoff.dueAt)}` : 'No due date'}</span>
      </div>
      {(handoff.isStalled || handoff.isOverdue) && <div className="attention-signals" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        {handoff.isStalled && <span className="signal-pill">Stalled</span>}
        {handoff.isOverdue && <span className="signal-pill signal-red">Overdue</span>}
      </div>}
    </article>
  );
}
