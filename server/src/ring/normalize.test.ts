import { describe, expect, it } from 'vitest';
import { ringWebhookSchema } from './webhook-schema.js';
import { normalizeDoorEvent } from './normalize.js';

const occurredAtMs = Date.parse('2026-10-17T12:00:00Z');

function payload(options: {
  type?: string;
  requestId?: string;
  eventId?: string;
  dataSubType?: string;
  attributeSubType?: string;
} = {}) {
  return {
    meta: {
      version: '1.1',
      time: '2026-10-17T12:00:01.123456789Z',
      request_id: options.requestId ?? '123e4567-e89b-42d3-a456-426614174002',
      account_id: 'ava1.ring.account.test-account-1',
    },
    data: {
      id: options.eventId ?? 'device-test-1_event_1792238400000',
      type: options.type ?? 'button_press',
      ...(options.dataSubType === undefined ? {} : { subType: options.dataSubType }),
      attributes: {
        source: 'device-test-1',
        source_type: 'devices',
        timestamp: occurredAtMs,
        ...(options.attributeSubType === undefined ? {} : { sub_type: options.attributeSubType }),
      },
      relationships: { devices: { links: { self: '/v1/devices/device-test-1' } } },
    },
  };
}

describe('Ring notification normalization', () => {
  it('maps button presses to neutral door-event inbox summaries and uses epoch milliseconds', () => {
    const parsed = ringWebhookSchema.parse(payload({ type: 'button_press' }));
    expect(normalizeDoorEvent(parsed)).toMatchObject({
      eventType: 'button_press',
      externalEventId: 'device-test-1_event_1792238400000',
      requestId: '123e4567-e89b-42d3-a456-426614174002',
      deviceId: 'device-test-1',
      occurredAt: '2026-10-17T12:00:00.000Z',
    });
    expect(normalizeDoorEvent(parsed)?.summary).toContain('Review the context');
  });

  it('uses the currently documented attributes.sub_type before the legacy data.subType fallback', () => {
    const parsed = ringWebhookSchema.parse(payload({
      type: 'motion_detected',
      dataSubType: 'human',
      attributeSubType: 'vehicle',
    }));
    expect(normalizeDoorEvent(parsed)).toMatchObject({ eventType: 'motion_detected', deviceId: 'device-test-1', subType: 'vehicle' });
    expect(normalizeDoorEvent(parsed)?.summary).not.toContain('vehicle');
  });

  it('accepts the legacy data.subType fallback when the documented attribute is absent', () => {
    const parsed = ringWebhookSchema.parse(payload({ type: 'motion_detected', dataSubType: 'human' }));
    expect(normalizeDoorEvent(parsed)).toMatchObject({ eventType: 'motion_detected', deviceId: 'device-test-1', subType: 'human' });
  });

  it('keeps a motion event neutral when no subtype is present', () => {
    const parsed = ringWebhookSchema.parse(payload({ type: 'motion_detected' }));
    expect(normalizeDoorEvent(parsed)).toMatchObject({ eventType: 'motion_detected', subType: null });
    expect(normalizeDoorEvent(parsed)?.summary).toBe('Motion was detected. Review the context before creating a handoff.');
  });

  it('safely ignores unsupported lifecycle event types without requiring door-event attributes', () => {
    const parsed = ringWebhookSchema.parse({
      meta: {
        version: '1.1',
        time: '2026-10-17T12:00:01Z',
        request_id: '123e4567-e89b-42d3-a456-426614174003',
        account_id: 'ava1.ring.account.test-account-1',
      },
      data: { id: 'device-test-1_device_offline_1792238400000', type: 'device_offline' },
    });
    expect(normalizeDoorEvent(parsed)).toBeNull();
  });
});
