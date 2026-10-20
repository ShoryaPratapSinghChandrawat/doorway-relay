import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

function deriveKey(keyHex: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('Token encryption key must be 32 bytes of hexadecimal.');
  return Buffer.from(keyHex, 'hex');
}

export function encryptToken(value: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptToken(envelope: string, keyHex: string): string {
  const [version, ivText, tagText, ciphertextText, ...extra] = envelope.split('.');
  if (version !== PREFIX || !ivText || !tagText || !ciphertextText || extra.length > 0) {
    throw new Error('Stored token has an unsupported encrypted format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(keyHex), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
