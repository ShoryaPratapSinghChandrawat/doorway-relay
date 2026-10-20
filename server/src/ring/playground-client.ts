import { z } from 'zod';

const responseSchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);
const topLevelLinksSchema = z.object({ links: z.unknown().optional() }).passthrough();
const linksObjectSchema = z.record(z.string(), z.unknown());
const nextLinkSchema = z.union([
  z.string().min(1),
  z.object({ href: z.string().min(1) }).passthrough(),
  z.null(),
]);
const API_ORIGIN = 'https://api.amazonvision.com';
const MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 12_000;

export type PlaygroundDocument = Record<string, unknown> | unknown[];
export type PlaygroundErrorCode =
  | 'token_expired'
  | 'rate_limited'
  | 'api_error'
  | 'timeout'
  | 'network_error'
  | 'invalid_response'
  | 'unsafe_pagination';

const safeMessages: Record<PlaygroundErrorCode, string> = {
  token_expired: 'Playground token expired — generate a new one (tokens last about 30 minutes).',
  rate_limited: 'Ring API is rate limiting requests. Wait a moment and try again.',
  api_error: 'Ring API request failed. Check the Playground integration status and try again.',
  timeout: 'Ring API request timed out. Try again.',
  network_error: 'Ring API could not be reached from this machine.',
  invalid_response: 'Ring API returned a response that does not match the expected JSON shape.',
  unsafe_pagination: 'Ring API returned a pagination link outside the expected Event History endpoint.',
};

export class RingPlaygroundError extends Error {
  constructor(readonly code: PlaygroundErrorCode, readonly httpStatus?: number) {
    super(safeMessages[code]);
    this.name = 'RingPlaygroundError';
  }
}

export interface PlaygroundClientOptions {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  minRequestIntervalMs?: number;
}

export interface EventHistoryPages {
  pages: PlaygroundDocument[];
  truncated: boolean;
  paginationIssue?: 'unrecognized_link' | 'unsafe_link' | 'repeated_link' | 'page_limit';
}

function normalizedBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Ring API base URL must be the official HTTPS API origin.');
  }
  if (url.origin !== API_ORIGIN || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new Error('Ring API base URL must be the official HTTPS API origin.');
  }
  return url;
}

function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.min(Math.max(date - now, 0), 60_000);
  return 1000;
}

function historyEndpoint(baseUrl: URL, deviceId: string): URL {
  if (!deviceId || deviceId.length > 512 || deviceId === '.' || deviceId === '..'
    || [...deviceId].some((character) => character.charCodeAt(0) < 32)) {
    throw new RingPlaygroundError('unsafe_pagination');
  }
  return new URL(`/v1/history/devices/${encodeURIComponent(deviceId)}/events`, baseUrl);
}

function readNextLink(document: PlaygroundDocument): { link: string | null; unsupported: boolean } {
  if (Array.isArray(document)) return { link: null, unsupported: false };
  const parsed = topLevelLinksSchema.safeParse(document);
  if (!parsed.success || parsed.data.links === undefined || parsed.data.links === null) {
    return { link: null, unsupported: !parsed.success };
  }
  const links = linksObjectSchema.safeParse(parsed.data.links);
  if (!links.success || !Object.hasOwn(links.data, 'next')) return { link: null, unsupported: !links.success };
  const next = nextLinkSchema.safeParse(links.data.next);
  if (!next.success) return { link: null, unsupported: true };
  if (next.data === null) return { link: null, unsupported: false };
  const link = typeof next.data === 'string' ? next.data : next.data.href;
  return { link, unsupported: false };
}

function discardResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

async function readBoundedText(response: Response): Promise<string> {
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) {
    throw new RingPlaygroundError('invalid_response', response.status);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new RingPlaygroundError('invalid_response', response.status);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RingPlaygroundError('invalid_response', response.status);
  }
}

export class RingPlaygroundClient {
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly minRequestIntervalMs: number;
  private lastRequestAt = 0;
  private readonly baseUrl: URL;

  constructor(baseUrl: string, private readonly accessToken: string, options: PlaygroundClientOptions = {}) {
    if (!accessToken.trim()) throw new Error('A server-side Ring Playground token is required.');
    this.baseUrl = normalizedBaseUrl(baseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const requestedTimeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs! : DEFAULT_TIMEOUT_MS;
    this.timeoutMs = Math.min(Math.max(requestedTimeout, 100), 30_000);
    const requestedRetries = Number.isFinite(options.maxRetries) ? Math.trunc(options.maxRetries!) : DEFAULT_MAX_RETRIES;
    this.maxRetries = Math.min(Math.max(requestedRetries, 0), 3);
    const requestedInterval = Number.isFinite(options.minRequestIntervalMs) ? options.minRequestIntervalMs! : 100;
    this.minRequestIntervalMs = Math.min(Math.max(requestedInterval, 0), 10_000);
  }

  getDevices(): Promise<PlaygroundDocument> {
    return this.get('/v1/devices');
  }

  async getEventHistoryPage(deviceId: string, nextLink?: string): Promise<PlaygroundDocument> {
    const endpoint = historyEndpoint(this.baseUrl, deviceId);
    if (!nextLink) return this.get(endpoint);
    const next = new URL(nextLink, endpoint);
    if (next.origin !== this.baseUrl.origin || next.pathname !== endpoint.pathname || next.username || next.password || next.hash) {
      throw new RingPlaygroundError('unsafe_pagination');
    }
    return this.get(next);
  }

  async getEventHistoryPages(deviceId: string, maxPages = DEFAULT_MAX_PAGES): Promise<EventHistoryPages> {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
      throw new Error('Event History page limit must be an integer from 1 to 50.');
    }
    const pages: PlaygroundDocument[] = [];
    const visited = new Set<string>();
    let nextLink: string | undefined;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const endpoint = historyEndpoint(this.baseUrl, deviceId);
      const currentUrl = nextLink ? new URL(nextLink, endpoint) : endpoint;
      if (visited.has(currentUrl.href)) return { pages, truncated: true, paginationIssue: 'repeated_link' };
      visited.add(currentUrl.href);
      const page = await this.getEventHistoryPage(deviceId, nextLink);
      pages.push(page);
      const nextResult = readNextLink(page);
      if (nextResult.unsupported) return { pages, truncated: true, paginationIssue: 'unrecognized_link' };
      if (!nextResult.link) return { pages, truncated: false };
      let validated: URL;
      try {
        validated = new URL(nextResult.link, currentUrl);
      } catch {
        return { pages, truncated: true, paginationIssue: 'unsafe_link' };
      }
      if (validated.origin !== this.baseUrl.origin || validated.pathname !== endpoint.pathname || validated.username || validated.password || validated.hash) {
        return { pages, truncated: true, paginationIssue: 'unsafe_link' };
      }
      if (visited.has(validated.href)) return { pages, truncated: true, paginationIssue: 'repeated_link' };
      nextLink = validated.href;
    }

    return { pages, truncated: true, paginationIssue: 'page_limit' };
  }

  private async get(pathOrUrl: string | URL): Promise<PlaygroundDocument> {
    const url = pathOrUrl instanceof URL ? new URL(pathOrUrl.href) : new URL(pathOrUrl, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) throw new RingPlaygroundError('unsafe_pagination');

    let attempt = 0;
    while (true) {
      const waitMs = this.minRequestIntervalMs - (Date.now() - this.lastRequestAt);
      if (waitMs > 0) await this.sleep(waitMs);
      this.lastRequestAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      timer.unref?.();
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: 'GET',
          headers: {
            accept: 'application/vnd.api+json, application/json',
            authorization: `Bearer ${this.accessToken}`,
          },
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof RingPlaygroundError) throw error;
        if (controller.signal.aborted) throw new RingPlaygroundError('timeout');
        throw new RingPlaygroundError('network_error');
      }

      if (response.status === 401) {
        discardResponseBody(response);
        clearTimeout(timer);
        throw new RingPlaygroundError('token_expired', response.status);
      }
      if (response.status === 429) {
        const delay = retryAfterMs(response.headers.get('retry-after'));
        discardResponseBody(response);
        clearTimeout(timer);
        if (attempt >= this.maxRetries) throw new RingPlaygroundError('rate_limited', response.status);
        attempt += 1;
        await this.sleep(delay);
        continue;
      }
      if (!response.ok) {
        discardResponseBody(response);
        clearTimeout(timer);
        throw new RingPlaygroundError('api_error', response.status);
      }

      try {
        const text = await readBoundedText(response);
        let value: unknown;
        try {
          value = JSON.parse(text) as unknown;
        } catch {
          throw new RingPlaygroundError('invalid_response', response.status);
        }
        const parsed = responseSchema.safeParse(value);
        if (!parsed.success) throw new RingPlaygroundError('invalid_response', response.status);
        return parsed.data;
      } catch (error) {
        if (controller.signal.aborted) throw new RingPlaygroundError('timeout');
        if (error instanceof RingPlaygroundError) throw error;
        throw new RingPlaygroundError('invalid_response', response.status);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
