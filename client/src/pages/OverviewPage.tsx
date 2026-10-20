import { useCallback, useEffect, useState } from 'react';
import { BellRing, CircleAlert, CircleCheck, Clock3, ListChecks, UserRound, UsersRound, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api';
import type { Handoff, Overview } from '../types';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';
import { formatDate, actionLabel } from '../components/format';

function Metric({ label, value, hint, icon: Icon, tone, to }: {
  label: string; value: number; hint: string; icon: typeof Activity; tone?: string; to?: string;
}) {
  const content = (
    <>
      <div className="metric-top"><span className="metric-label">{label}</span><span className={`metric-icon ${tone ?? ''}`}><Icon size={15} aria-hidden="true" /></span></div>
      <div className="metric-value">{value}<span className="metric-hint">{hint}</span></div>
    </>
  );
  return to ? <Link className={`card metric-card ${tone ?? ''}`} to={to}>{content}</Link> : <article className={`card metric-card ${tone ?? ''}`}>{content}</article>;
}

function AttentionRow({ handoff }: { handoff: Handoff }) {
  return (
    <article className="attention-row">
      <span className={`attention-indicator ${handoff.isOverdue ? 'overdue' : handoff.isStalled ? 'stalled' : handoff.priority}`} />
      <div className="attention-main">
        <Link className="attention-title" to={`/handoffs/${handoff.id}`}>{handoff.summary}</Link>
        <div className="attention-meta">
          <StatusBadge status={handoff.status} />
          <span>{handoff.ownerName ?? 'Unassigned'}</span>
          <ProvenanceBadge provenance={handoff.provenance} isSynthetic={handoff.isSynthetic} />
        </div>
      </div>
      <div className="attention-signals">
        {handoff.isStalled && <span className="signal-pill">Stalled</span>}
        {handoff.isOverdue && <span className="signal-pill signal-red">Overdue</span>}
        {!handoff.isStalled && !handoff.isOverdue && <PriorityBadge priority={handoff.priority} />}
      </div>
    </article>
  );
}

export function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void apiGet<Overview>('/api/overview').then((result) => {
      if (alive) { setData(result); setError(null); }
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Could not load the overview.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  if (loading && !data) return <LoadingState label="Loading your overview…" />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return <DataStateFallback />;

  return (
    <div>
      <div className="overview-intro">
        <div><p className="eyebrow">OVERVIEW</p><h1>Keep the next step in view.</h1><p>Track a door event from first notice to a real resolution. Acknowledgement is progress—not completion.</p></div>
        <Link to="/inbox" className="button button-secondary button-small"><BellRing size={15} aria-hidden="true" />Inbox <span className="panel-count">{data.counts.inbox}</span></Link>
      </div>
      {error && <ErrorState message={error} onRetry={retry} />}
      <section className="metric-grid" aria-label="Handoff counts">
        <Metric label="Unassigned" value={data.counts.unassigned} hint="needs an owner" icon={UserRound} to="/handoffs?status=new&ownerId=unassigned" />
        <Metric label="Awaiting acknowledgement" value={data.counts.awaitingAcknowledgement} hint="owner has not acknowledged" icon={Clock3} to="/handoffs?status=awaiting_acknowledgement" />
        <Metric label="Acknowledged" value={data.counts.acknowledged} hint="work in progress" icon={UsersRound} to="/handoffs?status=acknowledged" />
        <Metric label="Overdue" value={data.counts.overdue} hint="due date passed" icon={CircleAlert} tone="metric-danger" />
        <Metric label="Stalled" value={data.counts.stalled} hint={`>${data.stallThresholdHours}h acknowledged`} icon={ListChecks} tone="metric-warning" to="/handoffs?status=acknowledged" />
        <Metric label="Resolved" value={data.counts.resolved} hint="completed with a note" icon={CircleCheck} to="/handoffs?status=resolved" />
      </section>
      <div className="dashboard-grid">
        <section className="card panel" aria-labelledby="needs-title">
          <div className="panel-header"><div><h2 className="panel-title" id="needs-title">Needs attention</h2><p className="panel-subtitle">Open work ordered by due date, stalled state, and priority.</p></div><span className="panel-count">{data.counts.needsAttention} open</span></div>
          {data.needsAttention.length ? <div className="attention-list">{data.needsAttention.map((item) => <AttentionRow handoff={item} key={item.id} />)}</div> : (
            <EmptyState title="Nothing waiting right now" detail="New events and handoffs will appear here as they need an owner." action={<Link className="button button-secondary button-small" to="/inbox">Review event inbox</Link>} />
          )}
          <div style={{ marginTop: 11 }}><Link className="link-button" to="/handoffs">View all handoffs →</Link></div>
        </section>
        <section className="card panel" aria-labelledby="activity-title">
          <div className="panel-header"><div><h2 className="panel-title" id="activity-title">Recent activity</h2><p className="panel-subtitle">Changes recorded in the workspace.</p></div><Activity size={16} color="#7a9698" aria-hidden="true" /></div>
          {data.recentActivity.length ? <div className="recent-list">{data.recentActivity.map((item) => {
            const title = item.handoffSummary ?? item.sourceEventSummary ?? 'Incoming event';
            const content = <><p><strong>{item.actorName}</strong> {actionLabel(item.action)}{item.handoffSummary ? <>: <strong>{item.handoffSummary}</strong></> : null}</p><span>{formatDate(item.occurredAt, true)}</span></>;
            return <div className="recent-item" key={item.id}><span className="recent-mark"><Activity size={13} aria-hidden="true" /></span><div className="recent-copy">{item.handoffId ? <Link to={`/handoffs/${item.handoffId}`} aria-label={`${title}: ${item.action}`}>{content}</Link> : content}</div></div>;
          })}</div> : <div className="activity-empty">Activity will appear here when a handoff is created or updated.</div>}
        </section>
      </div>
    </div>
  );
}

function DataStateFallback() {
  return <DataState message="The overview is temporarily unavailable." />;
}

function DataState({ message }: { message: string }) {
  return <div className="error-state" role="alert">{message}</div>;
}
