import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { apiGet } from '../api';
import type { Handoff } from '../types';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { HandoffCard } from '../components/HandoffCard';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { PriorityBadge, StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../components/format';

interface HandoffListResponse { items: Handoff[]; page: number; limit: number; total: number; pages: number; }
interface OwnerOption { id: string; displayName: string; isDemo: boolean; }
const categoryLabels = { visitor: 'Visitor', delivery: 'Delivery', access: 'Access', other: 'Other' } as const;

export function HandoffsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [data, setData] = useState<HandoffListResponse | null>(null);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const queryString = searchParams.toString();
  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => { setSearch(searchParams.get('q') ?? ''); }, [searchParams]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void apiGet<HandoffListResponse>(`/api/handoffs${queryString ? `?${queryString}` : ''}`).then((result) => {
      if (alive) { setData(result); setError(null); }
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Could not load handoffs.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [queryString, reloadKey]);
  useEffect(() => {
    let alive = true;
    void apiGet<{ users: OwnerOption[] }>('/api/users').then((result) => { if (alive) setOwners(result.users); })
      .catch((reason: unknown) => { if (alive) setOwnerError(reason instanceof Error ? reason.message : 'Could not load owners.'); });
    return () => { alive = false; };
  }, []);

  const activeFilters = useMemo(() => Array.from(searchParams.entries()).some(([key, value]) => key !== 'page' && value.length > 0), [searchParams]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilter('q', search.trim());
  }

  function changePage(page: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  }

  function clearFilters() { setSearchParams(new URLSearchParams()); setSearch(''); }

  return (
    <div>
      <div className="page-heading">
        <div><p className="eyebrow">WORK QUEUE</p><h1>Handoffs</h1><p>One clear owner. A record of what happened. Resolution that means more than detection.</p></div>
        <div className="heading-actions"><Link to="/handoffs/new" className="button button-primary"><Plus size={16} aria-hidden="true" />New handoff</Link></div>
      </div>
      <section className="card toolbar-card" aria-label="Filter handoffs">
        <form onSubmit={submitSearch}>
          <div className="filter-grid">
            <label className="search-field"><span className="sr-only">Search handoffs</span><Search size={15} aria-hidden="true" /><input className="field-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search handoffs…" maxLength={120} /></label>
            <label><span className="sr-only">Filter by status</span><select className="field-control" value={searchParams.get('status') ?? ''} onChange={(event) => setFilter('status', event.target.value)}>
              <option value="">All statuses</option><option value="new">New</option><option value="awaiting_acknowledgement">Awaiting acknowledgement</option><option value="assigned">Assigned</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="reopened">Reopened</option>
            </select></label>
            <label><span className="sr-only">Filter by owner</span><select className="field-control" value={searchParams.get('ownerId') ?? ''} onChange={(event) => setFilter('ownerId', event.target.value)}>
              <option value="">All owners</option><option value="unassigned">Unassigned</option>{owners.map((owner) => <option value={owner.id} key={owner.id}>{owner.displayName}</option>)}
            </select></label>
            <label><span className="sr-only">Filter by category</span><select className="field-control" value={searchParams.get('category') ?? ''} onChange={(event) => setFilter('category', event.target.value)}>
              <option value="">All categories</option><option value="visitor">Visitor</option><option value="delivery">Delivery</option><option value="access">Access</option><option value="other">Other</option>
            </select></label>
            <label><span className="sr-only">Filter by priority</span><select className="field-control" value={searchParams.get('priority') ?? ''} onChange={(event) => setFilter('priority', event.target.value)}>
              <option value="">All priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select></label>
            <label><span className="sr-only">Filter by provenance</span><select className="field-control" value={searchParams.get('provenance') ?? ''} onChange={(event) => setFilter('provenance', event.target.value)}>
              <option value="">All sources</option><option value="ring_live">Ring · Live</option><option value="ring_playground">Playground · Simulated</option><option value="ring_simulated">Local · Simulated</option><option value="manual">Manual</option>
            </select></label>
          </div>
          <div className="filter-footer">
            <span><SlidersHorizontal size={12} aria-hidden="true" /> {data?.total ?? 0} handoffs · choose filters to narrow the list</span>
            <div className="heading-actions"><label className="sort-control"><ArrowDownWideNarrow size={13} aria-hidden="true" /><span className="sr-only">Sort handoffs</span><select className="field-control" value={searchParams.get('sort') ?? 'updated_desc'} onChange={(event) => setFilter('sort', event.target.value)}>
              <option value="updated_desc">Recently updated</option><option value="due_asc">Due date</option><option value="created_desc">Recently created</option>
            </select></label><button className="button button-secondary button-small" type="submit">Search</button>{activeFilters && <button className="link-button" type="button" onClick={clearFilters}>Clear</button>}</div>
          </div>
          {ownerError && <p className="form-help" role="status">{ownerError}</p>}
        </form>
      </section>
      {loading && !data && <LoadingState label="Loading handoffs…" />}
      {error && !data && <ErrorState message={error} onRetry={retry} />}
      {error && data && <ErrorState message={error} onRetry={retry} />}
      {data && !loading && data.items.length === 0 && (
        <section className="card"><EmptyState title={activeFilters ? 'No handoffs match these filters' : 'No handoffs yet'} detail={activeFilters ? 'Try widening your filters or search terms.' : 'Create a manual handoff or classify an event from the inbox.'} action={activeFilters ? <button className="button button-secondary button-small" onClick={clearFilters}>Clear filters</button> : <Link to="/handoffs/new" className="button button-primary button-small"><Plus size={14} />Create handoff</Link>} /></section>
      )}
      {data && data.items.length > 0 && (
        <section className="card table-card" aria-label="Handoff results">
          <table className="handoff-table desktop-handoff-table">
            <thead><tr><th>Handoff</th><th>Status</th><th>Owner</th><th>Source</th><th>Due date</th><th>Priority</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id}>
              <td><Link className="handoff-title-link" to={`/handoffs/${item.id}`}>{item.summary}</Link><span className="table-subtitle">{categoryLabels[item.category]} · {item.id.slice(0, 8)}</span></td>
              <td><StatusBadge status={item.status} />{item.isStalled && <span className="signal-pill">Stalled</span>}{item.isOverdue && <span className="signal-pill signal-red">Overdue</span>}</td>
              <td><span className="owner-cell"><span className="owner-mini">{item.ownerName?.slice(0, 1).toUpperCase() ?? '—'}</span>{item.ownerName ?? 'Unassigned'}</span></td>
              <td><ProvenanceBadge provenance={item.provenance} isSynthetic={item.isSynthetic} /></td>
              <td>{item.dueAt ? formatDate(item.dueAt) : <span className="table-subtitle">No due date</span>}</td>
              <td><PriorityBadge priority={item.priority} /></td>
            </tr>)}</tbody>
          </table>
          <div className="mobile-handoff-list">{data.items.map((item) => <HandoffCard handoff={item} key={item.id} />)}</div>
          <div className="pagination"><span>Showing {Math.min((data.page - 1) * data.limit + 1, data.total)}–{Math.min(data.page * data.limit, data.total)} of {data.total}</span><div className="pagination-controls">
            <button className="button button-secondary button-small" onClick={() => changePage(data.page - 1)} disabled={data.page <= 1}><ChevronLeft size={14} aria-hidden="true" />Previous</button>
            <button className="button button-secondary button-small" onClick={() => changePage(data.page + 1)} disabled={data.page >= data.pages}>Next<ChevronRight size={14} aria-hidden="true" /></button>
          </div></div>
        </section>
      )}
    </div>
  );
}
