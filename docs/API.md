# HTTP API

Application errors use `{ "error": { "code", "message", "details?" } }`; stacks and secrets are not returned. Inputs are validated with Zod. Protected mutations require a signed session cookie, `x-csrf-token`, and a same/trusted origin. The browser calls relative `/api/...` URLs. Ring contract notes include earlier M5 source review (2026-10-17) and owner-supplied official reference facts checked 2026-10-20; those facts were not independently fetched or exercised by this agent. Nothing here confirms current eligibility or a live Ring response.

## Health

- `GET /api/health` — unauthenticated readiness probe. Returns `200 { status: "ok" }` only when a lightweight SQLite query succeeds; returns `503 { status: "unavailable" }` otherwise. Responses are `Cache-Control: no-store`, set no session cookie, and reveal no database error details. This does not prove Ring connectivity or external dependency health.

## Authentication

- `GET /api/auth/csrf` — issue/retrieve the current session CSRF token; returns `Cache-Control: no-store`.
- `GET /api/auth/me` — `{ user: User | null, registrationOpen: boolean }`; first-user registration closes once a login-enabled account exists.
- `POST /api/auth/register` — first-user-only `{ email, password (12+ chars), displayName }`; 201.
- `POST /api/auth/login` — `{ email, password }`; rotates the browser session.
- `POST /api/auth/logout` — CSRF-protected; 204.

## Handoffs and overview

- `GET /api/overview` — database-derived counts, needs-attention items, recent activity, and stall threshold.
- `GET /api/handoffs` — filters `q`, `status` (including the dashboard group `awaiting_acknowledgement`, which includes `assigned` and `reopened`), `ownerId` (`unassigned` supported), `category`, `priority`, `provenance`, `sort` (`updated_desc`, `due_asc`, `created_desc`), `page`, `limit` (1–50). Returns items and pagination.
- `POST /api/handoffs` — manual create `{ category, summary, priority?, dueAt? }`; creates a `manual` source event with no Ring request/event identity and one activity row; 201.
- `GET /api/handoffs/:id` — `{ handoff, activity }`.
- `GET /api/handoffs/:id/activity` — activity timeline.
- `POST /api/handoffs/:id/claim` — `new` → `assigned` to current user.
- `POST /api/handoffs/:id/assign` — `{ ownerId }`; assign/reassign under the state-machine rules.
- `POST /api/handoffs/:id/acknowledge` — `assigned`/eligible `reopened` → `acknowledged`.
- `POST /api/handoffs/:id/resolve` — `{ note }`; `acknowledged` → `resolved`.
- `POST /api/handoffs/:id/reopen` — `resolved` → `reopened`.
- `GET /api/users` — owners available in the single workspace.
- `GET /api/settings` / `PATCH /api/settings` — display name and larger-text/reduced-motion preferences. Notification presentation is in-app only; no email/SMS/push is implemented.

## Inbox and settings

- `GET /api/inbox` — pending incoming events only.
- `POST /api/inbox/:id/classify` — `{ category, summary, priority?, dueAt? }`; creates one handoff and marks the event classified; 201.
- `POST /api/inbox/:id/ignore` — mark pending event ignored; 204.
- `GET /api/settings` — display name and accessibility options.
- `PATCH /api/settings` — `{ displayName, largerText, reducedMotion }`.

## Ring boundary

When a Ring client ID/secret, HMAC key, API token, or history device ID is configured, `RING_EVENT_SOURCE` must be explicitly set to `ring_live` or `ring_playground`. A Ring-HMAC-signed webhook is accepted only when that setting is `ring_live`; `ring_playground` is authenticated Playground API access, not webhook provenance. The operator-configured source still does not prove the origin of a bearer token. `RING_HISTORY_POLLING_ENABLED` defaults to `false`; the legacy background poller/parser can only be explicitly enabled for `ring_live`, never `ring_playground`, and its historical response-field/timestamp assumptions are not live-verified.

### Playground devices, status, and verification

- `GET /api/ring/playground/status` — authenticated, `Cache-Control: no-store`; returns safe state (`no_token`, `source_mismatch`, `token_present_unverified`, `last_success`, `token_expired`, or `api_error`), token-presence boolean, last successful check time and device summary, last safe error code, the listed device IDs/types, latest-list shape status, selected ID, and explicit `historyShapeVerified: false` / `historySyncAvailable: false`. The token and raw upstream payload are never returned. Device selection and status are memory-only; changing the server token/source clears the selection/list and resets status.
- `GET /api/ring/playground/devices` — authenticated, no-store. Calls only `GET /v1/devices`; returns safe devices, summary, `lastSuccessfulCallAt`, and `shapeUnrecognized`. Device data extraction is deliberately limited to a top-level `data` array with opaque string `id` and optional short `type`; no shape is guessed. At most 50 unique devices are exposed. Unknown or malformed shapes are handled explicitly (`shapeUnrecognized: true`, no devices); malformed/network/upstream errors return only a safe error.
- `POST /api/ring/playground/verify` — authenticated + CSRF; requires server-side `RING_ACCESS_TOKEN` and `RING_EVENT_SOURCE=ring_playground`; calls only `GET /v1/devices`. Returns `{ status, checked: "devices", deviceSummary, devices, shapeUnrecognized, selectedDeviceId }`. Verify includes the bounded device list; it never returns the token or raw response body. A 401 marks the safe token-expired state and clears the device list/selection.
- `POST /api/ring/playground/device` — authenticated + CSRF; `{ id }`. Selects only an ID in the most recent successfully parsed list; otherwise returns 409 `ring_playground_device_not_listed`. The selected ID is in process memory only and is not persisted in SQLite. Changing selected device closes any WHEP session.

### Playground structure-only probe

- `npm run ring:probe` — human-run CLI, not an HTTP route. Requires a server-side `RING_ACCESS_TOKEN` and explicit `RING_EVENT_SOURCE=ring_playground`. Without `RING_HISTORY_DEVICE_ID`, it calls `GET /v1/devices` only; a device ID is not required for that first check and is never inferred. With an operator-supplied history device ID it calls `GET /v1/history/devices/{device_id}/events` after device discovery. It follows same-endpoint JSON:API `links.next` safely (string or `href` link object), sequentially, at most five History pages. Calls have bounded response size, timeouts, conservative retries/rate handling, and safe errors.
- The saved report is structure-only and non-replayable: bounded field paths/types, array lengths, allow-listed event-type strings, subtype/classification field paths and JSON types (not values), timestamp-format categories, pagination shape, and redaction markers. Unknown event strings and unrecognized/dynamic keys are omitted or redacted; raw values, tokens, device IDs, email addresses, and URLs are not included. Reports are written under `fixtures/ring-playground/`. `RING_PROBE_PRINT_DEVICE_IDS=true` can print IDs to the local terminal only with a warning; IDs are never included in saved reports. The owner must inspect a real report for privacy before sharing/committing it.
- The owner says a probe was run on their machine; its redacted report and findings were not supplied here. The implementation and its mocked tests do not constitute a real response/report. Do not hand-author a report or treat mocked data as Ring evidence.
- `POST /api/ring/playground/sync` — authenticated + CSRF; returns 409 `ring_playground_history_shape_unverified` without making a History request until a real redacted report is supplied/reviewed and an observed adapter is implemented. No History ingestion, `ring_playground_recorded` persistence, or Sync is implemented. Background Playground polling remains disabled.

### Playground WHEP receive-only simulation

- The Integration page lets a signed-in user start/stop a browser receive-only video session for a selected Playground device. It is explicitly labeled **Playground · Simulated**; it is not an inbox event, Ring webhook, History entry, production session, or proven Ring video stream. This agent did not make a live WHEP request or verify media.
- The browser creates a video-only `recvonly` WebRTC offer and waits for ICE gathering. It sends SDP to the app server, not directly to Ring. The server relays to the owner-supplied documented endpoint pattern `POST https://api.amazonvision.com/v1/devices/{device_id}/media/streaming/whep/sessions`, using the selected device ID and server-side bearer token. Optional `component_id` is omitted. No token, raw upstream error, or Ring `Location` is returned to the browser.
- `POST /api/ring/playground/whep/session` — authenticated + CSRF + same/trusted-origin protection; at most 10 calls per minute. Requires `Content-Type: application/sdp`, a bounded body (64 KiB), a selected listed device, and a valid single-video, receive-only SDP offer. Server checks the official HTTPS API origin, disallows redirects, and enforces a 10-second request timeout. The upstream answer must be bounded valid SDP; its `Location` must be a strict same-origin HTTPS session path under the expected endpoint. A safe app session is returned as `{ sessionId, answerSdp, expiresAt }` (201); the raw upstream `Location` and authorization token are not exposed.
- `DELETE /api/ring/playground/whep/session` — authenticated + CSRF + same/trusted-origin protection and rate-limited; `{ sessionId }`; 204 after a matching remote session DELETE. Unknown/nonmatching session IDs do not delete another resource. Safe 401/429/upstream errors are mapped without exposing upstream body/headers.
- The relay holds at most one session in memory per app process, for up to five minutes. Stop, expiry, selected-device/token/source change, or shutdown attempts remote DELETE; an in-flight create is aborted and awaited on shutdown. Browser peer/timer cleanup runs on stop, expiry, and unmount. The route sets `Cache-Control: no-store`. There is no recording, frame capture, snapshot/download, media persistence, or inbox-event creation. Preserve the mandatory Ring watermark unaltered. Code/route tests use mocked HTTP, fake timers, and an injected fake peer connection—not a real Ring session.

### Existing Ring endpoints

- `POST /api/ring/webhook` — public, rate-limited, raw JSON body ≤256 KiB. Verifies raw bytes using `X-Signature: sha256=<hex>` before JSON parsing. Validates the user-supplied Ring v1.1 envelope: `meta.version`, UTC `meta.time` (up to 9 fractional digits), bounded opaque `meta.request_id`, Ring-shaped `meta.account_id`, `data.id`/`data.type`, and supported door-event attributes/relationship. Only `button_press` and `motion_detected` create inbox events; lifecycle, app-integration, subscription, sensor, and other unsupported types are acknowledged with 200 `ignored`.
  - Same `meta.request_id` retry → 200 `duplicate`, no new receipt/event.
  - New request ID with already-seen `data.id` → 200 `duplicate`, receipt retained, no new inbox event.
  - Manual tasks use `manual` provenance and are not Ring duplicates.
  - Uses epoch-ms `attributes.timestamp` for `occurred_at` and exact `meta.time` for `received_at`. Non-simulator events are stored only for a matching claimed/linked `meta.account_id`; a valid unlinked-account event is 200 `ignored`.
  - Missing/invalid signature → 401; malformed JSON or required schema fields → 400; persistence failure → 500 so Ring can retry. The webhook does not fetch upstream media or create an event from WHEP video.
  - The M5 source review reported `data.attributes.sub_type` as the Motion Detection subtype; that field is canonical in the adapter. The earlier supplied `data.subType` shape is accepted only as a compatibility fallback, and missing subtype remains neutral. M7 did not re-check those current docs. The value is not included in the handoff summary.
  - A verified local simulator-key request is always stored as `ring_simulated`; the UI labels it **Local · Simulated**. It is Doorway Relay's Ring-shaped fixture, not a Ring-issued or official Ring Developer Playground event. A Ring-key signature is rejected when `RING_EVENT_SOURCE=ring_playground` so it cannot be mislabeled.
- `GET /api/ring/status` — authenticated status based on actual stored evidence; env variables alone are not success.
- `POST /api/ring/check` — authenticated + CSRF; calls `GET /v1/users/me` and `GET /v1/devices` server-to-server if a token exists. Does not return token or profile data. This status check does not call History or WHEP/media endpoints; the separate optional WHEP route above is user-triggered.
- `POST /api/ring/token-exchange` — public and rate-limited. `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` defaults to `false`, and production configuration rejects `true` while the inbound contract is unverified; while disabled, the route returns 503 before parsing. The M5 source review reported that Ring's Configure guide said Ring POSTs an authorization code to this partner URL but did not publish its exact content type/body fields, required headers, or acknowledgement response. M7 could not re-check the current guide. **UNVERIFIED assumption if enabled:** this implementation accepts JSON or URL-encoded form with a top-level `code`; unknown fields are rejected and a generic warning is logged without submitted field names or values. Its `200 { status: "accepted" }` is app-local, not a claimed Ring response contract. Do not enable until the inbound contract is confirmed. The separate outgoing OAuth exchange uses the documented `POST https://oauth.ring.com/oauth/token` form with `grant_type=authorization_code`, `client_id`, `code`, and `client_secret`, then `GET /v1/users/me`; the encrypted pair is stored as unclaimed under a shared 55-second exchange/profile deadline.
- `POST /api/ring/account-link` — authenticated + CSRF; accepts only `{ time, nonce }`, loads the Ring account ID from the stored unclaimed-token record (the OAuth tokens themselves are encrypted), and verifies the 600-second HMAC nonce against that ID. It checks `GET /v1/users/me` matches before sending the documented App Integrations POST (`{ account_identifier: <masked signed-in email>, nonce }`) and PATCH (`{ status: "completed" }`); only then is the token pair claimed. Route and ordering are covered with stubbed API tests, but no Ring callback or API request was tested.

## Status codes

- `200`: successful read/action or webhook accepted/duplicate/ignored.
- `201`: created manual/classified handoff, initial registration, or WHEP session.
- `204`: logout/ignore or WHEP session deletion.
- `400`: body/query validation, malformed JSON, invalid event fields, or invalid WHEP SDP.
- `401`: unauthenticated, invalid webhook signature, or expired Playground token (safe message only).
- `403`: CSRF/origin/nonce/registration policy.
- `404`: missing handoff/event.
- `409`: invalid lifecycle transition, duplicate classification, already-owned assignment, rejected/unselected Playground device, active WHEP session, or blocked Playground History sync while the real schema is unverified.
- `413`/`415`: body too large or wrong webhook/WHEP content type.
- `429`: rate limit.
- `500`: internal/persistence failure; transient webhook persistence failures are returned as 500.
- `502`: upstream Ring connection/configuration/response failure, with no secret detail.
- `503`: SQLite readiness failure, missing Ring configuration, or disabled/unverified Token Exchange route.
- `504`: WHEP upstream timeout.
