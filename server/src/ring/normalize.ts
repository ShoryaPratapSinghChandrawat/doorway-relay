import type { RingWebhookPayload } from './webhook-schema.js';
import type { RingEventType } from '../domain/types.js';

export interface NormalizedDoorEvent {
  eventType: RingEventType;
  externalEventId: string;
  requestId: string;
  deviceId: string;
  subType: string | null;
  occurredAt: string;
  summary: string;
}

export function normalizeDoorEvent(payload: RingWebhookPayload): NormalizedDoorEvent | null {
  if (payload.data.type !== 'button_press' && payload.data.type !== 'motion_detected') return null;
  const attributes = payload.data.attributes;
  if (!attributes) throw new Error('Validated Ring door event is missing attributes.');

  const deviceId = attributes.source;
  const timestamp = attributes.timestamp;
  const dataSubType = payload.data.subType;
  const attributeSubType = attributes.sub_type;
  if (typeof deviceId !== 'string' || typeof timestamp !== 'number') {
    throw new Error('Validated Ring door event has invalid source or timestamp fields.');
  }
  // Current Ring docs specify attributes.sub_type; data.subType is retained only for compatibility
  // with the earlier supplied v1.1 example. Do not discard an otherwise valid event if the subtype is absent.
  const subType = typeof attributeSubType === 'string'
    ? attributeSubType
    : typeof dataSubType === 'string' ? dataSubType : null;

  const eventType = payload.data.type as RingEventType;
  return {
    eventType,
    externalEventId: payload.data.id,
    requestId: payload.meta.request_id,
    deviceId,
    subType,
    occurredAt: new Date(timestamp).toISOString(),
    summary: eventType === 'button_press'
      ? 'A doorbell button was pressed. Review the context before creating a handoff.'
      : 'Motion was detected. Review the context before creating a handoff.',
  };
}

export function readWebhookAccountId(payload: RingWebhookPayload): string {
  return payload.meta.account_id;
}
