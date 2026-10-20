import { describe, expect, it, vi } from 'vitest';
import { completeRingAccountIntegration, maskPartnerAccountIdentifier, readRingAccountId } from './account-link.js';
import type { RingPartnerClient } from './client.js';

describe('Ring account-link adapter boundary', () => {
  it('reads the account ID from the verified JSON:API profile shape', () => {
    expect(readRingAccountId({ data: { id: 'opaque-account-id', attributes: {} } })).toBe('opaque-account-id');
    expect(readRingAccountId({ data: { attributes: {} } })).toBeNull();
  });

  it('masks the authenticated partner email for the App Integrations request', () => {
    expect(maskPartnerAccountIdentifier('owner@example.test')).toBe('o***r@example.test');
    expect(maskPartnerAccountIdentifier('ab@example.test')).toBe('a***@example.test');
    expect(() => maskPartnerAccountIdentifier('not-an-email')).toThrow('invalid email');
  });

  it('checks the signed account against GET /v1/users/me before POST then PATCH', async () => {
    const calls: string[] = [];
    const client = {
      getCurrentUser: vi.fn(async () => { calls.push('profile'); return { data: { id: 'account-1' } }; }),
      postAppIntegration: vi.fn(async (_body: unknown) => { calls.push('post'); return {}; }),
      patchAppIntegration: vi.fn(async (_body: unknown) => { calls.push('patch'); return {}; }),
    } as unknown as RingPartnerClient;
    await completeRingAccountIntegration(client, 'account-1', 'ring-nonce', 'o***r@example.test');
    expect(calls).toEqual(['profile', 'post', 'patch']);
    expect(client.postAppIntegration).toHaveBeenCalledWith({
      account_identifier: 'o***r@example.test',
      nonce: 'ring-nonce',
    });
    expect(client.patchAppIntegration).toHaveBeenCalledWith({ status: 'completed' });
  });

  it('does not send integration requests for an account mismatch', async () => {
    const client = {
      getCurrentUser: vi.fn(async () => ({ data: { id: 'actual-account' } })),
      postAppIntegration: vi.fn(),
      patchAppIntegration: vi.fn(),
    } as unknown as RingPartnerClient;
    await expect(completeRingAccountIntegration(client, 'different-account', 'nonce', 'o***r@example.test')).rejects.toThrow('did not match');
    expect(client.postAppIntegration).not.toHaveBeenCalled();
    expect(client.patchAppIntegration).not.toHaveBeenCalled();
  });
});
