import type { RingPartnerClient } from './client.js';

export interface RingHistoryPollerOptions {
  deviceId: string;
  intervalMs: number;
  client: RingPartnerClient;
  onHistory: (payload: unknown) => Promise<void> | void;
  onError?: () => void;
}

/** Opt-in fallback only. A Ring webhook registration is still required by the supplied integration brief. */
export class RingHistoryPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: RingHistoryPollerOptions) {}

  start(): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.options.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    try {
      const payload = await this.options.client.getEventHistory(this.options.deviceId);
      await this.options.onHistory(payload);
    } catch {
      this.options.onError?.();
    }
  }
}
