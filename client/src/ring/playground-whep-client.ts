import { apiRequest, ApiError } from '../api';

const ICE_GATHERING_TIMEOUT_MS = 10_000;
const MAX_CLIENT_SESSION_MS = 5 * 60_000;

export interface PlaygroundWhepSessionResponse {
  sessionId: string;
  answerSdp: string;
  expiresAt: string;
}

export interface PlaygroundWhepApi {
  create(offerSdp: string, signal?: AbortSignal): Promise<PlaygroundWhepSessionResponse>;
  delete(sessionId: string): Promise<void>;
}

export type PlaygroundPeerConnectionFactory = () => RTCPeerConnection;

export class PlaygroundWhepClientError extends Error {
  constructor(readonly code: 'peer_unavailable' | 'ice_timeout' | 'cancelled' | 'peer_setup_failed') {
    const messages = {
      peer_unavailable: 'This browser does not support the receive-only live view.',
      ice_timeout: 'The browser could not finish preparing a live-view connection. Try again.',
      cancelled: 'Playground live view was stopped.',
      peer_setup_failed: 'Playground live view could not be started. Check the browser connection and try again.',
    };
    super(messages[code]);
    this.name = 'PlaygroundWhepClientError';
  }
}

const defaultApi: PlaygroundWhepApi = {
  create: (offerSdp, signal) => apiRequest<PlaygroundWhepSessionResponse>('/api/ring/playground/whep/session', {
    method: 'POST',
    headers: { 'content-type': 'application/sdp' },
    body: offerSdp,
    ...(signal ? { signal } : {}),
  }),
  delete: async (sessionId) => {
    await apiRequest<void>('/api/ring/playground/whep/session', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  },
};

function waitForIceGathering(connection: RTCPeerConnection, signal: AbortSignal, timeoutMs: number): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => finish(new PlaygroundWhepClientError('cancelled'));
    const onStateChange = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    const finish = (error?: PlaygroundWhepClientError) => {
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', onStateChange);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new PlaygroundWhepClientError('ice_timeout')), timeoutMs);
    connection.addEventListener('icegatheringstatechange', onStateChange);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else if (connection.iceGatheringState === 'complete') finish();
  });
}

export class PlaygroundWhepClient {
  private readonly api: PlaygroundWhepApi;
  private readonly createPeerConnection: PlaygroundPeerConnectionFactory;
  private readonly iceTimeoutMs: number;
  private readonly hasInjectedPeerFactory: boolean;
  private readonly onSessionExpired: (() => void) | undefined;
  private peerConnection: RTCPeerConnection | null = null;
  private startController: AbortController | null = null;
  private sessionId: string | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private starting = false;

  constructor(options: {
    api?: PlaygroundWhepApi;
    peerConnectionFactory?: PlaygroundPeerConnectionFactory;
    iceTimeoutMs?: number;
    onSessionExpired?: () => void;
  } = {}) {
    this.api = options.api ?? defaultApi;
    this.hasInjectedPeerFactory = options.peerConnectionFactory !== undefined;
    this.createPeerConnection = options.peerConnectionFactory ?? defaultPeerFactory;
    this.iceTimeoutMs = Math.min(Math.max(options.iceTimeoutMs ?? ICE_GATHERING_TIMEOUT_MS, 100), ICE_GATHERING_TIMEOUT_MS);
    this.onSessionExpired = options.onSessionExpired;
  }

  async start(onStream: (stream: MediaStream) => void): Promise<PlaygroundWhepSessionResponse> {
    if (this.starting || this.peerConnection || this.sessionId) throw new PlaygroundWhepClientError('peer_setup_failed');
    if (typeof RTCPeerConnection === 'undefined' && !this.hasInjectedPeerFactory) throw new PlaygroundWhepClientError('peer_unavailable');
    this.starting = true;
    const controller = new AbortController();
    this.startController = controller;
    let peer: RTCPeerConnection | null = null;

    try {
      peer = this.createPeerConnection();
      this.peerConnection = peer;
      peer.addTransceiver('video', { direction: 'recvonly' });
      peer.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream && !controller.signal.aborted) onStream(stream);
      };

      const offer = await peer.createOffer();
      if (controller.signal.aborted) throw new PlaygroundWhepClientError('cancelled');
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer, controller.signal, this.iceTimeoutMs);
      const offerSdp = peer.localDescription?.sdp;
      if (!offerSdp || controller.signal.aborted) throw new PlaygroundWhepClientError('cancelled');

      const session = await this.api.create(offerSdp, controller.signal);
      if (!session || typeof session.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(session.sessionId)
        || typeof session.answerSdp !== 'string' || typeof session.expiresAt !== 'string') {
        throw new PlaygroundWhepClientError('peer_setup_failed');
      }
      if (controller.signal.aborted) {
        await this.api.delete(session.sessionId).catch(() => undefined);
        throw new PlaygroundWhepClientError('cancelled');
      }

      this.sessionId = session.sessionId;
      const reportedExpiry = Date.parse(session.expiresAt);
      const remainingMs = Number.isFinite(reportedExpiry)
        ? Math.min(Math.max(reportedExpiry - Date.now(), 0), MAX_CLIENT_SESSION_MS)
        : MAX_CLIENT_SESSION_MS;
      this.expiryTimer = setTimeout(() => {
        void this.stop().then(() => this.onSessionExpired?.(), () => this.onSessionExpired?.()).catch(() => undefined);
      }, remainingMs);
      await peer.setRemoteDescription({ type: 'answer', sdp: session.answerSdp });
      if (controller.signal.aborted) throw new PlaygroundWhepClientError('cancelled');
      return session;
    } catch (error) {
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
      const sessionId = this.sessionId;
      this.sessionId = null;
      if (sessionId) await this.api.delete(sessionId).catch(() => undefined);
      if (peer) {
        peer.ontrack = null;
        peer.close();
      }
      if (this.peerConnection === peer) this.peerConnection = null;
      if (controller.signal.aborted) throw new PlaygroundWhepClientError('cancelled');
      if (error instanceof ApiError || error instanceof PlaygroundWhepClientError) throw error;
      throw new PlaygroundWhepClientError('peer_setup_failed');
    } finally {
      if (this.startController === controller) this.startController = null;
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    this.startController?.abort();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const peer = this.peerConnection;
    this.peerConnection = null;
    if (peer) {
      peer.ontrack = null;
      peer.close();
    }
    const sessionId = this.sessionId;
    this.sessionId = null;
    if (sessionId) await this.api.delete(sessionId);
  }

}

const defaultPeerFactory: PlaygroundPeerConnectionFactory = () => new RTCPeerConnection();
