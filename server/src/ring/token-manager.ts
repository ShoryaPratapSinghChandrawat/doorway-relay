import type { AppConfig } from '../config.js';
import type { RingTokenStore } from './token-store.js';
import type { RingOAuthService } from './oauth.js';
import type { RingTokenProvider } from './client.js';

export class RingTokenManager implements RingTokenProvider {
  constructor(
    private readonly config: AppConfig,
    private readonly store: RingTokenStore,
    private readonly oauth: RingOAuthService,
  ) {}

  async accessToken(): Promise<string | null> {
    if (this.config.ringAccessToken) return this.config.ringAccessToken;
    const pair = this.store.getPair();
    if (!pair) return null;
    if (Date.parse(pair.expiresAt) <= Date.now() + 5 * 60_000) {
      const refreshed = await this.oauth.refresh();
      return refreshed.accessToken;
    }
    return pair.accessToken;
  }

  async refreshAfterUnauthorized(): Promise<string | null> {
    if (this.config.ringAccessToken && !this.store.getPair()) return null;
    const refreshed = await this.oauth.refresh();
    return refreshed.accessToken;
  }
}
