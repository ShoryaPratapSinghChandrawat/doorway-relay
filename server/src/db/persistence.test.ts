import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './index.js';
import { runMigrations } from './migrate.js';
import { insertTestUser } from '../test-support.js';
import { createManualHandoff, getHandoff } from '../domain/handoffs.js';

let directory: string | null = null;
let opened: ReturnType<typeof openDatabase> | null = null;
afterEach(() => {
  opened?.close();
  opened = null;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = null;
});

describe('SQLite migrations and persistence', () => {
  it('applies migrations from empty and persists data after reopening the database', () => {
    directory = mkdtempSync(join(tmpdir(), 'doorway-relay-test-'));
    const path = join(directory, 'doorway.sqlite');
    opened = openDatabase(path);
    expect(runMigrations(opened)).toEqual([]);
    insertTestUser(opened);
    const created = createManualHandoff(opened, 'user-owner', {
      category: 'other', summary: 'Check the common entrance light', priority: 'normal', dueAt: null,
    });
    opened.close();

    opened = openDatabase(path);
    const reopenedDb = opened;
    expect(getHandoff(reopenedDb, created.id).summary).toBe('Check the common entrance light');
    expect((reopenedDb.prepare('SELECT COUNT(*) AS count FROM activity WHERE handoff_id = ?').get(created.id) as { count: number }).count).toBe(1);
    expect(() => reopenedDb.prepare('UPDATE handoffs SET source_event_id = NULL WHERE id = ?').run(created.id)).toThrow(/source events are immutable/);
    expect(() => reopenedDb.prepare("UPDATE handoffs SET status = 'assigned' WHERE id = ?").run(created.id)).toThrow(/status fields are inconsistent/);
    const activityId = (reopenedDb.prepare('SELECT id FROM activity WHERE handoff_id = ?').get(created.id) as { id: string }).id;
    expect(() => reopenedDb.prepare("UPDATE activity SET action = 'edited' WHERE id = ?").run(activityId)).toThrow(/append-only/);
    expect(() => reopenedDb.prepare('DELETE FROM activity WHERE id = ?').run(activityId)).toThrow(/append-only/);
    expect(getHandoff(reopenedDb, created.id).status).toBe('new');
  });
});
