import { describe, expect, it } from 'vitest';
import { redactProbeReport, summarizePlaygroundResponse } from './playground-probe-report.js';

describe('redacted Ring Playground probe report', () => {
  it('reports structure, array counts, allow-listed event vocabulary, and timestamp formats without raw response values', () => {
    const fixture = {
      data: [{
        id: 'private-device-identifier-987654321',
        type: 'devices',
        attributes: {
          name: 'Private Doorbell Name',
          email: 'owner@example.test',
          event_type: 'motion.human',
          sub_type: 'vehicle',
          classification: 'delivery',
          start_time: '2026-10-18T12:34:56.000Z',
          opaque_time: 1781788496,
          access_token: 'secret-bearer-token',
        },
        links: { self: 'https://api.amazonvision.com/private/device/123456' },
      }],
      links: { next: '?page=opaque-secret' },
    };

    const summary = summarizePlaygroundResponse(fixture, 'event_history');
    const serialized = JSON.stringify(summary);
    expect(summary.jsonType).toBe('object');
    expect(summary.arrayLengths).toContainEqual({ path: 'event_history.data', length: 1 });
    expect(summary.eventTypeStrings).toEqual([{ path: 'event_history.data[0].attributes.event_type', value: 'motion.human' }]);
    expect(summary.subtypeFields).toEqual([{ path: 'event_history.data[0].attributes.sub_type', type: 'string' }]);
    expect(summary.classificationFields).toEqual([{ path: 'event_history.data[0].attributes.classification', type: 'string' }]);
    expect(summary.timestampFormats).toContainEqual({ path: 'event_history.data[0].attributes.start_time', format: 'ISO-8601-like string' });
    expect(summary.timestampFormats).toContainEqual({ path: 'event_history.data[0].attributes.opaque_time', format: 'number (unit not inferred)' });
    for (const privateValue of [
      'private-device-identifier-987654321', 'Private Doorbell Name', 'owner@example.test', 'secret-bearer-token',
      'https://api.amazonvision.com', 'opaque-secret', 'vehicle', 'delivery',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).toContain('<redacted>');
  });

  it('preserves only an allow-listed event-type candidate with its path', () => {
    const summary = summarizePlaygroundResponse({ data: [{ attributes: { type: 'ding' } }] }, 'event_history');
    expect(summary.eventTypeStrings).toEqual([{ path: 'event_history.data[0].attributes.type', value: 'ding' }]);
  });

  it('omits unknown event, subtype, and classification values and redacts identifier-like object keys', () => {
    const dynamicIds = ['private-device-key-987654321', 'device-id-example', 'qwertyuiopas', 'Sarah', 'john_doe', 'abc'];
    const data = Object.fromEntries(dynamicIds.map((id) => [id, { event_type: 'motion.package_delivery', sub_type: id, classification: id }]));
    const summary = summarizePlaygroundResponse({ data, event_type: 'privateidentifierword' }, 'devices');
    const serialized = JSON.stringify(summary);
    for (const dynamicId of dynamicIds) expect(serialized).not.toContain(dynamicId);
    expect(serialized).not.toContain('privateidentifierword');
    expect(serialized).not.toContain('motion.package_delivery');
    expect(serialized).toContain('<redacted-key>');
    expect(summary.eventTypeStrings).toEqual([]);
    expect(summary.subtypeFields).toEqual([{ path: 'devices.data.<redacted-key>.sub_type', type: 'string' }]);
    expect(summary.classificationFields).toEqual([{ path: 'devices.data.<redacted-key>.classification', type: 'string' }]);
  });

  it('limits recursive shape traversal and rejects accidental token, email, or URL inclusion', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 20; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    const summary = summarizePlaygroundResponse(deep, 'devices');
    expect(summary.truncated).toBe(true);
    expect(() => redactProbeReport({ report: 'Bearer accidental-token' })).toThrow('redaction safety check');
    expect(() => redactProbeReport({ report: 'person@example.test' })).toThrow('redaction safety check');
    expect(() => redactProbeReport({ report: 'https://api.example.test' })).toThrow('redaction safety check');
    expect(redactProbeReport({ shape: summary })).toEqual({ shape: summary });
  });
});
