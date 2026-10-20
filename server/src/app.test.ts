import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Db } from './db/index.js';
import { createApp } from './app.js';
import type { AppConfig } from './config.js';
import { makeTestConfig, makeTestDb, insertTestTeammate, insertTestUser, testPassword } from './test-support.js';
import { createAccountNonce } from './ring/nonce.js';
import { RingTokenStore } from './ring/token-store.js';

let db: Db | null = null;
const whepOfferSdp = [
  'v=0', 'o=- 123456 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=ice-ufrag:offerfrag', 'a=ice-pwd:offerpassword',
  'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
  'a=recvonly', '',
].join('\r\n');
const whepAnswerSdp = whepOfferSdp
  .replace('a=ice-ufrag:offerfrag', 'a=ice-ufrag:answerfrag')
  .replace('a=ice-pwd:offerpassword', 'a=ice-pwd:answerpassword')
  .replace('a=recvonly', 'a=sendonly');
afterEach(() => {
  db?.close();
  db = null;
});

async function authenticatedApp(configOverrides: Partial<AppConfig> = {}, fetcher?: typeof fetch) {
  db = makeTestDb();
  insertTestUser(db);
  insertTestTeammate(db);
  const config = { ...makeTestConfig(), ...configOverrides };
  const app = createApp({ db, config, ...(fetcher ? { fetcher } : {}) });
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const token = csrf.body.csrfToken as string;
  const login = await agent.post('/api/auth/login')
    .set('origin', config.webOrigin)
    .set('x-csrf-token', token)
    .send({ email: 'owner@example.test', password: testPassword });
  expect(login.status).toBe(200);
  const fresh = await agent.get('/api/auth/csrf');
  return { app, agent, config, csrfToken: fresh.body.csrfToken as string };
}

describe('HTTP API auth and handoffs', () => {
  it('reports SQLite readiness without creating a session or leaking database errors', async () => {
    db = makeTestDb();
    const app = createApp({ db, config: makeTestConfig() });
    const healthy = await request(app).get('/api/health');
    expect(healthy.status).toBe(200);
    expect(healthy.body).toEqual({ status: 'ok' });
    expect(healthy.headers['cache-control']).toBe('no-store');
    expect(healthy.headers['set-cookie']).toBeUndefined();

    db.close();
    db = null;
    const unavailable = await request(app).get('/api/health');
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(unavailable.body)).not.toMatch(/sqlite|database|path/i);
  });

  it('rejects unauthenticated mutations and requires CSRF after login', async () => {
    db = makeTestDb();
    const config = makeTestConfig();
    const app = createApp({ db, config });
    const anonymous = request.agent(app);
    const noCookie = await request(app).post('/api/handoffs').send({});
    expect(noCookie.status).toBe(403);
    expect(noCookie.body.error.code).toBe('csrf_invalid');

    const csrf = await anonymous.get('/api/auth/csrf');
    const wrongLogin = await anonymous.post('/api/auth/login').set('origin', config.webOrigin)
      .set('x-csrf-token', csrf.body.csrfToken).send({ email: 'nobody@example.test', password: testPassword });
    expect(wrongLogin.status).toBe(401);

    insertTestUser(db);
    const login = await anonymous.post('/api/auth/login').set('origin', config.webOrigin)
      .set('x-csrf-token', csrf.body.csrfToken).send({ email: 'owner@example.test', password: testPassword });
    expect(login.status).toBe(200);
    const protectedRead = await request(app).get('/api/handoffs');
    expect(protectedRead.status).toBe(401);
    expect(protectedRead.body.error.code).toBe('unauthenticated');

    const sessionCsrf = await anonymous.get('/api/auth/csrf');
    const invalidCsrf = await anonymous.post('/api/handoffs')
      .set('origin', config.webOrigin).set('x-csrf-token', 'incorrect-csrf-token')
      .send({ category: 'visitor', summary: 'Meet the visitor at the entrance', priority: 'normal' });
    expect(sessionCsrf.status).toBe(200);
    expect(invalidCsrf.status).toBe(403);
    expect(invalidCsrf.body.error.code).toBe('csrf_invalid');
    expect((db.prepare('SELECT COUNT(*) AS count FROM handoffs').get() as { count: number }).count).toBe(0);
  });

  it('allows first-user registration once, then closes signup and reports that state', async () => {
    db = makeTestDb();
    const config = makeTestConfig();
    const agent = request.agent(createApp({ db, config }));
    const csrf = await agent.get('/api/auth/csrf');
    const registration = await agent.post('/api/auth/register')
      .set('origin', config.webOrigin)
      .set('x-csrf-token', csrf.body.csrfToken)
      .send({ email: 'new-owner@example.test', password: testPassword, displayName: 'New Coordinator' });
    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({ email: 'new-owner@example.test', displayName: 'New Coordinator' });
    const me = await agent.get('/api/auth/me');
    expect(me.body).toMatchObject({ registrationOpen: false, user: { email: 'new-owner@example.test' } });
    const freshCsrf = await agent.get('/api/auth/csrf');
    const secondRegistration = await agent.post('/api/auth/register')
      .set('origin', config.webOrigin)
      .set('x-csrf-token', freshCsrf.body.csrfToken)
      .send({ email: 'second-owner@example.test', password: testPassword, displayName: 'Second Coordinator' });
    expect(secondRegistration.status).toBe(403);
    expect(secondRegistration.body.error.code).toBe('registration_closed');
  });

  it('allows at most one first-user registration across concurrent requests', async () => {
    db = makeTestDb();
    const config = makeTestConfig();
    const app = createApp({ db, config });
    const agents = [request.agent(app), request.agent(app)];
    const csrfResponses = await Promise.all(agents.map((agent) => agent.get('/api/auth/csrf')));
    const registrations = await Promise.all(agents.map((agent, index) => agent.post('/api/auth/register')
      .set('origin', config.webOrigin)
      .set('x-csrf-token', csrfResponses[index]!.body.csrfToken as string)
      .send({ email: `owner-${index}@example.test`, password: testPassword, displayName: `Owner ${index}` })));

    expect(registrations.map((result) => result.status).sort()).toEqual([201, 403]);
    expect((db.prepare('SELECT COUNT(*) AS count FROM users WHERE login_enabled = 1').get() as { count: number }).count).toBe(1);
  });

  it('validates API inputs, creates a manual handoff, and lists it from SQLite', async () => {
    const { agent, config, csrfToken } = await authenticatedApp();
    const invalid = await agent.post('/api/handoffs').set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ category: 'visitor', summary: 'x', priority: 'normal' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('validation_error');

    const invalidDueDate = await agent.post('/api/handoffs').set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ category: 'visitor', summary: 'Meet the visitor at the entrance', priority: 'normal', dueAt: 'not-a-date' });
    expect(invalidDueDate.status).toBe(400);
    expect(invalidDueDate.body.error.code).toBe('validation_error');

    const created = await agent.post('/api/handoffs').set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ category: 'visitor', summary: 'Meet the visitor at the main entrance', priority: 'high', dueAt: null });
    expect(created.status).toBe(201);
    expect(created.body.handoff).toMatchObject({ status: 'new', provenance: 'manual', ownerId: null, dueAt: null });
    const list = await agent.get('/api/handoffs?status=new&provenance=manual');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.total).toBe(1);
  });

  it('returns a structured 409 for an invalid transition without changing rows', async () => {
    const { agent, config, csrfToken } = await authenticatedApp();
    const created = await agent.post('/api/handoffs').set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ category: 'access', summary: 'Check the shared entrance', priority: 'normal' });
    const invalid = await agent.post(`/api/handoffs/${created.body.handoff.id}/resolve`)
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({ note: 'Done.' });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('invalid_transition');
    expect((db!.prepare('SELECT COUNT(*) AS count FROM activity WHERE handoff_id = ?').get(created.body.handoff.id) as { count: number }).count).toBe(1);
  });

  it('reports simulator evidence separately and never calls env configuration a Ring connection', async () => {
    const { agent } = await authenticatedApp();
    const status = await agent.get('/api/ring/status');
    expect(status.headers['cache-control']).toBe('no-store');
    expect(status.body.state).toBe('not_connected');
    expect(status.body.connected).toBe(false);
    const overview = await agent.get('/api/overview');
    expect(overview.headers['cache-control']).toBe('no-store');
  });

  it('verifies Playground access server-side without exposing the token in API responses', async () => {
    const token = 'playground-secret-token-never-returned';
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/vnd.api+json' } });
    });
    const { agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);

    const before = await agent.get('/api/ring/playground/status');
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ state: 'token_present_unverified', tokenPresent: true, historyShapeVerified: false, historySyncAvailable: false });
    expect(JSON.stringify(before.body)).not.toContain(token);

    const verified = await agent.post('/api/ring/playground/verify')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({});
    expect(verified.status).toBe(200);
    expect(verified.body.checked).toBe('devices');
    expect(verified.body.status.state).toBe('last_success');
    expect(verified.body.deviceSummary).toBe('0 devices returned');
    expect(verified.body.status.lastDeviceSummary).toBe('0 devices returned');
    expect(verified.body.shapeUnrecognized).toBe(false);
    expect(verified.body.devices).toEqual([]);
    expect(JSON.stringify(verified.body)).not.toContain(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM ring_tokens').get() as { count: number }).count).toBe(0);

    const after = await agent.get('/api/ring/playground/status');
    expect(after.body.lastSuccessfulCallAt).toEqual(expect.any(String));
    expect(JSON.stringify(after.body)).not.toContain(token);
  });

  it('lists only safe Playground device identifiers and requires authentication', async () => {
    const token = 'playground-device-secret-never-returned';
    const privateValue = 'private-room-label-never-returned';
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
      return new Response(JSON.stringify({ data: [
        { id: 'opaque-device-1', type: 'devices', name: privateValue, attributes: { serial: 'private-serial' } },
        { id: 'opaque-device-2', type: 'doorbell' },
      ], links: { next: 'private-link' } }), { status: 200, headers: { 'content-type': 'application/vnd.api+json' } });
    });
    const { app, agent } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);

    const unauthenticated = await request(app).get('/api/ring/playground/devices');
    expect(unauthenticated.status).toBe(401);

    const response = await agent.get('/api/ring/playground/devices');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      devices: [{ id: 'opaque-device-1', type: 'devices' }, { id: 'opaque-device-2', type: 'doorbell' }],
      shapeUnrecognized: false,
      selectedDeviceId: null,
      deviceSummary: '2 devices returned',
    });
    expect(response.body.lastSuccessfulCallAt).toEqual(expect.any(String));
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain('private-serial');
    expect(serialized).not.toContain('private-link');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns an empty, explicitly unrecognized device list without guessing from response fields', async () => {
    const token = 'playground-unrecognized-secret';
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ devices: [{ id: 'do-not-guess' }], meta: { token } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const { agent } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);
    const response = await agent.get('/api/ring/playground/devices');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ devices: [], shapeUnrecognized: true, selectedDeviceId: null, deviceSummary: 'response received' });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain('do-not-guess');
  });

  it('accepts only a device in the most recent list and requires CSRF for selection', async () => {
    const token = 'playground-selection-secret';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'device-a' }, { id: 'device-b', type: 'devices' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'device-b' }] }), { status: 200 }));
    const { agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);

    const beforeList = await agent.post('/api/ring/playground/device')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({ id: 'device-a' });
    expect(beforeList.status).toBe(409);
    expect(beforeList.body.error.code).toBe('ring_playground_device_not_listed');

    const listed = await agent.get('/api/ring/playground/devices');
    expect(listed.body.devices.map((device: { id: string }) => device.id)).toEqual(['device-a', 'device-b']);
    const noCsrf = await agent.post('/api/ring/playground/device').set('origin', config.webOrigin).send({ id: 'device-a' });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('csrf_invalid');

    const selected = await agent.post('/api/ring/playground/device')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({ id: 'device-a' });
    expect(selected.status).toBe(200);
    expect(selected.body).toEqual({ selectedDeviceId: 'device-a' });

    const refreshed = await agent.get('/api/ring/playground/devices');
    expect(refreshed.body.selectedDeviceId).toBeNull();
    const staleSelection = await agent.post('/api/ring/playground/device')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({ id: 'device-a' });
    expect(staleSelection.status).toBe(409);
    expect(JSON.stringify(selected.body)).not.toContain(token);
  });

  it('relays a receive-only Playground WHEP session only for an authenticated, CSRF-protected selected device', async () => {
    const token = 'playground-whep-secret-never-returned';
    const sessionLocation = 'https://api.amazonvision.com/v1/devices/whep-device/media/streaming/whep/sessions/whep-resource';
    const ringRequests: Array<{ path: string; method: string; authorization: string | null; body: unknown; redirect: RequestInit['redirect'] }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      ringRequests.push({
        path: url.pathname,
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
        body: init?.body,
        redirect: init?.redirect,
      });
      if (url.pathname === '/v1/devices') return new Response(JSON.stringify({ data: [{ id: 'whep-device', type: 'devices' }] }), { status: 200 });
      if (url.pathname.endsWith('/media/streaming/whep/sessions') && init?.method === 'POST') {
        return new Response(whepAnswerSdp, { status: 201, headers: { 'content-type': 'application/sdp', location: '/v1/devices/whep-device/media/streaming/whep/sessions/whep-resource' } });
      }
      if (url.href === sessionLocation && init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response('unexpected mock route', { status: 404 });
    });
    const { app, agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);

    const unauthenticated = await request(app).post('/api/ring/playground/whep/session')
      .set('content-type', 'application/sdp').send(whepOfferSdp);
    expect(unauthenticated.status).toBe(403);
    expect(unauthenticated.headers['cache-control']).toBe('no-store');
    const noCsrf = await agent.post('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('content-type', 'application/sdp').send(whepOfferSdp);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.headers['cache-control']).toBe('no-store');
    const sessionId = '1f96a7ad-1af9-44d2-8a5f-6d7e38f79d3e';
    const unauthenticatedDelete = await request(app).delete('/api/ring/playground/whep/session').send({ sessionId });
    expect(unauthenticatedDelete.status).toBe(403);
    expect(unauthenticatedDelete.headers['cache-control']).toBe('no-store');
    const noCsrfDelete = await agent.delete('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).send({ sessionId });
    expect(noCsrfDelete.status).toBe(403);
    expect(noCsrfDelete.headers['cache-control']).toBe('no-store');
    const oversizedOffer = `${whepOfferSdp}${'x'.repeat(64 * 1024)}`;
    const oversized = await agent.post('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .set('content-type', 'application/sdp').send(oversizedOffer);
    expect(oversized.status).toBe(413);
    expect(oversized.headers['cache-control']).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();

    const listed = await agent.get('/api/ring/playground/devices');
    expect(listed.status).toBe(200);
    const selected = await agent.post('/api/ring/playground/device')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({ id: 'whep-device' });
    expect(selected.status).toBe(200);

    const started = await agent.post('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .set('content-type', 'application/sdp').send(whepOfferSdp);
    expect(started.status).toBe(201);
    expect(started.headers['cache-control']).toBe('no-store');
    expect(started.body).toMatchObject({ answerSdp: whepAnswerSdp });
    expect(started.body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(started.body)).not.toContain(sessionLocation);
    expect(JSON.stringify(started.body)).not.toContain(token);
    expect(ringRequests.some((call) => call.path.includes('/history/'))).toBe(false);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);
    expect(ringRequests).toContainEqual({
      path: '/v1/devices/whep-device/media/streaming/whep/sessions',
      method: 'POST',
      authorization: `Bearer ${token}`,
      body: whepOfferSdp,
      redirect: 'error',
    });

    const stopped = await agent.delete('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ sessionId: started.body.sessionId });
    expect(stopped.status).toBe(204);
    expect(stopped.headers['cache-control']).toBe('no-store');
    const upstreamRequestCountAfterStop = ringRequests.length;
    const stoppedAgain = await agent.delete('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ sessionId: started.body.sessionId });
    expect(stoppedAgain.status).toBe(204);
    expect(ringRequests).toHaveLength(upstreamRequestCountAfterStop);
    expect(ringRequests.at(-1)).toMatchObject({
      path: '/v1/devices/whep-device/media/streaming/whep/sessions/whep-resource',
      method: 'DELETE',
      authorization: `Bearer ${token}`,
    });
    expect(JSON.stringify(ringRequests)).not.toContain('unexpected mock route');
  });

  it('returns a safe 401 on a WHEP token expiry without exposing upstream text or SDP', async () => {
    const token = 'whep-expired-token-never-returned';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (new URL(String(input)).pathname === '/v1/devices') return new Response(JSON.stringify({ data: [{ id: 'whep-device' }] }), { status: 200 });
      return new Response(`private upstream body ${token}`, { status: 401 });
    });
    const { agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);
    await agent.get('/api/ring/playground/devices');
    await agent.post('/api/ring/playground/device').set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({ id: 'whep-device' });
    const expired = await agent.post('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .set('content-type', 'application/sdp').send(whepOfferSdp);
    expect(expired.status).toBe(401);
    expect(expired.headers['cache-control']).toBe('no-store');
    expect(expired.body.error.code).toBe('ring_playground_token_expired');
    expect(JSON.stringify(expired.body)).not.toContain(token);
    expect(JSON.stringify(expired.body)).not.toContain('private upstream body');
    expect(JSON.stringify(expired.body)).not.toContain(whepOfferSdp);
    const resetStatus = (await agent.get('/api/ring/playground/status')).body;
    expect(resetStatus).toMatchObject({ state: 'token_expired', selectedDeviceId: null, devices: [], shapeUnrecognized: true });
  });

  it('rejects WHEP without a selected device and rate-limits creation attempts', async () => {
    const token = 'whep-rate-limit-token';
    const fetcher = vi.fn();
    const { agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const missingSelection = await agent.post('/api/ring/playground/whep/session')
        .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
        .set('content-type', 'application/sdp').send(whepOfferSdp);
      expect(missingSelection.status).toBe(409);
      expect(missingSelection.body.error.code).toBe('ring_playground_device_not_selected');
    }
    const limited = await agent.post('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .set('content-type', 'application/sdp').send(whepOfferSdp);
    expect(limited.status).toBe(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.body.error.code).toBe('rate_limited');
    const limitedDelete = await agent.delete('/api/ring/playground/whep/session')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ sessionId: '1f96a7ad-1af9-44d2-8a5f-6d7e38f79d3e' });
    expect(limitedDelete.status).toBe(429);
    expect(limitedDelete.headers['cache-control']).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps Playground expiry, rate limits, and malformed responses safely without logging tokens', async () => {
    const token = 'playground-response-secret-never-returned';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: token }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: token }), { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: token }), { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: token }), { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { agent } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);

    const expired = await agent.get('/api/ring/playground/devices');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('ring_playground_token_expired');
    expect(JSON.stringify(expired.body)).not.toContain(token);

    const limited = await agent.get('/api/ring/playground/devices');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('ring_playground_rate_limited');
    expect(JSON.stringify(limited.body)).not.toContain(token);

    const malformed = await agent.get('/api/ring/playground/devices');
    expect(malformed.status).toBe(502);
    expect(malformed.body.error.code).toBe('ring_playground_invalid_response');
    expect(JSON.stringify(malformed.body)).not.toContain(token);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('redacts expired-token failures and refuses to sync unverified history without a Ring request', async () => {
    const token = 'playground-secret-token-never-returned';
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'authorization failed' }), { status: 401 }));
    const { agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_playground' }, fetcher);
    const expired = await agent.post('/api/ring/playground/verify')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({});
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('ring_playground_token_expired');
    expect(expired.body.error.message).toMatch(/generate a new one/);
    expect(JSON.stringify(expired.body)).not.toContain(token);
    expect(JSON.stringify(expired.body)).not.toContain('authorization failed');

    const status = await agent.get('/api/ring/playground/status');
    expect(status.body.state).toBe('token_expired');
    const sync = await agent.post('/api/ring/playground/sync')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({});
    expect(sync.status).toBe(409);
    expect(sync.body.error.code).toBe('ring_playground_history_shape_unverified');
    expect(JSON.stringify(sync.body)).not.toContain(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not use a Playground token while event provenance is not explicitly set to Playground', async () => {
    const token = 'playground-secret-token-never-returned';
    const fetcher = vi.fn();
    const { agent, config, csrfToken } = await authenticatedApp({ ringAccessToken: token, ringEventSource: 'ring_live' }, fetcher);
    const status = await agent.get('/api/ring/playground/status');
    expect(status.body.state).toBe('source_mismatch');
    expect(status.body.tokenPresent).toBe(true);
    const verify = await agent.post('/api/ring/playground/verify')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken).send({});
    expect(verify.status).toBe(409);
    expect(verify.body.error.code).toBe('ring_playground_source_not_selected');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects same-host cross-scheme origins and blocks cross-site mutations with a browser session', async () => {
    const { agent, csrfToken } = await authenticatedApp();
    const sameHostWrongScheme = await agent.patch('/api/settings')
      .set('host', 'localhost:5173')
      .set('origin', 'https://localhost:5173')
      .set('x-csrf-token', csrfToken)
      .send({ displayName: 'Test Owner', largerText: false, reducedMotion: false });
    expect(sameHostWrongScheme.status).toBe(403);
    expect(sameHostWrongScheme.body.error.code).toBe('origin_rejected');

    const response = await agent.patch('/api/settings')
      .set('origin', 'https://attacker.example')
      .set('sec-fetch-site', 'cross-site')
      .set('x-csrf-token', csrfToken)
      .send({ displayName: 'Test Owner', largerText: false, reducedMotion: false });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('origin_rejected');
  });

  it('accepts only the documented time/nonce account-link body and rejects seconds timestamps', async () => {
    const { agent, config, csrfToken } = await authenticatedApp();
    const secondsTimestamp = await agent.post('/api/ring/account-link')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ time: String(Math.floor(Date.now() / 1000)), nonce: 'A'.repeat(43) });
    expect(secondsTimestamp.status).toBe(400);
    expect(secondsTimestamp.body.error.code).toBe('validation_error');

    const callerSuppliedAccount = await agent.post('/api/ring/account-link')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ time: String(Date.now()), accountId: 'caller-controlled', nonce: 'A'.repeat(43) });
    expect(callerSuppliedAccount.status).toBe(400);
    expect(callerSuppliedAccount.body.error.code).toBe('validation_error');

    const noUnclaimedToken = await agent.post('/api/ring/account-link')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ time: String(Date.now()), nonce: 'A'.repeat(43) });
    expect(noUnclaimedToken.status).toBe(409);
    expect(noUnclaimedToken.body.error.code).toBe('ring_token_unclaimed_not_found');
  });

  it('verifies the stored Ring account and nonce before masked POST/PATCH and only then claims tokens', async () => {
    db = makeTestDb();
    insertTestUser(db);
    const config = makeTestConfig();
    const accountId = 'ava1.ring.account.test-account-1';
    const tokenStore = new RingTokenStore(db, config.tokenEncryptionKey);
    tokenStore.saveUnclaimedPair({
      accessToken: 'ring-access-token-for-test',
      refreshToken: 'ring-refresh-token-for-test',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }, accountId);
    const ringRequests: Array<{ method: string; path: string; authorization: string | null; body: unknown }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      let body: unknown = null;
      if (typeof init?.body === 'string') body = JSON.parse(init.body) as unknown;
      const headers = new Headers(init?.headers);
      ringRequests.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        authorization: headers.get('authorization'),
        body,
      });
      if (url.pathname === '/v1/users/me') {
        return new Response(JSON.stringify({ data: { id: accountId } }), { status: 200 });
      }
      if (url.pathname === '/v1/accounts/me/app-integrations') {
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    const app = createApp({ db, config, fetcher: fetcher as unknown as typeof fetch });
    const agent = request.agent(app);
    const csrf = await agent.get('/api/auth/csrf');
    const login = await agent.post('/api/auth/login')
      .set('origin', config.webOrigin).set('x-csrf-token', csrf.body.csrfToken as string)
      .send({ email: 'owner@example.test', password: testPassword });
    expect(login.status).toBe(200);
    const freshCsrf = await agent.get('/api/auth/csrf');
    const csrfToken = freshCsrf.body.csrfToken as string;
    const time = String(Date.now());
    const signingKey = config.ringHmacSigningKey!;

    const invalidNonce = await agent.post('/api/ring/account-link')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ time, nonce: createAccountNonce(time, 'different-ring-account', signingKey) });
    expect(invalidNonce.status).toBe(403);
    expect(invalidNonce.body.error.code).toBe('ring_nonce_invalid');
    expect(fetcher).not.toHaveBeenCalled();
    expect(tokenStore.getUnclaimedAccountId()).toBe(accountId);

    const nonce = createAccountNonce(time, accountId, signingKey);
    const linked = await agent.post('/api/ring/account-link')
      .set('origin', config.webOrigin).set('x-csrf-token', csrfToken)
      .send({ time, nonce });
    expect(linked.status).toBe(200);
    expect(linked.body).toEqual({ status: 'linked' });
    expect(ringRequests).toEqual([
      { method: 'GET', path: '/v1/users/me', authorization: 'Bearer ring-access-token-for-test', body: null },
      {
        method: 'POST', path: '/v1/accounts/me/app-integrations', authorization: 'Bearer ring-access-token-for-test',
        body: { account_identifier: 'o***r@example.test', nonce },
      },
      {
        method: 'PATCH', path: '/v1/accounts/me/app-integrations', authorization: 'Bearer ring-access-token-for-test',
        body: { status: 'completed' },
      },
    ]);
    expect(JSON.stringify(ringRequests)).not.toContain('owner@example.test');
    expect(tokenStore.getUnclaimedAccountId()).toBeNull();
    expect(tokenStore.isLinkedForAccount(accountId)).toBe(true);
  });

  it('leaves the Ring token unclaimed when App Integrations does not complete', async () => {
    db = makeTestDb();
    insertTestUser(db);
    const config = makeTestConfig();
    const accountId = 'ava1.ring.account.test-account-2';
    const tokenStore = new RingTokenStore(db, config.tokenEncryptionKey);
    tokenStore.saveUnclaimedPair({
      accessToken: 'ring-access-token-for-test',
      refreshToken: 'ring-refresh-token-for-test',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }, accountId);
    const methods: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      methods.push(`${method} ${path}`);
      if (path === '/v1/users/me') return new Response(JSON.stringify({ data: { id: accountId } }), { status: 200 });
      if (path === '/v1/accounts/me/app-integrations' && method === 'POST') return new Response('{}', { status: 200 });
      return new Response('{}', { status: 500 });
    });
    const app = createApp({ db, config, fetcher: fetcher as unknown as typeof fetch });
    const agent = request.agent(app);
    const csrf = await agent.get('/api/auth/csrf');
    const login = await agent.post('/api/auth/login')
      .set('origin', config.webOrigin).set('x-csrf-token', csrf.body.csrfToken as string)
      .send({ email: 'owner@example.test', password: testPassword });
    expect(login.status).toBe(200);
    const freshCsrf = await agent.get('/api/auth/csrf');
    const time = String(Date.now());
    const nonce = createAccountNonce(time, accountId, config.ringHmacSigningKey!);

    const failedLink = await agent.post('/api/ring/account-link')
      .set('origin', config.webOrigin).set('x-csrf-token', freshCsrf.body.csrfToken as string)
      .send({ time, nonce });
    expect(failedLink.status).toBe(502);
    expect(failedLink.body.error.code).toBe('ring_link_failed');
    expect(methods).toEqual([
      'GET /v1/users/me',
      'POST /v1/accounts/me/app-integrations',
      'PATCH /v1/accounts/me/app-integrations',
    ]);
    expect(tokenStore.getUnclaimedAccountId()).toBe(accountId);
    expect(tokenStore.isLinkedForAccount(accountId)).toBe(false);
  });

  it('returns 503 from Token Exchange while its assumed inbound body is disabled', async () => {
    db = makeTestDb();
    const config = makeTestConfig();
    const fetcher = vi.fn();
    const app = createApp({ db, config, fetcher: fetcher as unknown as typeof fetch });
    const response = await request(app).post('/api/ring/token-exchange')
      .set('content-type', 'application/json').send('{not json');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ring_token_exchange_disabled');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts the explicitly unverified code assumption as JSON or form only when enabled', async () => {
    db = makeTestDb();
    const config = makeTestConfig({
      ringTokenExchangeRouteEnabled: true,
      ringClientId: 'test-client-id',
      ringClientSecret: 'test-client-secret',
    });
    const exchangedCodes: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === config.ringTokenUrl) {
        exchangedCodes.push(new URLSearchParams(init?.body as URLSearchParams).get('code') ?? '');
        return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { id: 'ava1.ring.account.test-account-1' } }), { status: 200 });
    });
    const app = createApp({ db, config, fetcher: fetcher as unknown as typeof fetch });
    const json = await request(app).post('/api/ring/token-exchange').send({ code: 'json-code' });
    const form = await request(app).post('/api/ring/token-exchange').type('form').send({ code: 'form-code' });

    expect(json.status).toBe(200);
    expect(form.status).toBe(200);
    expect(exchangedCodes).toEqual(['json-code', 'form-code']);
    expect((db.prepare('SELECT COUNT(*) AS count FROM ring_tokens').get() as { count: number }).count).toBe(1);
  });

  it('rejects unexpected Token Exchange fields without logging submitted names or values', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringTokenExchangeRouteEnabled: true });
    const fetcher = vi.fn();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createApp({ db, config, fetcher: fetcher as unknown as typeof fetch });
    try {
      const response = await request(app).post('/api/ring/token-exchange?unexpected_query=query-secret')
        .send({ code: 'do-not-log-code', extra_field: 'do-not-log-value' });
      expect(response.status).toBe(400);
      expect(warning).toHaveBeenCalledOnce();
      const warningText = warning.mock.calls.flat().join(' ');
      expect(warningText).toContain('unexpected fields');
      expect(warningText).not.toContain('extra_field');
      expect(warningText).not.toContain('query.unexpected_query');
      expect(warningText).not.toContain('do-not-log-code');
      expect(warningText).not.toContain('do-not-log-value');
      expect(warningText).not.toContain('query-secret');
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
