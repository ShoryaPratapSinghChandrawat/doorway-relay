import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(password, salt, KEY_BYTES, { N: 16_384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = scryptSync(password, salt, KEY_BYTES, { N: 16_384, r: 8, p: 1 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
