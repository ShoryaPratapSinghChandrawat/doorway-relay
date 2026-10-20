import 'dotenv/config';
import { resolve } from 'node:path';
import { openDatabase } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';

const db = openDatabase(process.env.DATABASE_PATH ?? './data/doorway-relay.sqlite', false);
const applied = runMigrations(db);
const versions = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string }>;
console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database already up to date.');
console.log(`SQLite file: ${process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : resolve('./data/doorway-relay.sqlite')}`);
console.log(`Migration count: ${versions.length}`);
db.close();
