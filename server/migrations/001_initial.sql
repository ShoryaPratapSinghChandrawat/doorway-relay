CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_salt TEXT,
  password_hash TEXT,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  login_enabled INTEGER NOT NULL DEFAULT 1 CHECK (login_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK ((password_salt IS NULL) = (password_hash IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users(lower(email));
CREATE INDEX IF NOT EXISTS users_login_idx ON users(login_enabled, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS source_events (
  id TEXT PRIMARY KEY,
  provenance TEXT NOT NULL CHECK (provenance IN ('ring_live', 'ring_playground', 'ring_simulated', 'manual')),
  ring_event_type TEXT NOT NULL,
  external_event_id TEXT UNIQUE,
  request_id TEXT UNIQUE,
  device_id TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  classification_status TEXT NOT NULL DEFAULT 'pending' CHECK (classification_status IN ('pending', 'classified', 'ignored')),
  classified_at TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS source_events_inbox_idx ON source_events(classification_status, received_at DESC);
CREATE INDEX IF NOT EXISTS source_events_provenance_idx ON source_events(provenance, received_at DESC);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  source_event_id TEXT UNIQUE REFERENCES source_events(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('visitor', 'delivery', 'access', 'other')),
  summary TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL CHECK (status IN ('new', 'assigned', 'acknowledged', 'resolved', 'reopened')),
  owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  due_at TEXT,
  acknowledged_at TEXT,
  resolution_note TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS handoffs_status_idx ON handoffs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS handoffs_owner_idx ON handoffs(owner_id, status);
CREATE INDEX IF NOT EXISTS handoffs_due_idx ON handoffs(due_at) WHERE due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  handoff_id TEXT REFERENCES handoffs(id) ON DELETE RESTRICT,
  source_event_id TEXT REFERENCES source_events(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  from_owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  to_owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT,
  occurred_at TEXT NOT NULL,
  CHECK (handoff_id IS NOT NULL OR source_event_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS activity_handoff_idx ON activity(handoff_id, occurred_at, id);

CREATE TRIGGER IF NOT EXISTS activity_no_update
BEFORE UPDATE ON activity
BEGIN
  SELECT RAISE(ABORT, 'activity is append-only');
END;
CREATE TRIGGER IF NOT EXISTS activity_no_delete
BEFORE DELETE ON activity
BEGIN
  SELECT RAISE(ABORT, 'activity is append-only');
END;

CREATE TABLE IF NOT EXISTS webhook_receipts (
  request_id TEXT PRIMARY KEY,
  payload_sha256 TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('ring_live', 'ring_playground', 'ring_simulated')),
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ring_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ring_link_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  linked_at TEXT,
  last_signed_event_at TEXT,
  last_signed_event_source TEXT CHECK (last_signed_event_source IS NULL OR last_signed_event_source IN ('ring_live', 'ring_playground')),
  last_simulated_event_at TEXT,
  last_api_success_at TEXT,
  last_api_success_kind TEXT,
  last_refresh_at TEXT,
  last_refresh_error TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO ring_link_state (id, updated_at) VALUES (1, datetime('now'));
