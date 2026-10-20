# Ring integration findings

## M11 Ring state (2026-10-20; earlier milestone notes are historical)

The repo contains authenticated Playground device discovery/selection, a structure-only `npm run ring:probe` that supports devices-only discovery, and a user-triggered, receive-only browser WHEP view through a server relay. History ingestion and Sync remain disabled pending review of a real redacted probe report. The owner says a probe was run on their own machine; no redacted report or findings were supplied here. This agent did not inspect `.env`, use Ring credentials, make a Ring request, or verify a real WHEP session. The mocked responses and tests below are not Ring evidence.

The Integration live view is explicitly labelled **Playground · Simulated**. It only runs on user action for a selected listed device; it does not create an inbox event or History entry. It relays the documented WHEP session operation server-side, keeps one in-memory session for at most five minutes, validates bounded SDP and the response `Location`, and attempts session deletion on stop, expiry, identity/device change, and shutdown. No recording, frame capture, snapshot/download, or media storage is implemented. Preserve Ring's mandatory watermark unaltered. The browser configures no STUN/TURN server, but ICE gathering may still include host candidates or mDNS/network identifiers in the SDP sent through this server to Ring; do not use the feature if that disclosure is unacceptable. No candidate filtering is implemented, and actual browser/Ring candidate behavior is unverified. CSS uses `object-fit: contain` with no live video crop, filter, transform, or overlay; human review of watermark visibility remains pending. See [`HUMAN_VISUAL_REVIEW.md`](HUMAN_VISUAL_REVIEW.md).

### M10 risk-first audit and confirmed local corrections

- A Ring-HMAC-signed webhook could previously inherit `RING_EVENT_SOURCE=ring_playground` and be persisted with Playground provenance. The webhook now accepts the Ring key only for `ring_live`; Playground mode returns 401 for that webhook instead. A linked-account regression test proves no event, receipt, or signed-event status is written. The separate simulator key still yields `ring_simulated`.
- The legacy Event History adapter and unit test previously allowed the `ring_playground` provenance label despite the documented gate that Playground ingestion must wait for a real report. The adapter now writes `ring_live` only, the Playground label is not a callable argument, and the default-off poller is not allowed for Playground. It also maps `motion.*` event values to the same neutral `motion_detected` category as `ding` maps to `button_press`. Its old response-field and timestamp assumptions remain unverified; synthetic test input is explicitly not a captured Ring/Playground fixture or evidence.
- The probe previously copied heuristic-matched subtype and classification string values into reports, and its key redactor allowed some short/title-case dynamic keys. Reports now include allow-listed event names only; subtype/classification report paths and JSON types, not their values; unknown event values and unrecognized/dynamic keys are omitted/redacted. The final human privacy review remains mandatory.
- The Ring API client now rejects non-HTTPS bases, cross-origin paths, and redirects; OAuth token/profile requests also reject redirects. It applies a 12-second API request timeout and 2 MB streamed JSON body cap. OAuth refresh is bounded to 12 seconds. Production configuration pins Ring API/OAuth origins to the documented official HTTPS origins; authorization-code/profile processing retains its 55-second deadline. These are locally tested safeguards, not evidence of live API compatibility.
- Local simulator provenance now displays **Local · Simulated**, distinct from Ring Live, Ring Playground, and the **Synthetic demo data** marker for seeded rows.

The current exact local checks and constraints are recorded in [`docs/TESTING.md`](TESTING.md), [`docs/SECURITY.md`](SECURITY.md), and [`submission/RELEASE_CANDIDATE_REPORT.md`](../submission/RELEASE_CANDIDATE_REPORT.md). No Phase 2 ingestion, screenshots, video, publication, or deployment was performed.

### Owner-supplied official facts (checked 20 October 2026)

The owner supplied these official Ring facts and references. The agent did not independently fetch these pages, make a live API request, or inspect a redacted probe report:

- [Ring Developer Playground](https://developer.amazon.com/ring/console/playground) is the official simulator; its short-lived token is valid for about **30 minutes**. It simulates Package, Vehicle, and Motion; no Ring app/account linking or subscription is required for Playground use.
- [Ring live-video documentation](https://developer.amazon.com/docs/ring/live-video.html) describes a WHEP session: the browser creates a receive-only WebRTC video offer after ICE gathering, then the client POSTs SDP to `https://api.amazonvision.com/v1/devices/{device_id}/media/streaming/whep/sessions`. The response provides answer SDP and a `Location`; the client deletes the session with `DELETE`. The mandatory Ring watermark must remain unaltered. The optional `component_id` is omitted.
- [Ring API documentation](https://developer.amazon.com/docs/ring/api-documentation.html) documents `GET /v1/devices`, but the actual Playground response shape remains unverified here. The implementation deliberately recognizes only one bounded candidate shape and reports an unrecognized shape rather than guessing; mocked tests do not establish that Ring returns it.
- The supplied factual notes say Playground simulation modes are Package, Vehicle, and Motion and that no app/account linking or subscription is needed. Doorway Relay's local generator is not Ring's simulator. Any demo must distinguish Playground simulation video from a webhook or inbox event.

### Probe requirements and owner instructions

A devices-only probe needs `RING_ACCESS_TOKEN` and `RING_EVENT_SOURCE=ring_playground` in the local ignored `.env`; **it does not need `RING_HISTORY_DEVICE_ID`**. In the official [Ring Developer Playground](https://developer.amazon.com/ring/console/playground), generate a short-lived token. Do not put credentials on a command line, in browser code, screenshots, logs, or chat. The owner says they ran a probe on their own machine, but no redacted report or findings were supplied to this workspace; this text does not claim otherwise and does not infer what the probe found.

**PowerShell** (run from the repository root; keep the token in the editor, not on the command line):

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
# Set RING_ACCESS_TOKEN and RING_EVENT_SOURCE=ring_playground.
# Leave RING_HISTORY_DEVICE_ID blank for devices-only discovery.
npm run ring:probe
```

**Bash / Zsh** (run from the repository root; keep the token in the editor, not on the command line):

```bash
if [ ! -e .env ]; then cp .env.example .env; fi
${EDITOR:-nano} .env
# Set RING_ACCESS_TOKEN and RING_EVENT_SOURCE=ring_playground.
# Leave RING_HISTORY_DEVICE_ID blank for devices-only discovery.
npm run ring:probe
```

The devices-only run calls `GET /v1/devices`, writes a redacted, structure-only JSON report under `fixtures/ring-playground/`, and prints the redacted report. It does not save device IDs. If the response shape is unrecognized, it reports that explicitly and does not guess. The optional `RING_PROBE_PRINT_DEVICE_IDS=true` prints IDs to the **local terminal only** with the warning “local terminal only, do not paste”; that output must not be copied into the report, screenshots, logs, or chat. The report writer does not include those IDs.

For a separate History-shape probe, first review the latest real device listing and deliberately select a device ID from the official Playground/app UI. Then set `RING_HISTORY_DEVICE_ID` locally and rerun `npm run ring:probe`; do not infer an ID from an unknown response or substitute an account/event ID. History pagination is bounded at five sequential pages. The owner must inspect the generated report for privacy before sharing it. It contains bounded field paths/types/counts, allow-listed event-type strings, subtype/classification paths and JSON types (not values), timestamp-format categories, and pagination shape; it does not save raw responses, tokens, IDs, emails, or URLs. A mocked test payload is not a real report.

**Still unverified in the evidence available here:** the actual Playground device-list and Event History shapes and field semantics, stable event identity/deduplication, timestamp fields/units, event-type/subtype/classification placement, pagination behavior, whether simulated sessions appear in History, which devices are returned, and any report-specific findings. The owner-reported probe may contain observations, but its redacted report was not supplied or reviewed here.

The previous `server/src/ring/history.ts` parser and its old tests contain M5 assumptions (`data[].id`, `attributes.event_type/start`, and `relationships.source.data.id`, plus `ding`/`motion`). **The parser is not reused for Playground.** No Playground History normalization, ingestion, identity/dedup logic, or recorded-response fixture is implemented until a real report is supplied and reviewed. The API Sync route returns a safe 409 and the UI action is disabled. `ring_playground_recorded` remains reserved and is not persisted. `RING_HISTORY_POLLING_ENABLED` defaults off, and config rejects the legacy poller for `ring_playground`. The WHEP session endpoint is now a separate, optional user-triggered media-session call; no snapshot/video-download endpoint, recording, frame capture, or media storage is implemented.

The production OAuth/webhook path has not been exercised live (the earlier owner note reports no US staging device/account for that path). The owner says they ran a Playground probe on their own machine, but its report and findings were not supplied here. A Playground API probe or WHEP session is separate from a Ring-signed webhook. Keep `ring_live`, `ring_playground`, `ring_playground_recorded`, `ring_simulated`, and `manual` separate; do not infer identity or intent from footage. Human confirmation remains necessary for any delivery handoff.

See [`docs/TESTING.md`](TESTING.md), [`API.md`](API.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`BUILD_LOG.md`](../BUILD_LOG.md), and [`HUMAN_VISUAL_REVIEW.md`](HUMAN_VISUAL_REVIEW.md) for local test records and owner actions.

**M7 verification boundary (2026-10-18, historical):** M7 inspected local runtime code and verified local Ring/API tests, but did not contact Ring. The M5 links and rule conclusions then available were dated 2026-10-17; M7 could not re-fetch `developer.ring.com` or Devpost because those hosts were outside the sandbox's outbound allowlist. This did not establish current eligibility or a Ring response. At that time no official Playground event, Ring device event, authenticated API response, portal app, or Ring-issued signature was available. Config required explicit `RING_EVENT_SOURCE` when Ring credentials, token, HMAC key, or history device were supplied. At M7 recovery, older milestone commit objects named in historical notes were absent; see [`BUILD_LOG.md`](../BUILD_LOG.md) and [`TESTING.md`](TESTING.md).

**M6 checkout note (2026-10-18, historical):** At the M6 audit the checkout was at `28f9d2f` and lacked the reported M4/M5 commit objects; the application and docs were present as untracked working-tree files. That discrepancy was recorded without resetting, staging, or rewriting history in [`BUILD_LOG.md`](../BUILD_LOG.md). The current M11 checkout has a local snapshot-restoration commit; this does not change the evidence boundary: no live Ring connectivity is established here.

**M5 status (2026-10-17): local webhook, account-link boundary, and event-to-handoff paths verified with tests/stubs; Ring is not connected.** The local signed simulator returned HTTP 200 for both supported event types and both records were stored as `ring_simulated` with `is_synthetic = 0`. No Ring credential, authenticated Ring API response, real Ring device event, Ring-signed webhook, or official Ring sandbox interaction was available. This is not a claim of live compatibility, Ring certification, or Devpost compliance.

## M5 review and implementation changes

The review began from M4 commit `8175984`; M2–M4 changes remain in the branch history. M5 updated the Ring webhook/history and account-link adapters, the account-link page/configuration, their tests, and the Ring integration documentation. The implementation is committed locally as `97e790b` (`fix: align Ring adapter and account linking`) on `arena/51d1d642-doorway-relay`; it was not pushed. A separate docs-only closeout records this commit:

- `server/src/ring/webhook-schema.ts` no longer assumes every v1.1 `meta.request_id` is UUID-shaped. The current official sensor example uses a longer opaque ID with a suffix; the adapter now accepts a bounded non-empty opaque ID so valid unsupported sensor events can still be acknowledged rather than rejected with a permanent 4xx.
- The current Ring Motion Detection reference places the subtype in `data.attributes.sub_type`. Normalization now treats that as canonical, preserves the earlier supplied `data.subType` form only as a compatibility fallback, and keeps a motion event neutral if neither field is present.
- `server/src/ring/history.ts` now maps the documented Event History values `ding` → `button_press` and `motion` → `motion_detected`, reads device identity from `relationships.source.data.id`, and keeps Event History IDs opaque. Other history labels, including `on_demand`, remain ignored.
- The account-link route/page now accept only the documented `time`/`nonce`, match the nonce to the stored unclaimed-token account, check `/v1/users/me`, send the documented masked-identifier POST and completion PATCH, and claim the pair only after success. Removed unsupported caller-supplied account IDs and static JSON body overrides.
- Ring webhook, normalization, history, and account-link tests cover these cases. No database schema, migration, or media-access path was added.

## Official references checked during M5

The current public resources below were fetched on **2026-10-17**. Public documentation loaded; authenticated portal content did not.

- [Ring Developer](https://developer.ring.com/) — public overview of Ring APIs, motion/button events, status/history, and the Ring MCP knowledge server.
- [Getting Started with Ring Developer Experience](https://developer.amazon.com/docs/ring/get-started.html) — developer registration, identity verification, app lifecycle, and testing overview.
- [Configure Phase](https://developer.amazon.com/docs/ring/configure.html) — Public vs Private apps, scope groups, one-time credentials, and staging/production endpoint setup.
- [Ring Partner API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html) — current consolidated API, OAuth, account-link, webhook, event-history, retry, and payload details.
- [Ring API Development Guide](https://developer.amazon.com/docs/ring/develop.html) — configure/build/test guidance and staging prerequisites.
- [Ring Appstore MCP Server](https://developer.amazon.com/docs/ring/ring-mcp.html) — remote `search_docs`/`get_doc` tools for documentation lookup; it is not an event simulator or an application runtime API.
- [Devpost hackathon rules](https://amazonappdev2026.devpost.com/rules) and [resources](https://amazonappdev2026.devpost.com/resources) — Ring track and accepted demonstration paths, plus links to the portal and AmazonAppDev's [Ring API Hello World sample](https://github.com/AmazonAppDev/ring-api-helloworld).

`https://developer.amazon.com/docs/ring/` still returned a 404 directory page, but the current deep links above loaded. In the earlier 2026-10-17 follow-up, the supplied `notifications.html`, `motion-detection.html`, `button-press.html`, and `account-linking.html` links returned 404; M5 instead verified the current consolidated `api-documentation.html`. The older [development guide](https://developer.amazon.com/docs/ring/develop.html) still summarizes only three webhook types, while the newer API reference lists additional lifecycle, subscription, and sensor events. Treat the detailed API reference as the richer current contract, but retain this source inconsistency as an open documentation issue.

**Historical M5 access note (2026-10-17):** The developer console and Ring Playground URLs redirected to Amazon sign-in; no sign-in was attempted, and no authenticated app, token, or credential screen was inspected. This is not evidence that the Playground is unavailable. The owner-supplied official facts above (checked 2026-10-20) identify the Ring Developer Playground as the official simulator and summarize its Package, Vehicle, and Motion simulations. The agent has not used the Playground or inspected the owner's probe results. No real WHEP session was established in this workspace.

### Tooling and Devpost boundary

- The API reference says there is **no official Ring Partner SDK** and recommends ordinary HTTP clients/tools (for example, `curl`, Postman, Bruno, and standard language libraries). The Ring MCP server is documentation search/retrieval for an IDE, not a source of Ring events.
- Devpost permits an app using Ring APIs, SDKs, simulators, or devices, demonstrated via a simulator or actual device; it also requires the track technology to be used at runtime. The Doorway Relay fixture below is Doorway Relay's own Ring-shaped local simulator, **not** a Ring simulator listed in Ring's developer documentation. No claim is made that the fixture alone satisfies the Ring-track runtime requirement.
- The official AmazonAppDev sample was inspected as a reference only; it was not installed or run. M5 made no media request. M11 added an optional server-relayed WHEP session path using the documented live-video endpoint, but this agent did not make a Ring request or establish a session. No snapshot/download endpoint, recording, frame capture, or media storage is implemented.

## Ring contract details observed in M5 public references (not rechecked in M7)

### Operations and authentication

The documented API base is `https://api.amazonvision.com`; Ring OAuth is hosted at `https://oauth.ring.com`. API calls are server-to-server and use `Authorization: Bearer <access_token>`; the API reference warns against browser-initiated requests.

Operations relevant to this adapter and its account flow include:

- `GET /v1/users/me` — obtain the authenticated Ring account ID from the JSON:API `data.id`.
- `GET /v1/devices` — list authorized devices; the app's authenticated check also calls this endpoint.
- `GET /v1/history/devices/{device_id}/events` — retrieve event metadata. The current history vocabulary is `ding`, `motion`, and `on_demand`; the first two are mapped to the app's two door-event types. The optional poller currently reads one response page and does not follow `links.next`.
- `POST /v1/accounts/me/app-integrations` — one-way account-link verification using `nonce` and optional `account_identifier`; `PATCH` updates the link to `status: "completed"`.
- `POST https://oauth.ring.com/oauth/token` — documented form-encoded code exchange (`grant_type=authorization_code`, `client_id`, `code`, `client_secret`) and refresh (`grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`). The docs show an access token, refresh token, token type, scope, and expiry in the response.

Authorization codes are documented as one-time and valid for 60 seconds; access tokens last about four hours and refresh tokens about 30 days. The OAuth service's 55-second exchange/profile deadline and outgoing form fields are covered by tests. These facts verify the **outgoing** OAuth request contract; they do not define Ring's **inbound** Token Exchange callback body.

### Account-link boundary

The current one-way account-link documentation shows Ring redirecting to the Account Link URL with `time` and `nonce` query parameters. It documents a 600-second HMAC-SHA256 nonce window, URL-safe Base64 without padding, and the nonce input `<time_ms>:<account_id>`. The account ID is obtained from the unclaimed token's `GET /v1/users/me` profile; after the partner user signs in, the documented API sequence is POST nonce verification then PATCH `status: "completed"`.

The local account-link route now follows that published one-way contract: the browser submits only `time` and `nonce`; the server reads the Ring account ID from the stored unclaimed-token record (OAuth tokens remain encrypted), verifies the 600-second HMAC nonce against that ID, checks the stored token's `/v1/users/me` identity, then POSTs `{ account_identifier: <masked signed-in email>, nonce }` and PATCHes `{ status: "completed" }`. It claims the token pair only after both API calls succeed. The former caller-supplied `accountId` and speculative static JSON overrides were removed. Unit and route tests cover the identity check, request bodies/order, nonce rejection, masking, and claim timing using stubs. No actual portal callback or Ring API response was observed; the route has not been live-tested and cannot receive an unclaimed pair through the disabled-by-default inbound Token Exchange path until Ring confirms that callback contract.

### Webhook envelope, events, and provenance

The current v1.1 contract documents `meta.version`, UTC ISO-8601 `meta.time`, opaque `meta.request_id`, and `meta.account_id`; `data.id` is also treated as opaque. Door-event payloads include `data.type`, `attributes.source`, `attributes.source_type: "devices"`, an epoch-millisecond `attributes.timestamp`, and a device relationship. The current Motion Detection reference puts subtype at `attributes.sub_type` (for example, `motion`, `human`, `vehicle`, `package_delivery`, or `other_motion`, depending on Smart Alerts). The app keeps the handoff summary neutral; it does not infer a visitor, person, or delivery from Ring's classification.

The detailed API reference lists `button_press`, `motion_detected`, `device_added`, `device_removed`, `device_online`, `device_offline`, `app_integration_added`, `app_integration_removed`, `subscription_activated`, and `subscription_deactivated`, plus sensor types including `contact_sensor_faulted/cleared`, `tamper_detected/cleared`, `flood_detected/cleared`, `freeze_detected/cleared`, `temperature_exceeded/cleared`, `humidity_exceeded/cleared`, `pm25_exceeded/cleared`, and `co_exceeded/cleared`. The older Develop page's three-event summary does not enumerate all of these. Doorway Relay creates inbox events only for `button_press` and `motion_detected`; other documented and unknown event types are schema-valid, stored only as receipts when accepted, and acknowledged as ignored with HTTP 200. Sensor request IDs are accepted as opaque IDs; sensor events are not turned into handoffs.

The app verifies `X-Signature: sha256=<hex>` as HMAC-SHA256 over the exact raw request bytes, using constant-time comparison. A Ring-key signature is accepted only under `ring_live`; `ring_playground` API access is not a webhook. The separate local key is always `ring_simulated`. For supported non-simulator events, `meta.account_id` must match a claimed, linked Ring token account before an inbox event is stored. Delivery retries deduplicate by `meta.request_id`; repeated upstream events deduplicate by `data.id`. Event History uses its opaque event ID for `external_event_id` and has no webhook request ID.

The documented webhook requirements include public HTTPS/TLS 1.2+, `POST application/json`, response within five seconds, and HMAC verification. Ring documents 2xx as delivered, 4xx as permanent/no-retry, and 5xx/timeouts as retryable, with delays of 1 second, 5 seconds, 30 seconds, 2 minutes, 10 minutes, then 1 hour (seven attempts total); exhausted events are retained in a dead-letter queue for 72 hours. Doorway Relay responds 200 to valid accepted/duplicate/ignored events, 401 to a missing/invalid signature, 400 to malformed or invalid required payload fields, and 500 on receipt-persistence failure. Tests cover those responses, duplicate handling, account mapping, and the under-five-second local handler path. No actual Ring retry was induced.

### Developer account, app, scopes, credentials, and staging

The current Getting Started/Configure pages say a developer must register and complete identity verification (government-issued photo ID) before app creation/submission. The portal supports Public apps (certification/public listing) and Private apps (personal/known-group integration); the app type and scopes are selected during creation.

The portal issues a Client ID, Client Secret, and HMAC Signature Key. The Configure page says the values are shown once and cannot be regenerated in place; before certification, credential replacement means deleting/recreating the app, and after submission it requires Ring Support. Keep values in the ignored server-side `.env`; never put them in Git, browser code, logs, screenshots, or chat.

The Cameras and Doorbells scope was described in the M5 public-source review as one group toggle that includes motion events, doorbell presses, livestream, and video downloads; those capabilities could not then be individually deselected within the group. Account/lifecycle events were described as always available; sensors and chimes as separate groups. M11 adds only the explicitly user-triggered, receive-only WHEP session path described above; it does not call snapshot/download endpoints, record video, capture frames, or persist media. The official facts supplied by the owner say the Playground simulator does not require an app/account link or subscription. The earlier Develop staging guide described a separate staging path with a Ring account/device, active Ring Protection subscription, and US-located devices; current portal provisioning for this project was not inspected. This agent did not create a Ring app/scope, acquire or use a paid plan/device/cloud resource, or make a real media call.

The Devpost resources page advertises a free Ring account for API access; that does not replace the portal's identity-verification/app setup or prove that this workspace has credentials. The `RING_ACCESS_TOKEN`, Client ID, Client Secret, Ring HMAC key, history device ID, and callback endpoints were all **unset** in the ignored `.env` at the M5 credential-availability check. Only local simulator/encryption configuration was present; no values were printed or copied.

## Token Exchange — inbound contract remains unverified and disabled

The current Configure page documents that Ring **POSTs an authorization code** to the partner Token Exchange URL, and the API deployment guide says the code must be exchanged within 60 seconds. The documentation does **not** specify the exact incoming content type, body field/nesting, required headers/authentication, or the success response Ring expects. This is distinct from the documented outgoing form request to `https://oauth.ring.com/oauth/token`.

`RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains **false by default**; `/api/ring/token-exchange` returns 503 before parsing or contacting Ring while disabled. Production configuration rejects attempts to set it to `true` while the inbound contract is unverified. In a non-production environment only, explicitly enabling it exercises the unverified JSON/form top-level `code` assumption and returns the app-local `200 { status: "accepted" }`; neither is a Ring contract. Keep the route disabled until Ring provides the full inbound request and acknowledgement contract. `RING_OAUTH_CONTRACT_VERIFIED=true` refers only to the outgoing form exchange/refresh contract established in the public API reference.

## M5 verification commands and results

| Command / check | Result |
|---|---|
| Initial Ring-focused baseline: `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass before M5 edits: 9 files / 41 tests. |
| Ring-focused post-change run: `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass: 9 files / 46 tests. Covers webhook signature/tamper handling, account matching, idempotency, unsupported-event acknowledgement, persistence failure → 500, OAuth form/refresh/retry, nonce, account-link route/body/claim sequence, normalization, history mapping, and status. |
| Local event-to-handoff checks: `npx vitest run --config vitest.config.ts client/src/workflow.integration.test.tsx server/src/vertical-slice.test.ts server/src/domain/inbox.test.ts` | Pass: 3 files / 3 tests. The rendered workflow uses `ring_simulated`, human inbox classification, handoff creation, assignment, acknowledgement, resolution, activity, and persistence. |
| CLI simulator via an in-memory app bound only to `127.0.0.1` on an ephemeral port: `npm run simulate:ring -- button_press`; `npm run simulate:ring -- motion_detected` | Both exited 0 and returned HTTP 200 `accepted`. The temporary DB held exactly 2 `ring_simulated` source events (`button_press`, `motion_detected`), `is_synthetic = 0`, 2 receipts, and no signed Ring event. No public listener or tunnel was used. |
| `npm test` | Pass: 19 files / 67 tests. |
| `npm run typecheck` | Pass: server and client TypeScript checks. |
| `npm run lint` | Pass: zero warnings. |
| `git diff --check` | Pass. |
| `npm run build` | **Not run**, per the standing no-rebuild instruction. |

## Live-verification blocker and remaining demonstration steps

No authenticated portal session, Ring API token, Ring app, Ring account/device, staging interaction, or live Ring-signed webhook was available. The official portal links redirected to Amazon sign-in; no credentials were requested in chat or printed from `.env`. Therefore M5 verifies the local adapter and workflow only, not Ring connectivity.

For a later **authenticated API check only**, the user would need to sign in to the [Ring Developer Playground](https://developer.amazon.com/ring/console/playground), generate the documented short-lived token, and place it directly in the ignored `.env` as `RING_ACCESS_TOKEN` (never in chat). The authenticated `/api/ring/check` path checks the profile and device list; that is not a webhook test and does not create a live event.

A real webhook additionally requires a configured app and an endpoint Ring can reach. Ring's documented staging webhook URL would be `https://<user-approved-host>/api/ring/webhook`, publicly reachable over HTTPS/TLS 1.2+ and capable of responding within five seconds. The current development API is local HTTP only. No tunnel, deployment, or public exposure was created. A future test could use a **user-approved, temporary HTTPS proxy restricted to the webhook path** (or an isolated staging endpoint), with Ring's HMAC key stored only server-side and signature validation/rate limits active. Public exposure broadens the attack surface; do not expose the full development server or proceed with a tunnel until the user explicitly approves the endpoint and security plan.

Before live webhook testing, Ring must confirm the unpublished inbound Token Exchange body/response, and staging eligibility/device/subscription requirements must be verified without acquiring a paid resource. The account-link route has been aligned to the documented one-way flow but still needs a Ring-confirmed unclaimed-token handoff and live API verification. Then, with approved credentials and an endpoint, verify a real Ring signature, account match, event normalization, duplicate/retry handling, inbox classification, and handoff/activity creation. Keep `ring_live`, `ring_playground`, `ring_simulated`, and `manual` distinct throughout.

## M6 update (2026-10-18)

M6 added only local security/deployment safeguards: production origin/session/database-path validation, loopback listener defaults, a SQLite readiness check, safer Token Exchange rejection logging, and a production guard for demo seeding. `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains `false` by default, and production configuration rejects attempts to enable it while the contract remains unverified. No Ring endpoint, account, app, token, device, or signed event was used. The M6 local smoke/test results and the Git-checkout discrepancy are recorded in [`BUILD_LOG.md`](../BUILD_LOG.md), [`TESTING.md`](TESTING.md), and [`DEPLOYMENT.md`](DEPLOYMENT.md).
