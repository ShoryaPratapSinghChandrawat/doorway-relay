import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { RingTokenStore, TokenPair } from './token-store.js';
import { readRingAccountId } from './account-link.js';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export const RING_CODE_EXCHANGE_TIMEOUT_MS = 55_000;
export const RING_TOKEN_REFRESH_TIMEOUT_MS = 12_000;

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
}
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<FetchResponseLike>;

export class RingOAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly tokenStore: RingTokenStore,
    private readonly fetcher: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async exchangeAuthorizationCode(code: string): Promise<TokenPair> {
    if (!this.config.ringOAuthContractVerified) {
      throw new Error('Ring OAuth exchange is disabled until the current official token contract is verified.');
    }
    if (!this.config.ringTokenUrl || !this.config.ringClientId || !this.config.ringClientSecret) {
      throw new Error('Ring OAuth exchange is not configured; set the Ring token URL and server-side credentials.');
    }
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.ringClientId,
      code,
      client_secret: this.config.ringClientSecret,
    });

    return this.withAuthorizationCodeDeadline(async (signal) => {
      const tokens = await this.requestTokens(form, signal);
      const profileResponse = await this.fetcher(new URL('/v1/users/me', `${this.config.ringApiBaseUrl}/`), {
        method: 'GET',
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        redirect: 'error',
        signal,
      });
      if (!profileResponse.ok) throw new Error(`Ring user-profile request failed with HTTP ${profileResponse.status}.`);
      const ringAccountId = readRingAccountId(await profileResponse.json());
      if (!ringAccountId) throw new Error('Ring user-profile response did not include the account ID.');
      this.tokenStore.saveUnclaimedPair(tokens, ringAccountId);
      return tokens;
    });
  }

  async refresh(): Promise<TokenPair> {
    if (!this.config.ringOAuthContractVerified) {
      throw new Error('Ring token refresh is disabled until the current official token contract is verified.');
    }
    if (!this.config.ringTokenUrl || !this.config.ringClientId || !this.config.ringClientSecret) {
      throw new Error('Ring token refresh is not configured.');
    }
    const existing = this.tokenStore.getPair();
    if (!existing) throw new Error('No encrypted Ring refresh token is stored.');
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken,
      client_id: this.config.ringClientId,
      client_secret: this.config.ringClientSecret,
    });
    try {
      const tokens = await this.withDeadline(RING_TOKEN_REFRESH_TIMEOUT_MS, (signal) => this.requestAndSave(form, signal));
      this.tokenStore.markRefreshSuccess();
      return tokens;
    } catch (error) {
      this.tokenStore.markRefreshFailure();
      throw error;
    }
  }

  async refreshIfDue(bufferMs = 5 * 60 * 1000): Promise<boolean> {
    const pair = this.tokenStore.getPair();
    if (!pair || Date.parse(pair.expiresAt) - this.now() > bufferMs) return false;
    await this.refresh();
    return true;
  }

  private withAuthorizationCodeDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return this.withDeadline(RING_CODE_EXCHANGE_TIMEOUT_MS, operation);
  }

  private async withDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      return await operation(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Ring OAuth request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestTokens(form: URLSearchParams, signal?: AbortSignal): Promise<TokenPair> {
    const response = await this.fetcher(this.config.ringTokenUrl!, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'error',
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`Ring OAuth request failed with HTTP ${response.status}.`);
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Ring OAuth response did not match the expected token shape.');
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAt: new Date(this.now() + parsed.data.expires_in * 1000).toISOString(),
    };
  }

  private async requestAndSave(form: URLSearchParams, signal: AbortSignal): Promise<TokenPair> {
    const tokens = await this.requestTokens(form, signal);
    // Both rotating tokens are encrypted and committed together; the old refresh token is never kept as a fallback.
    this.tokenStore.savePair(tokens);
    return tokens;
  }
}
