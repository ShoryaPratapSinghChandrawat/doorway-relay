import { randomUUID } from 'node:crypto';

const OFFICIAL_API_ORIGIN = 'https://api.amazonvision.com';
export const PLAYGROUND_WHEP_SESSION_TTL_MS = 5 * 60_000;
export const PLAYGROUND_WHEP_MAX_SDP_BYTES = 64 * 1024;
const MAX_LOCATION_LENGTH = 2048;
const REQUEST_TIMEOUT_MS = 10_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SDP_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export type PlaygroundWhepErrorCode =
  | 'invalid_offer'
  | 'session_active'
  | 'token_expired'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'api_error'
  | 'invalid_response';

const safeMessages: Record<PlaygroundWhepErrorCode, string> = {
  invalid_offer: 'The receive-only video offer is invalid or too large.',
  session_active: 'A Playground live-view session is already active. Stop it before starting another.',
  token_expired: 'Playground token expired — generate a new one (tokens last about 30 minutes).',
  rate_limited: 'Ring API is rate limiting requests. Wait a moment and try again.',
  timeout: 'Ring live-view request timed out. Stop the view and try again.',
  network_error: 'Ring live view could not be reached from this machine.',
  api_error: 'Ring live-view request failed. Check Playground access and try again.',
  invalid_response: 'Ring returned an invalid live-view response. No upstream details were exposed.',
};

export class PlaygroundWhepError extends Error {
  constructor(readonly code: PlaygroundWhepErrorCode, readonly httpStatus?: number) {
    super(safeMessages[code]);
    this.name = 'PlaygroundWhepError';
  }
}

export interface PlaygroundWhepSession {
  sessionId: string;
  answerSdp: string;
  expiresAt: string;
}

export interface PlaygroundWhepOptions {
  fetcher?: typeof fetch;
  getAccessToken?: () => string | null;
  sessionTtlMs?: number;
  requestTimeoutMs?: number;
  now?: () => number;
}

interface ActiveSession {
  id: string;
  location: URL;
  expiresAtMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  deleting: boolean;
}

function safeDeviceId(deviceId: string): boolean {
  return deviceId.length > 0 && deviceId.length <= 512 && deviceId !== '.' && deviceId !== '..'
    && !CONTROL_CHARACTERS.test(deviceId);
}

function apiOrigin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Ring API base URL must be the official HTTPS API origin.');
  }
  if (url.origin !== OFFICIAL_API_ORIGIN || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new Error('Ring API base URL must be the official HTTPS API origin.');
  }
  return url;
}

function validSdp(value: unknown, kind: 'offer' | 'answer'): value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') === 0 || Buffer.byteLength(value, 'utf8') > PLAYGROUND_WHEP_MAX_SDP_BYTES) return false;
  if (!value.startsWith('v=0\r\n') || !value.endsWith('\r\n') || SDP_CONTROL_CHARACTERS.test(value)) return false;
  if (/(?:\r(?!\n)|(?<!\r)\n)/.test(value)) return false;

  const lines = value.slice(0, -2).split('\r\n');
  if (lines.length > 1500 || lines.some((line) => line.length === 0 || line.length > 4096)) return false;
  if (!lines.some((line) => line.startsWith('o=')) || !lines.some((line) => line.startsWith('s=')) || !lines.some((line) => line.startsWith('t='))) return false;
  const mediaLines = lines.filter((line) => line.startsWith('m='));
  if (mediaLines.length !== 1) return false;

  const mediaParts = mediaLines[0]!.slice(2).split(/\s+/);
  if (mediaParts.length < 4 || mediaParts[0] !== 'video') return false;
  if (!/^[1-9]\d{0,4}$/.test(mediaParts[1]!) || Number(mediaParts[1]) > 65_535) return false;
  if (mediaParts[2] !== 'UDP/TLS/RTP/SAVPF' || !mediaParts.slice(3).every((payloadType) => /^\d{1,3}$/.test(payloadType))) return false;

  const directionLines = lines.filter((line) => ['a=sendrecv', 'a=sendonly', 'a=recvonly', 'a=inactive'].includes(line));
  const expectedDirection = kind === 'offer' ? 'a=recvonly' : 'a=sendonly';
  if (directionLines.length !== 1 || directionLines[0] !== expectedDirection) return false;
  if (!lines.some((line) => /^a=ice-ufrag:[^\s]+$/.test(line)) || !lines.some((line) => /^a=ice-pwd:[^\s]+$/.test(line))) return false;
  if (!lines.some((line) => /^a=fingerprint:(sha-256|sha-384|sha-512) [A-Fa-f0-9:]+$/.test(line))) return false;
  return true;
}

function endpointForDevice(base: URL, deviceId: string): URL {
  if (!safeDeviceId(deviceId)) throw new PlaygroundWhepError('invalid_offer');
  return new URL(`/v1/devices/${encodeURIComponent(deviceId)}/media/streaming/whep/sessions`, base);
}

function sessionLocation(value: string | null, endpoint: URL): URL {
  if (!value || value.length > MAX_LOCATION_LENGTH || /\s|[\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) {
    throw new PlaygroundWhepError('invalid_response');
  }
  if (!value.startsWith('/') && !value.startsWith('https://')) throw new PlaygroundWhepError('invalid_response');

  let location: URL;
  try {
    location = new URL(value, endpoint);
  } catch {
    throw new PlaygroundWhepError('invalid_response');
  }
  const prefix = `${endpoint.pathname}/`;
  if (location.origin !== OFFICIAL_API_ORIGIN || location.protocol !== 'https:' || location.username || location.password
    || location.search || location.hash || !location.pathname.startsWith(prefix)) {
    throw new PlaygroundWhepError('invalid_response');
  }
  const resourceId = location.pathname.slice(prefix.length);
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(resourceId);
  } catch {
    throw new PlaygroundWhepError('invalid_response');
  }
  if (!resourceId || resourceId.includes('/') || decodedId === '.' || decodedId === '..' || !/^[A-Za-z0-9._~-]{1,256}$/.test(decodedId)) {
    throw new PlaygroundWhepError('invalid_response');
  }
  return location;
}

function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

async function readBoundedSdp(response: Response): Promise<string> {
  const advertisedText = response.headers.get('content-length');
  if (advertisedText !== null) {
    const advertised = Number(advertisedText);
    if (!Number.isSafeInteger(advertised) || advertised < 0 || advertised > PLAYGROUND_WHEP_MAX_SDP_BYTES) {
      cancelBody(response);
      throw new PlaygroundWhepError('invalid_response', response.status);
    }
  }
  if (!response.body) throw new PlaygroundWhepError('invalid_response', response.status);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > PLAYGROUND_WHEP_MAX_SDP_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new PlaygroundWhepError('invalid_response', response.status);
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
    throw new PlaygroundWhepError('invalid_response', response.status);
  }
}

function responseMediaType(response: Response): string | null {
  const value = response.headers.get('content-type');
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
}

export class PlaygroundWhepRelay {
  private readonly fetcher: typeof fetch;
  private readonly getAccessToken: () => string | null;
  private readonly sessionTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;
  private readonly base: URL;
  private activeSession: ActiveSession | null = null;
  private creating = false;
  private pendingCreateController: AbortController | null = null;
  private pendingCreateTask: Promise<PlaygroundWhepSession> | null = null;

  constructor(apiBaseUrl: string, options: PlaygroundWhepOptions = {}) {
    this.base = apiOrigin(apiBaseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.sessionTtlMs = Math.min(Math.max(options.sessionTtlMs ?? PLAYGROUND_WHEP_SESSION_TTL_MS, 1_000), PLAYGROUND_WHEP_SESSION_TTL_MS);
    this.requestTimeoutMs = Math.min(Math.max(options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS, 100), REQUEST_TIMEOUT_MS);
    this.now = options.now ?? Date.now;
  }

  async createSession(deviceId: string, offerSdp: string, accessToken: string): Promise<PlaygroundWhepSession> {
    if (!validSdp(offerSdp, 'offer')) throw new PlaygroundWhepError('invalid_offer');
    if (this.activeSession || this.creating) throw new PlaygroundWhepError('session_active');
    const endpoint = endpointForDevice(this.base, deviceId);
    const token = accessToken.trim();
    if (!token) throw new PlaygroundWhepError('api_error');
    this.creating = true;
    const controller = new AbortController();
    this.pendingCreateController = controller;
    const task = this.performCreate(endpoint, offerSdp, token, controller);
    this.pendingCreateTask = task;
    try {
      return await task;
    } finally {
      if (this.pendingCreateTask === task) this.pendingCreateTask = null;
      if (this.pendingCreateController === controller) this.pendingCreateController = null;
      this.creating = false;
    }
  }

  private async performCreate(endpoint: URL, offerSdp: string, token: string, controller: AbortController): Promise<PlaygroundWhepSession> {
    let remoteLocation: URL | null = null;
    try {
      const result = await this.request(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/sdp',
          authorization: `Bearer ${token}`,
          'content-type': 'application/sdp',
        },
        body: offerSdp,
      }, async (response) => {
        if (response.status === 401) {
          cancelBody(response);
          throw new PlaygroundWhepError('token_expired', response.status);
        }
        if (response.status === 429) {
          cancelBody(response);
          throw new PlaygroundWhepError('rate_limited', response.status);
        }
        if (!response.ok) {
          cancelBody(response);
          throw new PlaygroundWhepError('api_error', response.status);
        }
        if (responseMediaType(response) !== 'application/sdp') {
          cancelBody(response);
          throw new PlaygroundWhepError('invalid_response', response.status);
        }

        const location = sessionLocation(response.headers.get('location'), endpoint);
        remoteLocation = location;
        const answerSdp = await readBoundedSdp(response);
        if (!validSdp(answerSdp, 'answer')) throw new PlaygroundWhepError('invalid_response', response.status);
        return { location, answerSdp };
      }, controller);

      if (controller.signal.aborted) throw new PlaygroundWhepError('network_error');
      const sessionId = randomUUID();
      const expiresAtMs = this.now() + this.sessionTtlMs;
      const activeSession: ActiveSession = {
        id: sessionId,
        location: result.location,
        expiresAtMs,
        timer: null,
        deleting: false,
      };
      this.activeSession = activeSession;
      this.scheduleExpiry(activeSession);
      return { sessionId, answerSdp: result.answerSdp, expiresAt: new Date(expiresAtMs).toISOString() };
    } catch (error) {
      if (remoteLocation) await this.bestEffortDelete(remoteLocation, token);
      throw error;
    }
  }

  async deleteSession(sessionId: string, accessToken: string | null): Promise<void> {
    const session = this.activeSession;
    const token = accessToken?.trim();
    if (!session || session.id !== sessionId || !token || session.deleting) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    session.deleting = true;
    try {
      await this.requestDelete(session.location, token);
      this.takeSession(sessionId);
    } catch (error) {
      if (this.activeSession === session) {
        session.deleting = false;
        this.scheduleExpiry(session);
      }
      throw error;
    }
  }

  async closeAll(accessToken = this.getAccessToken()): Promise<void> {
    const pending = this.pendingCreateTask;
    if (pending) {
      this.pendingCreateController?.abort();
      await pending.catch(() => undefined);
    }
    const session = this.takeSession();
    if (!session || !accessToken?.trim()) return;
    await this.bestEffortDelete(session.location, accessToken.trim());
  }

  get hasActiveSession(): boolean {
    return this.activeSession !== null;
  }

  private takeSession(sessionId?: string): ActiveSession | null {
    const session = this.activeSession;
    if (!session || (sessionId && session.id !== sessionId)) return null;
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    this.activeSession = null;
    return session;
  }

  private scheduleExpiry(session: ActiveSession): void {
    const delay = Math.max(session.expiresAtMs - this.now(), 0);
    session.timer = setTimeout(() => this.expireSession(session.id), delay);
    session.timer.unref?.();
  }

  private expireSession(sessionId: string): void {
    const active = this.activeSession;
    if (!active || active.id !== sessionId || active.deleting) return;
    const session = this.takeSession(sessionId);
    const token = this.getAccessToken()?.trim();
    if (!session || !token) return;
    void this.bestEffortDelete(session.location, token);
  }

  private async bestEffortDelete(location: URL, token: string): Promise<void> {
    try {
      await this.requestDelete(location, token);
    } catch {
      // Cleanup is best effort; no upstream response or credential is exposed.
    }
  }

  private async requestDelete(location: URL, token: string): Promise<void> {
    await this.request(location, {
      method: 'DELETE',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    }, (response) => {
      cancelBody(response);
      if (response.status === 401) throw new PlaygroundWhepError('token_expired', response.status);
      if (response.status === 429) throw new PlaygroundWhepError('rate_limited', response.status);
      if (!response.ok) throw new PlaygroundWhepError('api_error', response.status);
    });
  }

  private async request<T>(
    url: URL,
    init: RequestInit,
    consume: (response: Response) => Promise<T> | T,
    controller = new AbortController(),
  ): Promise<T> {
    if (controller.signal.aborted) throw new PlaygroundWhepError('network_error');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let cancelRequest: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancelRequest = () => {
        if (!timedOut) reject(new PlaygroundWhepError('network_error'));
      };
      controller.signal.addEventListener('abort', cancelRequest, { once: true });
    });
    const operation = (async () => {
      const response = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        cancelBody(response);
        throw new PlaygroundWhepError(timedOut ? 'timeout' : 'network_error');
      }
      return consume(response);
    })();
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new PlaygroundWhepError('timeout'));
      }, this.requestTimeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([operation, deadline, cancelled]);
    } catch (error) {
      if (error instanceof PlaygroundWhepError) throw error;
      if (timedOut) throw new PlaygroundWhepError('timeout');
      throw new PlaygroundWhepError('network_error');
    } finally {
      if (timer) clearTimeout(timer);
      if (cancelRequest) controller.signal.removeEventListener('abort', cancelRequest);
    }
  }
}
