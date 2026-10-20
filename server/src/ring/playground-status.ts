export type PlaygroundConnectionState =
  | 'no_token'
  | 'source_mismatch'
  | 'token_present_unverified'
  | 'last_success'
  | 'token_expired'
  | 'api_error';

export interface PlaygroundStatusView {
  state: PlaygroundConnectionState;
  tokenPresent: boolean;
  source: 'ring_playground' | null;
  lastSuccessfulCallAt: string | null;
  lastDeviceSummary: string | null;
  errorCode: string | null;
  historyShapeVerified: false;
  historySyncAvailable: false;
  historySyncDisabledReason: string;
}

export class PlaygroundStatusTracker {
  private lastSuccessfulCallAt: string | null = null;
  private lastDeviceSummary: string | null = null;
  private errorCode: string | null = null;
  private expired = false;

  recordSuccess(at = new Date().toISOString(), deviceSummary: string | null = null): void {
    this.lastSuccessfulCallAt = at;
    this.lastDeviceSummary = deviceSummary;
    this.errorCode = null;
    this.expired = false;
  }

  reset(): void {
    this.lastSuccessfulCallAt = null;
    this.lastDeviceSummary = null;
    this.errorCode = null;
    this.expired = false;
  }

  recordExpired(): void {
    this.expired = true;
    this.errorCode = 'token_expired';
  }

  recordApiError(code: string): void {
    this.expired = false;
    this.errorCode = code;
  }

  read(token: string | null, eventSource: 'ring_live' | 'ring_playground' | null): PlaygroundStatusView {
    const tokenPresent = Boolean(token?.trim());
    let state: PlaygroundConnectionState;
    if (!tokenPresent) state = 'no_token';
    else if (eventSource !== 'ring_playground') state = 'source_mismatch';
    else if (this.expired) state = 'token_expired';
    else if (this.errorCode) state = 'api_error';
    else if (this.lastSuccessfulCallAt) state = 'last_success';
    else state = 'token_present_unverified';

    return {
      state,
      tokenPresent,
      source: eventSource === 'ring_playground' ? 'ring_playground' : null,
      lastSuccessfulCallAt: this.lastSuccessfulCallAt,
      lastDeviceSummary: this.lastDeviceSummary,
      errorCode: state === 'api_error' || state === 'token_expired' ? this.errorCode : null,
      historyShapeVerified: false,
      historySyncAvailable: false,
      historySyncDisabledReason: 'Run npm run ring:probe and review the real response shape before enabling Event History ingestion.',
    };
  }
}
