/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import request from 'supertest';
import { AuthProvider } from './auth';
import { AppRouter } from './App';
import { createApp } from '../../server/src/app.js';
import { hashPassword } from '../../server/src/auth/password.js';
import type { AppConfig } from '../../server/src/config.js';
import type { Db } from '../../server/src/db/index.js';
import { createRingSignature } from '../../server/src/ring/signature.js';

const testPassword = 'correct-horse-battery-1';
let db: Db | null = null;
afterEach(() => {
  cleanup();
  db?.close();
  db = null;
  vi.unstubAllGlobals();
});

function makeWorkflowDb(): Db {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  const migrationsDirectory = join(process.cwd(), 'server/migrations');
  for (const file of readdirSync(migrationsDirectory).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort()) {
    database.exec(readFileSync(join(migrationsDirectory, file), 'utf8'));
  }
  return database;
}

function makeWorkflowConfig(): AppConfig {
  return {
    nodeEnv: 'test', host: '127.0.0.1', port: 3001, webOrigin: 'http://localhost:5173',
    sessionSecret: 's'.repeat(64), tokenEncryptionKey: 'a'.repeat(64), databasePath: ':memory:',
    demoEmail: 'demo@doorway.local', demoPassword: testPassword, simulatorHmacKey: 'simulator-test-key-not-ring',
    ringClientId: null, ringClientSecret: null, ringHmacSigningKey: 'ring-test-key-not-simulator',
    ringEventSource: 'ring_live', ringApiBaseUrl: 'https://api.amazonvision.com', ringOauthBaseUrl: 'https://oauth.ring.com',
    ringTokenUrl: 'https://oauth.ring.com/token-test', ringOAuthContractVerified: true,
    ringTokenExchangeRouteEnabled: false,
    ringAccessToken: null, ringHistoryDeviceId: null, ringHistoryPollingEnabled: false, ringPollIntervalSeconds: 60, stallThresholdHours: 24,
  };
}

function insertWorkflowUser(database: Db, id: string, displayName: string, email: string, loginEnabled: 0 | 1): void {
  const credentials = loginEnabled ? hashPassword(testPassword) : { salt: null, hash: null };
  database.prepare(`INSERT INTO users
    (id, email, display_name, password_salt, password_hash, is_demo, login_enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, email, displayName, credentials.salt, credentials.hash, loginEnabled ? 0 : 1, loginEnabled, new Date().toISOString());
}

function bridgeFetch(app: ReturnType<typeof createApp>, webOrigin: string) {
  const agent = request.agent(app);
  const paths: string[] = [];
  let pendingRequests = 0;
  const idleWaiters: Array<() => void> = [];
  const finishRequest = () => {
    pendingRequests -= 1;
    if (pendingRequests === 0) idleWaiters.splice(0).forEach((resolve) => resolve());
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    pendingRequests += 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      finishRequest();
    };
    try {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, webOrigin);
      const path = `${url.pathname}${url.search}`;
      if (!path.startsWith('/api/')) throw new Error(`Unexpected browser request outside the local API: ${path}`);
      paths.push(path);

      const method = (init?.method ?? 'GET').toUpperCase();
      let apiRequest = method === 'POST' ? agent.post(path)
        : method === 'PATCH' ? agent.patch(path)
          : method === 'DELETE' ? agent.delete(path)
            : agent.get(path);
      const headers = new Headers(init?.headers);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers.has('origin')) headers.set('origin', webOrigin);
      headers.forEach((value, name) => { apiRequest = apiRequest.set(name, value); });
      if (typeof init?.body === 'string') apiRequest = apiRequest.send(init.body);
      const result = await apiRequest;
      const contentType = result.headers['content-type'] ?? '';
      if (result.status === 204 || !contentType.includes('application/json')) finish();
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
        json: async () => {
          try { return result.body; }
          finally { finish(); }
        },
      } as Response;
    } catch (error) {
      finish();
      throw error;
    }
  });
  vi.stubGlobal('fetch', fetchMock);
  const waitForIdle = async () => {
    while (pendingRequests > 0) await new Promise<void>((resolve) => idleWaiters.push(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  return { agent, paths, fetchMock, waitForIdle };
}

async function settleWorkspaceRequests(api: ReturnType<typeof bridgeFetch>): Promise<void> {
  await act(async () => { await api.waitForIdle(); });
}

function metricValue(label: string): string {
  const labelNode = Array.from(document.querySelectorAll('.metric-card .metric-label'))
    .find((node) => node.textContent?.trim() === label);
  const card = labelNode?.closest('.metric-card');
  const value = card?.querySelector('.metric-value')?.firstChild?.textContent;
  if (!value) throw new Error(`Dashboard metric ${label} did not render a value.`);
  return value.trim();
}

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider><AppRouter /></AuthProvider>
    </MemoryRouter>,
  );
}

describe('full-stack workspace workflow', () => {
  // This full-stack UI/API/SQLite journey takes about 2.4s serially and exceeded Vitest's default 5s during concurrent verification load.
  it('keeps dashboard, inbox, handoff details, actions, errors, and SQLite state in sync', async () => {
    db = makeWorkflowDb();
    insertWorkflowUser(db, 'user-owner', 'Test Owner', 'owner@example.test', 1);
    insertWorkflowUser(db, 'user-teammate', 'Test Teammate', 'teammate@example.invalid', 0);
    const config = makeWorkflowConfig();
    const app = createApp({ db, config });
    const api = bridgeFetch(app, config.webOrigin);

    const payload = {
      meta: {
        version: '1.1',
        time: '2026-10-17T12:00:00.123456789Z',
        request_id: '123e4567-e89b-42d3-a456-426614174099',
        account_id: 'ava1.ring.account.simulator-only',
      },
      data: {
        id: 'ui-workflow-simulated-event',
        type: 'button_press',
        attributes: { source: 'ui-workflow-device', source_type: 'devices', timestamp: Date.parse('2026-10-17T12:00:00.000Z') },
        relationships: { devices: { links: { self: '/v1/devices/ui-workflow-device' } } },
      },
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const webhook = await request(app).post('/api/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', createRingSignature(raw, config.simulatorHmacKey!))
      .send(raw.toString('utf8'));
    expect(webhook.status).toBe(200);
    expect(webhook.body).toMatchObject({ status: 'accepted' });

    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Keep the next step in view.' })).toBeInTheDocument();
    await waitFor(() => expect(api.paths).toContain('/api/settings'));

    expect(metricValue('Unassigned')).toBe('0');
    expect(metricValue('Awaiting acknowledgement')).toBe('0');
    expect(metricValue('Acknowledged')).toBe('0');
    expect(metricValue('Resolved')).toBe('0');
    expect(screen.getByRole('link', { name: /Inbox 1/ })).toBeInTheDocument();
    const initialOverview = await api.agent.get('/api/overview');
    expect(initialOverview.status).toBe(200);
    expect(initialOverview.body.counts).toMatchObject({ needsAttention: 0, unassigned: 0, assigned: 0, resolved: 0, inbox: 1 });

    await user.click(screen.getByRole('link', { name: /New handoff/ }));
    expect(await screen.findByRole('heading', { name: 'Capture the next step.' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/What needs attention/), 'Meet the visitor at the accessible entrance');
    await user.selectOptions(screen.getByLabelText('Category'), 'visitor');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Create manual handoff' }));
    expect(await screen.findByRole('heading', { name: 'Follow through, step by step.' })).toBeInTheDocument();
    expect(screen.getByText('Meet the visitor at the accessible entrance')).toBeInTheDocument();
    expect(screen.getAllByText('Manual')).toHaveLength(2);
    expect(screen.getByText(/waiting for an owner/)).toBeInTheDocument();
    await settleWorkspaceRequests(api);

    const createdDetail = await api.agent.get('/api/handoffs?provenance=manual');
    expect(createdDetail.status).toBe(200);
    expect(createdDetail.body.items).toHaveLength(1);
    const handoffId = createdDetail.body.items[0].id as string;
    const createdOverview = await api.agent.get('/api/overview');
    expect(createdOverview.body.counts).toMatchObject({
      needsAttention: 1, unassigned: 1, awaitingAcknowledgement: 0,
      assigned: 0, acknowledged: 0, resolved: 0, inbox: 1,
    });
    expect(createdOverview.body.needsAttention[0]).toMatchObject({ id: handoffId, provenance: 'manual' });

    await user.click(screen.getByRole('link', { name: 'Overview' }));
    expect(await screen.findByRole('heading', { name: 'Keep the next step in view.' })).toBeInTheDocument();
    expect(metricValue('Unassigned')).toBe('1');
    expect(metricValue('Awaiting acknowledgement')).toBe('0');
    expect(metricValue('Acknowledged')).toBe('0');
    await user.click(screen.getByRole('link', { name: 'Meet the visitor at the accessible entrance' }));
    expect(await screen.findByRole('heading', { name: 'Follow through, step by step.' })).toBeInTheDocument();
    await settleWorkspaceRequests(api);

    await user.click(screen.getByRole('button', { name: 'Assign to someone' }));
    await user.selectOptions(screen.getByLabelText('New owner'), 'user-teammate');
    db.prepare('DELETE FROM users WHERE id = ?').run('user-teammate');
    await user.click(screen.getByRole('button', { name: 'Assign handoff' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The selected owner is not available.');
    await settleWorkspaceRequests(api);
    expect((db.prepare('SELECT status FROM handoffs WHERE id = ?').get(handoffId) as { status: string }).status).toBe('new');
    expect((db.prepare('SELECT COUNT(*) AS count FROM activity WHERE handoff_id = ?').get(handoffId) as { count: number }).count).toBe(1);
    insertWorkflowUser(db, 'user-teammate', 'Test Teammate', 'teammate@example.invalid', 0);

    await user.click(screen.getByRole('button', { name: 'Assign handoff' }));
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    expect(screen.getAllByText('Test Teammate', { exact: true }).length).toBeGreaterThan(0);
    await settleWorkspaceRequests(api);
    expect((await api.agent.get('/api/overview')).body.counts).toMatchObject({
      needsAttention: 1, unassigned: 0, awaitingAcknowledgement: 1, assigned: 1, acknowledged: 0, inbox: 1,
    });

    await user.click(screen.getByRole('link', { name: 'Overview' }));
    expect(await screen.findByRole('heading', { name: 'Keep the next step in view.' })).toBeInTheDocument();
    expect(metricValue('Unassigned')).toBe('0');
    expect(metricValue('Awaiting acknowledgement')).toBe('1');
    expect(metricValue('Acknowledged')).toBe('0');
    await user.click(screen.getByRole('link', { name: /Awaiting acknowledgement/ }));
    expect(await screen.findByRole('heading', { name: 'Handoffs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toHaveValue('awaiting_acknowledgement');
    const matchingHandoffLinks = screen.getAllByRole('link', { name: 'Meet the visitor at the accessible entrance' });
    expect(matchingHandoffLinks).toHaveLength(2);
    await user.click(matchingHandoffLinks[0]!);
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    await settleWorkspaceRequests(api);

    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Acknowledged', { exact: true })).toBeInTheDocument();
    await settleWorkspaceRequests(api);
    const acknowledgedAt = (await api.agent.get(`/api/handoffs/${handoffId}`)).body.handoff.acknowledgedAt as string;
    expect(acknowledgedAt).toBeTruthy();
    expect((await api.agent.get('/api/overview')).body.counts).toMatchObject({
      needsAttention: 1, awaitingAcknowledgement: 0, assigned: 0, acknowledged: 1, inbox: 1,
    });

    await user.click(screen.getByRole('link', { name: 'Overview' }));
    expect(await screen.findByRole('heading', { name: 'Keep the next step in view.' })).toBeInTheDocument();
    expect(metricValue('Awaiting acknowledgement')).toBe('0');
    expect(metricValue('Acknowledged')).toBe('1');
    await user.click(screen.getByRole('link', { name: 'Meet the visitor at the accessible entrance' }));
    expect(await screen.findByRole('button', { name: 'Reassign owner' })).toBeInTheDocument();
    await settleWorkspaceRequests(api);

    await user.click(screen.getByRole('button', { name: 'Reassign owner' }));
    await user.selectOptions(screen.getByLabelText('New owner'), 'user-owner');
    await user.click(screen.getByRole('button', { name: 'Save reassignment' }));
    expect(await screen.findByText('Acknowledged', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('Test Owner', { exact: true }).length).toBeGreaterThan(0);
    await settleWorkspaceRequests(api);
    const reassignedDetail = await api.agent.get(`/api/handoffs/${handoffId}`);
    expect(reassignedDetail.body.handoff).toMatchObject({
      status: 'acknowledged', ownerId: 'user-owner', ownerName: 'Test Owner', acknowledgedAt,
    });
    expect(reassignedDetail.body.activity.map((item: { action: string }) => item.action)).toEqual([
      'created_manual', 'assigned', 'acknowledged', 'reassigned',
    ]);

    await user.type(screen.getByLabelText('Resolution note'), 'Visitor was welcomed and guided inside.');
    await user.click(screen.getByRole('button', { name: 'Resolve handoff' }));
    expect(await screen.findByRole('button', { name: 'Reopen handoff' })).toBeInTheDocument();
    expect(screen.getByText('Resolution note:').parentElement).toHaveTextContent('Visitor was welcomed and guided inside.');
    await settleWorkspaceRequests(api);
    const resolvedDetail = await api.agent.get(`/api/handoffs/${handoffId}`);
    expect(resolvedDetail.body.handoff).toMatchObject({ status: 'resolved', resolutionNote: 'Visitor was welcomed and guided inside.', provenance: 'manual' });
    expect(resolvedDetail.body.activity.map((item: { action: string }) => item.action)).toEqual([
      'created_manual', 'assigned', 'acknowledged', 'reassigned', 'resolved',
    ]);

    await user.click(screen.getByRole('link', { name: 'Overview' }));
    expect(await screen.findByRole('heading', { name: 'Keep the next step in view.' })).toBeInTheDocument();
    await waitFor(() => expect(metricValue('Resolved')).toBe('1'));
    expect(metricValue('Unassigned')).toBe('0');
    expect(metricValue('Awaiting acknowledgement')).toBe('0');
    expect(metricValue('Acknowledged')).toBe('0');
    expect(screen.getByRole('link', { name: /Inbox 1/ })).toBeInTheDocument();
    const resolvedOverview = await api.agent.get('/api/overview');
    expect(resolvedOverview.body.counts).toMatchObject({ needsAttention: 0, unassigned: 0, assigned: 0, acknowledged: 0, resolved: 1, inbox: 1 });

    await user.click(screen.getByRole('link', { name: 'Event inbox' }));
    expect(await screen.findByText('Button press')).toBeInTheDocument();
    expect(screen.getByText('Local · Simulated')).toBeInTheDocument();
    expect(screen.queryByText('Ring · Simulated')).not.toBeInTheDocument();
    expect(screen.queryByText('Ring · Live')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Human classification'), 'delivery');
    await user.type(screen.getByLabelText('What needs attention?'), 'Collect the parcel from the shared entrance');
    await user.selectOptions(screen.getByLabelText('Priority'), 'normal');
    await user.click(screen.getByRole('button', { name: 'Create handoff' }));
    expect(await screen.findByText('Collect the parcel from the shared entrance')).toBeInTheDocument();
    expect(screen.getAllByText('Local · Simulated')).toHaveLength(2);
    await settleWorkspaceRequests(api);
    const simulatedList = await api.agent.get('/api/handoffs?provenance=ring_simulated');
    expect(simulatedList.status).toBe(200);
    expect(simulatedList.body.items).toHaveLength(1);
    expect(simulatedList.body.items[0]).toMatchObject({ summary: 'Collect the parcel from the shared entrance', provenance: 'ring_simulated', isSynthetic: false });
    const classifiedOverview = await api.agent.get('/api/overview');
    expect(classifiedOverview.body.counts).toMatchObject({ needsAttention: 1, unassigned: 1, resolved: 1, inbox: 0 });

    await user.click(screen.getByRole('link', { name: 'Event inbox' }));
    expect(await screen.findByText('No unclassified events')).toBeInTheDocument();
    const inbox = await api.agent.get('/api/inbox');
    expect(inbox.status).toBe(200);
    expect(inbox.body.events).toEqual([]);
    expect(api.paths).toContain('/api/overview');
  }, 10_000);
});
