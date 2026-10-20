import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestConfig, makeTestDb } from '../test-support.js';
import { RingTokenStore } from './token-store.js';
import { RingOAuthService, RING_CODE_EXCHANGE_TIMEOUT_MS, RING_TOKEN_REFRESH_TIMEOUT_MS } from './oauth.js';
import { RingPartnerClient } from './client.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

const future = (): string => new Date(Date.now() + 60 * 60_000).toISOString();

describe('Ring token storage and API retry', () => {
  it('keeps OAuth disabled until the current official contract is explicitly verified', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret', ringOAuthContractVerified: false });
    const store = new RingTokenStore(db, config.tokenEncryptionKey);
    const fetcher = vi.fn();
    const oauth = new RingOAuthService(config, store, fetcher);
    await expect(oauth.exchangeAuthorizationCode('test-code')).rejects.toThrow('disabled until');
    await expect(oauth.refresh()).rejects.toThrow('disabled until');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the verified token form, reads the Ring profile, and stores the pair unclaimed', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret' });
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === config.ringTokenUrl) {
        return new Response(JSON.stringify({ access_token: 'exchange-access', refresh_token: 'exchange-refresh', expires_in: 14_400 }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ data: { id: 'ring-account-1' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const store = new RingTokenStore(db, config.tokenEncryptionKey);
    const oauth = new RingOAuthService(config, store, fetcher);

    const pair = await oauth.exchangeAuthorizationCode('one-way-code');

    expect(pair).toMatchObject({ accessToken: 'exchange-access', refreshToken: 'exchange-refresh' });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe('https://oauth.ring.com/token-test');
    expect(requests[0]?.init?.method).toBe('POST');
    expect(requests[0]?.init?.redirect).toBe('error');
    expect(new Headers(requests[0]?.init?.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
    const form = requests[0]?.init?.body as URLSearchParams;
    expect(Object.fromEntries(form.entries())).toEqual({
      grant_type: 'authorization_code',
      client_id: 'test-client-id',
      code: 'one-way-code',
      client_secret: 'test-client-secret',
    });
    expect(form.has('redirect_uri')).toBe(false);
    expect(requests[1]?.url).toBe('https://api.amazonvision.com/v1/users/me');
    expect(requests[1]?.init?.method).toBe('GET');
    expect(requests[1]?.init?.redirect).toBe('error');
    expect(new Headers(requests[1]?.init?.headers).get('authorization')).toBe('Bearer exchange-access');
    expect(requests[0]?.init?.signal).toBeDefined();
    expect(requests[1]?.init?.signal).toBe(requests[0]?.init?.signal);
    expect(RING_CODE_EXCHANGE_TIMEOUT_MS).toBeLessThan(60_000);
    expect(store.getUnclaimedAccountId()).toBe('ring-account-1');
    expect(store.isUnclaimedForAccount('ring-account-1')).toBe(true);
    expect(store.getPair()).toMatchObject({ accessToken: 'exchange-access', refreshToken: 'exchange-refresh' });
  });

  it('aborts a stalled authorization-code exchange before the 60-second Ring window', async () => {
    vi.useFakeTimers();
    try {
      db = makeTestDb();
      const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret' });
      const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
      }));
      const store = new RingTokenStore(db, config.tokenEncryptionKey);
      const oauth = new RingOAuthService(config, store, fetcher);
      const exchange = oauth.exchangeAuthorizationCode('slow-code');
      const rejection = expect(exchange).rejects.toThrow('timed out');

      await vi.advanceTimersByTimeAsync(RING_CODE_EXCHANGE_TIMEOUT_MS);
      await rejection;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a stalled OAuth refresh and preserves the previously encrypted token pair', async () => {
    vi.useFakeTimers();
    try {
      db = makeTestDb();
      const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret' });
      const store = new RingTokenStore(db, config.tokenEncryptionKey);
      store.savePair({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: future() });
      const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
      }));
      const oauth = new RingOAuthService(config, store, fetcher);
      const refresh = oauth.refresh();
      const rejection = expect(refresh).rejects.toThrow('timed out');

      await vi.advanceTimersByTimeAsync(RING_TOKEN_REFRESH_TIMEOUT_MS);
      await rejection;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(store.getPair()).toMatchObject({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not persist a token pair when the Ring profile cannot identify the account', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret' });
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ access_token: 'temporary-access', refresh_token: 'temporary-refresh', expires_in: 14_400 }), { status: 200 })
        : new Response(JSON.stringify({ data: {} }), { status: 200 });
    };
    const store = new RingTokenStore(db, config.tokenEncryptionKey);
    const oauth = new RingOAuthService(config, store, fetcher);

    await expect(oauth.exchangeAuthorizationCode('one-way-code')).rejects.toThrow('did not include the account ID');
    expect(store.getPair()).toBeNull();
    expect(store.getUnclaimedAccountId()).toBeNull();
  });

  it('claims only the matching unclaimed account and preserves the linked token pair', () => {
    db = makeTestDb();
    const store = new RingTokenStore(db, makeTestConfig().tokenEncryptionKey);
    store.saveUnclaimedPair({ accessToken: 'pending-access', refreshToken: 'pending-refresh', expiresAt: future() }, 'ring-account-2');

    expect(store.isUnclaimedForAccount('other-account')).toBe(false);
    expect(store.claimUnclaimedPair('other-account')).toBe(false);
    expect(store.isUnclaimedForAccount('ring-account-2')).toBe(true);
    expect(store.claimUnclaimedPair('ring-account-2')).toBe(true);
    expect(store.isUnclaimedForAccount('ring-account-2')).toBe(false);
    expect(store.getPair()).toMatchObject({ accessToken: 'pending-access', refreshToken: 'pending-refresh' });
  });

  it('stores rotated access and refresh tokens together encrypted at rest', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret' });
    const store = new RingTokenStore(db, config.tokenEncryptionKey);
    store.savePair({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: future() });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 14_400 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const oauth = new RingOAuthService(config, store, fetcher);
    const returned = await oauth.refresh();
    expect(returned.accessToken).toBe('new-access');
    expect(store.getPair()).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    const raw = db.prepare('SELECT access_token_encrypted, refresh_token_encrypted FROM ring_tokens').get() as {
      access_token_encrypted: string; refresh_token_encrypted: string;
    };
    expect(raw.access_token_encrypted).not.toContain('new-access');
    expect(raw.refresh_token_encrypted).not.toContain('new-refresh');
    expect((db.prepare('SELECT last_refresh_at FROM ring_link_state').get() as { last_refresh_at: string | null }).last_refresh_at).not.toBeNull();
  });

  it('does not replace the old pair when the upstream refresh fails', async () => {
    db = makeTestDb();
    const config = makeTestConfig({ ringClientId: 'test-client-id', ringClientSecret: 'test-client-secret' });
    const store = new RingTokenStore(db, config.tokenEncryptionKey);
    store.savePair({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: future() });
    const oauth = new RingOAuthService(config, store, async () => new Response('unavailable', { status: 503 }));
    await expect(oauth.refresh()).rejects.toThrow('HTTP 503');
    expect(store.getPair()).toMatchObject({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    expect((db.prepare('SELECT last_refresh_error FROM ring_link_state').get() as { last_refresh_error: string }).last_refresh_error).toContain('Token refresh failed');
  });

  it('refreshes after one 401 and retries with the replacement access token', async () => {
    const seen: string[] = [];
    let refreshed = false;
    const provider = {
      accessToken: async () => 'expired-access',
      refreshAfterUnauthorized: async () => { refreshed = true; return 'replacement-access'; },
    };
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get('authorization') ?? '');
      if (seen.length === 1) return new Response('', { status: 401 });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new RingPartnerClient('https://api.amazonvision.com', provider, { fetcher });
    await client.getDevices();
    expect(refreshed).toBe(true);
    expect(seen).toEqual(['Bearer expired-access', 'Bearer replacement-access']);
  });

  it('backs off by the Retry-After value before retrying 429', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fetcher = async () => {
      calls += 1;
      return calls === 1
        ? new Response('', { status: 429, headers: { 'retry-after': '2' } })
        : new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const provider = { accessToken: async () => 'access', refreshAfterUnauthorized: async () => null };
    const client = new RingPartnerClient('https://api.amazonvision.com', provider, {
      fetcher,
      sleep: async (duration) => { sleeps.push(duration); },
      maxRetries: 2,
    });
    await client.getDevices();
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it('enforces HTTPS origins and rejects cross-origin request paths before retrieving a token', async () => {
    const accessToken = vi.fn(async () => 'must-not-be-sent');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const provider = { accessToken, refreshAfterUnauthorized: async () => null };
    expect(() => new RingPartnerClient('http://api.amazonvision.com', provider, { fetcher })).toThrow('HTTPS origin');
    const client = new RingPartnerClient('https://api.amazonvision.com', provider, { fetcher });

    await expect(client.request('https://attacker.example/collect')).rejects.toThrow('configured HTTPS origin');
    expect(accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts a stalled Ring API request at the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
      }));
      const provider = { accessToken: async () => 'access', refreshAfterUnauthorized: async () => null };
      const client = new RingPartnerClient('https://api.amazonvision.com', provider, { fetcher, timeoutMs: 100 });
      const pending = client.getDevices();
      const rejection = expect(pending).rejects.toThrow('timed out');

      await vi.advanceTimersByTimeAsync(100);
      await rejection;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects oversized API response bodies before parsing JSON', async () => {
    const fetcher = async () => new Response(' '.repeat(2_000_001), { status: 200 });
    const provider = { accessToken: async () => 'access', refreshAfterUnauthorized: async () => null };
    const client = new RingPartnerClient('https://api.amazonvision.com', provider, { fetcher });

    await expect(client.getDevices()).rejects.toThrow('size limit');
  });
});
