import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase, type Db } from './db/index.js';
import { createApp } from './app.js';
import { makeTestConfig, insertTestTeammate, insertTestUser } from './test-support.js';
import { createRingSignature } from './ring/signature.js';

let directory: string | null = null;
let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = null;
});

function cookieFrom(response: { headers: Record<string, string | string[] | undefined> }): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Expected an HTTP-only session cookie.');
  return value.split(';')[0] ?? '';
}

describe('signed event to resolved handoff vertical slice', () => {
  it('ingests a simulated signed event, classifies, assigns, acknowledges, resolves, and persists after restart', async () => {
    directory = mkdtempSync(join(tmpdir(), 'doorway-relay-slice-'));
    const databasePath = join(directory, 'slice.sqlite');
    db = openDatabase(databasePath);
    insertTestUser(db);
    insertTestTeammate(db);
    const config = makeTestConfig({ databasePath });
    let app = createApp({ db, config });

    const csrfResponse = await request(app).get('/api/auth/csrf');
    const anonymousCookie = cookieFrom(csrfResponse);
    const login = await request(app).post('/api/auth/login')
      .set('cookie', anonymousCookie).set('origin', config.webOrigin)
      .set('x-csrf-token', csrfResponse.body.csrfToken)
      .send({ email: 'owner@example.test', password: 'correct-horse-battery-1' });
    expect(login.status).toBe(200);
    let cookie = cookieFrom(login);
    const sessionCsrf = await request(app).get('/api/auth/csrf').set('cookie', cookie);
    let csrf = sessionCsrf.body.csrfToken as string;

    const payload = {
      meta: {
        version: '1.1',
        time: '2026-10-17T12:00:00.123456789Z',
        request_id: '123e4567-e89b-42d3-a456-426614174001',
        account_id: 'ava1.ring.account.simulator-only',
      },
      data: {
        id: 'slice-upstream-event-1',
        type: 'button_press',
        attributes: { source: 'slice-device-1', source_type: 'devices', timestamp: Date.parse('2026-10-17T12:00:00Z') },
        relationships: { devices: { links: { self: '/v1/devices/slice-device-1' } } },
      },
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const webhook = await request(app).post('/api/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', createRingSignature(raw, config.simulatorHmacKey!))
      .send(raw.toString('utf8'));
    expect(webhook.status).toBe(200);
    expect(webhook.body.status).toBe('accepted');

    const inbox = await request(app).get('/api/inbox').set('cookie', cookie);
    expect(inbox.body.events).toHaveLength(1);
    expect(inbox.body.events[0]).toMatchObject({ provenance: 'ring_simulated', eventType: 'button_press' });
    const eventId = inbox.body.events[0].id as string;
    const classify = await request(app).post(`/api/inbox/${eventId}/classify`)
      .set('cookie', cookie).set('origin', config.webOrigin).set('x-csrf-token', csrf)
      .send({ category: 'visitor', summary: 'Meet the visitor at the side entrance', priority: 'high' });
    expect(classify.status).toBe(201);
    const handoffId = classify.body.handoff.id as string;
    expect(classify.body.handoff.provenance).toBe('ring_simulated');

    const assign = await request(app).post(`/api/handoffs/${handoffId}/assign`)
      .set('cookie', cookie).set('origin', config.webOrigin).set('x-csrf-token', csrf)
      .send({ ownerId: 'user-teammate' });
    expect(assign.body.handoff).toMatchObject({ status: 'assigned', ownerName: 'Test Teammate' });

    const acknowledge = await request(app).post(`/api/handoffs/${handoffId}/acknowledge`)
      .set('cookie', cookie).set('origin', config.webOrigin).set('x-csrf-token', csrf).send({});
    expect(acknowledge.body.handoff.status).toBe('acknowledged');
    expect(acknowledge.body.handoff.resolutionNote).toBeNull();

    const resolve = await request(app).post(`/api/handoffs/${handoffId}/resolve`)
      .set('cookie', cookie).set('origin', config.webOrigin).set('x-csrf-token', csrf)
      .send({ note: 'Visitor was met and guided inside.' });
    expect(resolve.body.handoff).toMatchObject({ status: 'resolved', resolutionNote: 'Visitor was met and guided inside.' });

    const detail = await request(app).get(`/api/handoffs/${handoffId}`).set('cookie', cookie);
    expect(detail.body.activity.map((item: { action: string }) => item.action)).toEqual([
      'classified_event', 'assigned', 'acknowledged', 'resolved',
    ]);

    db.close();
    db = openDatabase(databasePath);
    app = createApp({ db, config });
    const afterRestart = await request(app).get(`/api/handoffs/${handoffId}`).set('cookie', cookie);
    expect(afterRestart.status).toBe(200);
    expect(afterRestart.body.handoff.status).toBe('resolved');
    expect(afterRestart.body.handoff.provenance).toBe('ring_simulated');
    expect(afterRestart.body.activity).toHaveLength(4);

    const duplicate = await request(app).post('/api/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', createRingSignature(raw, config.simulatorHmacKey!))
      .send(raw.toString('utf8'));
    expect(duplicate.body.status).toBe('duplicate');
    expect((db.prepare('SELECT COUNT(*) AS count FROM source_events WHERE external_event_id = ?').get('slice-upstream-event-1') as { count: number }).count).toBe(1);

    cookie = '';
    csrf = '';
  });
});
