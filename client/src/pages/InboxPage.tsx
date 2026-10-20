import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BellRing, DoorOpen, FlaskConical, Footprints, Radio, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api';
import type { Category, InboxEvent, Priority } from '../types';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { eventTypeLabel, formatDate } from '../components/format';

function InboxEventCard({ event, onChanged }: { event: InboxEvent; onChanged: () => void }) {
  const [category, setCategory] = useState<Category | ''>('');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const navigate = useNavigate();
  const Icon = event.eventType === 'button_press' ? DoorOpen : Footprints;

  async function classify(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!category) { setValidation('Choose what this event means before creating a handoff.'); return; }
    if (summary.trim().length < 3) { setValidation('Add a short description of what needs to happen next.'); return; }
    setValidation(null);
    setError(null);
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiPost<{ handoff: { id: string } }>(`/api/inbox/${encodeURIComponent(event.id)}/classify`, {
        category,
        summary: summary.trim(),
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      onChanged();
      navigate(`/handoffs/${result.handoff.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The event could not be classified.');
    } finally { setBusy(false); }
  }

  async function ignore() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await apiPost<void>(`/api/inbox/${encodeURIComponent(event.id)}/ignore`); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The event could not be ignored.'); }
    finally { setBusy(false); }
  }

  return (
    <article className="card inbox-card">
      <div className="inbox-card-top">
        <div className="event-kind"><span className="event-kind-icon"><Icon size={16} aria-hidden="true" /></span>{eventTypeLabel(event.eventType)}</div>
        <ProvenanceBadge provenance={event.provenance} isSynthetic={event.isSynthetic} />
      </div>
      <p className="inbox-event-summary">{event.summary}</p>
      <span className="inbox-time">Occurred {formatDate(event.occurredAt, true)} · received {formatDate(event.receivedAt, true)}</span>
      <form className="inbox-classify" onSubmit={(formEvent) => void classify(formEvent)} noValidate>
        <label className="form-field"><span className="form-label">Human classification</span><select className="field-control" value={category} onChange={(change) => { setCategory(change.target.value as Category | ''); setValidation(null); }}>
          <option value="">Choose what happened…</option><option value="visitor">Visitor to meet</option><option value="delivery">Delivery to collect</option><option value="access">Access / entry follow-up</option><option value="other">Other task</option>
        </select></label>
        <label className="form-field"><span className="form-label">Priority</span><select className="field-control" value={priority} onChange={(change) => setPriority(change.target.value as Priority)}>
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select></label>
        <label className="form-field summary-field"><span className="form-label">What needs attention?</span><input className="field-control" value={summary} onChange={(change) => { setSummary(change.target.value); setValidation(null); }} maxLength={180} placeholder="Write the next step in plain language" /></label>
        <label className="form-field"><span className="form-label">Due date <span className="form-help" style={{ display: 'inline' }}>optional</span></span><input className="field-control" type="datetime-local" value={dueAt} onChange={(change) => setDueAt(change.target.value)} /></label>
        <div className="classify-actions">
          <p>{validation ?? error ?? 'This event stays neutral until a person confirms its meaning. No automatic delivery labels.'}</p>
          <div className="heading-actions"><button className="button button-quiet" type="button" onClick={() => void ignore()} disabled={busy}>Ignore</button><button className="button button-primary button-small" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create handoff'}<UserCheck size={14} aria-hidden="true" /></button></div>
        </div>
        {(validation || error) && <span className="sr-only" role="alert">{validation ?? error}</span>}
      </form>
    </article>
  );
}

export function InboxPage() {
  const [events, setEvents] = useState<InboxEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((value) => value + 1), []);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void apiGet<{ events: InboxEvent[] }>('/api/inbox').then((result) => {
      if (alive) { setEvents(result.events); setError(null); }
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Could not load events.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  return (
    <div>
      <div className="page-heading">
        <div><p className="eyebrow">EVENT INBOX</p><h1>Read the event. Decide the task.</h1><p>Button presses and motion stay neutral here. A person decides whether there is a visitor, delivery, or no handoff at all.</p></div>
        <div className="heading-actions"><span className="panel-count"><Radio size={12} aria-hidden="true" /> Supported door events only</span></div>
      </div>
      <section className="playground-inbox-note" aria-label="Playground simulation event boundary">
        <FlaskConical size={16} aria-hidden="true" />
        <div><strong>Playground events are simulated, not live Ring activity.</strong><p>Any event tagged “Playground · Simulated” keeps that provenance. The Integration page's receive-only video view does not create inbox entries, capture frames, or store media.</p></div>
        <Link to="/integrations" className="button button-quiet button-small">Integration status</Link>
      </section>
      {loading && !events && <LoadingState label="Loading event inbox…" />}
      {error && !events && <ErrorState message={error} onRetry={retry} />}
      {error && events && <ErrorState message={error} onRetry={retry} />}
      {events && events.length === 0 && <section className="card"><EmptyState title="No unclassified events" detail="New supported events will wait here for a person to decide what they mean." action={<Link to="/integrations" className="button button-secondary button-small"><BellRing size={14} />Check integration status</Link>} /></section>}
      {events && events.length > 0 && <div className="inbox-list" aria-label="Unclassified incoming events">{events.map((event) => <InboxEventCard key={event.id} event={event} onChanged={reload} />)}</div>}
    </div>
  );
}
