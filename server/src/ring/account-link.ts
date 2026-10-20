import type { RingPartnerClient } from './client.js';

interface JsonApiUser {
  data?: { id?: string };
}

/** Account ID extraction follows the JSON:API shape in the official Ring starter's GET /v1/users/me example. */
export function readRingAccountId(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null;
  const data = (profile as JsonApiUser).data;
  return typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
}

/** The one-way account-link API displays a masked identifier derived from the authenticated partner user. */
export function maskPartnerAccountIdentifier(email: string): string {
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) throw new Error('The authenticated partner account has an invalid email address.');
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local.at(-1)}`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Completes the documented one-way account link: verify the stored token's Ring account,
 * POST the time-bound Ring nonce, then PATCH the integration to completed.
 */
export async function completeRingAccountIntegration(
  client: RingPartnerClient,
  accountIdFromNonce: string,
  nonce: string,
  accountIdentifier: string,
): Promise<void> {
  const profile = await client.getCurrentUser();
  const accountId = readRingAccountId(profile);
  if (!accountId || accountId !== accountIdFromNonce) throw new Error('The authenticated Ring account did not match the signed link request.');
  await client.postAppIntegration({ account_identifier: accountIdentifier, nonce });
  await client.patchAppIntegration({ status: 'completed' });
}
