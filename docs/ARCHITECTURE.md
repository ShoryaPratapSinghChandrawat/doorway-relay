# Architecture and state machine

**M11 documentation boundary (2026-10-20):** The owner says a Playground probe was run on their own machine; its redacted report and findings were not supplied here. This agent made no Ring request, used no Ring credentials, and did not inspect `.env`. Device discovery/selection and the receive-only WHEP client/relay are implemented and covered by mocked/fake-peer tests only; no real WHEP session was exercised. Event History response fields, IDs, timestamps, classification/subtype placement, pagination, and simulation visibility remain unverified here, so History ingestion and Sync remain blocked pending review of a real redacted report. Owner-supplied official facts are distinguished from responses observed in this workspace.

## Runtime layout

- `client/`: React + TypeScript + Vite UI. The browser calls relative `/api/...` URLs; Vite proxies them to the Express API. The local Vite server binds to `127.0.0.1` and does not allow arbitrary hosts. No Ring secret is exposed to browser code.
- `server/`: Express + TypeScript API. `HOST` defaults to `127.0.0.1`; deployments must deliberately bind on the private service interface. Zod validates inputs; Helmet/CSP, auth rate limits, public webhook rate limits, exact configured-origin checks, and structured errors are applied at the edge. `GET /api/health` is a no-session SQLite readiness probe, not an integration check.
- `server/src/ring/`: server-side Ring HTTP adapter, signature verifier, webhook normalizer, encrypted OAuth token store, token refresh/client logic, nonce helper, and account-link boundary; plus a separate env-only Playground API client, bounded device discovery/selection, structure-only probe reporter, safe status tracker, and WHEP session relay. Playground selection and WHEP session state are in process memory only. The legacy Event History poller is default-off and cannot run for `ring_playground`.
- `server/migrations/`: sequential SQLite SQL migrations. `better-sqlite3` is the only application database. Mutations that affect multiple rows use a transaction.
- `submission/`: honest draft copy and recording checklist; no public video or real screenshot is claimed.

## Persistence and data minimization

`source_events` stores only provenance, event type, upstream/request IDs for deduplication, device ID, event/sent timestamps, a controlled summary, and inbox classification state. The webhook path does not persist the raw body, visitor names, motion subtype, snapshots, audio, video, or thumbnail data. `device_id` is populated from the supplied event's `attributes.source` for supported door events. `is_synthetic` distinguishes seeded demo rows from user-created or simulator requests. Simulator provenance is separate from the demo-data marker.

`handoffs.source_event_id` is unique, so one source event can create at most one handoff. `source_events.external_event_id` and `request_id` are independently unique where non-null. `webhook_receipts.request_id` retains only the request identifier, raw-body SHA-256 digest, provenance, and the exact `meta.time`; a duplicate request ID never creates another receipt or event. A distinct request ID carrying an already-seen upstream event ID is recorded as a receipt but does not create another source event. Manual handoffs have `manual` provenance and no Ring request or event ID.

Ring access/refresh tokens are stored in SQLite only as AES-256-GCM ciphertext, using a 32-byte key from the ignored `.env`. A refresh response replaces both token values in one SQLite transaction; old refresh tokens are not retained as fallbacks. The configured Playground access token, if used, stays server-side in `.env` and is not copied into the database. No token is returned to the UI or written to logs.

## Authentication and security boundary

Passwords are scrypt-hashed with a per-user random salt. First-user registration rechecks account count and inserts under an immediate SQLite transaction. Browser sessions use a random opaque ID, HMAC-signed in an HTTP-only, SameSite=Lax cookie; the `Secure` attribute is enabled in production, and only a SHA-256 hash of the session ID is stored in SQLite. Login rotates the session; sessions expire after seven days. State-changing browser routes require a session-bound CSRF token and an exact match to the configured `WEB_ORIGIN`; cross-site Fetch Metadata is rejected. The public Ring webhook and Token Exchange routes are rate-limited and do not require a browser session; Token Exchange is disabled by default. If explicitly enabled, its top-level `code` body assumption is **UNVERIFIED**. Ring secrets stay server-side. Unexpected API errors return generic messages without stacks; the Token Exchange rejection warning omits submitted fields and values.

Production config validation requires an HTTPS `WEB_ORIGIN`, the documented HTTPS Ring API and OAuth origins, a 64-hex-character `SESSION_SECRET`, and an absolute `DATABASE_PATH`; the simulator signing key is forbidden. Ring token URLs must stay on the configured HTTPS OAuth origin. Demo seeding is blocked when `NODE_ENV=production`. These checks do not provide a production runtime or secret manager.

This is a demo-grade, single-workspace scheme, not production-hardened authentication: all signed-in workspace users share the same records; registration is first-user-only; demo teammate rows cannot sign in; there is no email verification, password reset, multi-tenant isolation, audit export, configured retention/backup process, or operational monitoring. Before any public deployment, obtain a security review, secret manager, stricter session lifecycle, backup/retention policy, and deployment-specific origin configuration. See [`SECURITY.md`](SECURITY.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Handoff state machine

The server enforces these transitions. Every successful transition writes exactly one activity row in the same SQLite transaction as the handoff update. An invalid transition returns HTTP 409 and changes nothing.

```text
NEW ──claim / assign──> ASSIGNED ──acknowledge──> ACKNOWLEDGED ──resolve + note──> RESOLVED
  ▲                         ▲                            │                           │
  │                         │                            └── reassign owner ─────────┘
  │                         │                                                        │
  └──── new handoff          └──── reopened ─────────────────────────────────────────┘

RESOLVED ──reopen──> REOPENED ──assign──> ASSIGNED
                              └── acknowledge (only if an owner remains) ──> ACKNOWLEDGED
```

More precisely:

- `claim`: only `new` with no owner; sets the acting user as owner and status `assigned`.
- `assign`: from `new` or `reopened`, sets `assigned`; from `assigned` or `acknowledged`, changes the owner without erasing the status. Assigning the existing owner is a no-op conflict.
- `acknowledge`: from `assigned`, or from `reopened` if an owner exists; records `acknowledged_at`. It never resolves.
- `resolve`: only from `acknowledged`; requires a short resolution note and sets `resolved`.
- `reopen`: only from `resolved`; logs the action, resets acknowledgement/resolution fields, and moves to `reopened`.
- `activity` is append-only; database triggers reject update/delete.

The `new` status is unassigned and waiting for an owner. The dashboard's `awaitingAcknowledgement` count includes `assigned` and `reopened` work, which has an owner but still needs acknowledgement (again, after reopening); `acknowledged` work remains open until resolved. Overdue is computed only when `due_at` exists and is in the past (resolved rows are excluded). Stalled is computed only for `acknowledged` rows whose `acknowledged_at` is older than `STALL_THRESHOLD_HOURS` (default 24); it is not a fabricated background notification.

## Ring boundary / provenance

The webhook endpoint verifies the exact raw bytes (not re-serialized JSON) using `X-Signature: sha256=<hex>` and a constant-time comparison, then validates the user-supplied Ring v1.1 envelope. Request IDs are bounded opaque strings; simulator and Ring keys are separate. The simulator calls the same endpoint and receives `ring_simulated`; a Ring-key signature is accepted only when `RING_EVENT_SOURCE=ring_live`. `ring_playground` is authenticated Playground API access, not a Ring-signed webhook source, so the webhook rejects that combination rather than mislabeling it. Only `button_press` and `motion_detected` create inbox events; lifecycle, app-integration, subscription, sensor, and unknown types are acknowledged and ignored. Supported non-simulator events are matched to a claimed/linked Ring account using `meta.account_id`. Delivery retries use `meta.request_id`; repeated upstream events use `data.id`; a manual task has no Ring identity. A person must classify a supported event before it becomes a handoff. The M5 source review reported `attributes.sub_type` as the canonical motion subtype; the earlier supplied top-level `data.subType` form is only a compatibility fallback. M7 could not re-check that contract.

The M5 public Ring docs were fetched on 2026-10-17; M7 could not re-check them. The partner Token Exchange callback body and acknowledgement remain unverified; the route is off by default and only reads an assumed JSON/form top-level `code` if explicitly enabled, with that assumption marked **UNVERIFIED**. Earlier M5 Event History parser tests use an assumed history contract and are not Playground evidence; the parser is not reused for Playground. Account linking follows the M5-reviewed one-way flow locally: the authenticated route accepts `time`/`nonce`, reads account identity from the stored unclaimed-token record (OAuth tokens remain encrypted), verifies the profile, sends the documented masked-identifier POST and completion PATCH, then claims the pair. Stubbed route tests cover this sequence, but it has not been tested against Ring and still depends on the unverified inbound Token Exchange callback to obtain an unclaimed pair.

### M11 Playground device, probe, and WHEP boundaries

The Playground client fixes its API origin to `https://api.amazonvision.com`, keeps the bearer token server-only, makes bounded sequential GETs, validates JSON with Zod, uses timeouts/response caps/retries, and follows only safe same-history-endpoint `links.next` links. The device picker exposes at most 50 unique opaque IDs and short types from a deliberately narrow supported shape; it reports an unrecognized shape rather than guessing. Selection is restricted to the most recent device list, held in memory only, and cleared on token/source identity changes. Verify lists safe devices and a summary; it does not return a raw response or token. `npm run ring:probe` can run devices-only with no `RING_HISTORY_DEVICE_ID`. Optional `RING_PROBE_PRINT_DEVICE_IDS=true` prints IDs in the local terminal with a warning; saved reports never contain them. The owner says a probe was run separately, but the report/findings were not supplied here. The exact response shape, History identity/dedup semantics, normalization, `ring_playground_recorded` mapping, and any recorded fixture remain unverified in this workspace. The Sync endpoint returns a safe 409 without a History request, and polling stays off for Playground.

The browser WHEP client creates a single video `recvonly` offer and waits for ICE. Its server relay sends the selected device's offer to the owner-supplied documented WHEP session endpoint with the server-side token, validates bounded answer SDP and a strict same-origin session `Location`, disallows redirects, and applies a 10-second timeout. Authenticated + CSRF-protected/rate-limited routes return an app session ID/answer, not the Ring token or `Location`. One in-memory session expires in at most five minutes; stop/expiry/device or identity changes/shutdown attempt DELETE. Video is browser-only and clearly labelled **Playground · Simulated**; no audio transceiver, recording, frame capture, snapshot/download, media storage, or inbox event is implemented. The video uses `object-fit: contain` without crop/filter/transform or a live overlay; the mandatory Ring watermark must remain unaltered and needs human review. No STUN/TURN server is configured, but ICE host candidates or mDNS/network identifiers may still appear in the offer sent to the app server and Ring; no candidate filtering is implemented, so users must decide whether that disclosure is acceptable. WHEP tests use mocked HTTP/fake timers and an injected fake peer connection; no real session or media was verified.

The legacy Ring API client also enforces same-origin HTTPS requests, rejects redirects, bounds requests and JSON response bodies, and production configuration pins the documented Ring API/OAuth origins. OAuth refresh has a 12-second deadline; the authorization-code/profile sequence retains its 55-second deadline. These are local safeguards, not live performance measurements. See `docs/RING_INTEGRATION.md`, `docs/API.md`, `docs/SECURITY.md`, and `docs/HUMAN_VISUAL_REVIEW.md`; no live compatibility or visual review is claimed.
