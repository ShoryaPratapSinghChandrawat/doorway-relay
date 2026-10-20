import { createHmac, timingSafeEqual } from 'node:crypto';

export interface NonceInput {
  time: string;
  accountId: string;
  nonce: string;
}

const MAX_NONCE_AGE_MS = 10 * 60 * 1000;

export function createAccountNonce(time: string, accountId: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(`${time}:${accountId}`).digest('base64url');
}

export function verifyAccountNonce(input: NonceInput, signingKey: string, nowMilliseconds = Date.now()): boolean {
  if (!/^[1-9]\d{12}$/.test(input.time) || !input.accountId || input.accountId.length > 300) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.nonce)) return false;
  const issuedAtMilliseconds = Number(input.time);
  const ageMilliseconds = nowMilliseconds - issuedAtMilliseconds;
  if (!Number.isSafeInteger(issuedAtMilliseconds) || ageMilliseconds < 0 || ageMilliseconds > MAX_NONCE_AGE_MS) return false;
  const expected = Buffer.from(createAccountNonce(input.time, input.accountId, signingKey));
  const supplied = Buffer.from(input.nonce);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
