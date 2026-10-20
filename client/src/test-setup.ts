import { randomUUID } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';

// Test workers must not inherit Ring credentials or load the developer's .env.
// dotenv/config honours DOTENV_CONFIG_PATH; this unique path is intentionally never created.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('RING_')) delete process.env[key];
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '3001',
  WEB_ORIGIN: 'http://localhost:5173',
  SESSION_SECRET: '5'.repeat(64),
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  DATABASE_PATH: ':memory:',
  DEMO_EMAIL: 'demo@doorway.local',
  DEMO_PASSWORD: 'test-only-demo-password',
  STALL_THRESHOLD_HOURS: '24',
  APP_PREVIEW_PORT: '5173',
  API_PROXY_TARGET: 'http://127.0.0.1:3001',
  DOTENV_CONFIG_PATH: join(tmpdir(), `doorway-relay-vitest-no-env-${process.pid}-${randomUUID()}`),
  DOTENV_CONFIG_OVERRIDE: 'false',
  DOTENV_CONFIG_DEBUG: 'false',
});

const leakedRingVariables = Object.keys(process.env).filter((key) => key.startsWith('RING_'));
if (leakedRingVariables.length > 0) {
  throw new Error('Vitest setup leaked inherited RING_* environment variables into a test file.');
}

function loopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (normalized === 'localhost') return true;
  const addressType = isIP(normalized);
  if (addressType === 4) return normalized.startsWith('127.');
  return addressType === 6 && (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1');
}

function hostFromRequestArgs(args: readonly unknown[]): string | null {
  const target = args[0];
  let host: string | null = null;
  let targetUrl: URL | null = null;

  if (target instanceof URL) targetUrl = target;
  else if (typeof Request !== 'undefined' && target instanceof Request) {
    try { targetUrl = new URL(target.url); } catch { return null; }
  } else if (typeof target === 'string' && /^https?:\/\//i.test(target)) {
    try { targetUrl = new URL(target); } catch { return null; }
  } else if (target && typeof target === 'object') {
    const options = target as { hostname?: unknown; host?: unknown };
    const value = options.hostname ?? options.host;
    if (typeof value === 'string') host = value;
  }

  const override = args[1];
  if (override && typeof override === 'object') {
    const options = override as { hostname?: unknown; host?: unknown };
    const value = options.hostname ?? options.host;
    if (typeof value === 'string') host = value;
  }

  if (host) {
    if (host.startsWith('[')) {
      const closing = host.indexOf(']');
      if (closing > 0) return host.slice(1, closing);
    }
    const colon = host.lastIndexOf(':');
    if (colon > 0 && /^\d+$/.test(host.slice(colon + 1)) && host.indexOf(':') === colon) {
      return host.slice(0, colon);
    }
    return host;
  }
  return targetUrl?.hostname ?? null;
}

function assertLoopbackTarget(host: string | null): void {
  if (!host || !loopbackHost(host)) {
    throw new Error('Blocked non-loopback network access from a test. Mock the request instead.');
  }
}

const testGlobal = globalThis as unknown as Record<PropertyKey, unknown>;
const fetchGuardKey = Symbol.for('doorway-relay.test-fetch-guard');
if (!testGlobal[fetchGuardKey]) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assertLoopbackTarget(hostFromRequestArgs([input]));
    return originalFetch(input, init);
  }) as typeof fetch;
  testGlobal[fetchGuardKey] = true;
}

// Supertest uses loopback HTTP, while Ring requests must always be mocked. Patch
// the built-in modules as well as fetch so an accidental unmocked request fails
// before DNS resolution or a socket is opened.
const require = createRequire(import.meta.url);
const networkGuardKey = Symbol.for('doorway-relay.test-http-guard');
const httpModule = require('node:http') as typeof import('node:http') & Record<PropertyKey, unknown>;
const httpsModule = require('node:https') as typeof import('node:https') & Record<PropertyKey, unknown>;

function guardHttpModule(module: typeof httpModule | typeof httpsModule): void {
  if (module[networkGuardKey]) return;
  const originalRequest = module.request;
  const originalGet = module.get;
  module.request = ((...args: unknown[]) => {
    assertLoopbackTarget(hostFromRequestArgs(args));
    return Reflect.apply(originalRequest, module, args);
  }) as typeof module.request;
  module.get = ((...args: unknown[]) => {
    assertLoopbackTarget(hostFromRequestArgs(args));
    return Reflect.apply(originalGet, module, args);
  }) as typeof module.get;
  module[networkGuardKey] = true;
}

guardHttpModule(httpModule);
guardHttpModule(httpsModule);
syncBuiltinESMExports();
