import { useRef, useState, type FormEvent } from 'react';
import type { Category, Priority } from '../types';

export interface ManualHandoffInput {
  category: Category;
  summary: string;
  priority: Priority;
  dueAt: string | null;
}

export function ManualHandoffForm({ onSubmit, cancelHref = '/handoffs' }: {
  onSubmit: (input: ManualHandoffInput) => Promise<void>;
  cancelHref?: string;
}) {
  const [category, setCategory] = useState<Category>('other');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const cleanSummary = summary.trim();
    if (cleanSummary.length < 3) {
      setSummaryError('Add a short description of what needs attention (at least 3 characters).');
      return;
    }
    setSummaryError(null);
    setSubmitError(null);
    submitting.current = true;
    setSaving(true);
    try {
      await onSubmit({ category, summary: cleanSummary, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The handoff could not be saved.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="form-grid">
        <label className="form-field form-field-full">
          <span className="form-label">What needs attention?</span>
          <textarea className="field-control" value={summary} onChange={(event) => { setSummary(event.target.value); setSummaryError(null); }} maxLength={180} aria-invalid={Boolean(summaryError)} aria-describedby={summaryError ? 'manual-summary-error' : 'manual-summary-help'} placeholder="For example: Meet the visitor at the accessible entrance" required />
          {summaryError ? <span id="manual-summary-error" className="field-error">{summaryError}</span> : <span id="manual-summary-help" className="form-help">Plain language works best. Avoid recording visitor names or sensitive details.</span>}
        </label>
        <label className="form-field">
          <span className="form-label">Category</span>
          <select className="field-control" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
            <option value="visitor">Visitor</option><option value="delivery">Delivery</option><option value="access">Access</option><option value="other">Other</option>
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">Priority</span>
          <select className="field-control" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="form-field form-field-full">
          <span className="form-label">Due date <span className="form-help" style={{ display: 'inline' }}>optional</span></span>
          <input className="field-control" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          <span className="form-help">Overdue is shown only when you set a due date.</span>
        </label>
      </div>
      {submitError && <p className="form-notice" role="alert">{submitError}</p>}
      <div className="form-actions">
        <a className="button button-secondary" href={cancelHref}>Cancel</a>
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create manual handoff'}</button>
      </div>
    </form>
  );
}
