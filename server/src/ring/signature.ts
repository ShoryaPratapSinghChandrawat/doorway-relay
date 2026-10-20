import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { Provenance } from '../domain/types.js';

export function createRingSignature(rawBody: Buffer | string, signingKey: string): string {
  return `sha256=${createHmac('sha256', signingKey).update(rawBody).digest('hex')}`;
}

export function verifyRingSignature(rawBody: Buffer, header: string | undefined, signingKey: string | null): boolean {
  if (!header || !signingKey || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const supplied = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', signingKey).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function identifyWebhookSource(rawBody: Buffer, header: string | undefined, config: AppConfig): Exclude<Provenance, 'manual'> | null {
  if (verifyRingSignature(rawBody, header, config.simulatorHmacKey)) return 'ring_simulated';
  // The Playground path is authenticated HTTP API access, not a Ring-signed webhook source.
  // Reject the Ring key here rather than labeling a live webhook as Playground data.
  if (config.ringEventSource !== 'ring_live') return null;
  if (verifyRingSignature(rawBody, header, config.ringHmacSigningKey)) return 'ring_live';
  return null;
}
