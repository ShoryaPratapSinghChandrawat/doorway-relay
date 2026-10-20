import { useMemo, useState } from 'react';
import { ShieldCheck, Link2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiPost } from '../api';
import { useAuth } from '../auth';

export function AccountLinkPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  async function confirmLink() {
    const time = query.get('time');
    const nonce = query.get('nonce');
    if (!time || !nonce) {
      setError('The account-link return is missing the required time or nonce value. Check the Ring account-link URL before retrying.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/ring/account-link', { time, nonce });
      setMessage('The signed link was accepted and Ring account integration calls completed.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The account link could not be verified.');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-heading">
        <div><p className="eyebrow">RING ACCOUNT LINK</p><h1>Confirm your connection</h1><p>This page requires your signed-in Doorway Relay workspace and verifies the returned nonce before any Ring integration call.</p></div>
      </div>
      <section className="card integration-status">
        <div className="integration-state">
          <span className="integration-state-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
          <div><h2>Account-link verification</h2><p>A signed-in workspace user must confirm this request. The Ring account ID is checked against the stored unclaimed-token record; it is never accepted from the browser.</p></div>
        </div>
        {error && <div className="form-notice" role="alert">{error}</div>}
        {message && <p className="integration-note" role="status">{message}</p>}
        <div className="heading-actions" style={{ marginTop: 18 }}>
          <button className="button button-primary" type="button" onClick={() => void confirmLink()} disabled={busy}>
            <Link2 size={16} aria-hidden="true" />{busy ? 'Verifying…' : 'Verify and link account'}
          </button>
          <button className="button button-secondary" type="button" onClick={() => navigate('/integrations')}>Back to integrations</button>
        </div>
        <p className="form-help" style={{ marginTop: 13 }}>Signed in as {auth.user?.displayName ?? 'workspace user'}. Nonce values are not displayed or logged.</p>
      </section>
    </div>
  );
}
