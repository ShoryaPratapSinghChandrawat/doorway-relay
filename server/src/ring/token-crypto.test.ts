import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './token-crypto.js';

describe('encrypted token envelope', () => {
  it('round-trips a token and detects tampering', () => {
    const key = 'b'.repeat(64);
    const ciphertext = encryptToken('sensitive-refresh-token', key);
    expect(ciphertext).not.toContain('sensitive-refresh-token');
    expect(decryptToken(ciphertext, key)).toBe('sensitive-refresh-token');
    const parts = ciphertext.split('.');
    const tag = parts[2]!;
    parts[2] = `${tag[0] === 'A' ? 'B' : 'A'}${tag.slice(1)}`;
    expect(() => decryptToken(parts.join('.'), key)).toThrow();
  });
});
