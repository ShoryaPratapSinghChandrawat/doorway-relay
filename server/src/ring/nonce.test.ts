import { describe, expect, it } from 'vitest';
import { createAccountNonce, verifyAccountNonce } from './nonce.js';

const key = 'ring-nonce-test-key';
const accountId = 'account-opaque-123';
const nowMilliseconds = 1_800_000_000_000;

describe('Ring account-link nonce', () => {
  it('accepts a correct millisecond timestamp within the 600-second window', () => {
    const time = String(nowMilliseconds - 300_000);
    const nonce = createAccountNonce(time, accountId, key);
    expect(verifyAccountNonce({ time, accountId, nonce }, key, nowMilliseconds)).toBe(true);
  });

  it('accepts the exact 600-second boundary and rejects older timestamps', () => {
    const boundaryTime = String(nowMilliseconds - 600_000);
    const boundaryNonce = createAccountNonce(boundaryTime, accountId, key);
    expect(verifyAccountNonce({ time: boundaryTime, accountId, nonce: boundaryNonce }, key, nowMilliseconds)).toBe(true);

    const expiredTime = String(nowMilliseconds - 600_001);
    const expiredNonce = createAccountNonce(expiredTime, accountId, key);
    expect(verifyAccountNonce({ time: expiredTime, accountId, nonce: expiredNonce }, key, nowMilliseconds)).toBe(false);
  });

  it('rejects a wrong account, tampered nonce, future timestamp, and seconds timestamp', () => {
    const time = String(nowMilliseconds - 10_000);
    const nonce = createAccountNonce(time, accountId, key);
    const tamperedNonce = `${nonce.slice(0, -1)}${nonce.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyAccountNonce({ time, accountId: 'different-account', nonce }, key, nowMilliseconds)).toBe(false);
    expect(verifyAccountNonce({ time, accountId, nonce: tamperedNonce }, key, nowMilliseconds)).toBe(false);

    const futureTime = String(nowMilliseconds + 1);
    const futureNonce = createAccountNonce(futureTime, accountId, key);
    expect(verifyAccountNonce({ time: futureTime, accountId, nonce: futureNonce }, key, nowMilliseconds)).toBe(false);

    const secondsTime = String(Math.floor(nowMilliseconds / 1000));
    const secondsNonce = createAccountNonce(secondsTime, accountId, key);
    expect(verifyAccountNonce({ time: secondsTime, accountId, nonce: secondsNonce }, key, nowMilliseconds)).toBe(false);
  });

  it('rejects malformed millisecond timestamps and malformed nonces', () => {
    const time = String(nowMilliseconds - 1_000);
    const nonce = createAccountNonce(time, accountId, key);
    expect(verifyAccountNonce({ time: '1800000000', accountId, nonce }, key, nowMilliseconds)).toBe(false);
    expect(verifyAccountNonce({ time: '01800000000000', accountId, nonce }, key, nowMilliseconds)).toBe(false);
    expect(verifyAccountNonce({ time, accountId, nonce: 'short' }, key, nowMilliseconds)).toBe(false);
  });
});
