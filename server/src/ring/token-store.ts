import type { Db } from '../db/index.js';
import { decryptToken, encryptToken } from './token-crypto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface EncryptedTokenRow {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: string;
}

interface TokenClaimRow {
  ringAccountId: string | null;
}

export class RingTokenStore {
  constructor(private readonly db: Db, private readonly encryptionKey: string | null) {}

  savePair(tokens: TokenPair): void {
    if (!this.encryptionKey) throw new Error('Ring token encryption is not configured.');
    const accessTokenEncrypted = encryptToken(tokens.accessToken, this.encryptionKey);
    const refreshTokenEncrypted = encryptToken(tokens.refreshToken, this.encryptionKey);
    const now = new Date().toISOString();
    const write = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO ring_tokens (id, access_token_encrypted, refresh_token_encrypted, expires_at, updated_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET access_token_encrypted = excluded.access_token_encrypted,
          refresh_token_encrypted = excluded.refresh_token_encrypted,
          expires_at = excluded.expires_at, updated_at = excluded.updated_at`)
        .run(accessTokenEncrypted, refreshTokenEncrypted, tokens.expiresAt, now);
      this.db.prepare('UPDATE ring_link_state SET last_refresh_error = NULL, updated_at = ? WHERE id = 1').run(now);
    });
    write();
  }

  saveUnclaimedPair(tokens: TokenPair, ringAccountId: string): void {
    if (!this.encryptionKey) throw new Error('Ring token encryption is not configured.');
    if (!ringAccountId.trim() || ringAccountId.length > 300) throw new Error('Ring account ID is invalid.');

    const accessTokenEncrypted = encryptToken(tokens.accessToken, this.encryptionKey);
    const refreshTokenEncrypted = encryptToken(tokens.refreshToken, this.encryptionKey);
    const now = new Date().toISOString();
    const write = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT ring_account_id AS ringAccountId FROM ring_tokens WHERE id = 1')
        .get() as TokenClaimRow | undefined;
      if (existing?.ringAccountId && existing.ringAccountId !== ringAccountId) {
        throw new Error('A different Ring account already occupies the single-token store.');
      }

      this.db.prepare(`INSERT INTO ring_tokens
        (id, access_token_encrypted, refresh_token_encrypted, expires_at, ring_account_id, claimed_at, updated_at)
        VALUES (1, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET access_token_encrypted = excluded.access_token_encrypted,
          refresh_token_encrypted = excluded.refresh_token_encrypted, expires_at = excluded.expires_at,
          ring_account_id = excluded.ring_account_id, claimed_at = NULL, updated_at = excluded.updated_at`)
        .run(accessTokenEncrypted, refreshTokenEncrypted, tokens.expiresAt, ringAccountId, now);
      this.db.prepare('UPDATE ring_link_state SET linked_at = NULL, last_refresh_error = NULL, updated_at = ? WHERE id = 1')
        .run(now);
    });
    write();
  }

  getUnclaimedAccountId(): string | null {
    const row = this.db.prepare(`SELECT ring_account_id AS ringAccountId FROM ring_tokens
      WHERE id = 1 AND ring_account_id IS NOT NULL AND claimed_at IS NULL`).get() as TokenClaimRow | undefined;
    return row?.ringAccountId ?? null;
  }

  isUnclaimedForAccount(ringAccountId: string): boolean {
    return this.getUnclaimedAccountId() === ringAccountId;
  }

  claimUnclaimedPair(ringAccountId: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare(`UPDATE ring_tokens SET claimed_at = ?, updated_at = ?
      WHERE id = 1 AND ring_account_id = ? AND claimed_at IS NULL`).run(now, now, ringAccountId);
    return result.changes === 1;
  }

  isLinkedForAccount(ringAccountId: string): boolean {
    const token = this.db.prepare(`SELECT 1 AS linked FROM ring_tokens
      WHERE id = 1 AND ring_account_id = ? AND claimed_at IS NOT NULL`).get(ringAccountId);
    if (!token) return false;
    const state = this.db.prepare('SELECT linked_at AS linkedAt FROM ring_link_state WHERE id = 1')
      .get() as { linkedAt: string | null } | undefined;
    return Boolean(state?.linkedAt);
  }

  getPair(): TokenPair | null {
    if (!this.encryptionKey) return null;
    const row = this.db.prepare(`SELECT access_token_encrypted AS accessTokenEncrypted,
      refresh_token_encrypted AS refreshTokenEncrypted, expires_at AS expiresAt
      FROM ring_tokens WHERE id = 1`).get() as EncryptedTokenRow | undefined;
    if (!row) return null;
    return {
      accessToken: decryptToken(row.accessTokenEncrypted, this.encryptionKey),
      refreshToken: decryptToken(row.refreshTokenEncrypted, this.encryptionKey),
      expiresAt: row.expiresAt,
    };
  }

  markRefreshSuccess(): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE ring_link_state SET last_refresh_at = ?, last_refresh_error = NULL, updated_at = ? WHERE id = 1')
      .run(now, now);
  }

  markRefreshFailure(): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE ring_link_state SET last_refresh_error = ?, updated_at = ? WHERE id = 1')
      .run('Token refresh failed; check Ring configuration and connectivity.', now);
  }
}
