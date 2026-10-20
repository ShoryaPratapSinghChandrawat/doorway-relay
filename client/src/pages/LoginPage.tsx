import { useState, type FormEvent } from 'react';
import { Check, CircleCheck, DoorOpen, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';

export function LoginPage({ initialError, registrationOpen = false }: { initialError?: string | null; registrationOpen?: boolean }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('demo@doorway.local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initialError ?? null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (password.length < (mode === 'register' ? 12 : 1)) {
      setMessage(mode === 'register' ? 'Use at least 12 characters for the password.' : 'Enter your password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') await auth.register(displayName, email, password);
      else await auth.login(email, password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark"><DoorOpen size={22} aria-hidden="true" /></span>
          <span><strong>Doorway Relay</strong><small>Shared-space handoffs</small></span>
        </div>
        <div className="auth-story">
          <p className="eyebrow">A calmer way to follow through</p>
          <h1>From door event to completed action.</h1>
          <p>Make the next step visible. Give it an owner, record what happened, and make sure “seen” doesn’t quietly become “done.”</p>
          <div className="auth-story-list">
            <div className="auth-story-line"><CircleCheck size={16} aria-hidden="true" /><span>People classify door events; nothing is assumed.</span></div>
            <div className="auth-story-line"><CircleCheck size={16} aria-hidden="true" /><span>Acknowledged is different from resolved.</span></div>
            <div className="auth-story-line"><CircleCheck size={16} aria-hidden="true" /><span>Every handoff keeps its owner and history.</span></div>
          </div>
        </div>
        <div className="auth-footnote">Local demo workspace · no media stored</div>
      </aside>
      <main className="auth-panel">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">PRIVATE WORKSPACE</p>
          <h2 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
          <p>{mode === 'login' ? 'Sign in to see what needs attention next.' : 'The first local account becomes the workspace coordinator.'}</p>
          {message && <div className="auth-error" role="alert">{message}</div>}
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mode === 'register' && (
              <label className="form-field">
                <span className="form-label">Your name</span>
                <input className="field-control" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} maxLength={80} />
              </label>
            )}
            <label className="form-field">
              <span className="form-label">Email</span>
              <input className="field-control" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
            </label>
            <label className="form-field">
              <span className="form-label">Password</span>
              <input className="field-control" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'register' ? 12 : 1} maxLength={128} />
              {mode === 'register' && <span className="form-help">At least 12 characters. This demo stores a scrypt password hash.</span>}
            </label>
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create local account'}
              {!busy && <Check size={16} aria-hidden="true" />}
            </button>
          </form>
          {(registrationOpen || mode === 'register') ? (
            <div className="auth-switch">
              {mode === 'login' ? 'First time here?' : 'Already have a workspace?'}
              <button className="link-button" type="button" onClick={() => { setMessage(null); setMode(mode === 'login' ? 'register' : 'login'); }}>
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </div>
          ) : <div className="auth-switch">Account creation is closed for this demo workspace.</div>}
          <div className="auth-demo-note"><ShieldCheck size={14} aria-hidden="true" /> Demo-grade sign-in. Ring credentials belong only in the ignored server `.env`, never here.</div>
        </section>
      </main>
    </div>
  );
}
