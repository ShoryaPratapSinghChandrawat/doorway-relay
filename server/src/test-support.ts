import type { AppConfig } from './config.js';
import { openDatabase, type Db } from './db/index.js';
import { hashPassword } from './auth/password.js';

export const testPassword = 'correct-horse-battery-1';

export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 3001,
    webOrigin: 'http://localhost:5173',
    sessionSecret: 's'.repeat(64),
    tokenEncryptionKey: 'a'.repeat(64),
    databasePath: ':memory:',
    demoEmail: 'demo@doorway.local',
    demoPassword: testPassword,
    simulatorHmacKey: 'simulator-test-key-not-ring',
    ringClientId: null,
    ringClientSecret: null,
    ringHmacSigningKey: 'ring-test-key-not-simulator',
    ringEventSource: 'ring_live',
    ringApiBaseUrl: 'https://api.amazonvision.com',
    ringOauthBaseUrl: 'https://oauth.ring.com',
    ringTokenUrl: 'https://oauth.ring.com/token-test',
    ringOAuthContractVerified: true,
    ringTokenExchangeRouteEnabled: false,
    ringAccessToken: null,
    ringHistoryDeviceId: null,
    ringHistoryPollingEnabled: false,
    ringPollIntervalSeconds: 60,
    stallThresholdHours: 24,
    ...overrides,
  };
}

export function makeTestDb(): Db {
  return openDatabase(':memory:');
}

export function insertTestUser(db: Db, id = 'user-owner', displayName = 'Test Owner', email = 'owner@example.test'): void {
  const credentials = hashPassword(testPassword);
  db.prepare(`INSERT INTO users
    (id, email, display_name, password_salt, password_hash, is_demo, login_enabled, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?)`)
    .run(id, email, displayName, credentials.salt, credentials.hash, new Date().toISOString());
}

export function insertTestTeammate(db: Db, id = 'user-teammate', displayName = 'Test Teammate'): void {
  db.prepare(`INSERT INTO users
    (id, email, display_name, password_salt, password_hash, is_demo, login_enabled, created_at)
    VALUES (?, ?, ?, NULL, NULL, 1, 0, ?)`)
    .run(id, `${id}@example.invalid`, displayName, new Date().toISOString());
}
