import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { PlaygroundWhepClient, PlaygroundWhepClientError, type PlaygroundWhepApi } from './playground-whep-client';

const offerSdp = 'browser-offer-sdp-with-gathered-ice';
const answerSdp = 'validated-answer-sdp';
const sessionId = '1f96a7ad-1af9-44d2-8a5f-6d7e38f79d3e';

class FakePeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: RTCSessionDescription | null = null;
  onicegatheringstatechange: RTCPeerConnection['onicegatheringstatechange'] = null;
  ontrack: RTCPeerConnection['ontrack'] = null;
  addTransceiver = vi.fn(() => ({} as RTCRtpTransceiver));
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: offerSdp } as RTCSessionDescriptionInit));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
  });
  setRemoteDescription = vi.fn(async (_description: RTCSessionDescriptionInit) => undefined);
  close = vi.fn(() => undefined);

  finishIce(): void {
    this.iceGatheringState = 'complete';
    this.dispatchEvent(new Event('icegatheringstatechange'));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeSessionApi(overrides: Partial<PlaygroundWhepApi> = {}): PlaygroundWhepApi {
  return {
    create: vi.fn(async () => ({ sessionId, answerSdp, expiresAt: new Date(Date.now() + 60_000).toISOString() })),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('receive-only Playground WHEP browser client', () => {
  it('creates a video recvonly offer, waits for ICE, installs the answer, and deletes on stop', async () => {
    const peer = new FakePeerConnection();
    const api = makeSessionApi();
    const client = new PlaygroundWhepClient({ api, peerConnectionFactory: () => peer as unknown as RTCPeerConnection });
    const receivedStream = {} as MediaStream;
    const onStream = vi.fn();

    const session = await client.start(onStream);
    expect(peer.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    expect(api.create).toHaveBeenCalledWith(offerSdp, expect.any(AbortSignal));
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: answerSdp });
    peer.ontrack?.call(peer as unknown as RTCPeerConnection, { streams: [receivedStream] } as unknown as RTCTrackEvent);
    expect(onStream).toHaveBeenCalledWith(receivedStream);
    expect(session.sessionId).toBe(sessionId);

    await client.stop();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(api.delete).toHaveBeenCalledWith(sessionId);
  });

  it('waits for ICE gathering completion and enforces a client-side timeout', async () => {
    vi.useFakeTimers();
    const peer = new FakePeerConnection();
    peer.iceGatheringState = 'gathering';
    const api = makeSessionApi();
    const client = new PlaygroundWhepClient({ api, peerConnectionFactory: () => peer as unknown as RTCPeerConnection, iceTimeoutMs: 100 });
    const starting = client.start(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.create).not.toHaveBeenCalled();
    peer.finishIce();
    await expect(starting).resolves.toMatchObject({ sessionId });
    await client.stop();

    const stalledPeer = new FakePeerConnection();
    stalledPeer.iceGatheringState = 'gathering';
    const stalledApi = makeSessionApi();
    const stalledClient = new PlaygroundWhepClient({ api: stalledApi, peerConnectionFactory: () => stalledPeer as unknown as RTCPeerConnection, iceTimeoutMs: 100 });
    const stalledStart = stalledClient.start(() => undefined);
    const iceTimedOut = expect(stalledStart).rejects.toMatchObject({ code: 'ice_timeout' });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await iceTimedOut;
    expect(stalledApi.create).not.toHaveBeenCalled();
    expect(stalledPeer.close).toHaveBeenCalledOnce();
  });

  it('closes the peer and keeps token-expiry errors safe', async () => {
    const peer = new FakePeerConnection();
    const api = makeSessionApi({ create: vi.fn(async () => { throw new ApiError('Playground token expired.', 401, 'ring_playground_token_expired'); }) });
    const client = new PlaygroundWhepClient({ api, peerConnectionFactory: () => peer as unknown as RTCPeerConnection });
    await expect(client.start(() => undefined)).rejects.toMatchObject({ status: 401, message: 'Playground token expired.' });
    expect(peer.close).toHaveBeenCalledOnce();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('clears the expiry timer and deletes a created session when answer setup fails', async () => {
    vi.useFakeTimers();
    const peer = new FakePeerConnection();
    vi.spyOn(peer, 'setRemoteDescription').mockRejectedValue(new Error('peer setup failed'));
    const api = makeSessionApi();
    const onSessionExpired = vi.fn();
    const client = new PlaygroundWhepClient({
      api,
      peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
      onSessionExpired,
    });

    await expect(client.start(() => undefined)).rejects.toMatchObject({ code: 'peer_setup_failed' });
    expect(api.delete).toHaveBeenCalledWith(sessionId);
    expect(peer.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('deletes the remote session and notifies the view when the browser session expires', async () => {
    vi.useFakeTimers();
    const peer = new FakePeerConnection();
    const api = makeSessionApi({
      create: vi.fn(async () => ({ sessionId, answerSdp, expiresAt: new Date(Date.now() + 1_000).toISOString() })),
    });
    const onSessionExpired = vi.fn();
    const client = new PlaygroundWhepClient({
      api,
      peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
      onSessionExpired,
    });

    await client.start(() => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(peer.close).toHaveBeenCalledOnce();
    expect(api.delete).toHaveBeenCalledWith(sessionId);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('cancels an unfinished ICE gather when stop is called and does not send an offer', async () => {
    const peer = new FakePeerConnection();
    peer.iceGatheringState = 'gathering';
    const api = makeSessionApi();
    const client = new PlaygroundWhepClient({ api, peerConnectionFactory: () => peer as unknown as RTCPeerConnection, iceTimeoutMs: 10_000 });
    const starting = client.start(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    await client.stop();
    await expect(starting).rejects.toBeInstanceOf(PlaygroundWhepClientError);
    expect(api.create).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });
});
