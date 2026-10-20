import { isAbsolute } from 'node:path';
import { z } from 'zod';

const nullableText = z.string().trim().optional().transform((value) => value || null);
const OFFICIAL_RING_API_ORIGIN = 'https://api.amazonvision.com';
const OFFICIAL_RING_OAUTH_ORIGIN = 'https://oauth.ring.com';

function validateRingBaseOrigin(url: URL, variable: string): string {
  if (url.protocol !== 'https:') throw new Error(`${variable} must use HTTPS.`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${variable} must be an HTTPS origin without credentials, path, query, or fragment.`);
  }
  return url.origin;
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: nullableText,
  DATABASE_PATH: z.string().default('./data/doorway-relay.sqlite'),
  DEMO_EMAIL: z.email().default('demo@doorway.local'),
  DEMO_PASSWORD: nullableText,
  RING_SIMULATOR_HMAC_KEY: nullableText,
  RING_CLIENT_ID: nullableText,
  RING_CLIENT_SECRET: nullableText,
  RING_HMAC_SIGNING_KEY: nullableText,
  RING_EVENT_SOURCE: z.enum(['ring_live', 'ring_playground']).optional(),
  RING_API_BASE_URL: z.url().default('https://api.amazonvision.com'),
  RING_OAUTH_BASE_URL: z.url().default('https://oauth.ring.com'),
  RING_TOKEN_URL: nullableText,
  RING_OAUTH_CONTRACT_VERIFIED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  RING_TOKEN_EXCHANGE_ROUTE_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RING_ACCESS_TOKEN: nullableText,
  RING_HISTORY_DEVICE_ID: nullableText,
  RING_HISTORY_POLLING_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RING_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(86_400).default(60),
  STALL_THRESHOLD_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  webOrigin: string;
  sessionSecret: string;
  tokenEncryptionKey: string | null;
  databasePath: string;
  demoEmail: string;
  demoPassword: string | null;
  simulatorHmacKey: string | null;
  ringClientId: string | null;
  ringClientSecret: string | null;
  ringHmacSigningKey: string | null;
  ringEventSource: 'ring_live' | 'ring_playground' | null;
  ringApiBaseUrl: string;
  ringOauthBaseUrl: string;
  ringTokenUrl: string;
  ringOAuthContractVerified: boolean;
  ringTokenExchangeRouteEnabled: boolean;
  ringAccessToken: string | null;
  ringHistoryDeviceId: string | null;
  ringHistoryPollingEnabled: boolean;
  ringPollIntervalSeconds: number;
  stallThresholdHours: number;
};

export function parseConfig(input: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    const issueNames = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration (${issueNames}). Check the ignored .env file.`);
  }

  const env = parsed.data;
  const ringSourceConfigured = Boolean(
    env.RING_ACCESS_TOKEN || env.RING_CLIENT_ID || env.RING_CLIENT_SECRET || env.RING_HMAC_SIGNING_KEY || env.RING_HISTORY_DEVICE_ID || env.RING_HISTORY_POLLING_ENABLED,
  );
  if (ringSourceConfigured && !env.RING_EVENT_SOURCE) {
    throw new Error('Set RING_EVENT_SOURCE explicitly to ring_live or ring_playground when configuring Ring credentials or device history.');
  }
  if (env.RING_HISTORY_POLLING_ENABLED && env.RING_EVENT_SOURCE !== 'ring_live') {
    throw new Error('RING_HISTORY_POLLING_ENABLED is available only for ring_live; Playground history stays off pending probe review.');
  }
  const webOriginUrl = new URL(env.WEB_ORIGIN);
  const ringApiUrl = new URL(env.RING_API_BASE_URL);
  const ringOauthUrl = new URL(env.RING_OAUTH_BASE_URL);
  const ringApiBaseUrl = validateRingBaseOrigin(ringApiUrl, 'RING_API_BASE_URL');
  const ringOauthBaseUrl = validateRingBaseOrigin(ringOauthUrl, 'RING_OAUTH_BASE_URL');
  const ringTokenUrl = new URL(env.RING_TOKEN_URL ?? `${ringOauthBaseUrl}/oauth/token`);
  if (ringTokenUrl.protocol !== 'https:' || ringTokenUrl.username || ringTokenUrl.password || ringTokenUrl.search || ringTokenUrl.hash) {
    throw new Error('RING_TOKEN_URL must be an HTTPS URL without credentials, query, or fragment.');
  }
  if (ringTokenUrl.origin !== ringOauthBaseUrl) {
    throw new Error('RING_TOKEN_URL must use the same HTTPS origin as RING_OAUTH_BASE_URL.');
  }
  if (webOriginUrl.protocol !== 'http:' && webOriginUrl.protocol !== 'https:') {
    throw new Error('WEB_ORIGIN must use HTTP or HTTPS.');
  }
  if (webOriginUrl.username || webOriginUrl.password || webOriginUrl.pathname !== '/' || webOriginUrl.search || webOriginUrl.hash) {
    throw new Error('WEB_ORIGIN must be an origin without credentials, path, query, or fragment.');
  }
  if (env.NODE_ENV === 'production') {
    if (env.RING_SIMULATOR_HMAC_KEY) {
      throw new Error('Do not enable the local webhook simulator key in production.');
    }
    if (webOriginUrl.protocol !== 'https:') {
      throw new Error('WEB_ORIGIN must use HTTPS in production.');
    }
    if (ringApiBaseUrl !== OFFICIAL_RING_API_ORIGIN) {
      throw new Error('Production RING_API_BASE_URL must use the documented official Ring API origin.');
    }
    if (ringOauthBaseUrl !== OFFICIAL_RING_OAUTH_ORIGIN || ringTokenUrl.origin !== OFFICIAL_RING_OAUTH_ORIGIN) {
      throw new Error('Production Ring OAuth URLs must use the documented official Ring OAuth origin.');
    }
    if (!/^[a-f0-9]{64}$/i.test(env.SESSION_SECRET)) {
      throw new Error('SESSION_SECRET must be 64 hexadecimal characters (32 bytes) in production.');
    }
    if (env.DATABASE_PATH === ':memory:' || !isAbsolute(env.DATABASE_PATH)) {
      throw new Error('DATABASE_PATH must be an absolute path on persistent storage in production.');
    }
    if (env.RING_TOKEN_EXCHANGE_ROUTE_ENABLED) {
      throw new Error('RING_TOKEN_EXCHANGE_ROUTE_ENABLED must remain false in production until Ring confirms the inbound contract.');
    }
    if (!env.TOKEN_ENCRYPTION_KEY || !/^[a-f0-9]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY) || /replace|placeholder/i.test(env.TOKEN_ENCRYPTION_KEY)) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be configured as 64 hexadecimal characters (32 bytes) in production.');
    }
  }
  if (/replace|placeholder/i.test(env.SESSION_SECRET)) {
    throw new Error('SESSION_SECRET is a placeholder. Set a random value in the ignored .env file.');
  }
  if (env.TOKEN_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).');
  }
  if (env.RING_SIMULATOR_HMAC_KEY && /replace|placeholder|change/i.test(env.RING_SIMULATOR_HMAC_KEY)) {
    throw new Error('RING_SIMULATOR_HMAC_KEY is a placeholder. Set a random local-only value in the ignored .env file.');
  }
  if (env.RING_SIMULATOR_HMAC_KEY && env.RING_HMAC_SIGNING_KEY && env.RING_SIMULATOR_HMAC_KEY === env.RING_HMAC_SIGNING_KEY) {
    throw new Error('The simulator HMAC key must be different from the Ring HMAC signing key.');
  }

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    webOrigin: webOriginUrl.origin,
    sessionSecret: env.SESSION_SECRET,
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    databasePath: env.DATABASE_PATH,
    demoEmail: env.DEMO_EMAIL.toLowerCase(),
    demoPassword: env.DEMO_PASSWORD,
    simulatorHmacKey: env.RING_SIMULATOR_HMAC_KEY,
    ringClientId: env.RING_CLIENT_ID,
    ringClientSecret: env.RING_CLIENT_SECRET,
    ringHmacSigningKey: env.RING_HMAC_SIGNING_KEY,
    ringEventSource: env.RING_EVENT_SOURCE ?? null,
    ringApiBaseUrl,
    ringOauthBaseUrl,
    ringTokenUrl: ringTokenUrl.href,
    ringOAuthContractVerified: env.RING_OAUTH_CONTRACT_VERIFIED,
    ringTokenExchangeRouteEnabled: env.RING_TOKEN_EXCHANGE_ROUTE_ENABLED,
    ringAccessToken: env.RING_ACCESS_TOKEN,
    ringHistoryDeviceId: env.RING_HISTORY_DEVICE_ID,
    ringHistoryPollingEnabled: env.RING_HISTORY_POLLING_ENABLED,
    ringPollIntervalSeconds: env.RING_POLL_INTERVAL_SECONDS,
    stallThresholdHours: env.STALL_THRESHOLD_HOURS,
  };
}
