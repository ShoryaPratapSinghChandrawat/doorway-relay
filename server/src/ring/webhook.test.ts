import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Db } from '../db/index.js';
import { createApp } from '../app.js';
import { makeTestConfig, makeTestDb } from '../test-support.js';
import { createRingSignature } from './signature.js';
import { RingTokenStore } from './token-store.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

const accountId = 'ava1.ring.account.test-account-1';
const eventTimestamp = Date.parse('2026-10-17T12:00:00Z');
const sentAt = '2026-10-17T12:00:01.123456789Z';
const defaultRequestId = '123e4567-e89b-42d3-a456-426614174010';

function fixture(overrides: {
  eventType?: string;
  requestId?: string;
  eventId?: string;
  accountId?: string;
  metaTime?: string;
  timestamp?: number;
  deviceId?: string;
  dataSubType?: string | null;
  attributeSubType?: string;
} = {}) {
  const eventType = overrides.eventType ?? 'button_press';
  const deviceId = overrides.deviceId ?? 'device-test-1';
  const timestamp = overrides.timestamp ?? eventTimestamp;
  const subType = overrides.dataSubType ?? overrides.attributeSubType ?? 'human';
  const data = {
    id: overrides.eventId ?? `${deviceId}_${subType}_${timestamp}`,
    type: eventType,
    ...(eventType === 'motion_detected' && overrides.dataSubType !== null
      ? { subType: overrides.dataSubType ?? 'human' }
      : {}),
    ...(eventType === 'button_press' || eventType === 'motion_detected' ? {
      attributes: {
        source: deviceId,
        source_type: 'devices',
        timestamp,
        ...(overrides.attributeSubType === undefined ? {} : { sub_type: overrides.attributeSubType }),
      },
      relationships: { devices: { links: { self: `/v1/devices/${deviceId}` } } },
    } : {}),
  };
  return {
    meta: {
      version: '1.1',
      time: overrides.metaTime ?? sentAt,
      request_id: overrides.requestId ?? defaultRequestId,
      account_id: overrides.accountId ?? accountId,
    },
    data,
  };
}

function signedBody(body: unknown): Buffer {
  return Buffer.from(JSON.stringify(body));
}

function signature(raw: Buffer, key = 'simulator-test-key-not-ring'): string {
  return createRingSignature(raw, key);
}

function createServer() {
  db = makeTestDb();
  const config = makeTestConfig();
  return { app: createApp({ db, config }), config };
}

function linkTestAccount(config: ReturnType<typeof makeTestConfig>, id = accountId): void {
  const tokenStore = new RingTokenStore(db!, config.tokenEncryptionKey);
  const now = new Date().toISOString();
  tokenStore.saveUnclaimedPair({
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }, id);
  if (!tokenStore.claimUnclaimedPair(id)) throw new Error('Test Ring account claim failed.');
  db!.prepare('UPDATE ring_link_state SET linked_at = ?, updated_at = ? WHERE id = 1').run(now, now);
}

describe('Ring webhook receiver', () => {
  it('accepts a valid simulator signature, stores the device ID, and preserves Ring timestamps', async () => {
    const { app } = createServer();
    const raw = signedBody(fixture());
    const started = performance.now();
    const response = await request(app).post('/api/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', signature(raw))
      .send(raw.toString('utf8'));
    const elapsed = performance.now() - started;

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('accepted');
    expect(elapsed).toBeLessThan(5000);
    const event = db!.prepare(`SELECT provenance, ring_event_type, device_id, occurred_at, received_at, summary
      FROM source_events`).get() as {
      provenance: string; ring_event_type: string; device_id: string | null;
      occurred_at: string; received_at: string; summary: string;
    };
    expect(event).toMatchObject({
      provenance: 'ring_simulated',
      ring_event_type: 'button_press',
      device_id: 'device-test-1',
      occurred_at: '2026-10-17T12:00:00.000Z',
      received_at: sentAt,
    });
    expect(event.summary).toContain('Review the context');
    expect((db!.prepare('SELECT received_at FROM webhook_receipts').get() as { received_at: string }).received_at).toBe(sentAt);
  });

  it('accepts motion subtype from both supported locations', async () => {
    const { app } = createServer();
    const send = async (body: unknown) => {
      const raw = signedBody(body);
      return request(app).post('/api/ring/webhook').set('content-type', 'application/json')
        .set('x-signature', signature(raw)).send(raw.toString('utf8'));
    };
    const atData = await send(fixture({
      eventType: 'motion_detected', requestId: '123e4567-e89b-42d3-a456-426614174011',
      eventId: 'motion-data-subtype', dataSubType: 'human', attributeSubType: 'vehicle',
    }));
    const atAttributes = await send(fixture({
      eventType: 'motion_detected', requestId: '123e4567-e89b-42d3-a456-426614174012',
      eventId: 'motion-attribute-subtype', dataSubType: null, attributeSubType: 'vehicle',
    }));

    expect(atData.status).toBe(200);
    expect(atAttributes.status).toBe(200);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events WHERE ring_event_type = ?').get('motion_detected') as { count: number }).count).toBe(2);
  });

  it('rejects missing, incorrect, and tampered signatures with 401 before parsing', async () => {
    const { app } = createServer();
    const raw = signedBody(fixture());
    const missing = await request(app).post('/api/ring/webhook').set('content-type', 'application/json').send(raw.toString('utf8'));
    const wrong = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(raw, 'incorrect-key')).send(raw.toString('utf8'));
    const tampered = Buffer.from(raw.toString().replace('button_press', 'motion_detected'));
    const changed = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(raw)).send(tampered.toString('utf8'));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(changed.status).toBe(401);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);
  });

  it('deduplicates Ring delivery retries by request ID and repeated events by data.id', async () => {
    const { app } = createServer();
    const send = async (body: unknown) => {
      const raw = signedBody(body);
      return request(app).post('/api/ring/webhook').set('content-type', 'application/json')
        .set('x-signature', signature(raw)).send(raw.toString('utf8'));
    };
    const first = await send(fixture({ requestId: '123e4567-e89b-42d3-a456-426614174013', eventId: 'same-event' }));
    const duplicateRequest = await send(fixture({ requestId: '123e4567-e89b-42d3-a456-426614174013', eventId: 'different-event' }));
    const duplicateEvent = await send(fixture({ requestId: '123e4567-e89b-42d3-a456-426614174014', eventId: 'same-event' }));

    expect(first.body.status).toBe('accepted');
    expect(duplicateRequest.body.status).toBe('duplicate');
    expect(duplicateEvent.body.status).toBe('duplicate');
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(1);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM webhook_receipts').get() as { count: number }).count).toBe(2);
  });

  it('acknowledges lifecycle, sensor, and unknown event types with 200 without creating inbox events', async () => {
    const { app } = createServer();
    const send = async (body: unknown) => {
      const raw = signedBody(body);
      return request(app).post('/api/ring/webhook').set('content-type', 'application/json')
        .set('x-signature', signature(raw)).send(raw.toString('utf8'));
    };
    const lifecycle = await send(fixture({ eventType: 'device_offline', requestId: '123e4567-e89b-42d3-a456-426614174015' }));
    const subscription = await send(fixture({ eventType: 'subscription_activated', requestId: '123e4567-e89b-42d3-a456-426614174016' }));
    const sensor = await send({
      meta: {
        version: '1.1', time: sentAt,
        request_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-1773152538431-contact_senso',
        account_id: accountId,
      },
      data: {
        id: 'device-test-1_contact_sensor_faulted_1773152538431',
        type: 'contact_sensor_faulted',
        attributes: { source: 'device-test-1', source_type: 'devices', timestamp: 1773152538431 },
        relationships: { devices: { links: { self: '/v1/devices/device-test-1' } } },
      },
    });
    const unknown = await send(fixture({ eventType: 'vendor_specific_unhandled_event', requestId: '123e4567-e89b-42d3-a456-426614174017' }));

    expect(lifecycle.status).toBe(200);
    expect(subscription.status).toBe(200);
    expect(sensor.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect([lifecycle.body.status, subscription.body.status, sensor.body.status, unknown.body.status])
      .toEqual(['ignored', 'ignored', 'ignored', 'ignored']);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);
    expect((db!.prepare('SELECT COUNT(*) AS count FROM webhook_receipts WHERE request_id = ?')
      .get('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-1773152538431-contact_senso') as { count: number }).count).toBe(1);
  });

  it('returns 400 for malformed JSON and a signed payload missing required event fields', async () => {
    const { app } = createServer();
    const incompleteRaw = signedBody({
      meta: {
        version: '1.1', time: sentAt, request_id: '123e4567-e89b-42d3-a456-426614174018', account_id: accountId,
      },
      data: { id: 'missing-timestamp', type: 'button_press', attributes: { source: 'device-test-1', source_type: 'devices' } },
    });
    const incomplete = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(incompleteRaw)).send(incompleteRaw.toString('utf8'));
    const jsonRaw = Buffer.from('{not json');
    const malformedJson = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(jsonRaw)).send(jsonRaw.toString('utf8'));

    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe('invalid_ring_payload');
    expect(malformedJson.status).toBe(400);
    expect(malformedJson.body.error.code).toBe('malformed_json');
  });

  it('returns 500 when receipt persistence fails so Ring can retry transiently', async () => {
    const { app } = createServer();
    db!.exec(`CREATE TRIGGER fail_webhook_receipt BEFORE INSERT ON webhook_receipts
      BEGIN SELECT RAISE(ABORT, 'simulated transient database failure'); END`);
    const raw = signedBody(fixture());
    const response = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(raw)).send(raw.toString('utf8'));

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('internal_error');
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);
  });

  it('matches meta.account_id to the claimed linked Ring account before storing live events', async () => {
    const { app, config } = createServer();
    const raw = signedBody(fixture({ requestId: '123e4567-e89b-42d3-a456-426614174019', eventId: 'ring-event' }));
    const unlinked = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(raw, config.ringHmacSigningKey!)).send(raw.toString('utf8'));
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.status).toBe('ignored');
    expect((db!.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);

    linkTestAccount(config);
    const linkedRaw = signedBody(fixture({ requestId: '123e4567-e89b-42d3-a456-426614174020', eventId: 'ring-event' }));
    const linked = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(linkedRaw, config.ringHmacSigningKey!)).send(linkedRaw.toString('utf8'));

    expect(linked.status).toBe(200);
    expect(linked.body.status).toBe('accepted');
    expect(db!.prepare('SELECT provenance, device_id FROM source_events').get() as { provenance: string; device_id: string })
      .toMatchObject({ provenance: 'ring_live', device_id: 'device-test-1' });
    expect(db!.prepare('SELECT last_signed_event_source FROM ring_link_state').get() as { last_signed_event_source: string })
      .toMatchObject({ last_signed_event_source: 'ring_live' });
  });

  it('rejects a Ring-key webhook instead of labeling it as Playground provenance', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringEventSource: 'ring_playground' });
    const app = createApp({ db, config });
    linkTestAccount(config);
    const raw = signedBody(fixture({ requestId: '123e4567-e89b-42d3-a456-426614174021', eventId: 'mislabel-test-event' }));
    const response = await request(app).post('/api/ring/webhook').set('content-type', 'application/json')
      .set('x-signature', signature(raw, config.ringHmacSigningKey!)).send(raw.toString('utf8'));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('signature_invalid');
    expect((db.prepare('SELECT COUNT(*) AS count FROM source_events').get() as { count: number }).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS count FROM webhook_receipts').get() as { count: number }).count).toBe(0);
    expect((db.prepare('SELECT last_signed_event_at FROM ring_link_state').get() as { last_signed_event_at: string | null }).last_signed_event_at).toBeNull();
  });
});
