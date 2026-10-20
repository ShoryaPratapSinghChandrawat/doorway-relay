import { useEffect, useState, type FormEvent } from 'react';
import { Check, Info, Save } from 'lucide-react';
import { apiGet, apiPatch } from '../api';
import { useAuth } from '../auth';
import { usePreferences } from '../App';
import { ErrorState, LoadingState } from '../components/DataState';

interface SettingsData {
  displayName: string;
  largerText: boolean;
  reducedMotion: boolean;
  notificationPresentation: string;
}

export function SettingsPage() {
  const auth = useAuth();
  const { preferences, setPreferences } = usePreferences();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [displayName, setDisplayName] = useState(preferences.displayName || auth.user?.displayName || '');
  const [largerText, setLargerText] = useState(preferences.largerText);
  const [reducedMotion, setReducedMotion] = useState(preferences.reducedMotion);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void apiGet<SettingsData>('/api/settings').then((result) => {
      if (!alive) return;
      setSettings(result);
      setDisplayName(result.displayName);
      setLargerText(result.largerText);
      setReducedMotion(result.reducedMotion);
      setError(null);
    }).catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : 'Could not load settings.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (displayName.trim().length < 2) { setError('Display name must be at least 2 characters.'); return; }
    setSaving(true);
    try {
      const result = await apiPatch<SettingsData>('/api/settings', { displayName: displayName.trim(), largerText, reducedMotion });
      setSettings(result);
      setPreferences({ displayName: result.displayName, largerText: result.largerText, reducedMotion: result.reducedMotion });
      auth.updateDisplayName(result.displayName);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Settings could not be saved.');
    } finally { setSaving(false); }
  }

  if (loading && !settings) return <LoadingState label="Loading preferences…" />;
  if (error && !settings) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div>
      <div className="page-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Make the workspace yours.</h1><p>Small accessibility choices should be easy to find and easy to change.</p></div></div>
      <div className="settings-layout">
        <section className="card settings-card">
          <form onSubmit={(event) => void save(event)}>
            <div className="settings-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
              <h3>Profile</h3><p>Shown in activity records as the person making a change.</p>
              <label className="form-field"><span className="form-label">Display name</span><input className="field-control" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} required minLength={2} maxLength={80} /></label>
            </div>
            <div className="settings-section">
              <h3>Accessibility</h3><p>These preferences are saved to this workspace.</p>
              <div style={{ display: 'grid', gap: 13 }}>
                <label className="checkbox-row"><input type="checkbox" checked={largerText} onChange={(event) => setLargerText(event.target.checked)} /><span><strong>Larger text</strong><br />Increase key interface text for easier reading.</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /><span><strong>Reduce motion</strong><br />Limit interface transitions and follow your preference.</span></label>
              </div>
            </div>
            <div className="settings-section">
              <h3>Notification presentation</h3><p>{settings?.notificationPresentation ?? 'In-app dashboard and event inbox only. No outbound notifications are implemented.'}</p>
            </div>
            {error && <p className="form-notice" role="alert">{error}</p>}
            {saved && <p className="form-help" role="status"><Check size={14} aria-hidden="true" /> Preferences saved.</p>}
            <div className="settings-actions"><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}<Save size={15} aria-hidden="true" /></button></div>
          </form>
        </section>
        <div>
          <section className="card info-card"><Info size={16} color="#458b85" aria-hidden="true" /><h3>Where notifications appear</h3><p>New signed events appear in Event Inbox. Handoff state and recent changes appear on the dashboard. Doorway Relay does not currently send email, SMS, or push notifications.</p></section>
          <section className="card info-card"><Info size={16} color="#458b85" aria-hidden="true" /><h3>Keep records minimal</h3><p>Use task-focused notes. Avoid visitor names or sensitive personal details. This app does not download or keep Ring video, audio, or snapshots.</p></section>
        </div>
      </div>
    </div>
  );
}
