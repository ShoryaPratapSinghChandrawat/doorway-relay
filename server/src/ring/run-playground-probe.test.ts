import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPlaygroundProbe } from './run-playground-probe.js';

const token = 'mock-playground-token-never-saved';
let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
  vi.restoreAllMocks();
});

async function makeOutputDirectory(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'doorway-relay-probe-test-'));
  return join(root, 'reports');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/vnd.api+json' } });
}

function options(outputDirectory: string, fetcher: typeof fetch, extra: Partial<Parameters<typeof runPlaygroundProbe>[0]> = {}) {
  return {
    accessToken: token,
    apiBaseUrl: 'https://api.amazonvision.com',
    outputDirectory,
    clientOptions: { fetcher, minRequestIntervalMs: 0, maxRetries: 0 },
    now: () => new Date('2026-10-21T12:00:00.000Z'),
    ...extra,
  };
}

describe('devices-first Playground probe', () => {
  it('runs devices only without a History ID, saves a redacted report, and prints next steps', async () => {
    const outputDirectory = await makeOutputDirectory();
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
      expect(new URL(String(input)).pathname).toBe('/v1/devices');
      return jsonResponse({ data: [{ id: 'opaque-device-id-secret', type: 'devices', name: 'private-labeled-door' }] });
    });
    const lines: string[] = [];
    const result = await runPlaygroundProbe(options(outputDirectory, fetcher, { writeOutput: (line) => lines.push(line) }));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.report.historyDeviceSelection).toMatchObject({ configuredInServerEnvironment: false, identifierValue: '<not configured>' });
    expect((result.report.calls as Array<{ operation: string }>).map((call) => call.operation)).toEqual(['list_devices']);
    expect(lines.join('\n')).toContain('select a device in the Ring Developer Playground explorer or the app');
    expect(lines.join('\n')).toContain('devices only; no History request was made');
    expect(lines.join('\n')).not.toContain('opaque-device-id-secret');

    const reportText = await readFile(join(outputDirectory, result.reportPath.split('/').at(-1)!), 'utf8');
    expect(reportText).not.toContain('opaque-device-id-secret');
    expect(reportText).not.toContain('private-labeled-door');
    expect(reportText).not.toContain(token);
    expect(reportText).not.toContain('event_history');
    const savedNames = await readdir(outputDirectory);
    expect(savedNames).toContain('README.md');
    for (const name of savedNames) {
      const contents = await readFile(join(outputDirectory, name), 'utf8');
      expect(contents).not.toContain('opaque-device-id-secret');
    }
  });

  it('prints optional IDs to terminal output only and never stores them in any report file', async () => {
    const outputDirectory = await makeOutputDirectory();
    const deviceIds = ['terminal-only-device-a', 'terminal-only-device-b'];
    const fetcher = vi.fn(async () => jsonResponse({ data: deviceIds.map((id) => ({ id, type: 'devices' })) }));
    const lines: string[] = [];
    const result = await runPlaygroundProbe(options(outputDirectory, fetcher, {
      printDeviceIds: true,
      writeOutput: (line) => lines.push(line),
    }));

    const terminal = lines.join('\n');
    expect(terminal).toContain('local terminal only, do not paste');
    for (const id of deviceIds) expect(terminal).toContain(id);
    const reportText = JSON.stringify(result.report);
    expect(reportText).not.toContain('local terminal only');
    expect(reportText).not.toContain(token);
    const savedNames = await readdir(outputDirectory);
    for (const name of savedNames) {
      const contents = await readFile(join(outputDirectory, name), 'utf8');
      for (const id of deviceIds) expect(contents).not.toContain(id);
    }
  });

  it('does not guess IDs or call History when the device response shape is unrecognized', async () => {
    const outputDirectory = await makeOutputDirectory();
    const fetcher = vi.fn(async () => jsonResponse({ devices: [{ id: 'not-a-known-shape' }] }));
    const lines: string[] = [];
    const result = await runPlaygroundProbe(options(outputDirectory, fetcher, {
      printDeviceIds: true,
      writeOutput: (line) => lines.push(line),
    }));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.report.calls).toHaveLength(1);
    expect(lines.join('\n')).toContain('No IDs printed because the device-list response shape was unrecognized.');
    expect(lines.join('\n')).not.toContain('not-a-known-shape');
  });

  it('requests History only when an operator supplies a device ID', async () => {
    const outputDirectory = await makeOutputDirectory();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/devices') return jsonResponse({ data: [{ id: 'operator-device' }] });
      if (url.pathname === '/v1/history/devices/operator-device/events') return jsonResponse({ data: [{ type: 'events', attributes: { event_type: 'ding' } }] });
      throw new Error('unexpected mocked path');
    });
    const result = await runPlaygroundProbe(options(outputDirectory, fetcher, { historyDeviceId: 'operator-device' }));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((result.report.calls as Array<{ operation: string }>).map((call) => call.operation)).toEqual(['list_devices', 'event_history']);
    expect(result.report.historyPagination).toMatchObject({ pageCount: 1, truncated: false });
    expect(JSON.stringify(result.report)).not.toContain('operator-device');
  });
});
