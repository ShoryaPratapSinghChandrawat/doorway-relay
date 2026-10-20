const MAX_NODES = 1500;
const MAX_DEPTH = 10;
const MAX_KEYS_PER_OBJECT = 200;
const MAX_ARRAY_EXAMPLES = 2;

const SAFE_EVENT_TYPES = new Set([
  'button_press', 'ding', 'motion', 'motion.detected', 'motion.human', 'motion.vehicle', 'motion_detected', 'on_demand',
]);

const SAFE_FIELD_KEYS = new Set([
  'account', 'account_id', 'access_token', 'attributes', 'capabilities', 'category', 'classification', 'code',
  'count', 'created_at', 'createdat', 'data', 'date', 'device', 'device_id', 'devices', 'email', 'end', 'end_time',
  'endtime', 'error', 'event', 'event_id', 'event_type', 'event_types', 'events', 'expires_in', 'href', 'history',
  'id', 'included', 'key', 'kind', 'links', 'media', 'message', 'meta', 'name', 'next', 'notifications', 'occurred_at',
  'occurredat', 'page', 'page_key', 'pagination', 'received_at', 'receivedat', 'refresh_token', 'relationships',
  'request_id', 'serial_number', 'self', 'source', 'source_id', 'source_type', 'start', 'start_time', 'starttime',
  'state', 'status', 'sub_type', 'subtype', 'time', 'timestamp', 'token', 'type', 'unit', 'updated_at', 'updatedat',
  'url', 'uri', 'version',
]);
const SAFE_CAMEL_FIELD_KEYS = new Set([
  'accountId', 'createdAt', 'deviceId', 'eventId', 'eventType', 'endTime', 'nextPage', 'pageKey', 'receivedAt',
  'requestId', 'sourceType', 'startTime', 'subType', 'updatedAt', 'occurredAt',
]);
const SAFE_FIELD_KEY_PARTS = new Set([
  'access', 'account', 'at', 'attribute', 'attributes', 'capability', 'capabilities', 'classification', 'created',
  'date', 'device', 'devices', 'email', 'end', 'event', 'events', 'expires', 'history', 'id', 'in', 'key', 'link',
  'links', 'media', 'meta', 'name', 'next', 'notification', 'notifications', 'occurred', 'page', 'pagination',
  'opaque', 'received', 'refresh', 'relationship', 'relationships', 'request', 'serial', 'source', 'start', 'state', 'status',
  'sub', 'time', 'timestamp', 'token', 'type', 'unit', 'updated', 'url', 'uri', 'version',
]);

export interface PlaygroundResponseShape {
  jsonType: 'object' | 'array';
  exampleShape: unknown;
  arrayLengths: Array<{ path: string; length: number }>;
  eventTypeStrings: Array<{ path: string; value: string }>;
  subtypeFields: Array<{ path: string; type: string }>;
  classificationFields: Array<{ path: string; type: string }>;
  timestampFormats: Array<{ path: string; format: string }>;
  truncated: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (record(value)) return 'object';
  return typeof value;
}

function timestampFormat(value: unknown): string {
  if (typeof value === 'number') return 'number (unit not inferred)';
  if (typeof value !== 'string') return typeof value;
  if (/^\d+$/.test(value)) return 'numeric string (unit not inferred)';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value))) {
    return 'ISO-8601-like string';
  }
  return 'string (format not inferred)';
}

function sensitiveKey(key: string): boolean {
  return /(?:^id$|(?:^|[_-])id$|token|secret|email|url|uri|address|name|account|serial|device|nonce|auth|credential|key)/i.test(key);
}

function safeFieldKey(key: string): string {
  const lower = key.toLowerCase();
  if (key.length > 80 || /[^a-z_]/i.test(key) || /\d/.test(key)) return '<redacted-key>';
  if (SAFE_FIELD_KEYS.has(lower) || SAFE_CAMEL_FIELD_KEYS.has(key)) return key;
  const parts = lower.split('_');
  if (parts.length > 1 && parts.every((part) => SAFE_FIELD_KEY_PARTS.has(part))) return key;
  return '<redacted-key>';
}

export function summarizePlaygroundResponse(payload: unknown, operation: 'devices' | 'event_history'): PlaygroundResponseShape {
  const arrayLengths: Array<{ path: string; length: number }> = [];
  const eventTypes = new Map<string, string>();
  const subtypeFields = new Map<string, string>();
  const classificationFields = new Map<string, string>();
  const timestampFormats = new Map<string, string>();
  let visited = 0;
  let truncated = false;

  function shape(value: unknown, path: string, depth: number): unknown {
    visited += 1;
    if (visited > MAX_NODES || depth > MAX_DEPTH) {
      truncated = true;
      return { type: 'truncated' };
    }
    if (value === null) return { type: 'null' };
    if (Array.isArray(value)) {
      arrayLengths.push({ path, length: value.length });
      return {
        type: 'array',
        length: value.length,
        examples: value.slice(0, MAX_ARRAY_EXAMPLES).map((item, index) => shape(item, `${path}[${index}]`, depth + 1)),
      };
    }
    const object = record(value);
    if (object) {
      const fields: Record<string, unknown> = {};
      const keys = Object.keys(object).sort();
      const visibleKeys = keys.slice(0, MAX_KEYS_PER_OBJECT);
      for (const key of visibleKeys) {
        if (visited > MAX_NODES) break;
        const child = object[key];
        const fieldKey = safeFieldKey(key);
        const childPath = path ? `${path}.${fieldKey}` : fieldKey;
        if (typeof child === 'string') {
          const eventTypeField = /event[_-]?type|eventType/i.test(key)
            || (operation === 'event_history' && key.toLowerCase() === 'type' && path.split('.').includes('attributes'));
          const safeEventType = child.toLowerCase();
          if (eventTypeField && !sensitiveKey(key) && SAFE_EVENT_TYPES.has(safeEventType)) {
            eventTypes.set(childPath, safeEventType);
          }
        }
        if (/sub[_-]?type|subType/i.test(key) && !sensitiveKey(key)) subtypeFields.set(childPath, valueType(child));
        if (/classification|classifier/i.test(key) && !sensitiveKey(key)) classificationFields.set(childPath, valueType(child));
        if (/(?:time|date|start|occurred|created|timestamp)/i.test(key)) {
          timestampFormats.set(childPath, timestampFormat(child));
        }
        if (sensitiveKey(key) && (typeof child === 'string' || typeof child === 'number')) {
          fields[fieldKey] = { type: typeof child, example: '<redacted>' };
        } else {
          fields[fieldKey] = shape(child, childPath, depth + 1);
        }
      }
      if (visibleKeys.length < keys.length || visited > MAX_NODES) {
        truncated = true;
        fields['<omitted-fields>'] = { type: 'truncated', count: Math.max(keys.length - visibleKeys.length, 0) };
      }
      return { type: 'object', fields };
    }
    if (typeof value === 'string') return { type: 'string', example: '<redacted:string>' };
    if (typeof value === 'number') return { type: 'number' };
    if (typeof value === 'boolean') return { type: 'boolean' };
    return { type: 'unknown' };
  }

  const rootShape = shape(payload, operation, 0);
  const rootType = Array.isArray(payload) ? 'array' : 'object';
  return {
    jsonType: rootType,
    exampleShape: rootShape,
    arrayLengths,
    eventTypeStrings: [...eventTypes.entries()].map(([path, value]) => ({ path, value })).sort((left, right) => left.path.localeCompare(right.path)),
    subtypeFields: [...subtypeFields.entries()].map(([path, type]) => ({ path, type })).sort((left, right) => left.path.localeCompare(right.path)),
    classificationFields: [...classificationFields.entries()].map(([path, type]) => ({ path, type })).sort((left, right) => left.path.localeCompare(right.path)),
    timestampFormats: [...timestampFormats.entries()].map(([path, format]) => ({ path, format })),
    truncated,
  };
}

export function redactProbeReport(report: unknown): unknown {
  // Reports are generated from shape metadata rather than response values; this final guard
  // rejects accidentally added bearer tokens, email addresses, or URLs before serialization.
  const serialized = JSON.stringify(report);
  if (/(?:Bearer\s+\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/\S+)/i.test(serialized)) {
    throw new Error('Probe report failed the redaction safety check.');
  }
  return report;
}
