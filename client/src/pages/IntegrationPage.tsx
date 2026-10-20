import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, ExternalLink, FlaskConical, KeyRound, Radio, RefreshCw, ShieldAlert, Unplug } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../api';
import { ErrorState, LoadingState } from '../components/DataState';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { formatDate } from '../components/format';
import { PlaygroundLiveView } from '../ring/PlaygroundLiveView';

interface RingStatus {
  state: 'not_connected' | 'credentials_configured' | 'verified_simulator' | 'api_verified' | 'ring_event_verified' | 'refresh_failing';
  connected: boolean;
  credentialsConfigured: boolean;
  apiTokenAvailable: boolean;
  linked: boolean;
  lastSignedEventAt: string | null;
  lastSignedEventSource: 'ring_live' | 'ring_playground' | null;
  lastSimulatedEventAt: string | null;
  lastApiSuccessAt: string | null;
  lastApiSuccessKind: string | null;
  lastRefreshAt: string | null;
  refreshFailing: boolean;
  refreshError: string | null;
  simulatorConfigured: boolean;
  eventSource: 'ring_live' | 'ring_playground' | null;
  note: string;
}

interface PlaygroundDevice {
  id: string;
  type?: string;
}

interface PlaygroundStatus {
  state: 'no_token' | 'source_mismatch' | 'token_present_unverified' | 'last_success' | 'token_expired' | 'api_error';
  tokenPresent: boolean;
  source: 'ring_playground' | null;
  lastSuccessfulCallAt: string | null;
  lastDeviceSummary: string | null;
  errorCode: string | null;
  historyShapeVerified: false;
  historySyncAvailable: false;
  historySyncDisabledReason: string;
  devices: PlaygroundDevice[];
  shapeUnrecognized: boolean;
  selectedDeviceId: string | null;
}

function playgroundStateCopy(status: PlaygroundStatus) {
  switch (status.state) {
    case 'no_token': return { title: 'No Playground token configured', detail: 'Add RING_ACCESS_TOKEN to the ignored server .env file. It is never sent to the browser.' };
    case 'source_mismatch': return { title: 'Playground source not selected', detail: 'Set RING_EVENT_SOURCE=ring_playground explicitly before making Playground API calls.' };
    case 'token_present_unverified': return { title: 'Token present · not yet verified', detail: 'A server-side token is configured, but no successful authenticated Playground call is recorded.' };
    case 'last_success': return { title: 'Playground API access verified', detail: `A server-side devices request succeeded${status.lastSuccessfulCallAt ? ` at ${formatDate(status.lastSuccessfulCallAt, true)}` : ''}. This does not verify Event History shape or ingestion.` };
    case 'token_expired': return { title: 'Playground token expired', detail: 'Generate a new token in the Ring Developer Playground; tokens last about 30 minutes.' };
    case 'api_error': return { title: 'Playground API error', detail: 'The last request failed without exposing the upstream response body or credentials.' };
  }
}

function stateCopy(status: RingStatus) {
  if (status.refreshFailing) return { title: 'Token refresh needs attention', detail: status.refreshError ?? 'The last refresh attempt failed.', tone: 'error' };
  if (status.lastSignedEventAt && status.lastSignedEventSource) return {
    title: status.lastSignedEventSource === 'ring_playground' ? 'Signed Playground event received' : 'Signed Ring event received',
    detail: `The server verified a Ring-key signature at ${formatDate(status.lastSignedEventAt, true)}.`, tone: 'success',
  };
  if (status.lastApiSuccessAt) return { title: 'Ring API call verified', detail: `A server-side ${status.lastApiSuccessKind ?? 'API'} request succeeded at ${formatDate(status.lastApiSuccessAt, true)}. This does not mean a webhook has been received.`, tone: 'success' };
  if (status.lastSimulatedEventAt) return { title: 'Simulator path verified · Ring not connected', detail: `A local simulator request passed raw-body signature verification at ${formatDate(status.lastSimulatedEventAt, true)}. This is not a Ring event.`, tone: 'warning' };
  if (status.credentialsConfigured || status.apiTokenAvailable) return { title: 'Configuration present · not verified', detail: 'Server-side settings exist, but no authenticated Ring API request or signed Ring event has succeeded yet.', tone: 'warning' };
  return { title: 'Not connected', detail: 'No authenticated Ring API call or Ring-signed webhook is recorded. The local signed simulator is separate and clearly labeled.', tone: 'neutral' };
}

export function IntegrationPage() {
  const [status, setStatus] = useState<RingStatus | null>(null);
  const [playgroundStatus, setPlaygroundStatus] = useState<PlaygroundStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectingDevice, setSelectingDevice] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      apiGet<RingStatus>('/api/ring/status'),
      apiGet<PlaygroundStatus>('/api/ring/playground/status'),
    ]).then(([result, playgroundResult]) => {
      if (alive) { setStatus(result); setPlaygroundStatus(playgroundResult); setError(null); }
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Could not load integration status.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  async function checkApi() {
    if (!status?.apiTokenAvailable || checking) return;
    setChecking(true);
    setActionError(null);
    try {
      if (status.eventSource === 'ring_playground') {
        const result = await apiPost<{
          status: PlaygroundStatus;
          deviceSummary: string;
          devices: PlaygroundDevice[];
          shapeUnrecognized: boolean;
          selectedDeviceId: string | null;
        }>('/api/ring/playground/verify');
        setPlaygroundStatus({
          ...result.status,
          lastDeviceSummary: result.deviceSummary,
          devices: result.devices,
          shapeUnrecognized: result.shapeUnrecognized,
          selectedDeviceId: result.selectedDeviceId,
        });
      } else {
        const result = await apiPost<{ status: RingStatus }>('/api/ring/check');
        setStatus(result.status);
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The Ring API check failed.');
      setReloadKey((value) => value + 1);
    } finally { setChecking(false); }
  }

  async function refreshPlaygroundDevices() {
    if (loadingDevices || !status || status.eventSource !== 'ring_playground') return;
    setLoadingDevices(true);
    setActionError(null);
    try {
      const result = await apiGet<{
        devices: PlaygroundDevice[];
        shapeUnrecognized: boolean;
        selectedDeviceId: string | null;
        deviceSummary: string;
        lastSuccessfulCallAt: string;
      }>('/api/ring/playground/devices');
      setPlaygroundStatus((current) => current ? {
        ...current,
        state: 'last_success',
        errorCode: null,
        lastSuccessfulCallAt: result.lastSuccessfulCallAt,
        lastDeviceSummary: result.deviceSummary,
        devices: result.devices,
        shapeUnrecognized: result.shapeUnrecognized,
        selectedDeviceId: result.selectedDeviceId,
      } : current);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not load Playground devices.');
      setReloadKey((value) => value + 1);
    } finally { setLoadingDevices(false); }
  }

  async function selectPlaygroundDevice(id: string) {
    if (!id || selectingDevice) return;
    setSelectingDevice(true);
    setActionError(null);
    try {
      const result = await apiPost<{ selectedDeviceId: string }>('/api/ring/playground/device', { id });
      setPlaygroundStatus((current) => current ? { ...current, selectedDeviceId: result.selectedDeviceId } : current);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not select that Playground device.');
      setReloadKey((value) => value + 1);
    } finally { setSelectingDevice(false); }
  }

  if (loading && !status) return <LoadingState label="Checking integration status…" />;
  if (error && !status) return <ErrorState message={error} onRetry={retry} />;
  if (!status) return <ErrorState message="Integration status is unavailable." onRetry={retry} />;
  const copy = stateCopy(status);
  const Icon = status.refreshFailing ? CircleAlert : status.lastSignedEventAt || status.lastApiSuccessAt ? CircleCheck : status.lastSimulatedEventAt ? FlaskConical : Unplug;

  return (
    <div>
      <div className="page-heading">
        <div><p className="eyebrow">INTEGRATIONS</p><h1>Ring connection status</h1><p>Connection evidence is based on actual signed events or successful server-side API calls—not just environment variables.</p></div>
        <Link className="button button-secondary button-small" to="/inbox"><Radio size={14} aria-hidden="true" />Open event inbox</Link>
      </div>
      {error && <ErrorState message={error} onRetry={retry} />}
      <div className="integration-grid">
        <section className="card integration-status">
          <div className="integration-state">
            <span className={`integration-state-icon ${copy.tone}`}><Icon size={19} aria-hidden="true" /></span>
            <div><p className="eyebrow">CURRENT STATUS</p><h2>{copy.title}</h2><p>{copy.detail}</p></div>
          </div>
          <div className="integration-facts">
            <div className="integration-fact"><span>Ring app credentials</span><strong>{status.credentialsConfigured ? 'Present · not proof of connection' : 'Not configured'}</strong></div>
            <div className="integration-fact"><span>Server-side API token</span><strong>{status.apiTokenAvailable ? 'Available · not yet proven' : 'Not available'}</strong></div>
            <div className="integration-fact"><span>Partner linking</span><strong>{status.linked ? 'Completed in app' : 'Not confirmed'}</strong></div>
            <div className="integration-fact"><span>Ring event source label</span><strong>{status.credentialsConfigured ? `${status.eventSource === 'ring_live' ? 'Live' : 'Playground'} source selected · unverified` : 'No Ring signing key configured'}</strong></div>
          </div>
          <div className="integration-events">
            <div className="integration-event-row"><span>Last verified Ring-key webhook</span><strong>{status.lastSignedEventAt ? <><ProvenanceBadge provenance={status.lastSignedEventSource ?? 'ring_live'} /> · {formatDate(status.lastSignedEventAt, true)}</> : 'None recorded'}</strong></div>
            <div className="integration-event-row"><span>Last successful Ring API call</span><strong>{status.lastApiSuccessAt ? `${status.lastApiSuccessKind ?? 'API'} · ${formatDate(status.lastApiSuccessAt, true)}` : 'None recorded'}</strong></div>
            <div className="integration-event-row"><span>Last simulator request</span><strong>{status.lastSimulatedEventAt ? <><ProvenanceBadge provenance="ring_simulated" /> · {formatDate(status.lastSimulatedEventAt, true)}</> : 'None recorded'}</strong></div>
            <div className="integration-event-row"><span>Last token refresh</span><strong>{status.lastRefreshAt ? formatDate(status.lastRefreshAt, true) : 'None recorded'}</strong></div>
          </div>
          {actionError && <p className="form-notice" role="alert">{actionError}</p>}
          <div className="heading-actions" style={{ marginTop: 17 }}>
            <button className="button button-secondary button-small" onClick={() => void checkApi()} disabled={!status.apiTokenAvailable || checking} title={!status.apiTokenAvailable ? 'Add a token in the server .env before checking.' : undefined}><RefreshCw size={14} aria-hidden="true" />{checking ? 'Checking Ring API…' : status.eventSource === 'ring_playground' ? 'Verify Playground API access' : 'Verify Ring API access'}</button>
            <button className="button button-quiet button-small" onClick={retry}><RefreshCw size={13} aria-hidden="true" />Refresh status</button>
          </div>
        </section>
        <div>
          <section className="card simulator-card playground-card">
            <div className="panel-header"><div><h2 className="panel-title">Ring Developer Playground</h2><p className="panel-subtitle">Simulation source · server-only API token</p></div><KeyRound size={16} color="#72848a" aria-hidden="true" /></div>
            {playgroundStatus && <>
              <div className="playground-status" role="status">
                <strong>{playgroundStateCopy(playgroundStatus).title}</strong>
                <p>{playgroundStateCopy(playgroundStatus).detail}</p>
              </div>
              <div className="integration-fact"><span>Last device check</span><strong>{playgroundStatus.lastDeviceSummary
                ? `${playgroundStatus.lastDeviceSummary}${playgroundStatus.lastSuccessfulCallAt ? ` · ${formatDate(playgroundStatus.lastSuccessfulCallAt, true)}` : ''}`
                : 'Not checked'}</strong></div>
              {playgroundStatus.shapeUnrecognized && playgroundStatus.lastSuccessfulCallAt && (
                <p className="form-help">The response was received, but its device-list shape was not recognized. No IDs were inferred.</p>
              )}
              <label className="form-field" htmlFor="playground-device-picker">
                <span className="form-label">Playground device</span>
                <select
                  id="playground-device-picker"
                  className="field-control"
                  value={playgroundStatus.selectedDeviceId ?? ''}
                  onChange={(event) => void selectPlaygroundDevice(event.target.value)}
                  disabled={selectingDevice || !status.apiTokenAvailable || status.eventSource !== 'ring_playground' || playgroundStatus.devices.length === 0}
                >
                  <option value="">{playgroundStatus.devices.length ? 'Select a device…' : 'Load devices first'}</option>
                  {playgroundStatus.devices.map((device) => (
                    <option key={device.id} value={device.id}>{device.type ? `${device.type} · ` : ''}{device.id}</option>
                  ))}
                </select>
              </label>
              <div className="integration-fact"><span>Current selection</span><strong>{playgroundStatus.selectedDeviceId ?? 'None selected'}</strong></div>
              <div className="heading-actions">
                <button
                  className="button button-secondary button-small"
                  onClick={() => void refreshPlaygroundDevices()}
                  disabled={!status.apiTokenAvailable || status.eventSource !== 'ring_playground' || loadingDevices}
                >
                  <RefreshCw size={13} aria-hidden="true" />{loadingDevices ? 'Loading devices…' : 'Refresh device list'}
                </button>
              </div>
              <p className="form-help">Only opaque IDs and short type labels are shown. Selection stays in server memory and clears when the token or source changes.</p>
              <div className="integration-fact"><span>Server-side token</span><strong>{playgroundStatus.tokenPresent ? 'Present · never returned to browser' : 'Not configured'}</strong></div>
              <div className="integration-fact"><span>Event History schema</span><strong>{playgroundStatus.historyShapeVerified ? 'Reviewed' : 'Not yet verified'}</strong></div>
              <p>{playgroundStatus.historySyncDisabledReason}</p>
            </>}
            <PlaygroundLiveView
              enabled={status.apiTokenAvailable && status.eventSource === 'ring_playground'}
              selectedDeviceId={playgroundStatus?.selectedDeviceId ?? null}
              onTokenExpired={() => setReloadKey((value) => value + 1)}
            />
            <div className="heading-actions">
              <button className="button button-secondary button-small" disabled title={playgroundStatus?.historySyncDisabledReason ?? 'Review a real Playground probe report first.'}>
                <RefreshCw size={13} aria-hidden="true" />Sync from Ring · blocked
              </button>
            </div>
            <p className="form-help">Run the probe without a device ID for a devices-only structure report. Set RING_HISTORY_DEVICE_ID only when you are ready to request Event History.</p>
            <code>npm run ring:probe</code>
            <p className="form-help">Optional RING_PROBE_PRINT_DEVICE_IDS=true prints IDs to the local terminal only; do not paste that output. IDs never enter the saved report. Review the redacted report before any History ingestion; Sync and background Playground polling remain disabled.</p>
          </section>
          <section className="card simulator-card">
            <div className="panel-header"><div><h2 className="panel-title">Local signed simulator</h2><p className="panel-subtitle">Exercises the real webhook endpoint; does not connect Ring.</p></div><FlaskConical size={16} color="#9a741f" aria-hidden="true" /></div>
            <ProvenanceBadge provenance="ring_simulated" />
            <p>Run this in a terminal while the API is running. The simulator uses its separate test key and the inbox keeps the “Simulated” label.</p>
            <code>npm run simulate:ring</code>
            <p className="form-help">No visitor identification, media, or automatic delivery classification.</p>
          </section>
          <section className="integration-note"><strong><ShieldAlert size={13} aria-hidden="true" /> Not yet verified</strong><br />Ring's inbound Token Exchange request and acknowledgement remain unverified, and the portal staging path has not been confirmed. Keep Token Exchange disabled; do not register a public callback until Ring confirms the contract and the endpoint is separately approved.</section>
          <section className="card simulator-card" style={{ marginTop: 12 }}>
            <div className="panel-header"><div><h2 className="panel-title">Setup guidance</h2><p className="panel-subtitle">Credentials never go in the browser.</p></div><KeyRound size={16} color="#72848a" aria-hidden="true" /></div>
            <p>Keep Ring Client ID, Client Secret, HMAC key, and any Playground token in the ignored server <code>.env</code>. No secret is displayed here.</p>
            <Link className="link-button" to="/settings">Review workspace settings <ExternalLink size={12} aria-hidden="true" /></Link>
          </section>
        </div>
      </div>
    </div>
  );
}
