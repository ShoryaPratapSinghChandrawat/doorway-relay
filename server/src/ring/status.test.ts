import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/index.js';
import { makeTestConfig, makeTestDb } from '../test-support.js';
import { getRingStatus } from './status.js';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

describe('evidence-derived Ring status', () => {
  it('reports linked only when a completed link and an available server-side token coexist', () => {
    db = makeTestDb();
    db.prepare('UPDATE ring_link_state SET linked_at = ? WHERE id = 1').run('2026-10-17T00:00:00.000Z');
    expect(getRingStatus(db, makeTestConfig()).linked).toBe(false);
    const status = getRingStatus(db, makeTestConfig({ ringAccessToken: 'playground-test-token' }));
    expect(status).toMatchObject({ linked: true, connected: false, apiTokenAvailable: true });
  });
});
