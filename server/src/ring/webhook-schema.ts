import { z } from 'zod';

const ringAccountIdShape = /^ava1\.ring\.account\.\S+$/;
const utcNanosecondTimeShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const deviceSelfLinkShape = /^\/v1\/devices\/[^/?#]+$/;
const supportedDoorEvents = new Set(['button_press', 'motion_detected']);

function isValidUtcNanosecondTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= (daysInMonth ?? 0)
    && hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(Date.parse(value));
}

const metaSchema = z.object({
  version: z.literal('1.1'),
  time: z.string().regex(utcNanosecondTimeShape).refine(isValidUtcNanosecondTime, 'Expected a valid ISO-8601 UTC timestamp.'),
  // Ring's v1.1 sensor example uses an opaque request ID with a suffix, not a UUID.
  request_id: z.string().min(1).max(300).refine((value) => value.trim().length > 0 && value === value.trim(), 'Expected a non-empty opaque request ID.'),
  account_id: z.string().max(300).regex(ringAccountIdShape),
}).passthrough();

const dataSchema = z.object({
  id: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(120),
  // Kept as a compatibility fallback for the earlier supplied v1.1 example; current Ring docs specify attributes.sub_type.
  subType: z.unknown().optional(),
  attributes: z.object({}).passthrough().optional(),
  relationships: z.object({}).passthrough().optional(),
}).passthrough();

const envelopeSchema = z.object({
  meta: metaSchema,
  data: dataSchema,
}).passthrough();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readDeviceSelfLink(relationships: unknown): unknown {
  if (!isRecord(relationships)) return undefined;
  const deviceRelationship = relationships.devices ?? relationships.device;
  if (!isRecord(deviceRelationship) || !isRecord(deviceRelationship.links)) return undefined;
  return deviceRelationship.links.self;
}

/**
 * Ring v1.1 webhook envelope. Current Ring Motion Detection documentation puts the canonical subtype
 * at data.attributes.sub_type; the earlier supplied example also used data.subType, which is retained
 * only as a fallback. A missing subtype stays neutral rather than causing a valid motion event to be
 * discarded. Unknown event types remain schema-valid so they can be acknowledged and ignored.
 */
export const ringWebhookSchema = envelopeSchema.superRefine((payload, context) => {
  if (!supportedDoorEvents.has(payload.data.type)) return;

  const attributes = payload.data.attributes;
  if (!attributes) {
    context.addIssue({ code: 'custom', path: ['data', 'attributes'], message: 'Door events require attributes.' });
    return;
  }

  if (typeof attributes.source !== 'string' || attributes.source.trim().length === 0) {
    context.addIssue({ code: 'custom', path: ['data', 'attributes', 'source'], message: 'Door events require a device source ID.' });
  }
  if (attributes.source_type !== 'devices') {
    context.addIssue({ code: 'custom', path: ['data', 'attributes', 'source_type'], message: 'Door event source_type must be devices.' });
  }
  const timestamp = attributes.timestamp;
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8_640_000_000_000_000) {
    context.addIssue({ code: 'custom', path: ['data', 'attributes', 'timestamp'], message: 'Door events require an epoch-millisecond timestamp.' });
  }

  const relationshipSelf = readDeviceSelfLink(payload.data.relationships);
  if (typeof relationshipSelf !== 'string' || !deviceSelfLinkShape.test(relationshipSelf)) {
    context.addIssue({ code: 'custom', path: ['data', 'relationships', 'devices', 'links', 'self'], message: 'Door events require the device self link.' });
  }

  const dataSubType = payload.data.subType;
  const attributeSubType = attributes.sub_type;
  if (dataSubType !== undefined && (typeof dataSubType !== 'string' || dataSubType.trim().length === 0)) {
    context.addIssue({ code: 'custom', path: ['data', 'subType'], message: 'data.subType must be a non-empty string when present.' });
  }
  if (attributeSubType !== undefined && (typeof attributeSubType !== 'string' || attributeSubType.trim().length === 0)) {
    context.addIssue({ code: 'custom', path: ['data', 'attributes', 'sub_type'], message: 'attributes.sub_type must be a non-empty string when present.' });
  }
});

export type RingWebhookPayload = z.infer<typeof ringWebhookSchema>;
