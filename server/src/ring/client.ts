import type { FetchLike, FetchResponseLike } from './oauth.js';

export interface RingTokenProvider {
  accessToken(): Promise<string | null>;
  refreshAfterUnauthorized(): Promise<string | null>;
}

export interface RetryOptions {
  fetcher?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
  onSuccess?: (path: string) => void;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_RESPONSE_BYTES = 2_000_000;

function retryDelay(header: string | null, nowMs: number): number {
  if (!header) return 1000;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(date - nowMs, 0), 60_000);
  return 1000;
}

function discardResponseBody(response: FetchResponseLike): void {
  void response.body?.cancel().catch(() => undefined);
}

async function readBoundedJson(response: FetchResponseLike): Promise<unknown> {
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) {
    discardResponseBody(response);
    throw new Error('Ring API response exceeded the size limit.');
  }
  if (!response.body) throw new Error('Ring API response body was empty.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new Error('Ring API response exceeded the size limit.');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Ring API response was not valid UTF-8.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Ring API response was not valid JSON.');
  }
}

export class RingPartnerClient {
  private readonly baseUrl: URL;
  private readonly fetcher: FetchLike;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly onSuccess: ((path: string) => void) | undefined;

  constructor(baseUrl: string, private readonly tokenProvider: RingTokenProvider, options: RetryOptions = {}) {
    this.baseUrl = new URL(baseUrl);
    if (this.baseUrl.protocol !== 'https:' || this.baseUrl.username || this.baseUrl.password
      || this.baseUrl.pathname !== '/' || this.baseUrl.search || this.baseUrl.hash) {
      throw new Error('Ring API base URL must be an HTTPS origin.');
    }
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const retryOption = options.maxRetries;
    const requestedRetries = typeof retryOption === 'number' && Number.isFinite(retryOption)
      ? Math.trunc(retryOption)
      : DEFAULT_MAX_RETRIES;
    this.maxRetries = Math.min(Math.max(requestedRetries, 0), 3);
    const timeoutOption = options.timeoutMs;
    const requestedTimeout = typeof timeoutOption === 'number' && Number.isFinite(timeoutOption)
      ? timeoutOption
      : DEFAULT_TIMEOUT_MS;
    this.timeoutMs = Math.min(Math.max(requestedTimeout, 100), 30_000);
    this.onSuccess = options.onSuccess;
  }

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const url = new URL(path.replace(/^\/+/, ''), `${this.baseUrl.origin}/`);
    if (url.origin !== this.baseUrl.origin || url.username || url.password) {
      throw new Error('Ring API request path must stay on the configured HTTPS origin.');
    }

    let refreshed = false;
    let retryCount = 0;
    let token = await this.tokenProvider.accessToken();
    if (!token) throw new Error('No Ring access token is available.');

    while (true) {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      timer.unref?.();
      let response: FetchResponseLike;
      try {
        response = await this.fetcher(url, { ...init, headers, redirect: 'error', signal: controller.signal });
      } catch {
        clearTimeout(timer);
        if (controller.signal.aborted) throw new Error('Ring API request timed out.');
        throw new Error('Ring API request failed.');
      }

      if (response.status === 401 && !refreshed) {
        discardResponseBody(response);
        clearTimeout(timer);
        refreshed = true;
        token = await this.tokenProvider.refreshAfterUnauthorized();
        if (!token) throw new Error('Ring access was rejected and refresh did not produce a new access token.');
        continue;
      }
      if (response.status === 429 && retryCount < this.maxRetries) {
        const delay = retryDelay(response.headers.get('retry-after'), Date.now());
        discardResponseBody(response);
        clearTimeout(timer);
        retryCount += 1;
        await this.sleep(delay);
        continue;
      }
      if (!response.ok) {
        discardResponseBody(response);
        clearTimeout(timer);
        throw new Error(`Ring API request failed with HTTP ${response.status}.`);
      }

      try {
        if (response.status === 204) {
          this.onSuccess?.(path);
          return null;
        }
        const payload = await readBoundedJson(response);
        this.onSuccess?.(path);
        return payload;
      } catch (error) {
        if (controller.signal.aborted) throw new Error('Ring API request timed out.');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  getDevices(): Promise<unknown> {
    return this.request('/v1/devices');
  }

  getCurrentUser(): Promise<unknown> {
    return this.request('/v1/users/me');
  }

  getEventHistory(deviceId: string): Promise<unknown> {
    return this.request(`/v1/history/devices/${encodeURIComponent(deviceId)}/events`);
  }

  postAppIntegration(body: unknown): Promise<unknown> {
    return this.request('/v1/accounts/me/app-integrations', { method: 'POST', body: JSON.stringify(body) });
  }

  patchAppIntegration(body: unknown): Promise<unknown> {
    return this.request('/v1/accounts/me/app-integrations', { method: 'PATCH', body: JSON.stringify(body) });
  }
}
