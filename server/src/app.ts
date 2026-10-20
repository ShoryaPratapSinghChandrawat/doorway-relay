import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import type { Db } from './db/index.js';
import type { AppConfig } from './config.js';
import { ApiError } from './domain/errors.js';
import { categorySchema, dueAtSchema, prioritySchema, provenanceSchema, resolutionNoteSchema, statusSchema, summarySchema } from './domain/validation.js';
import { createManualHandoff, classifySourceEvent, getActivity, getHandoff, ignoreSourceEvent, listHandoffs, transitionHandoff } from './domain/handoffs.js';
import { getOverview } from './domain/overview.js';
import { listInboxEvents } from './domain/inbox.js';
import { hashPassword, verifyPassword } from './auth/password.js';
import { clearSessionCookie, createAnonymousSession, deleteSession, rotateSession } from './auth/session.js';
import type { ApiRequest } from './auth/types.js';
import { attachSession, requireCsrf, requireTrustedOrigin, requireUser } from './api/middleware.js';
import { parseBody } from './api/validation.js';
import { identifyWebhookSource } from './ring/signature.js';
import { ringWebhookSchema } from './ring/webhook-schema.js';
import { normalizeDoorEvent, readWebhookAccountId } from './ring/normalize.js';
import { ingestWebhookEvent } from './ring/ingest.js';
import { RingTokenStore } from './ring/token-store.js';
import { RingOAuthService } from './ring/oauth.js';
import { RingTokenManager } from './ring/token-manager.js';
import { RingPartnerClient } from './ring/client.js';
import { getRingStatus } from './ring/status.js';
import { recordRingApiSuccess } from './ring/health.js';
import { completeRingAccountIntegration, maskPartnerAccountIdentifier } from './ring/account-link.js';
import { verifyAccountNonce } from './ring/nonce.js';
import { RingPlaygroundClient, RingPlaygroundError } from './ring/playground-client.js';
import { PlaygroundDeviceSelection, type PlaygroundDeviceState } from './ring/playground-devices.js';
import { PlaygroundStatusTracker } from './ring/playground-status.js';
import { PlaygroundWhepError, PlaygroundWhepRelay } from './ring/playground-whep.js';

const createHandoffSchema = z.object({
  category: categorySchema,
  summary: summarySchema,
  priority: prioritySchema.default('normal'),
  dueAt: dueAtSchema,
}).strict();
const classifySchema = createHandoffSchema;
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict();
const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(80),
}).strict();
const assignSchema = z.object({ ownerId: z.string().min(1).max(100) }).strict();
const resolveSchema = z.object({ note: resolutionNoteSchema }).strict();
const settingsSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  largerText: z.boolean(),
  reducedMotion: z.boolean(),
}).strict();
const accountLinkSchema = z.object({
  time: z.string().regex(/^[1-9]\d{12}$/),
  nonce: z.string().min(43).max(43),
}).strict();
const playgroundDeviceSelectionSchema = z.object({
  id: z.string().min(1).max(512).refine((id) => !/[\u0000-\u001f\u007f]/.test(id)),
}).strict();
const playgroundWhepStopSchema = z.object({ sessionId: z.uuid() }).strict();
const handoffQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.union([statusSchema, z.literal('awaiting_acknowledgement')]).optional(),
  ownerId: z.string().max(100).optional(),
  category: categorySchema.optional(),
  priority: prioritySchema.optional(),
  provenance: provenanceSchema.optional(),
  sort: z.enum(['updated_desc', 'due_asc', 'created_desc']).default('updated_desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export interface AppDependencies {
  db: Db;
  config: AppConfig;
  fetcher?: typeof fetch;
}

export interface DoorwayApp extends Express {
  closePlaygroundWhepSessions(): Promise<void>;
}

function asApiRequest(request: Request): ApiRequest {
  return request as ApiRequest;
}

function playgroundDeviceSummary(state: PlaygroundDeviceState): string {
  if (state.shapeUnrecognized) return 'response received';
  const count = state.devices.length;
  return `${count} ${count === 1 ? 'device' : 'devices'} returned`;
}

function playgroundApiError(error: unknown, tracker: PlaygroundStatusTracker, selection: PlaygroundDeviceSelection): ApiError {
  if (error instanceof RingPlaygroundError) {
    if (error.code === 'token_expired') {
      tracker.recordExpired();
      selection.clearDeviceState();
      return new ApiError(401, 'ring_playground_token_expired', error.message);
    }
    tracker.recordApiError(error.code);
    if (error.code === 'rate_limited') return new ApiError(429, 'ring_playground_rate_limited', error.message);
    return new ApiError(502, `ring_playground_${error.code}`, error.message);
  }
  tracker.recordApiError('api_error');
  return new ApiError(502, 'ring_playground_api_error', 'Ring API request failed. No token or upstream response details were logged.');
}

function playgroundWhepApiError(error: unknown, tracker: PlaygroundStatusTracker, selection: PlaygroundDeviceSelection): ApiError {
  if (error instanceof PlaygroundWhepError) {
    if (error.code === 'token_expired') {
      tracker.recordExpired();
      selection.clearDeviceState();
      return new ApiError(401, 'ring_playground_token_expired', error.message);
    }
    if (error.code === 'rate_limited') {
      tracker.recordApiError('rate_limited');
      return new ApiError(429, 'ring_playground_rate_limited', error.message);
    }
    if (error.code === 'invalid_offer') return new ApiError(400, 'ring_playground_whep_offer_invalid', error.message);
    if (error.code === 'session_active') return new ApiError(409, 'ring_playground_whep_session_active', error.message);
    if (error.code === 'timeout') return new ApiError(504, 'ring_playground_whep_timeout', error.message);
    tracker.recordApiError(`whep_${error.code}`);
    return new ApiError(502, `ring_playground_whep_${error.code}`, error.message);
  }
  tracker.recordApiError('whep_api_error');
  return new ApiError(502, 'ring_playground_whep_api_error', 'Ring live-view request failed. No token or upstream response details were logged.');
}

function routeId(request: Request): string {
  const value = request.params.id;
  if (typeof value !== 'string' || value.length === 0) throw new ApiError(400, 'invalid_id', 'The requested ID is invalid.');
  return value;
}

function rateLimitHandler(_request: Request, response: Response): void {
  response.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' } });
}

function noStoreResponse(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

export function createApp({ db, config, fetcher }: AppDependencies): DoorwayApp {
  const app = express() as DoorwayApp;
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.get('/api/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      db.prepare('SELECT 1').get();
      response.json({ status: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });
  app.use('/api', noStoreResponse);
  app.use('/api', attachSession(db, config));

  const ringTokenStore = new RingTokenStore(db, config.tokenEncryptionKey);
  const ringOauth = new RingOAuthService(config, ringTokenStore, fetcher);
  const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler });
  const tokenExchangeLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler });
  const playgroundWhepLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler });
  app.post('/api/ring/webhook', webhookLimiter, express.raw({ type: 'application/json', limit: '256kb' }), (request, response) => {
    if (!Buffer.isBuffer(request.body)) throw new ApiError(415, 'content_type_required', 'Send a JSON request body.');
    const source = identifyWebhookSource(request.body, request.header('x-signature'), config);
    if (!source) throw new ApiError(401, 'signature_invalid', 'Webhook signature could not be verified.');
    let body: unknown;
    try {
      body = JSON.parse(request.body.toString('utf8')) as unknown;
    } catch {
      throw new ApiError(400, 'malformed_json', 'Webhook body must be valid JSON.');
    }
    const parsed = ringWebhookSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'invalid_ring_payload', 'Webhook body did not match the supported Ring event envelope.');
    const normalized = normalizeDoorEvent(parsed.data);
    if (normalized && source !== 'ring_simulated' && !ringTokenStore.isLinkedForAccount(readWebhookAccountId(parsed.data))) {
      response.status(200).json({ status: 'ignored' });
      return;
    }
    const receivedAt = parsed.data.meta.time;
    const result = ingestWebhookEvent(db, request.body, source, parsed.data.meta.request_id, normalized, receivedAt);
    response.status(200).json(result);
  });

  app.post('/api/ring/token-exchange', (_request, response, next) => {
    if (!config.ringTokenExchangeRouteEnabled) {
      response.status(503).json({ error: {
        code: 'ring_token_exchange_disabled',
        message: 'Ring Token Exchange is disabled until its unpublished inbound request contract is verified.',
      } });
      return;
    }
    next();
  }, tokenExchangeLimiter, express.urlencoded({ extended: false, limit: '64kb' }), express.json({ limit: '64kb', strict: true }), async (request, response) => {
    // UNVERIFIED: Ring does not publish the inbound Token Exchange body shape. `code` is an opt-in assumption only.
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'ring_token_exchange_body_invalid', 'Token Exchange expects an object body with a code field.');
    }
    const fields = body as Record<string, unknown>;
    const unexpectedFields = [
      ...Object.keys(fields).filter((field) => field !== 'code'),
      ...Object.keys(request.query).map((field) => `query.${field}`),
    ];
    if (unexpectedFields.length > 0) {
      console.warn('Ring Token Exchange rejected a request with unexpected fields.');
      throw new ApiError(400, 'ring_token_exchange_fields_invalid', 'Token Exchange request contained unexpected fields.');
    }
    if (typeof fields.code !== 'string' || fields.code.trim().length === 0 || fields.code.length > 4096) {
      throw new ApiError(400, 'ring_token_exchange_code_invalid', 'Token Exchange request did not contain a valid code field.');
    }
    try {
      await ringOauth.exchangeAuthorizationCode(fields.code);
    } catch {
      throw new ApiError(502, 'ring_token_exchange_failed', 'Ring Token Exchange could not be completed. Check the server-side Ring configuration.');
    }
    // This local success acknowledgement is not a claim about Ring's unpublished callback response contract.
    response.status(200).json({ status: 'accepted' });
  });

  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(express.json({ limit: '64kb', strict: true }));
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler });
  const tokenManager = new RingTokenManager(config, ringTokenStore, ringOauth);
  const ringClientOptions = {
    ...(fetcher ? { fetcher } : {}),
    onSuccess: (path: string) => {
      const kind = path === '/v1/users/me' ? 'user_profile'
        : path === '/v1/devices' ? 'devices'
          : path.startsWith('/v1/history/devices/') ? 'event_history' : 'app_integration';
      recordRingApiSuccess(db, kind);
    },
  };
  const ringClient = new RingPartnerClient(config.ringApiBaseUrl, tokenManager, ringClientOptions);
  const accountLinkTokenManager = new RingTokenManager({ ...config, ringAccessToken: null }, ringTokenStore, ringOauth);
  const ringAccountLinkClient = new RingPartnerClient(config.ringApiBaseUrl, accountLinkTokenManager, ringClientOptions);
  const playgroundStatusTracker = new PlaygroundStatusTracker();
  const playgroundDeviceSelection = new PlaygroundDeviceSelection();
  const playgroundWhepRelay = new PlaygroundWhepRelay(config.ringApiBaseUrl, {
    ...(fetcher ? { fetcher } : {}),
    getAccessToken: () => config.ringAccessToken,
  });
  app.closePlaygroundWhepSessions = () => playgroundWhepRelay.closeAll(config.ringAccessToken);

  function synchronizePlaygroundIdentity(): void {
    if (playgroundDeviceSelection.synchronizeIdentity(config.ringAccessToken, config.ringEventSource)) {
      playgroundStatusTracker.reset();
      void playgroundWhepRelay.closeAll(config.ringAccessToken);
    }
  }

  function requirePlaygroundConfiguration(): string {
    if (!config.ringAccessToken) {
      throw new ApiError(409, 'ring_playground_no_token', 'No Playground token is configured in the server .env file.');
    }
    if (config.ringEventSource !== 'ring_playground') {
      throw new ApiError(409, 'ring_playground_source_not_selected', 'Set RING_EVENT_SOURCE=ring_playground before making Playground API calls.');
    }
    return config.ringAccessToken;
  }

  async function fetchPlaygroundDevices(): Promise<{ state: PlaygroundDeviceState; summary: string; checkedAt: string }> {
    synchronizePlaygroundIdentity();
    const token = requirePlaygroundConfiguration();
    try {
      const client = new RingPlaygroundClient(config.ringApiBaseUrl, token, fetcher ? { fetcher } : {});
      const payload = await client.getDevices();
      const previousSelection = playgroundDeviceSelection.read().selectedDeviceId;
      const state = playgroundDeviceSelection.record(payload);
      if (previousSelection && state.selectedDeviceId !== previousSelection) await playgroundWhepRelay.closeAll(token);
      const summary = playgroundDeviceSummary(state);
      const checkedAt = new Date().toISOString();
      playgroundStatusTracker.recordSuccess(checkedAt, summary);
      return { state, summary, checkedAt };
    } catch (error) {
      throw playgroundApiError(error, playgroundStatusTracker, playgroundDeviceSelection);
    }
  }

  app.get('/api/auth/csrf', (request, response) => {
    const apiRequest = asApiRequest(request);
    let session = apiRequest.authSession ?? null;
    if (!session) {
      const record = createAnonymousSession(db, config, response);
      session = { id: '', record };
      apiRequest.authSession = session;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.json({ csrfToken: session.record.csrfToken });
  });

  app.get('/api/auth/me', (request, response) => {
    const accountCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE login_enabled = 1').get() as { count: number };
    const registrationOpen = accountCount.count === 0;
    const userId = asApiRequest(request).authSession?.record.userId;
    if (!userId) return response.json({ user: null, registrationOpen });
    const row = db.prepare(`SELECT id, email, display_name AS displayName, is_demo AS isDemo,
      preferences_json AS preferencesJson FROM users WHERE id = ? AND login_enabled = 1`).get(userId) as {
        id: string; email: string; displayName: string; isDemo: number; preferencesJson: string;
      } | undefined;
    if (!row) return response.json({ user: null, registrationOpen });
    response.json({ user: { id: row.id, email: row.email, displayName: row.displayName, isDemo: row.isDemo === 1 }, registrationOpen });
  });

  app.post('/api/auth/register', authLimiter, requireTrustedOrigin(config), requireCsrf, (request, response) => {
    const input = parseBody(registerSchema, request.body);
    const accounts = db.prepare('SELECT COUNT(*) AS count FROM users WHERE login_enabled = 1').get() as { count: number };
    if (accounts.count > 0) throw new ApiError(403, 'registration_closed', 'This single-workspace demo already has an account. Sign in instead.');
    const id = randomUUID();
    const password = hashPassword(input.password);
    const now = new Date().toISOString();
    const createFirstUser = db.transaction(() => {
      const currentAccounts = db.prepare('SELECT COUNT(*) AS count FROM users WHERE login_enabled = 1').get() as { count: number };
      if (currentAccounts.count > 0) {
        throw new ApiError(403, 'registration_closed', 'This single-workspace demo already has an account. Sign in instead.');
      }
      db.prepare(`INSERT INTO users (id, email, display_name, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, input.email.toLowerCase(), input.displayName, password.salt, password.hash, now);
    });
    try {
      createFirstUser.immediate();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(409, 'account_exists', 'An account with that email already exists.');
    }
    const existingHash = asApiRequest(request).authSession?.record.sessionHash ?? null;
    rotateSession(db, config, existingHash, id, response);
    response.status(201).json({ user: { id, email: input.email.toLowerCase(), displayName: input.displayName, isDemo: false } });
  });

  app.post('/api/auth/login', authLimiter, requireTrustedOrigin(config), requireCsrf, (request, response) => {
    const input = parseBody(loginSchema, request.body);
    const user = db.prepare(`SELECT id, email, display_name AS displayName, password_salt AS passwordSalt,
      password_hash AS passwordHash, is_demo AS isDemo FROM users
      WHERE lower(email) = lower(?) AND login_enabled = 1`).get(input.email) as {
        id: string; email: string; displayName: string; passwordSalt: string | null; passwordHash: string | null; isDemo: number;
      } | undefined;
    const valid = Boolean(user && user.passwordSalt && user.passwordHash && verifyPassword(input.password, user.passwordSalt, user.passwordHash));
    if (!valid || !user) throw new ApiError(401, 'credentials_invalid', 'Email or password was not recognized.');
    rotateSession(db, config, asApiRequest(request).authSession?.record.sessionHash ?? null, user.id, response);
    response.json({ user: { id: user.id, email: user.email, displayName: user.displayName, isDemo: user.isDemo === 1 } });
  });

  app.post('/api/auth/logout', requireTrustedOrigin(config), requireCsrf, requireUser(db), (request, response) => {
    deleteSession(db, asApiRequest(request).authSession ?? null);
    clearSessionCookie(response, config);
    response.status(204).end();
  });

  const authenticated = [requireTrustedOrigin(config), requireCsrf, requireUser(db)] as const;
  app.get('/api/overview', requireUser(db), (_request, response) => {
    response.json(getOverview(db, config.stallThresholdHours));
  });

  app.get('/api/users', requireUser(db), (_request, response) => {
    const users = db.prepare(`SELECT id, display_name AS displayName, is_demo AS isDemo
      FROM users WHERE login_enabled = 1 OR is_demo = 1 ORDER BY lower(display_name)`)
      .all() as Array<{ id: string; displayName: string; isDemo: number }>;
    response.json({ users: users.map((user) => ({ ...user, isDemo: user.isDemo === 1 })) });
  });

  app.get('/api/handoffs', requireUser(db), (request, response) => {
    const query = parseBody(handoffQuerySchema, request.query);
    const filters = {
      page: query.page, limit: query.limit, sort: query.sort,
      ...(query.q ? { q: query.q } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.provenance ? { provenance: query.provenance } : {}),
    };
    response.json(listHandoffs(db, filters, Date.now(), config.stallThresholdHours));
  });

  app.post('/api/handoffs', ...authenticated, (request, response) => {
    const input = parseBody(createHandoffSchema, request.body);
    const user = asApiRequest(request).authUser!;
    response.status(201).json({ handoff: createManualHandoff(db, user.id, {
      category: input.category, summary: input.summary, priority: input.priority, dueAt: input.dueAt ?? null,
    }) });
  });

  app.get('/api/handoffs/:id', requireUser(db), (request, response) => {
    const handoff = getHandoff(db, routeId(request), Date.now(), config.stallThresholdHours);
    response.json({ handoff, activity: getActivity(db, handoff.id) });
  });

  app.get('/api/handoffs/:id/activity', requireUser(db), (request, response) => {
    response.json({ activity: getActivity(db, routeId(request)) });
  });

  app.post('/api/handoffs/:id/claim', ...authenticated, (request, response) => {
    const user = asApiRequest(request).authUser!;
    response.json({ handoff: transitionHandoff(db, routeId(request), user.id, 'claim', {}, new Date().toISOString()) });
  });

  app.post('/api/handoffs/:id/assign', ...authenticated, (request, response) => {
    const input = parseBody(assignSchema, request.body);
    const user = asApiRequest(request).authUser!;
    response.json({ handoff: transitionHandoff(db, routeId(request), user.id, 'assign', { ownerId: input.ownerId }) });
  });

  app.post('/api/handoffs/:id/acknowledge', ...authenticated, (request, response) => {
    const user = asApiRequest(request).authUser!;
    response.json({ handoff: transitionHandoff(db, routeId(request), user.id, 'acknowledge') });
  });

  app.post('/api/handoffs/:id/resolve', ...authenticated, (request, response) => {
    const input = parseBody(resolveSchema, request.body);
    const user = asApiRequest(request).authUser!;
    response.json({ handoff: transitionHandoff(db, routeId(request), user.id, 'resolve', { note: input.note }) });
  });

  app.post('/api/handoffs/:id/reopen', ...authenticated, (request, response) => {
    const user = asApiRequest(request).authUser!;
    response.json({ handoff: transitionHandoff(db, routeId(request), user.id, 'reopen') });
  });

  app.get('/api/inbox', requireUser(db), (_request, response) => response.json({ events: listInboxEvents(db) }));
  app.post('/api/inbox/:id/classify', ...authenticated, (request, response) => {
    const input = parseBody(classifySchema, request.body);
    const user = asApiRequest(request).authUser!;
    const handoff = classifySourceEvent(db, user.id, routeId(request), {
      category: input.category, summary: input.summary, priority: input.priority, dueAt: input.dueAt ?? null,
    });
    response.status(201).json({ handoff });
  });
  app.post('/api/inbox/:id/ignore', ...authenticated, (request, response) => {
    const user = asApiRequest(request).authUser!;
    ignoreSourceEvent(db, user.id, routeId(request));
    response.status(204).end();
  });

  app.get('/api/settings', requireUser(db), (request, response) => {
    const userId = asApiRequest(request).authUser!.id;
    const row = db.prepare('SELECT display_name AS displayName, preferences_json AS preferencesJson FROM users WHERE id = ?')
      .get(userId) as { displayName: string; preferencesJson: string };
    let preferences: { largerText?: boolean; reducedMotion?: boolean } = {};
    try { preferences = JSON.parse(row.preferencesJson) as typeof preferences; } catch { preferences = {}; }
    response.json({
      displayName: row.displayName,
      largerText: preferences.largerText === true,
      reducedMotion: preferences.reducedMotion === true,
      notificationPresentation: 'In-app dashboard and event inbox only. Email, SMS, and push notifications are not implemented.',
    });
  });

  app.patch('/api/settings', ...authenticated, (request, response) => {
    const input = parseBody(settingsSchema, request.body);
    const userId = asApiRequest(request).authUser!.id;
    db.prepare('UPDATE users SET display_name = ?, preferences_json = ? WHERE id = ?')
      .run(input.displayName, JSON.stringify({ largerText: input.largerText, reducedMotion: input.reducedMotion }), userId);
    response.json({ ...input, notificationPresentation: 'In-app dashboard and event inbox only. Email, SMS, and push notifications are not implemented.' });
  });

  app.get('/api/ring/status', requireUser(db), (_request, response) => response.json(getRingStatus(db, config)));

  app.get('/api/ring/playground/status', requireUser(db), (_request, response) => {
    synchronizePlaygroundIdentity();
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      ...playgroundStatusTracker.read(config.ringAccessToken, config.ringEventSource),
      ...playgroundDeviceSelection.read(),
    });
  });

  app.get('/api/ring/playground/devices', requireUser(db), async (_request, response) => {
    const result = await fetchPlaygroundDevices();
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      ...result.state,
      deviceSummary: result.summary,
      lastSuccessfulCallAt: result.checkedAt,
    });
  });

  app.post('/api/ring/playground/device', ...authenticated, async (request, response) => {
    synchronizePlaygroundIdentity();
    const token = requirePlaygroundConfiguration();
    const input = parseBody(playgroundDeviceSelectionSchema, request.body);
    const previousSelection = playgroundDeviceSelection.read().selectedDeviceId;
    if (!playgroundDeviceSelection.select(input.id)) {
      throw new ApiError(409, 'ring_playground_device_not_listed', 'Choose a device from the most recent Playground device list.');
    }
    if (previousSelection !== input.id) await playgroundWhepRelay.closeAll(token);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ selectedDeviceId: input.id });
  });

  app.post('/api/ring/playground/verify', ...authenticated, async (_request, response) => {
    const result = await fetchPlaygroundDevices();
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      status: playgroundStatusTracker.read(config.ringAccessToken, config.ringEventSource),
      checked: 'devices',
      deviceSummary: result.summary,
      devices: result.state.devices,
      shapeUnrecognized: result.state.shapeUnrecognized,
      selectedDeviceId: result.state.selectedDeviceId,
    });
  });

  app.post('/api/ring/playground/whep/session', noStoreResponse, playgroundWhepLimiter, ...authenticated,
    express.text({ type: 'application/sdp', limit: '64kb' }), async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      synchronizePlaygroundIdentity();
      const token = requirePlaygroundConfiguration();
      if (!request.is('application/sdp') || typeof request.body !== 'string') {
        throw new ApiError(415, 'ring_playground_whep_sdp_required', 'Send a bounded receive-only offer using application/sdp.');
      }
      const selectedDeviceId = playgroundDeviceSelection.read().selectedDeviceId;
      if (!selectedDeviceId) {
        throw new ApiError(409, 'ring_playground_device_not_selected', 'Refresh the Playground device list and select a device before starting live view.');
      }
      try {
        const session = await playgroundWhepRelay.createSession(selectedDeviceId, request.body, token);
        response.setHeader('Cache-Control', 'no-store');
        response.status(201).json(session);
      } catch (error) {
        throw playgroundWhepApiError(error, playgroundStatusTracker, playgroundDeviceSelection);
      }
    });

  app.delete('/api/ring/playground/whep/session', noStoreResponse, playgroundWhepLimiter, ...authenticated, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    synchronizePlaygroundIdentity();
    const input = parseBody(playgroundWhepStopSchema, request.body);
    try {
      await playgroundWhepRelay.deleteSession(input.sessionId, config.ringAccessToken);
    } catch (error) {
      throw playgroundWhepApiError(error, playgroundStatusTracker, playgroundDeviceSelection);
    }
    response.setHeader('Cache-Control', 'no-store');
    response.status(204).end();
  });

  app.post('/api/ring/playground/sync', ...authenticated, (_request, _response) => {
    synchronizePlaygroundIdentity();
    if (!config.ringAccessToken) {
      throw new ApiError(409, 'ring_playground_no_token', 'No Playground token is configured in the server .env file.');
    }
    if (config.ringEventSource !== 'ring_playground') {
      throw new ApiError(409, 'ring_playground_source_not_selected', 'Set RING_EVENT_SOURCE=ring_playground before syncing Playground history.');
    }
    throw new ApiError(409, 'ring_playground_history_shape_unverified', 'Event History sync is disabled until the real Playground response shape is reviewed. Run npm run ring:probe first; no history request was made.');
  });

  app.post('/api/ring/check', ...authenticated, async (_request, response) => {
    if (!config.ringAccessToken && !ringTokenStore.getPair()) {
      throw new ApiError(409, 'ring_not_configured', 'No Ring API token is available. Add a server-side token or complete verified Ring account linking.');
    }
    try {
      await ringClient.getCurrentUser();
      await ringClient.getDevices();
    } catch {
      throw new ApiError(502, 'ring_api_unavailable', 'Ring API verification did not complete. Check the local integration status and current Ring docs.');
    }
    response.json({ status: getRingStatus(db, config), checked: ['user_profile', 'devices'] });
  });

  app.post('/api/ring/account-link', ...authenticated, async (request, response) => {
    const input = parseBody(accountLinkSchema, request.body);
    if (!config.ringHmacSigningKey || !config.tokenEncryptionKey) {
      throw new ApiError(503, 'ring_link_not_configured', 'Ring account linking requires server-side HMAC and token-encryption keys.');
    }
    const ringAccountId = ringTokenStore.getUnclaimedAccountId();
    if (!ringAccountId) {
      throw new ApiError(409, 'ring_token_unclaimed_not_found', 'No unclaimed Ring token pair is available for this account-link request.');
    }
    if (!verifyAccountNonce({ time: input.time, accountId: ringAccountId, nonce: input.nonce }, config.ringHmacSigningKey)) {
      throw new ApiError(403, 'ring_nonce_invalid', 'The Ring account-link request is invalid or expired.');
    }
    const partnerUser = asApiRequest(request).authUser!;
    const accountIdentifier = maskPartnerAccountIdentifier(partnerUser.email);
    try {
      await completeRingAccountIntegration(ringAccountLinkClient, ringAccountId, input.nonce, accountIdentifier);
    } catch {
      throw new ApiError(502, 'ring_link_failed', 'Ring account linking could not be completed. Check the current Ring account-integration status.');
    }
    if (!ringTokenStore.claimUnclaimedPair(ringAccountId)) {
      throw new ApiError(409, 'ring_token_claim_conflict', 'The unclaimed Ring token pair changed during account linking.');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE ring_link_state SET linked_at = ?, updated_at = ? WHERE id = 1').run(now, now);
    response.json({ status: 'linked' });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'not_found', message: 'The requested route was not found.' } });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } });
      return;
    }
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'payload_too_large', message: 'Request body is too large.' } });
      return;
    }
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: { code: 'malformed_json', message: 'Request body must be valid JSON.' } });
      return;
    }
    response.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong. Try again.' } });
  };
  app.use(errorHandler);
  return app;
}
