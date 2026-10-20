import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';

export type Db = Database.Database;

export function openDatabase(path: string, migrate = true): Db {
  const resolvedPath = path === ':memory:' ? path : resolve(process.cwd(), path);
  if (resolvedPath !== ':memory:') mkdirSync(dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  if (migrate) runMigrations(db);
  return db;
}
