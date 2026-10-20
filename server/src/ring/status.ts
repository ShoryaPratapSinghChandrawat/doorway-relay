import type { Db } from '../db/index.js';
import type { AppConfig } from '../config.js';

interface LinkStateRow {
  linkedAt: string | null;
  lastSignedEventAt: string | null;
  lastSignedEventSource: 'ring_live' | 'ring_playground' | null;
  lastSimulatedEventAt: string | null;
  lastApiSuccessAt: string | null;
  lastApiSuccessKind: string | null;
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
}

export function getRingStatus(db: Db, config: AppConfig) {
  const row = db.prepare(`SELECT linked_at AS linkedAt, last_signed_event_at AS lastSignedEventAt,
    last_signed_event_source AS lastSignedEventSource, last_simulated_event_at AS lastSimulatedEventAt,
    last_api_success_at AS lastApiSuccessAt, last_api_success_kind AS lastApiSuccessKind,
    last_refresh_at AS lastRefreshAt, last_refresh_error AS lastRefreshError
    FROM ring_link_state WHERE id = 1`).get() as LinkStateRow;
  const credentialsConfigured = Boolean(config.ringClientId && config.ringClientSecret && config.ringHmacSigningKey);
  const storedPair = db.prepare('SELECT id FROM ring_tokens WHERE id = 1').get() !== undefined;
  const apiTokenAvailable = Boolean(config.ringAccessToken || storedPair);
  let state: 'not_connected' | 'credentials_configured' | 'verified_simulator' | 'api_verified' | 'ring_event_verified' | 'refresh_failing' = 'not_connected';
  if (row.lastRefreshError) state = 'refresh_failing';
  else if (row.lastSignedEventAt) state = 'ring_event_verified';
  else if (row.lastApiSuccessAt) state = 'api_verified';
  else if (row.lastSimulatedEventAt) state = 'verified_simulator';
  else if (credentialsConfigured || apiTokenAvailable) state = 'credentials_configured';

  return {
    state,
    connected: Boolean(row.lastSignedEventAt || row.lastApiSuccessAt),
    credentialsConfigured,
    apiTokenAvailable,
    linked: Boolean(row.linkedAt && apiTokenAvailable),
    lastSignedEventAt: row.lastSignedEventAt,
    lastSignedEventSource: row.lastSignedEventSource,
    lastSimulatedEventAt: row.lastSimulatedEventAt,
    lastApiSuccessAt: row.lastApiSuccessAt,
    lastApiSuccessKind: row.lastApiSuccessKind,
    lastRefreshAt: row.lastRefreshAt,
    refreshFailing: Boolean(row.lastRefreshError),
    refreshError: row.lastRefreshError,
    simulatorConfigured: Boolean(config.simulatorHmacKey),
    eventSource: config.ringEventSource,
    note: 'Environment variables alone do not indicate a connection. A verified Ring signature or successful authenticated Ring API response is required.',
  };
}
