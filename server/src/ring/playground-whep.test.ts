import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYGROUND_WHEP_MAX_SDP_BYTES, PlaygroundWhepError, PlaygroundWhepRelay } from './playground-whep.js';

const token = 'mock-playground-token-not-for-output';
const deviceId = 'opaque-device-for-whep';
const endpoint = `https://api.amazonvision.com/v1/devices/${deviceId}/media/streaming/whep/sessions`;
const location = `${endpoint}/session-resource-1`;
const offerSdp = [
  'v=0',
  'o=- 123456 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:offerfrag',
  'a=ice-pwd:offerpassword',
  'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
  'a=recvonly',
  '',
].join('\r\n');
const answerSdp = offerSdp
  .replace('a=ice-ufrag:offerfrag', 'a=ice-ufrag:answerfrag')
  .replace('a=ice-pwd:offerpassword', 'a=ice-pwd:answerpassword')
  .replace('a=recvonly', 'a=sendonly');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sdpResponse(body = answerSdp, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 201,
    headers: { 'content-type': 'application/sdp', location, ...headers },
  });
}

describe('Playground WHEP relay', () => {
  it('posts one bounded receive-only SDP offer to the official device endpoint and hides Location', async () => {
    const requests: Array<{ url: string; method: string; authorization: string | null; contentType: string | null; body: unknown; redirect: RequestInit['redirect'] }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
        contentType: new Headers(init?.headers).get('content-type'),
        body: init?.body,
        redirect: init?.redirect,
      });
      return sdpResponse();
    });
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });

    const session = await relay.createSession(deviceId, offerSdp, token);
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(session.answerSdp).toBe(answerSdp);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(requests).toEqual([{
      url: endpoint,
      method: 'POST',
      authorization: `Bearer ${token}`,
      contentType: 'application/sdp',
      body: offerSdp,
      redirect: 'error',
    }]);
    expect(JSON.stringify(session)).not.toContain(location);
    expect(JSON.stringify(session)).not.toContain(token);
    expect(relay.hasActiveSession).toBe(true);
    await relay.deleteSession(session.sessionId, token);
    expect(relay.hasActiveSession).toBe(false);
    expect(requests[1]).toMatchObject({ url: location, method: 'DELETE', authorization: `Bearer ${token}` });
    expect(JSON.stringify(requests[1])).not.toContain(answerSdp);
    await relay.deleteSession(session.sessionId, token);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects non-receive-only, non-video, multi-media, incomplete, malformed, and oversized offers before contacting Ring', async () => {
    const fetcher = vi.fn(async () => sdpResponse());
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
    const sendOffer = offerSdp.replace('a=recvonly', 'a=sendrecv');
    const crlf = String.fromCharCode(13, 10);
    const missingFingerprintOffer = offerSdp.split(crlf).filter((line) => !line.startsWith('a=fingerprint:')).join(crlf);
    await expect(relay.createSession(deviceId, sendOffer, token)).rejects.toMatchObject({ code: 'invalid_offer' });
    await expect(relay.createSession(deviceId, offerSdp.replaceAll('\r\n', '\n'), token)).rejects.toMatchObject({ code: 'invalid_offer' });
    await expect(relay.createSession(deviceId, `${offerSdp}${'x'.repeat(64 * 1024)}`, token)).rejects.toMatchObject({ code: 'invalid_offer' });
    await expect(relay.createSession(deviceId, offerSdp.replace('m=video', 'm=audio'), token)).rejects.toMatchObject({ code: 'invalid_offer' });
    await expect(relay.createSession(deviceId, missingFingerprintOffer, token)).rejects.toMatchObject({ code: 'invalid_offer' });
    const multipleMediaOffer = `${offerSdp}m=audio 9 UDP/TLS/RTP/SAVPF 97${String.fromCharCode(13, 10)}`;
    await expect(relay.createSession(deviceId, multipleMediaOffer, token)).rejects.toMatchObject({ code: 'invalid_offer' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an upstream Location outside the official WHEP session resource without contacting it', async () => {
    const fetcher = vi.fn(async () => sdpResponse(answerSdp, { location: 'https://evil.example/session/secret' }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
    await expect(relay.createSession(deviceId, offerSdp, token)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(relay.hasActiveSession).toBe(false);
  });

  it('rejects a session Location scoped to a different selected device', async () => {
    const otherDeviceLocation = `${endpoint.replace(deviceId, 'different-device')}/session-resource-2`;
    const fetcher = vi.fn(async () => sdpResponse(answerSdp, { location: otherDeviceLocation }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
    await expect(relay.createSession(deviceId, offerSdp, token)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(relay.hasActiveSession).toBe(false);
  });

  it('caps upstream SDP by advertised and streamed byte length and deletes a validated remote session', async () => {
    const oversizedResponses = [
      sdpResponse(answerSdp, { 'content-length': String(PLAYGROUND_WHEP_MAX_SDP_BYTES + 1) }),
      new Response('x'.repeat(PLAYGROUND_WHEP_MAX_SDP_BYTES + 1), {
        status: 201,
        headers: { 'content-type': 'application/sdp', location },
      }),
    ];
    for (const oversizedResponse of oversizedResponses) {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(oversizedResponse)
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
      await expect(relay.createSession(deviceId, offerSdp, token)).rejects.toMatchObject({ code: 'invalid_response' });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]?.[1]?.method).toBe('DELETE');
      expect(relay.hasActiveSession).toBe(false);
    }
  });

  it('maps Ring 401 to a safe token-expired error and never echoes upstream response text', async () => {
    const fetcher = vi.fn(async () => new Response('private-upstream-token-and-body', { status: 401 }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
    let failure: unknown;
    try { await relay.createSession(deviceId, offerSdp, token); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PlaygroundWhepError);
    expect(failure).toMatchObject({ code: 'token_expired', httpStatus: 401 });
    expect((failure as Error).message).not.toContain('private-upstream-token-and-body');
    expect((failure as Error).message).not.toContain(token);
    expect(relay.hasActiveSession).toBe(false);
  });

  it('rejects invalid SDP answers and makes a best-effort DELETE to the validated location', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(sdpResponse(answerSdp.replace('a=sendonly', 'a=recvonly')))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
    await expect(relay.createSession(deviceId, offerSdp, token)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(location);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE', redirect: 'error' });
    expect(relay.hasActiveSession).toBe(false);
  });

  it('keeps a failed upstream DELETE retryable until cleanup succeeds or the session expires', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(sdpResponse())
      .mockResolvedValueOnce(new Response('private expired-token body', { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher });
    const session = await relay.createSession(deviceId, offerSdp, token);
    await expect(relay.deleteSession(session.sessionId, token)).rejects.toMatchObject({ code: 'token_expired' });
    expect(relay.hasActiveSession).toBe(true);
    await relay.deleteSession(session.sessionId, token);
    expect(relay.hasActiveSession).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('bounds upstream requests and aborts a stalled fetch', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher, requestTimeoutMs: 1_000 });
    const attempt = relay.createSession(deviceId, offerSdp, token);
    const timedOut = expect(attempt).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1_000);
    await timedOut;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('aborts and waits for an in-flight creation during server shutdown', async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', { fetcher, getAccessToken: () => token });
    const creation = relay.createSession(deviceId, offerSdp, token);
    const cancelled = expect(creation).rejects.toMatchObject({ code: 'network_error' });
    await relay.closeAll();
    await cancelled;
    expect(signal?.aborted).toBe(true);
    expect(relay.hasActiveSession).toBe(false);
  });

  it('allows only one active session and deletes it on expiry, shutdown, or explicit stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(sdpResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(sdpResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(sdpResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const relay = new PlaygroundWhepRelay('https://api.amazonvision.com', {
      fetcher,
      getAccessToken: () => token,
      sessionTtlMs: 1_000,
    });

    const expires = await relay.createSession(deviceId, offerSdp, token);
    await expect(relay.createSession(deviceId, offerSdp, token)).rejects.toMatchObject({ code: 'session_active' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(relay.hasActiveSession).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('DELETE');

    const shutdownSession = await relay.createSession(deviceId, offerSdp, token);
    expect(relay.hasActiveSession).toBe(true);
    await relay.closeAll();
    expect(relay.hasActiveSession).toBe(false);
    expect(fetcher.mock.calls[3]?.[1]?.method).toBe('DELETE');

    const manualSession = await relay.createSession(deviceId, offerSdp, token);
    await relay.deleteSession(manualSession.sessionId, token);
    expect(relay.hasActiveSession).toBe(false);
    expect(fetcher.mock.calls[5]?.[1]?.method).toBe('DELETE');
    expect(shutdownSession.sessionId).not.toBe(expires.sessionId);
  });
});
