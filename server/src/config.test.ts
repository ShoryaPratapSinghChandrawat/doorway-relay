import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.js';

const session = 'c'.repeat(64);

describe('environment config validation', () => {
  it('isolates Ring environment and blocks unmocked non-loopback requests', async () => {
    expect(Object.keys(process.env).filter((key) => key.startsWith('RING_'))).toEqual([]);
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DOTENV_CONFIG_PATH).toContain('doorway-relay-vitest-no-env-');
    await import('dotenv/config');
    expect(Object.keys(process.env).filter((key) => key.startsWith('RING_'))).toEqual([]);

    await expect(fetch('https://example.invalid/')).rejects.toThrow('Blocked non-loopback network access');
    expect(() => httpRequest('http://example.invalid/')).toThrow('Blocked non-loopback network access');
    expect(() => httpsRequest('https://example.invalid/')).toThrow('Blocked non-loopback network access');
  });

  it('rejects placeholder session secrets and production simulator keys', () => {
    expect(() => parseConfig({ SESSION_SECRET: 'replace-with-a-random-32-byte-hex-value' })).toThrow('placeholder');
    expect(() => parseConfig({ SESSION_SECRET: session, NODE_ENV: 'production', WEB_ORIGIN: 'https://relay.example.test', DATABASE_PATH: '/var/lib/app.sqlite', RING_SIMULATOR_HMAC_KEY: 'known-test-key' })).toThrow('simulator key');
    expect(() => parseConfig({ SESSION_SECRET: session, RING_SIMULATOR_HMAC_KEY: 'replace-with-random-local-key' })).toThrow('placeholder');
  });

  it('accepts the local test configuration without implying a Ring connection', () => {
    const config = parseConfig({ SESSION_SECRET: session, NODE_ENV: 'test', RING_SIMULATOR_HMAC_KEY: 'local-key' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.sessionSecret).toBe(session);
    expect(config.ringClientId).toBeNull();
    expect(config.ringTokenUrl).toBe('https://oauth.ring.com/oauth/token');
    expect(config.ringOAuthContractVerified).toBe(true);
    expect(config.ringTokenExchangeRouteEnabled).toBe(false);
    expect(parseConfig({ SESSION_SECRET: session, RING_TOKEN_EXCHANGE_ROUTE_ENABLED: 'true' }).ringTokenExchangeRouteEnabled).toBe(true);
    expect(parseConfig({ SESSION_SECRET: session, RING_TOKEN_EXCHANGE_ROUTE_ENABLED: 'false' }).ringTokenExchangeRouteEnabled).toBe(false);
    expect(parseConfig({ SESSION_SECRET: session, RING_OAUTH_BASE_URL: 'https://oauth.example.test/' }).ringTokenUrl)
      .toBe('https://oauth.example.test/oauth/token');
    expect(parseConfig({ SESSION_SECRET: session, RING_OAUTH_BASE_URL: 'https://oauth.example.test/', RING_TOKEN_URL: 'https://oauth.example.test/custom-token' }).ringTokenUrl)
      .toBe('https://oauth.example.test/custom-token');
    expect(() => parseConfig({ SESSION_SECRET: session, RING_TOKEN_URL: 'https://override.example.test/token' }))
      .toThrow('same HTTPS origin');
    expect(() => parseConfig({ SESSION_SECRET: session, RING_API_BASE_URL: 'http://api.amazonvision.com' })).toThrow('must use HTTPS');
    expect(() => parseConfig({ SESSION_SECRET: session, RING_OAUTH_BASE_URL: 'http://oauth.ring.com' })).toThrow('must use HTTPS');
    expect(parseConfig({ SESSION_SECRET: session, RING_OAUTH_CONTRACT_VERIFIED: 'false' }).ringOAuthContractVerified).toBe(false);
    expect(parseConfig({ SESSION_SECRET: session, RING_OAUTH_CONTRACT_VERIFIED: 'true' }).ringOAuthContractVerified).toBe(true);
  });

  it('requires an explicit provenance label when Ring credentials or history configuration are present', () => {
    expect(parseConfig({ SESSION_SECRET: session }).ringEventSource).toBeNull();
    expect(parseConfig({ SESSION_SECRET: session, RING_EVENT_SOURCE: 'ring_live' }).ringEventSource).toBe('ring_live');
    expect(() => parseConfig({ SESSION_SECRET: session, RING_ACCESS_TOKEN: 'playground-token-test-only' }))
      .toThrow('Set RING_EVENT_SOURCE explicitly');
    expect(() => parseConfig({ SESSION_SECRET: session, RING_HISTORY_DEVICE_ID: 'device-test-only' }))
      .toThrow('Set RING_EVENT_SOURCE explicitly');
    expect(parseConfig({ SESSION_SECRET: session, RING_ACCESS_TOKEN: 'playground-token-test-only', RING_EVENT_SOURCE: 'ring_playground' })
      .ringEventSource).toBe('ring_playground');
    expect(parseConfig({ SESSION_SECRET: session }).ringHistoryPollingEnabled).toBe(false);
    expect(parseConfig({ SESSION_SECRET: session, RING_EVENT_SOURCE: 'ring_live', RING_HISTORY_POLLING_ENABLED: 'true' })
      .ringHistoryPollingEnabled).toBe(true);
    expect(() => parseConfig({ SESSION_SECRET: session, RING_EVENT_SOURCE: 'ring_playground', RING_HISTORY_POLLING_ENABLED: 'true' }))
      .toThrow('Playground history stays off');
  });

  it('requires deployment-safe production origin, session secret, and persistent SQLite path', () => {
    const base = {
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://relay.example.test',
      SESSION_SECRET: session,
      TOKEN_ENCRYPTION_KEY: 'b'.repeat(64),
      DATABASE_PATH: '/var/lib/doorway-relay/doorway-relay.sqlite',
    };
    const config = parseConfig(base);
    expect(config.webOrigin).toBe('https://relay.example.test');
    expect(config.databasePath).toBe('/var/lib/doorway-relay/doorway-relay.sqlite');
    expect(config.tokenEncryptionKey).toBe('b'.repeat(64));

    expect(() => parseConfig({ ...base, WEB_ORIGIN: 'http://relay.example.test' })).toThrow('HTTPS');
    expect(() => parseConfig({ ...base, WEB_ORIGIN: 'ftp://relay.example.test' })).toThrow('HTTP or HTTPS');
    expect(() => parseConfig({ ...base, WEB_ORIGIN: 'https://relay.example.test/app' })).toThrow('origin');
    expect(() => parseConfig({ ...base, SESSION_SECRET: 's'.repeat(32) })).toThrow('64 hexadecimal');
    expect(() => parseConfig({ ...base, TOKEN_ENCRYPTION_KEY: undefined })).toThrow('TOKEN_ENCRYPTION_KEY');
    expect(() => parseConfig({ ...base, TOKEN_ENCRYPTION_KEY: 'replace-with-64-hex-characters' })).toThrow('TOKEN_ENCRYPTION_KEY');
    expect(() => parseConfig({ ...base, TOKEN_ENCRYPTION_KEY: 'c'.repeat(32) })).toThrow('TOKEN_ENCRYPTION_KEY');
    expect(() => parseConfig({ ...base, DATABASE_PATH: './data/app.sqlite' })).toThrow('absolute path');
    expect(() => parseConfig({ ...base, DATABASE_PATH: ':memory:' })).toThrow('absolute path');
    expect(() => parseConfig({ ...base, RING_API_BASE_URL: 'https://api.example.test' })).toThrow('official Ring API origin');
    expect(() => parseConfig({ ...base, RING_OAUTH_BASE_URL: 'https://oauth.example.test' })).toThrow('official Ring OAuth origin');
    expect(() => parseConfig({ ...base, RING_TOKEN_URL: 'https://override.example.test/oauth/token' })).toThrow('same HTTPS origin');
    expect(() => parseConfig({ ...base, RING_TOKEN_EXCHANGE_ROUTE_ENABLED: 'true' }))
      .toThrow('must remain false in production');
  });
});
