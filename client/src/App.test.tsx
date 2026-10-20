/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import { AppRouter } from './App';
import { ProvenanceBadge } from './components/ProvenanceBadge';

const demoUser = { id: 'user-demo', email: 'demo@example.invalid', displayName: 'Demo Coordinator', isDemo: true };
const emptyOverview = {
  counts: { needsAttention: 0, unassigned: 0, awaitingAcknowledgement: 0, assigned: 0, acknowledged: 0, overdue: 0, stalled: 0, resolved: 0, inbox: 0 },
  needsAttention: [], recentActivity: [], stallThresholdHours: 24,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockApi(user: typeof demoUser | null, registrationOpen = user === null, playgroundStatus?: unknown) {
  const paths: string[] = [];
  const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
    const path = typeof request === 'string' ? request : request.toString();
    paths.push(path);
    let body: unknown;
    if (path === '/api/auth/csrf') body = { csrfToken: 'test-csrf-token' };
    else if (path === '/api/auth/me') body = { user, registrationOpen };
    else if (path === '/api/settings') body = { displayName: user?.displayName ?? '', largerText: false, reducedMotion: false };
    else if (path === '/api/overview') body = emptyOverview;
    else if (path === '/api/inbox') body = { events: [] };
    else if (path === '/api/ring/status') body = {
      state: 'not_connected', connected: false, credentialsConfigured: false, apiTokenAvailable: false,
      linked: false, lastSignedEventAt: null, lastSignedEventSource: null, lastSimulatedEventAt: null,
      lastApiSuccessAt: null, lastApiSuccessKind: null, lastRefreshAt: null, refreshFailing: false,
      refreshError: null, simulatorConfigured: false, eventSource: 'ring_live', note: 'No verified Ring evidence.',
    };
    else if (path === '/api/ring/playground/status') body = playgroundStatus ?? {
      state: 'no_token', tokenPresent: false, source: null, lastSuccessfulCallAt: null, lastDeviceSummary: null, errorCode: null,
      historyShapeVerified: false, historySyncAvailable: false,
      historySyncDisabledReason: 'Run npm run ring:probe and review the real response shape before enabling Event History ingestion.',
      devices: [], shapeUnrecognized: true, selectedDeviceId: null,
    };
    else body = {};
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return paths;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider><AppRouter /></AuthProvider>
    </MemoryRouter>,
  );
}

describe('application routes and authenticated shell', () => {
  it('labels seeded synthetic rows explicitly while preserving their source provenance', () => {
    render(<ProvenanceBadge provenance="ring_simulated" isSynthetic />);
    expect(screen.getByText('Local · Simulated')).toBeInTheDocument();
    expect(screen.queryByText('Ring · Simulated')).not.toBeInTheDocument();
    expect(screen.getByText('Synthetic demo data')).toBeInTheDocument();
  });

  it('labels Playground provenance as simulated rather than live Ring activity', () => {
    render(<ProvenanceBadge provenance="ring_playground" />);
    expect(screen.getByText('Playground · Simulated')).toBeInTheDocument();
    expect(screen.queryByText('Ring · Playground')).not.toBeInTheDocument();
  });

  it('keeps signed-out users on the accessible login screen', async () => {
    mockApi(null);
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Handoffs' })).not.toBeInTheDocument();
  });

  it('does not offer first-user registration after the demo workspace has an account', async () => {
    mockApi(null, false);
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Account creation is closed for this demo workspace.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create an account' })).not.toBeInTheDocument();
  });

  it('keeps Ring integration status and Token Exchange guidance aligned with the API state', async () => {
    mockApi(demoUser);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Keep the next step in view.' });
    await user.click(screen.getByRole('link', { name: 'Integrations' }));

    expect(await screen.findByRole('heading', { name: 'Ring connection status' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Not connected' })).toBeInTheDocument();
    expect(screen.getByText(/Keep Token Exchange disabled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify Ring API access' })).toBeDisabled();
    expect(screen.getByText(/Exercises the real webhook endpoint; does not connect Ring/)).toBeInTheDocument();
  });

  it('shows Playground token and Event History blockers without offering a premature sync', async () => {
    mockApi(demoUser);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Keep the next step in view.' });
    await user.click(screen.getByRole('link', { name: 'Integrations' }));

    expect(await screen.findByRole('heading', { name: 'Ring Developer Playground' })).toBeInTheDocument();
    expect(screen.getByText('No Playground token configured')).toBeInTheDocument();
    expect(screen.getByText('Event History schema')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync from Ring/ })).toBeDisabled();
    expect(screen.getByText('npm run ring:probe')).toBeInTheDocument();
    expect(screen.getByText('PLAYGROUND SIMULATION')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Playground simulation' })).toBeDisabled();
    expect(screen.getByText(/no recording, frame capture, snapshots, or media storage/i)).toBeInTheDocument();
  });

  it('shows the safe device summary, timestamp, picker, and server-memory selection', async () => {
    mockApi(demoUser, false, {
      state: 'last_success', tokenPresent: true, source: 'ring_playground',
      lastSuccessfulCallAt: '2026-10-20T12:30:00.000Z', lastDeviceSummary: '2 devices returned', errorCode: null,
      historyShapeVerified: false, historySyncAvailable: false,
      historySyncDisabledReason: 'Review a real probe report before enabling Event History.',
      devices: [{ id: 'opaque-device-1', type: 'devices' }, { id: 'opaque-device-2' }],
      shapeUnrecognized: false, selectedDeviceId: 'opaque-device-1',
    });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Keep the next step in view.' });
    await user.click(screen.getByRole('link', { name: 'Integrations' }));

    expect(await screen.findByText(/2 devices returned/)).toBeInTheDocument();
    expect(screen.getByLabelText('Playground device')).toHaveValue('opaque-device-1');
    expect(screen.getByText('Current selection').parentElement).toHaveTextContent('opaque-device-1');
    expect(screen.getByText(/Selection stays in server memory/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh device list' })).toBeDisabled();
  });

  it('labels Playground inbox events as simulation data and keeps WHEP video out of the inbox', async () => {
    mockApi(demoUser);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Keep the next step in view.' });
    await user.click(screen.getByRole('link', { name: 'Event inbox' }));

    expect(await screen.findByRole('heading', { name: 'Read the event. Decide the task.' })).toBeInTheDocument();
    expect(screen.getByText('Playground events are simulated, not live Ring activity.')).toBeInTheDocument();
    expect(screen.getByText(/receive-only video view does not create inbox entries/i)).toBeInTheDocument();
    expect(screen.getByText('No unclassified events')).toBeInTheDocument();
  });

  it('loads the workspace and keeps the mobile navigation keyboard-operable', async () => {
    const paths = mockApi(demoUser);
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Keep the next step in view.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Handoffs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Event inbox' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Integrations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /New handoff/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument();
    await waitFor(() => expect(paths).toContain('/api/settings'));
    expect(paths).toContain('/api/overview');

    const menuButton = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Main navigation' })).toBeInTheDocument();
    const closeButton = screen.getByRole('button', { name: 'Close navigation' });
    await waitFor(() => expect(closeButton).toHaveFocus());
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(closeButton).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(menuButton).toHaveAttribute('aria-expanded', 'false'));
    expect(menuButton).toHaveFocus();
  });
});
