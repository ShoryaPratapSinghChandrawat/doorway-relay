import { describe, expect, it } from 'vitest';
import { extractPlaygroundDevices, PlaygroundDeviceSelection } from './playground-devices.js';

describe('Playground device discovery and selection', () => {
  it('extracts only opaque string IDs and short plain-string types from a recognized data array', () => {
    const result = extractPlaygroundDevices({
      data: [
        { id: 'device-opaque-1', type: 'devices', name: 'Private room label', attributes: { serial: 'private-value' } },
        { id: 'device-opaque-2', type: 'doorbell' },
      ],
      links: { next: 'https://private.example/' },
    });

    expect(result).toEqual({
      devices: [{ id: 'device-opaque-1', type: 'devices' }, { id: 'device-opaque-2', type: 'doorbell' }],
      shapeUnrecognized: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/Private room label|private-value|private\.example/);
  });

  it('recognizes an empty data array and caps unique devices at 50', () => {
    expect(extractPlaygroundDevices({ data: [] })).toEqual({ devices: [], shapeUnrecognized: false });
    const devices = Array.from({ length: 51 }, (_, index) => ({ id: `opaque-${index}`, type: 'device' }));
    const result = extractPlaygroundDevices({ data: [...devices, devices[0]] });
    expect(result.shapeUnrecognized).toBe(false);
    expect(result.devices).toHaveLength(50);
    expect(result.devices[0]).toEqual({ id: 'opaque-0', type: 'device' });
    expect(result.devices.at(-1)?.id).toBe('opaque-49');
  });

  it('omits overlong type strings and rejects unrecognized or malformed ID shapes without guessing', () => {
    expect(extractPlaygroundDevices({ devices: [{ id: 'not-in-data' }] })).toEqual({ devices: [], shapeUnrecognized: true });
    expect(extractPlaygroundDevices({ data: 'not-an-array' })).toEqual({ devices: [], shapeUnrecognized: true });
    expect(extractPlaygroundDevices({ data: [{ id: 123 }] })).toEqual({ devices: [], shapeUnrecognized: true });
    expect(extractPlaygroundDevices({ data: [{ id: 'ok' }, { type: 'device' }] })).toEqual({ devices: [], shapeUnrecognized: true });
    expect(extractPlaygroundDevices({ data: [{ id: 'ok', type: 't'.repeat(81) }] })).toEqual({
      devices: [{ id: 'ok' }], shapeUnrecognized: false,
    });
    expect(extractPlaygroundDevices({ data: [{ id: 'bad\u0000id' }] })).toEqual({ devices: [], shapeUnrecognized: true });
  });

  it('allows selection only from the most recently listed IDs', () => {
    const selection = new PlaygroundDeviceSelection();
    selection.synchronizeIdentity('server-token-a', 'ring_playground');
    expect(selection.select('device-a')).toBe(false);

    const listed = selection.record({ data: [{ id: 'device-a' }, { id: 'device-b', type: 'devices' }] });
    expect(listed.devices).toHaveLength(2);
    expect(selection.select('device-a')).toBe(true);
    expect(selection.read().selectedDeviceId).toBe('device-a');
    expect(selection.select('not-listed')).toBe(false);

    const refreshed = selection.record({ data: [{ id: 'device-b' }] });
    expect(refreshed.selectedDeviceId).toBeNull();
    expect(selection.select('device-a')).toBe(false);
  });

  it('clears cached IDs and selection when the token or event source changes', () => {
    const selection = new PlaygroundDeviceSelection();
    expect(selection.synchronizeIdentity('server-token-a', 'ring_playground')).toBe(true);
    selection.record({ data: [{ id: 'device-a' }] });
    expect(selection.select('device-a')).toBe(true);
    expect(selection.synchronizeIdentity('server-token-a', 'ring_playground')).toBe(false);
    expect(selection.read().selectedDeviceId).toBe('device-a');

    expect(selection.synchronizeIdentity('server-token-b', 'ring_playground')).toBe(true);
    expect(selection.read()).toEqual({ devices: [], shapeUnrecognized: true, selectedDeviceId: null });
    selection.record({ data: [{ id: 'device-b' }] });
    selection.select('device-b');
    expect(selection.synchronizeIdentity('server-token-b', 'ring_live')).toBe(true);
    expect(selection.read()).toEqual({ devices: [], shapeUnrecognized: true, selectedDeviceId: null });
    expect(JSON.stringify(selection.read())).not.toContain('server-token');
  });
});
