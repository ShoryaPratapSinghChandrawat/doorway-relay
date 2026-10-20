import { describe, expect, it } from 'vitest';
import { PlaygroundStatusTracker } from './playground-status.js';

describe('Playground connection status', () => {
  it('distinguishes no token, unverified presence, mismatch, success, and expiry', () => {
    const tracker = new PlaygroundStatusTracker();
    expect(tracker.read(null, 'ring_playground').state).toBe('no_token');
    expect(tracker.read('server-only-token', 'ring_playground').state).toBe('token_present_unverified');
    expect(tracker.read('server-only-token', 'ring_live').state).toBe('source_mismatch');

    tracker.recordSuccess('2026-10-18T12:00:00.000Z', '2 devices returned');
    expect(tracker.read('server-only-token', 'ring_playground')).toMatchObject({
      state: 'last_success',
      lastSuccessfulCallAt: '2026-10-18T12:00:00.000Z',
      lastDeviceSummary: '2 devices returned',
      historyShapeVerified: false,
      historySyncAvailable: false,
    });

    tracker.recordExpired();
    const expired = tracker.read('server-only-token', 'ring_playground');
    expect(expired.state).toBe('token_expired');
    expect(expired.errorCode).toBe('token_expired');
    expect(JSON.stringify(expired)).not.toContain('server-only-token');
  });

  it('keeps ingestion disabled with an explicit probe blocker', () => {
    const status = new PlaygroundStatusTracker().read('server-only-token', 'ring_playground');
    expect(status.historySyncAvailable).toBe(false);
    expect(status.historyShapeVerified).toBe(false);
    expect(status.historySyncDisabledReason).toContain('npm run ring:probe');
    expect(JSON.stringify(status)).not.toContain('server-only-token');
  });

  it('clears status tied to an old Playground token or source', () => {
    const tracker = new PlaygroundStatusTracker();
    tracker.recordSuccess('2026-10-20T12:00:00.000Z', '1 device returned');
    expect(tracker.read('server-token-a', 'ring_playground').lastDeviceSummary).toBe('1 device returned');
    tracker.reset();
    expect(tracker.read('server-token-b', 'ring_playground')).toMatchObject({
      state: 'token_present_unverified',
      lastSuccessfulCallAt: null,
      lastDeviceSummary: null,
    });
  });
});
