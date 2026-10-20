import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCheck, CircleCheck, CornerUpLeft, UserRound, Clock3, Shield } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';
import type { ActivityItem, Handoff } from '../types';
import { ErrorState, LoadingState } from '../components/DataState';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';
import { actionLabel, eventTypeLabel, formatDate } from '../components/format';

interface DetailResponse { handoff: Handoff; activity: ActivityItem[]; }
interface OwnerOption { id: string; displayName: string; isDemo: boolean; }
const categoryLabels = { visitor: 'Visitor', delivery: 'Delivery', access: 'Access', other: 'Other' } as const;

export function HandoffDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await apiGet<DetailResponse>(`/api/handoffs/${encodeURIComponent(id)}`);
      setData(result);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load this handoff.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load, reloadKey]);
  useEffect(() => {
    let alive = true;
    void apiGet<{ users: OwnerOption[] }>('/api/users').then((result) => { if (alive) setOwners(result.users); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function act(path: string, body?: unknown) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(path, body);
      setAssignOpen(false);
      setSelectedOwner('');
      setResolutionNote('');
      await load();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'That action could not be completed.');
    } finally { setBusy(false); }
  }

  async function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOwner) { setActionError('Choose a person to own this handoff.'); return; }
    await act(`/api/handoffs/${encodeURIComponent(id)}/assign`, { ownerId: selectedOwner });
  }

  async function submitResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resolutionNote.trim().length < 2) { setActionError('Add a short note describing what was completed.'); return; }
    await act(`/api/handoffs/${encodeURIComponent(id)}/resolve`, { note: resolutionNote.trim() });
  }

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);
  if (loading && !data) return <LoadingState label="Loading handoff details…" />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return <ErrorState message="This handoff could not be found." onRetry={retry} />;
  const { handoff, activity } = data;
  const canAssign = handoff.status === 'new' || handoff.status === 'assigned' || handoff.status === 'acknowledged' || handoff.status === 'reopened';

  return (
    <div>
      <div className="page-heading">
        <div><Link to="/handoffs" className="link-button"><ArrowLeft size={14} aria-hidden="true" /> Back to handoffs</Link><p className="eyebrow" style={{ marginTop: 15 }}>HANDOFF DETAILS</p><h1>Follow through, step by step.</h1></div>
        <div className="heading-actions"><ProvenanceBadge provenance={handoff.provenance} isSynthetic={handoff.isSynthetic} /></div>
      </div>
      {error && <ErrorState message={error} onRetry={retry} />}
      <div className="detail-layout">
        <div className="detail-main">
          <section className="card detail-card">
            <div className="detail-topline"><div className="detail-meta"><span>ID {handoff.id}</span><span>·</span><span>Created {formatDate(handoff.createdAt, true)}</span></div><StatusBadge status={handoff.status} /></div>
            <h2 className="detail-summary">{handoff.summary}</h2>
            <div className="detail-meta"><span>{categoryLabels[handoff.category]}</span><PriorityBadge priority={handoff.priority} />{handoff.isStalled && <span className="signal-pill">Stalled</span>}{handoff.isOverdue && <span className="signal-pill signal-red">Overdue</span>}</div>
            <div className="detail-divider" />
            <div className="data-pairs">
              <div className="data-pair"><span>Current owner</span><strong className="detail-owner"><span className="owner-mini">{handoff.ownerName?.slice(0, 1).toUpperCase() ?? '—'}</span>{handoff.ownerName ?? 'Unassigned'}</strong></div>
              <div className="data-pair"><span>Due date</span><strong>{handoff.dueAt ? formatDate(handoff.dueAt, true) : 'No due date'}</strong></div>
              <div className="data-pair"><span>Current state</span><strong>{handoff.status === 'acknowledged' ? 'Acknowledged — still open' : handoff.status === 'new' ? 'New — waiting for an owner' : handoff.status[0]?.toUpperCase() + handoff.status.slice(1)}</strong></div>
              <div className="data-pair"><span>Last updated</span><strong>{formatDate(handoff.updatedAt, true)}</strong></div>
            </div>
            {handoff.resolutionNote && <div className="timeline-note" style={{ marginTop: 15 }}><strong>Resolution note:</strong> {handoff.resolutionNote}</div>}
            <div className="detail-divider" />
            <div className="source-event-block">
              <div className="source-event-title"><strong><Shield size={13} aria-hidden="true" /> Source event · {eventTypeLabel(handoff.sourceEventType)}</strong><ProvenanceBadge provenance={handoff.provenance} isSynthetic={handoff.sourceEventSynthetic} /></div>
              <p>{handoff.sourceSummary}</p>
              <div className="detail-meta" style={{ marginTop: 8 }}><span><Clock3 size={12} aria-hidden="true" /> Occurred {formatDate(handoff.sourceOccurredAt, true)}</span><span>Received {formatDate(handoff.sourceReceivedAt, true)}</span></div>
            </div>
          </section>
          <section className="card detail-card" aria-labelledby="timeline-title">
            <div className="panel-header"><div><h2 className="panel-title" id="timeline-title">Activity timeline</h2><p className="panel-subtitle">Every successful change is recorded. Acknowledgement never closes the handoff.</p></div><span className="panel-count">{activity.length} updates</span></div>
            {activity.length ? <ol className="timeline">{activity.map((item) => (
              <li className="timeline-item" key={item.id}><span className="timeline-dot" aria-hidden="true" /><div className="timeline-copy"><p><strong>{item.actorName}</strong> {actionLabel(item.action)}{item.action === 'assigned' || item.action === 'reassigned' || item.action === 'claimed' ? <> {item.toOwnerName ? <>to <strong>{item.toOwnerName}</strong></> : null}</> : null}</p><small>{formatDate(item.occurredAt, true)}{item.toStatus ? ` · ${item.toStatus}` : ''}</small>{item.note && <div className="timeline-note">{item.note}</div>}</div></li>
            ))}</ol> : <p className="activity-empty">No changes have been recorded yet.</p>}
          </section>
        </div>
        <aside className="detail-side">
          <section className="card action-panel" aria-labelledby="actions-title">
            <h3 id="actions-title">Next action</h3>
            <p>{handoff.status === 'new' ? 'Give this task an owner before work starts.' : handoff.status === 'assigned' ? 'The owner can acknowledge they have seen the task.' : handoff.status === 'acknowledged' ? 'Acknowledged work remains open until someone resolves it.' : handoff.status === 'resolved' ? 'Reopen if the task needs more attention.' : 'Assign the reopened task or acknowledge it if an owner remains.'}</p>
            {actionError && <p className="form-notice" role="alert">{actionError}</p>}
            <div className="action-stack">
              {handoff.status === 'new' && <button className="button button-primary" disabled={busy} onClick={() => void act(`/api/handoffs/${encodeURIComponent(id)}/claim`)}><UserRound size={15} />Claim this handoff</button>}
              {handoff.status === 'assigned' && <button className="button button-primary" disabled={busy} onClick={() => void act(`/api/handoffs/${encodeURIComponent(id)}/acknowledge`)}><CheckCheck size={15} />Acknowledge</button>}
              {handoff.status === 'reopened' && handoff.ownerId && <button className="button button-primary" disabled={busy} onClick={() => void act(`/api/handoffs/${encodeURIComponent(id)}/acknowledge`)}><CheckCheck size={15} />Acknowledge again</button>}
              {handoff.status === 'acknowledged' && <form className="inline-form" onSubmit={(event) => void submitResolve(event)}>
                <label className="form-field"><span className="form-label">Resolution note</span><textarea className="field-control" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} minLength={2} maxLength={300} placeholder="What was completed?" /></label>
                <button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Resolve handoff'}<CircleCheck size={15} /></button>
              </form>}
              {handoff.status === 'resolved' && <button className="button button-secondary" disabled={busy} onClick={() => void act(`/api/handoffs/${encodeURIComponent(id)}/reopen`)}><CornerUpLeft size={15} />Reopen handoff</button>}
              {canAssign && <button className="button button-secondary" type="button" onClick={() => { setAssignOpen((value) => !value); setActionError(null); }}>{handoff.status === 'assigned' || handoff.status === 'acknowledged' ? 'Reassign owner' : 'Assign to someone'}</button>}
            </div>
            {assignOpen && canAssign && <form className="inline-form" onSubmit={(event) => void submitAssign(event)}>
              <label className="form-field"><span className="form-label">New owner</span><select className="field-control" value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)} required>
                <option value="">Choose a person…</option>{owners.filter((owner) => owner.id !== handoff.ownerId).map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}
              </select></label>
              <button className="button button-primary" disabled={busy || !selectedOwner}>{busy ? 'Saving…' : handoff.status === 'assigned' || handoff.status === 'acknowledged' ? 'Save reassignment' : 'Assign handoff'}</button>
            </form>}
            {handoff.status === 'acknowledged' && <div className="integration-note" style={{ marginTop: 12 }}>Still open: an acknowledgement confirms someone saw it; only a resolution note closes it.</div>}
          </section>
          <section className="card detail-card">
            <h3 className="panel-title">At a glance</h3>
            <div className="detail-divider" />
            <div className="data-pair"><span>Detected</span><strong>{formatDate(handoff.sourceOccurredAt, true)}</strong></div>
            <div className="data-pair" style={{ marginTop: 13 }}><span>Received</span><strong>{formatDate(handoff.sourceReceivedAt, true)}</strong></div>
            <div className="data-pair" style={{ marginTop: 13 }}><span>Owner</span><strong>{handoff.ownerName ?? 'No owner yet'}</strong></div>
          </section>
        </aside>
      </div>
      <div className="sr-only" aria-live="polite">{loading ? 'Refreshing handoff' : ''}</div>
    </div>
  );
}
