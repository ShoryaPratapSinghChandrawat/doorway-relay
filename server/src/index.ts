import 'dotenv/config';
import { parseConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { RingTokenStore } from './ring/token-store.js';
import { RingOAuthService } from './ring/oauth.js';
import { RingTokenManager } from './ring/token-manager.js';
import { RingPartnerClient } from './ring/client.js';
import { RingHistoryPoller } from './ring/poller.js';
import { ingestHistoryPayload } from './ring/history.js';
import { recordRingApiSuccess } from './ring/health.js';

const config = parseConfig(process.env);
const db = openDatabase(config.databasePath);
const app = createApp({ db, config });
const server = app.listen(config.port, config.host, () => {
  console.log(`Doorway Relay API listening on ${config.host}:${config.port}`);
  console.log('Ring status remains not connected until an authenticated Ring API call or verified Ring-signed webhook is recorded.');
});

const tokenStore = new RingTokenStore(db, config.tokenEncryptionKey);
const oauth = new RingOAuthService(config, tokenStore);
const tokenManager = new RingTokenManager(config, tokenStore, oauth);
const ringClient = new RingPartnerClient(config.ringApiBaseUrl, tokenManager, {
  onSuccess: (path) => {
    const kind = path === '/v1/users/me' ? 'user_profile'
      : path === '/v1/devices' ? 'devices'
        : path.startsWith('/v1/history/devices/') ? 'event_history' : 'app_integration';
    recordRingApiSuccess(db, kind);
  },
});

const refreshTimer = setInterval(() => {
  void oauth.refreshIfDue().catch(() => undefined);
}, 60_000);
refreshTimer.unref();

let historyPoller: RingHistoryPoller | null = null;
if (config.ringHistoryPollingEnabled && config.ringEventSource === 'ring_live' && config.ringHistoryDeviceId && (config.ringAccessToken || tokenStore.getPair())) {
  historyPoller = new RingHistoryPoller({
    deviceId: config.ringHistoryDeviceId,
    intervalMs: config.ringPollIntervalSeconds * 1000,
    client: ringClient,
    onHistory: (payload) => { ingestHistoryPayload(db, payload); },
  });
  historyPoller.start();
}

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  historyPoller?.stop();
  clearInterval(refreshTimer);
  const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()));
  void Promise.allSettled([serverClosed, app.closePlaygroundWhepSessions()]).then(() => {
    db.close();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
