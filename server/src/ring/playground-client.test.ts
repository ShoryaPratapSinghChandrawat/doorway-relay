import { describe, expect, it, vi } from 'vitest';
import { RingPlaygroundClient } from './playground-client.js';

const baseUrl = 'https://api.amazonvision.com';
const token = 'test-playground-token-do-not-log';

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/vnd.api+json', ...headers },
  });
}

function makeClient(fetcher: typeof fetch, options: { sleep?: (milliseconds: number) => Promise<void>; maxRetries?: number; timeoutMs?: number } = {}) {
  return new RingPlaygroundClient(baseUrl, token, {
    fetcher,
    minRequestIntervalMs: 0,
    ...options,
  });
}

describe('Ring Developer Playground API client', () => {
  it('sends only server-side bearer credentials to the configured official API host', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({ data: [] }));
    const client = makeClient(fetcher);
    await client.getDevices();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.origin).toBe(baseUrl);
    expect(url.pathname).toBe('/v1/devices');
    expect(url.search).toBe('');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(init?.redirect).toBe('error');
  });

  it('follows only same-endpoint JSON:API next links and returns ordered history pages', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ type: 'events', attributes: { event_type: 'ding' } }], links: { next: '?page%5Bafter%5D=opaque-cursor' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ type: 'events', attributes: { event_type: 'motion.human' } }], links: { next: null } }));
    const client = makeClient(fetcher);

    const result = await client.getEventHistoryPages('device-private-id', 5);
    expect(result).toMatchObject({ truncated: false });
    expect(result.pages).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetcher.mock.calls[0]![0]));
    const secondUrl = new URL(String(fetcher.mock.calls[1]![0]));
    expect(firstUrl.pathname).toBe('/v1/history/devices/device-private-id/events');
    expect(secondUrl.pathname).toBe(firstUrl.pathname);
    expect(secondUrl.searchParams.get('page[after]')).toBe('opaque-cursor');
  });

  it('encodes operator-supplied IDs as one path segment and rejects unsafe dot-segment IDs', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({ data: [] }));
    const client = makeClient(fetcher);
    await client.getEventHistoryPage('device/with?reserved#characters');
    expect(new URL(String(fetcher.mock.calls[0]![0])).pathname)
      .toBe('/v1/history/devices/device%2Fwith%3Freserved%23characters/events');
    await expect(client.getEventHistoryPage('..')).rejects.toMatchObject({ code: 'unsafe_pagination' });
    await expect(client.getEventHistoryPage('.')).rejects.toMatchObject({ code: 'unsafe_pagination' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts JSON:API link objects and reports unknown link shapes without guessing', async () => {
    const linkObjectFetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [], links: { next: { href: '?page=2', meta: { cursor: 'opaque' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: [], links: { next: null } }));
    const linked = await makeClient(linkObjectFetcher).getEventHistoryPages('device-id');
    expect(linked.pages).toHaveLength(2);
    expect(linked.paginationIssue).toBeUndefined();

    const unknownFetcher = vi.fn(async () => jsonResponse({ data: [], links: { next: { cursor: 'opaque' } } }));
    const unknown = await makeClient(unknownFetcher).getEventHistoryPages('device-id');
    expect(unknown).toMatchObject({ truncated: true, paginationIssue: 'unrecognized_link' });
    expect(unknown.pages).toHaveLength(1);
    expect(unknownFetcher).toHaveBeenCalledTimes(1);
  });

  it('caps the number of history pages and marks a truncated result', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const page = new URL(String(input)).searchParams.get('page');
      return jsonResponse({ data: [], links: { next: page === '2' ? '?page=3' : '?page=2' } });
    });
    const client = makeClient(fetcher);
    const result = await client.getEventHistoryPages('device-id', 2);
    expect(result.pages).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.paginationIssue).toBe('page_limit');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(client.getEventHistoryPages('device-id', 51)).rejects.toThrow('from 1 to 50');
  });

  it('does not follow pagination to another host and retains the first page for shape reporting', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: [], links: { next: 'https://attacker.invalid/steal?token=secret' } }));
    const client = makeClient(fetcher);
    const result = await client.getEventHistoryPages('device-id');
    expect(result).toMatchObject({ truncated: true, paginationIssue: 'unsafe_link' });
    expect(result.pages).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.getEventHistoryPage('device-id', 'https://attacker.invalid/steal'))
      .rejects.toMatchObject({ code: 'unsafe_pagination' });
  });

  it('retries 429 responses only a bounded number of times and caps Retry-After', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'sensitive upstream body' }, 429, { 'retry-after': '120' }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const sleep = vi.fn(async () => undefined);
    const client = makeClient(fetcher, { maxRetries: 1, sleep });
    await client.getDevices();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(60_000);

    const exhaustedFetcher = vi.fn(async () => jsonResponse({ error: token }, 429, { 'retry-after': '0' }));
    const exhausted = makeClient(exhaustedFetcher, { maxRetries: 1, sleep });
    await expect(exhausted.getDevices()).rejects.toMatchObject({ code: 'rate_limited' });
    expect(exhaustedFetcher).toHaveBeenCalledTimes(2);
  });

  it('returns safe errors for expired tokens and upstream failures without copying bodies', async () => {
    const expiredClient = makeClient(async () => jsonResponse({ access_token: token }, 401));
    await expect(expiredClient.getDevices()).rejects.toMatchObject({
      code: 'token_expired',
      message: expect.stringMatching(/generate a new one/),
    });
    await expect(makeClient(async () => jsonResponse({ error: token }, 502)).getDevices())
      .rejects.toMatchObject({ code: 'api_error', message: expect.not.stringContaining(token) });
    await expect(makeClient(async () => { throw new Error(`network failure ${token}`); }).getDevices())
      .rejects.toMatchObject({ code: 'network_error', message: expect.not.stringContaining(token) });
  });

  it('rejects malformed, non-JSON, and oversized response bodies', async () => {
    const malformed = makeClient(async () => new Response('not-json', { status: 200 }));
    await expect(malformed.getDevices()).rejects.toMatchObject({ code: 'invalid_response' });

    const scalar = makeClient(async () => new Response('null', { status: 200 }));
    await expect(scalar.getDevices()).rejects.toMatchObject({ code: 'invalid_response' });

    const oversized = makeClient(async () => new Response(JSON.stringify({ data: 'x'.repeat(2_000_010) }), { status: 200 }));
    await expect(oversized.getDevices()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects a non-official or unsafe API base URL before making network calls', () => {
    const fetcher = vi.fn();
    expect(() => new RingPlaygroundClient('https://evil.invalid', token, { fetcher })).toThrow('official HTTPS API origin');
    expect(() => new RingPlaygroundClient('https://user:pass@api.amazonvision.com', token, { fetcher })).toThrow('official HTTPS API origin');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses AbortController to enforce request timeouts', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      const client = makeClient(fetcher, { timeoutMs: 100 });
      const pending = client.getDevices();
      const rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
