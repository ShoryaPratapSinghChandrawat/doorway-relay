import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Play, Square } from 'lucide-react';
import { ApiError } from '../api';
import { PlaygroundWhepClient } from './playground-whep-client';

type ViewState = 'idle' | 'starting' | 'live' | 'stopping' | 'error';

export function PlaygroundLiveView({ enabled, selectedDeviceId, onTokenExpired }: {
  enabled: boolean;
  selectedDeviceId: string | null;
  onTokenExpired?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<PlaygroundWhepClient | null>(null);
  const mountedRef = useRef(false);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [message, setMessage] = useState('Stopped. No video is being requested or stored.');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setViewState('idle');
    setMessage(enabled && selectedDeviceId
      ? 'Stopped. Start a receive-only Playground simulation when ready.'
      : 'Choose a Playground device to enable the receive-only simulation.');
    const previousClient = clientRef.current;
    if (previousClient) {
      clientRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      void previousClient.stop().catch(() => undefined);
    }
    return () => {
      const client = clientRef.current;
      if (client) {
        clientRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        void client.stop().catch(() => undefined);
      }
    };
  }, [enabled, selectedDeviceId]);

  async function startView() {
    if (!enabled || !selectedDeviceId || clientRef.current || viewState === 'starting' || viewState === 'stopping') return;
    const client = new PlaygroundWhepClient({
      onSessionExpired: () => {
        if (!mountedRef.current || clientRef.current !== client) return;
        clientRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setViewState('idle');
        setMessage('Playground simulation session expired and was closed. No video was recorded or stored.');
      },
    });
    clientRef.current = client;
    setViewState('starting');
    setMessage('Preparing a receive-only video session…');
    if (videoRef.current) videoRef.current.srcObject = null;
    try {
      const session = await client.start((stream) => {
        if (clientRef.current !== client || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      });
      if (!mountedRef.current || clientRef.current !== client) {
        await client.stop().catch(() => undefined);
        return;
      }
      setViewState('live');
      setMessage(`Playground simulation active until ${new Date(session.expiresAt).toLocaleTimeString()}.`);
    } catch (error) {
      const stillCurrent = clientRef.current === client;
      if (stillCurrent) clientRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      await client.stop().catch(() => undefined);
      if (!stillCurrent || !mountedRef.current) return;
      if (error instanceof ApiError && error.status === 401) onTokenExpired?.();
      setViewState('error');
      setMessage(error instanceof Error ? error.message : 'Playground live view could not be started.');
    }
  }

  async function stopView() {
    const client = clientRef.current;
    if (!client) {
      if (videoRef.current) videoRef.current.srcObject = null;
      setViewState('idle');
      setMessage('Stopped. No video is being requested or stored.');
      return;
    }
    setViewState('stopping');
    clientRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    try {
      await client.stop();
      if (!mountedRef.current) return;
      setViewState('idle');
      setMessage('Stopped. The receive-only session was closed; no video was recorded or stored.');
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof ApiError && error.status === 401) onTokenExpired?.();
      setViewState('error');
      setMessage(error instanceof Error ? error.message : 'The live-view session could not be closed cleanly.');
    }
  }

  const busy = viewState === 'starting' || viewState === 'stopping';
  return (
    <section className="playground-live-panel" aria-labelledby="playground-live-title">
      <div className="playground-live-heading">
        <div>
          <p className="eyebrow">PLAYGROUND SIMULATION</p>
          <h3 id="playground-live-title">Receive-only live view</h3>
          <p>Browser video only. This is simulated Playground media—not a real Ring event or production connection.</p>
        </div>
        <span className="playground-simulation-tag">Simulation</span>
      </div>
      <div className={`playground-live-status ${viewState}`} role="status" aria-live="polite">
        {viewState === 'live' ? <CircleCheck size={15} aria-hidden="true" /> : viewState === 'error' ? <CircleAlert size={15} aria-hidden="true" /> : null}
        <span>{message}</span>
      </div>
      <div className="playground-video-frame">
        <video ref={videoRef} autoPlay playsInline muted controls={false} disablePictureInPicture aria-label="Receive-only Ring Developer Playground simulation video" />
        {viewState !== 'live' && <div className="playground-video-placeholder">{viewState === 'starting' ? 'Preparing simulation…' : 'Video is stopped'}</div>}
      </div>
      <div className="playground-live-actions">
        <button className="button button-primary button-small" type="button" onClick={() => void startView()} disabled={!enabled || !selectedDeviceId || busy || viewState === 'live'}>
          <Play size={14} aria-hidden="true" />{viewState === 'starting' ? 'Starting…' : 'Start Playground simulation'}
        </button>
        <button className="button button-secondary button-small" type="button" onClick={() => void stopView()} disabled={viewState === 'idle' || viewState === 'stopping'}>
          <Square size={13} aria-hidden="true" />{viewState === 'stopping' ? 'Stopping…' : 'Stop live view'}
        </button>
      </div>
      <p className="playground-live-boundary">Receive-only; no recording, frame capture, snapshots, or media storage. WebRTC gathers local host candidates only without external STUN/TURN queries. Keep the official Ring watermark visible and unaltered. Stop the view when finished.</p>
    </section>
  );
}
