import { Link, useNavigate } from 'react-router-dom';
import { apiPost } from '../api';
import { ManualHandoffForm, type ManualHandoffInput } from '../components/ManualHandoffForm';
import { ProvenanceBadge } from '../components/ProvenanceBadge';

export function ManualHandoffPage() {
  const navigate = useNavigate();
  async function create(input: ManualHandoffInput) {
    const result = await apiPost<{ handoff: { id: string } }>('/api/handoffs', input);
    navigate(`/handoffs/${result.handoff.id}`);
  }

  return (
    <div>
      <div className="page-heading">
        <div><p className="eyebrow">NEW HANDOFF</p><h1>Capture the next step.</h1><p>A manual task is useful when something needs an owner, even without a door event.</p></div>
        <ProvenanceBadge provenance="manual" />
      </div>
      <section className="card form-card">
        <div className="panel-header"><div><h2 className="panel-title">Manual handoff</h2><p className="panel-subtitle">A task you create here is labeled Manual in the activity record.</p></div></div>
        <ManualHandoffForm onSubmit={create} />
      </section>
      <p className="form-help" style={{ marginTop: 13 }}>Need to turn a Ring-format event into a task? <Link className="link-button" to="/inbox">Review the event inbox</Link></p>
    </div>
  );
}
