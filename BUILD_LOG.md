# Build log — Doorway Relay

**Session date:** 2026-10-18 (Asia/Kolkata; 2026-10-22 18:00 IST was a previously recorded target date, not reverified against current Devpost rules)<br>
**Branch:** `arena/51d1d642-doorway-relay` (fixed by this Arena session; do not change branches)<br>
**M7 recovery starting commit:** `28f9d2f0dfb6f2b4268d8d8dbf1d5afbd8b6d601`, dated 2026-10-17.<br>
**Historical milestone commit IDs:** Earlier sections record commits reported by prior milestones (including `ac0d03b` and `766fdeb`). M7's local object database did not contain those commit objects or any unreachable trees; treat these as historical log entries, not recoverable Git history.<br>
**Repository:** `origin` is `https://github.com/ShoryaPratapSinghChandrawat/doorway-relay.git`. M7 read-only checks report the GitHub repository is **public**, default branch `main`; remote `HEAD` and `main` point to the same README-only initial commit as M7's recovery base. No project source has been pushed. No push, visibility change, release, or deployment was made or authorized.

## Scope and source-of-truth boundary

The priority is a persistent event → inbox → classified handoff journey with explicit state transitions and append-only activity. A local HMAC-signed simulator exercises the public webhook route using separate test-key provenance (`ring_simulated`). It is not the Ring Playground and is not a live Ring event. The app status remains `connected: false` unless evidence from an authenticated Ring API call or verified Ring-signed event is recorded.

At the M1 audit, the official Ring documentation host failed from this sandbox with `SSL_ERROR_SYSCALL`. The older official `AmazonAppDev/ring-api-helloworld` sample (main commit `76100aa2892b2f4ece7879701bd9934d3f1e7743`, observed 2026-07-01) describes Playground token/API exploration; its webhook schema differs from the later user-supplied v1.1 contract and its sample handler does not verify HMAC. The user subsequently supplied the current webhook contract and reviewed six official Ring references; this follow-up fetched Configure and Develop but received 404 pages for Notifications, Motion detection, Button press, and Account linking. The inbound Token Exchange body, live Ring access, app integration request bodies, MCP, and Playground webhook capability remain unverified. See the current status in `docs/RING_INTEGRATION.md`, `docs/FRICTION_LOG.md`, and the follow-up log below.

## Completed implementation

### Milestone 1 — Ring research and adapter boundary

- Recorded official-source observations and their limits. Kept credentials server-side, status evidence-derived, and live/Playground/simulator provenance distinct.
- Implemented raw-byte HMAC validation, request/event deduplication, normalization, replay nonce, encrypted token storage/refresh, an HTTP API adapter for documented sample paths, and an isolated opt-in history poller. At the initial implementation stage OAuth exchange/refresh stayed disabled pending docs; continuation M2 later aligns the outgoing endpoint/form and default gate to the user-supplied verified contract. The inbound Token Exchange HTTP route remains fail-closed pending its exact body.
- Ring app-integration POST/PATCH payloads are not guessed: integration is disabled unless exact current official JSON bodies are supplied via server-side configuration. Production configuration rejects the local simulator key.
- Tests cover raw-body signatures, malformed/tampered/duplicate events, token encryption/rotation, API retries, the default-disabled unverified OAuth path, and account-ID match/POST→PATCH ordering.

### Milestone 2 — SQLite, authentication, lifecycle, API

- Added two sequential SQLite migrations with foreign keys, indexes, unique source-event ownership, triggers preventing activity updates/deletes, and database guards for source-event/status invariants.
- Added scrypt password hashes, signed HTTP-only session cookies, CSRF/origin checks, rate limits, Zod validation, structured errors, API routes, and a transaction-based handoff lifecycle.
- Tested allowed/blocked actions, append-only activity, manual/inbox creation, persistence, API auth and CSRF. Acknowledgement never means resolution; stalled/overdue are computed from stored timestamps.

### Milestone 3 — signed event → inbox → handoff

- Added an explicitly labeled synthetic demo seed and a simulator CLI that signs the same raw JSON bytes delivered to `/api/ring/webhook`.
- Added `server/src/vertical-slice.test.ts`: signed simulated event → inbox classify → assign → acknowledge → resolve → close/reopen database → duplicate replay.
- Local CLI smoke: two migrations applied; `npm run seed:demo` created/preserved explicitly synthetic fixtures for three workspace members; three `npm run simulate:ring` invocations returned HTTP 200 `accepted` through the API.
- Local API smoke: demo login returned 200; overview returned SQLite-backed counts; integration state was `verified_simulator` with `connected: false`. No Ring server/device/Playground call was made.

### Milestone 4 — accessible frontend MVP

- Added responsive overview, handoff list/detail/activity, manual create, inbox classification/ignore, Ring status, and preferences pages with shared shell, keyboard focus styling, reduced-motion/larger-text settings, and explicit source/status labels.
- Added component/route tests for data states, manual form validation, signed-in/out routes, and keyboard-operable mobile navigation (focus, Escape, and focus wrap). Human visual rendering, browser console, desktop/mobile sizing, and full keyboard review remain unverified because no browser executable/automation tool was available. A workspace preview had been running before continuation M1, was stopped before `npm ci`, and could not be restarted after the install failure.

### Milestone 5 — hardening, verification, and submission kit

- Added `README.md`, architecture/API/testing/Ring/friction docs, `.env.example`, `.gitignore`, and submission drafts. MIT `LICENSE` remains a draft pending user confirmation of the copyright holder; do not publish.
- Checks recorded before continuation M1 (historical; not freshly re-run): `npm test` → **17 files / 43 tests passed**; `npm run lint` → pass with zero warnings; `npm run typecheck` → server + client pass; `npm run build` → pass (Vite client JS 339.31 kB / 102.41 kB gzip; CSS 29.78 kB / 7.71 kB gzip); `npm audit --audit-level=moderate` → 0 vulnerabilities reported.
- A local `.env` and `data/doorway-relay.sqlite` were created for smoke testing; both are ignored. Confirmed `git check-ignore` covers both. No credentials were entered into chat or sent to Ring.
- Submission copy now reflects verified work and limitations. No actual screenshot/video/Devpost submission exists. Demo length target is <3 minutes; user records/uploads/submits.

## Pre-M1 verification snapshot (historical; continuation M1 rerun results follow)

| Check | Result |
|---|---|
| `npm test` | Pass — 17 files, 43 tests |
| `npm run lint` | Pass — zero warnings |
| `npm run typecheck` | Pass — server + client |
| `npm run build` | Pass — client production build |
| SQLite migrate + seed | Pass — two migrations; three demo members; fixtures explicitly synthetic |
| Signed simulator CLI | Pass — HTTP 200 `accepted`, simulator provenance |
| Local health/login/overview/status smoke | Pass — status remains `verified_simulator`, `connected: false` |
| Human browser, keyboard, desktop/mobile review | Pending — no browser executable/automation available in this session |
| Live Ring API/webhook/MCP/Playground | Not verified; no live credentials, app, device, or call |
| Secret scan | Pass — scanned tracked/non-ignored working files and existing Git history; no credential patterns found. `.env` and `data/doorway-relay.sqlite` are ignored. |
| Remote visibility / push | Blocked — `gh repo view` reports `isPrivate: false`; `gh repo edit --visibility private` failed HTTP 403. No new code has been pushed. |
| Commit | Pass — local implementation commit `ac0d03b` on `arena/51d1d642-doorway-relay`; not pushed. |
| Screenshot/video/Devpost submission | Pending; user records/uploads/submits |

## Human actions / blockers (historical M5 plan; status superseded by M7 closeout below)

1. In `https://developer.amazon.com/ring/console/apps`, create the app and securely retain the one-time Client ID, Client Secret, and HMAC Signing Key. Put secrets only in ignored `.env`; never paste them into chat. Confirm a US staging account/device and eligible Protection plan if available.
2. Check `https://developer.amazon.com/ring/console/playground` for current access and webhook capability. A token alone is not proof of webhook delivery. Report the observed UI/docs so the integration contract can be updated.
3. If a public HTTPS endpoint is needed for staging, approve before any tunnel/account is created. A one-off Cloudflare Quick Tunnel is the initial free option to consider, but its current terms/availability are unverified; nothing has been installed or started. `localhost` cannot receive Ring webhooks.
4. Post `submission/DEVPOST_QUESTION.md` when ready and share the organizer's answer. It has not been posted; no approval is known.
5. Confirm the MIT copyright holder. Keep the repository private until explicitly told “publish”; do not add reviewers until submission time.
6. No AWS services/costs are planned or approved. Ask before enabling any.
7. **Privacy blocker:** GitHub currently reports the origin as public, and this session cannot change it (HTTP 403). Ask the owner to reconnect GitHub with repository-admin permission or set the repo private in GitHub settings. Do not push any new code until the repo is verified private, unless the owner explicitly says “publish.” The local Arena branch can be committed meanwhile.
8. After human browser review and any required staging, rerun checks and scan the staged diff/history for secrets. User records/uploads the <3-minute video and submits Devpost.

## Continuation M1 — audit and baseline (2026-10-17)

**Scope:** Audit and baseline only. No application code, configuration, tests, dependencies, or lockfile were intentionally changed. The only tracked M1 change is this progress log. The five Section 5 findings below are compared with the Ring contract supplied in the continuation prompt; they are not claimed as independently re-verified against current Ring documentation.

### Git, workspace, and source inventory

- Work remained on `arena/51d1d642-doorway-relay`; M1 began at local `HEAD` `766fdeb`. The working tree was clean before checks and remained clean apart from this log. No branch switch, push, remote edit, or visibility change occurred.
- `origin` remained `https://github.com/ShoryaPratapSinghChandrawat/doorway-relay.git`. `gh repo view` again reported `isPrivate: false`; the earlier HTTP 403 visibility-change attempt was not retried.
- Runtime: Node `v22.22.3`, npm `10.9.8`, Git `2.39.5`. `package-lock.json` is tracked, lockfile version 3, 6,001 lines, root package `doorway-relay@0.1.0`; it had no M1 diff. `npm ci` reached `better-sqlite3`'s native build, so it did not fail on a lockfile mismatch.
- Inspected package scripts/dependencies, README, `.env.example`, `.gitignore`, both SQLite migrations and migration runner, the complete test inventory and relevant API/Ring/vertical-slice test sources, API/auth/session, Ring OAuth/token/account-link/webhook/signature/history/status, simulator, configuration, docs, submission drafts, and this log. There are 17 tracked test files and two migrations.
- `git check-ignore -v` confirmed `.env` and `data/doorway-relay.sqlite` are ignored; `.env.example` is intentionally tracked. No secrets were printed or added.

### One-time network and browser preflight

One `curl --head` request was made to each requested host; no host was retried.

| Host | Result |
|---|---|
| `developer.amazon.com` | HTTP `000`, curl exit `35`: `OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| `oauth.ring.com` | HTTP `000`, curl exit `35`: `OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| `api.amazonvision.com` | HTTP `000`, curl exit `35`: `OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| `github.com` | HTTP `200` |
| `registry.npmjs.org` | HTTP `200` |

No current Ring documentation or live API response was obtained from those failed hosts. No `chromium`, `chromium-browser`, `google-chrome`, `google-chrome-stable`, or `firefox` executable was found. The local package tree had no Playwright, `@playwright/test`, or Puppeteer dependency; no human visual review was performed.

### Fresh baseline commands

| Command | M1 result |
|---|---|
| `npm ci` | **Failed, exit 1.** `better-sqlite3`'s `node-gyp rebuild` tried to download `https://nodejs.org/download/release/v22.22.3/node-v22.22.3-headers.tar.gz`; attempt 1 failed with `ECONNRESET` / `Client network socket disconnected before secure TLS connection was established`. `nodejs.org` is outside this session's allowed outbound hosts. Per the one-attempt instruction, it was not retried. |
| `npm run typecheck` | **Could not start, exit 127:** `tsc: not found`. |
| `npm run lint` | **Could not start, exit 127:** `eslint: not found`. |
| `npm test` | **Could not start, exit 127:** `vitest: not found`. No tests ran in M1. |
| `npm run build` | **Could not start, exit 127:** `tsc: not found`; Vite build was not reached. |
| `npm audit` | **Pass:** `found 0 vulnerabilities` (using the lockfile). |
| `npm run db:migrate` with a new temporary empty database path | **Could not start, exit 127:** `tsx: not found`. No migration was applied; temporary directory was removed. |
| `npm run dev` | **Could not start, exit 127:** `concurrently: not found`; no listener started. |
| `npm run simulate:ring` | **Could not start, exit 127:** `tsx: not found`; the simulator made no HTTP request, so no event was accepted. |
| `git diff --check` (after the M1 log update) | **Pass:** no whitespace errors. |

The previous implementation-time results (17 files / 43 tests, plus lint/typecheck/build passes) remain historical only; they were not reproduced by M1. Because dependency installation failed, M1 has no fresh test, build, migration, server-start, or simulator-success result.

### Section 5 findings — source inspection only; no fixes

1. **Nonce timestamp unit mismatch — confirmed in code.** `server/src/app.ts` accepts `time` with at most 12 decimal digits; `server/src/ring/nonce.ts` compares it to `Math.floor(Date.now() / 1000)`. The supplied Ring contract uses milliseconds, so a normal 13-digit millisecond timestamp is rejected by the schema and the verifier otherwise interprets the value as seconds.
2. **OAuth exchange adds `redirect_uri` — confirmed in code.** The token-exchange route requires `redirect_uri`, and `server/src/ring/oauth.ts` includes it in the authorization-code form. The supplied contract says this Ring exchange has no `redirect_uri` field.
3. **Token URL/default gate do not implement the supplied contract — confirmed in config/code.** `RING_TOKEN_URL` defaults to `null` and is not derived from `RING_OAUTH_BASE_URL`; the OAuth contract gate defaults to `false`. Exchange requires the gate, token URL, and client credentials, then uses the form above. This keeps the unverified exchange disabled by default, but does not supply the contract's `/oauth/token` endpoint/body as a working default.
4. **Token Exchange workflow lacks required post-exchange steps/timeout — confirmed in code; inbound body remains unknown.** `/api/ring/token-exchange` accepts assumed `code` plus `redirect_uri`, exchanges and saves a token pair, but has no explicit 60-second fetch timeout, does not call `/v1/users/me` in this exchange path, and has no explicit unclaimed-token/account-claim state (the store is a single global row). The later account-link route's profile check does not fill this gap in the Token Exchange path. The actual Ring inbound request body is still unknown; no alternative body was guessed.
5. **Webhook envelope compatibility — unverified, not declared incorrect.** `server/src/ring/webhook-schema.ts` requires a `meta.request_id` and JSON:API-style `data.id`/`data.type`/`data.attributes`; exact current Ring v1.1 envelope/field compatibility was not established. The only direct preflight to the Ring docs host failed as above, and no live Ring webhook was available.

### Verification classification and remaining actions

- **Source-verified:** the current code structure and the five discrepancies above; tracked inventory; ignore rules; lockfile metadata; current Git/remote visibility query.
- **Freshly runtime-verified:** only `npm audit` (zero vulnerabilities) and `git diff --check`. The earlier test/build/migration/simulator passes are historical, not M1 results.
- **Unverified:** current Ring contract and live connectivity, OAuth/account-link execution, webhook field compatibility, 60-second delivery behavior, browser rendering/keyboard review, and current runtime tests/build/migrations/simulator smoke.
- No credential, Ring portal/device, public tunnel, AWS, screenshot, video, deployment, or Devpost action was used during M1. M1 was committed locally only; its patch was exported outside the Git repository as `/home/user/doorway-relay-M1.patch`. **At M1 close, M2 had not started; the user later explicitly authorized M2.**

## Continuation M2 — OAuth/nonce foundation (initial local commit `1e2a785`, 2026-10-17)

**Status at initial M2 commit:** Implemented the parts supported by the user-supplied outgoing OAuth/nonce contract. At that point the partner Token Exchange inbound body and webhook event payload had not been supplied, so the route failed closed and webhook schema/normalizer were unchanged. This initial status and its pending-docs section are superseded by the bounded follow-up below; no contract was guessed.

### Changes made

- Nonce validation now requires a 13-digit millisecond timestamp, calculates age in milliseconds, accepts the exact 600,000 ms boundary, rejects future/stale/seconds-form timestamps, and retains constant-time HMAC comparison. The account-link request schema enforces the same timestamp shape.
- The default OAuth URL is derived as `${RING_OAUTH_BASE_URL}/oauth/token` (default `https://oauth.ring.com/oauth/token`); `RING_OAUTH_CONTRACT_VERIFIED` defaults to `true` based on the user-supplied verified contract and can still be explicitly disabled. Authorization-code form fields are `grant_type`, `client_id`, `code`, and `client_secret`; `redirect_uri` was removed.
- The OAuth service has one shared 55-second abort deadline for the token POST and subsequent `GET /v1/users/me`; it stores the encrypted pair only after the profile yields an account ID. Migration `003_ring_token_claim_state.sql` records that account ID and nullable `claimed_at`. Account linking uses the stored pair, requires a matching unclaimed account, and claims it only after its configured POST/PATCH steps succeed.
- `/api/ring/token-exchange` no longer parses an assumed `{ code, redirect_uri }` body. It returns 503 `ring_token_exchange_body_unverified` until the exact Ring-to-partner request body is supplied. The webhook schema and event field normalization remain unchanged pending the Notification payload documentation.
- Updated `.env.example`, README, API/Ring/Testing docs, migration notes, and this log to distinguish the user-supplied outgoing OAuth contract from the two still-unknown incoming contracts.

### M2 test status at initial commit — written, not run

At commit `1e2a785`, tests were added/updated in `server/src/ring/nonce.test.ts`, `server/src/config.test.ts`, `server/src/ring/oauth-client.test.ts`, and `server/src/app.test.ts` for millisecond nonce boundaries/rejections, endpoint/gate defaults, the exact authorization-code form (no `redirect_uri`), profile GET ordering, shared deadline abort, unclaimed-token persistence/claiming, no persistence without an account ID, millisecond route validation, and fail-closed behavior for the then-unknown incoming Token Exchange body. They had not been run at that commit. The supplement below records the later webhook work and actual suite results.

### M2 installation and checks actually attempted

| Command | Result |
|---|---|
| `npm ci --nodedir=/usr/local` | **Pass:** installed 344 packages; local `/usr/local/include/node` headers matched Node `v22.22.3`; npm reported 0 vulnerabilities. This was the single requested `--nodedir` install attempt. |
| `npm run lint` | **Pass:** exit 0, no warnings. It ran before the final test-fixture-only type annotation correction. |
| `npm run typecheck` | First attempt **failed, exit 2:** `server/src/ring/oauth-client.test.ts(34,21): TS2379` because `{ init: RequestInit | undefined }` did not match an optional property under `exactOptionalPropertyTypes`. The fixture type was corrected; the subsequent server/client typecheck **passed**. This is not a test-suite result. |
| `npm run db:migrate` with a new temporary empty database path | **Pass:** applied migrations 1, 2, and 3; temporary directory was removed. |
| `npm test` | **Not run by instruction.** |
| `npm run build`, simulator smoke, live Ring/API calls | **Not run.** |

### Exact local commands to run

From the repository root, after creating the ignored `.env` as described in `README.md`:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

To apply migrations to a new temporary SQLite file on a POSIX shell:

```bash
tmpdir="$(mktemp -d)" && DATABASE_PATH="$tmpdir/empty.sqlite" npm run db:migrate
```

Optional local simulator smoke only (not a Ring event): run `npm run dev` in one terminal and `npm run simulate:ring` in a second terminal. No tunnel is needed or authorized.

### Documentation needed at initial M2 commit — superseded by the supplement

At commit `1e2a785`, the next request was for the current v1.1 webhook fields and the partner Token Exchange inbound request body. The user later supplied the webhook contract and clarified that the inbound body is unpublished; the supplement below implements the former and documents the latter without inventing a Ring contract.

No tunnel was started. The earlier cumulative M2 patch remains `/home/user/doorway-relay-M2.patch`; the updated cumulative patch is exported after the supplement commit, as documented below.

## Continuation M2 follow-up — user-supplied webhook contract and bounded Token Exchange gate (2026-10-17)

**Status:** The requested bounded follow-up is implemented locally. The user supplied the Ring Notifications v1.1 webhook contract and clarified that Ring's inbound Token Exchange body is unpublished. Webhook handling now follows the supplied contract; no inbound Ring body or response contract is claimed. The route remains off by default. No Ring credentials, account, live endpoint, public tunnel, cloud resource, or media endpoint was used.

### Official-doc re-check and source provenance

A single follow-up `fetch_page` re-check was made against each of the six user-cited official URLs. `configure.html` and `develop.html` returned Ring documentation content. `notifications.html`, `motion-detection.html`, `button-press.html`, and `account-linking.html` each returned a page titled `404 Page not found`. These results are reflected in `docs/RING_INTEGRATION.md` and `docs/FRICTION_LOG.md`. The implementation facts for the four unavailable pages remain user-supplied official-doc review from 2026-10-17, not independently fetched or live-tested. The available Configure content states that identity verification precedes app creation, scopes are selected during creation, Cameras and Doorbells is a single group, credentials are shown once (portal has no regenerate option), Private apps suit small/known groups without public-app certification, and configured callback URLs require HTTPS.

### Changes made

- Replaced the old webhook envelope with v1.1 validation: version `1.1`, UTC ISO `meta.time` with up to nine fractional digits, UUID-shaped `request_id`, Ring account ID shape, `data.id`/`data.type`, numeric epoch-ms device timestamp, device source/type and device self link. Motion subtype accepts both documented locations and prefers `data.subType`; the discrepancy is logged in code/docs.
- Normalizes only `button_press` and `motion_detected`. Lifecycle, app-integration, subscription, and unknown types are recorded/acknowledged as ignored with HTTP 200. Bad/missing signature returns 401; malformed JSON or missing supported-event fields returns 400; transient receipt persistence error returns 500. The path performs no upstream request or media access.
- Persists the device ID, uses the attribute epoch-ms timestamp as `occurred_at`, and uses exact `meta.time` as `received_at`. Non-simulator supported events are matched against the claimed/linked account ID. Delivery retry (`request_id`), repeated event (`data.id`), and manual tasks (`manual` provenance with no Ring identity) are documented distinctly and use separate handling.
- Added `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=false` to config and `.env.example`; disabled requests return 503 before body parsing. If explicitly enabled, JSON/form top-level `code` is marked **UNVERIFIED** in code and docs. Unexpected body/query fields are rejected, with sanitized field names only logged. No secret or value is logged.
- Updated the CLI and vertical-slice fixtures to current Ring-shaped local fields and kept simulator provenance clearly not certified. Updated Ring/API/architecture/testing/friction docs, README, and submission friction details; added `docs/RING_QUESTIONS.md` with draft support/community questions. Portal constraints (Private app preference, scopes, media prohibition, one-time credentials, identity verification, HTTPS URLs) are documented.

### Checks actually run during this follow-up

| Command | Result |
|---|---|
| `functions.fetch_page` for the six cited Ring URLs | `configure.html` and `develop.html`: content returned. `notifications.html`, `motion-detection.html`, `button-press.html`, `account-linking.html`: each returned `404 Page not found`. No retry was made. |
| Initial `npm run lint && npm run typecheck` | Lint failed on a syntax error in the new webhook test assertion. Fixed before the passing run. |
| `npm run lint && npm run typecheck` | **Pass** after correction; ESLint zero warnings, server and client TypeScript checks exit 0. |
| First `npm test` | **Failed, exit 1**, despite all 17 files / 58 tests reporting pass: Vitest also detected one unhandled rejection in the existing fake-timer OAuth deadline test because the assertion handler was attached after advancing timers. The test was corrected to attach the rejection assertion first. |
| `npm run lint && npm run typecheck && npm test` | **Pass, exit 0:** lint and both TypeScript projects pass; **17 test files, 58 tests passed**, no Vitest unhandled errors. Includes tests for both motion subtype locations, button press, ignored lifecycle/unknown event types, both deduplication cases, signature 401, malformed/required-field 400, transient DB 500, nine-digit `meta.time`, linked-account match, and enabled/disabled Token Exchange behavior. |
| `npm run build && git diff --check` | **Pass, exit 0:** typecheck and production Vite build passed; JS 339.31 kB (102.41 kB gzip), CSS 29.78 kB (7.71 kB gzip); no diff whitespace errors. |

Earlier M2 `npm ci --nodedir=/usr/local` and temporary migration 1–3 results remain recorded above; no dependency or migration change was required by this supplement. There was no live Ring/API test, no simulator CLI network smoke, and no browser visual review in this follow-up. The test fixtures exercise a simulated local contract, not Ring certification.

### Closeout

The webhook contract portion of M2 is implemented and the new test suite passes. The inbound Token Exchange callback shape and response requirement remain unresolved, with the route disabled by default; the docs friction log and question list record this. The follow-up code/docs commit is `f18e29a` on `arena/51d1d642-doorway-relay`. The cumulative patch is exported to `/home/user/doorway-relay-M2.patch` against the original base and includes `package-lock.json`; it is re-exported after this log closeout commit. Stop here for user authorization. **Do not push, start a tunnel, or call a live Ring endpoint.**

## Milestone M3 — baseline verification and core defect fixes (2026-10-17)

**Scope:** User-authorized M3 only. Work started on `arena/51d1d642-doorway-relay` at `72ce283`, with a clean worktree. I first read this build log and inspected the current domain state machine, SQLite migrations, API routes/middleware, auth/session code, webhook ingestion, and relevant tests. No branch/remote/visibility change, deployment, public tunnel, cost, or Ring call was made.

### Baseline checks before M3 changes

| Command | Result |
|---|---|
| `npm ci --nodedir=/usr/local` | **Pass:** 344 packages installed; npm reported 0 vulnerabilities. |
| `npm run typecheck && npm run lint && npm test && npm run build` | **Pass:** typecheck and lint passed; **17 test files / 58 tests passed**; production Vite build passed (JS 339.31 kB / 102.41 kB gzip; CSS 29.78 kB / 7.71 kB gzip). |
| `npm ls --depth=0` | **Pass:** declared top-level dependencies resolve; no missing or extraneous packages reported. |
| `npm audit --audit-level=moderate` | **Pass:** 0 vulnerabilities. |
| Temporary database migration check | **Pass:** `DATABASE_PATH="$tmpdir/m3.sqlite" npm run db:migrate` applied versions 1, 2, 3; the immediate second run reported already up to date. A Node `better-sqlite3` check found 3 migration rows and 0 rows from `PRAGMA foreign_key_check`; temporary database removed. |

### Core behavior inspected and verified

- Handoff state-machine tests exercise create, claim, assign/reassign, acknowledgement, resolution, reopening, overdue/stalled calculations, activity data, and rejected transitions with no partial writes. The main vertical-slice test covers signed simulated webhook → inbox → classify → assign → acknowledge → resolve → database close/reopen → duplicate replay. Persistence tests reopen a file database and verify migration constraints and append-only activity.
- Webhook tests cover retry-by-`request_id`, repeated-event-by-`data.id`, status behavior, and persistence. The HTTP API tests cover body validation, invalid transitions, public/protected routes, login/register, origin/CSRF checks, and fail-closed Token Exchange behavior.
- M3 expanded the lifecycle test to verify reassignment while acknowledged preserves both `acknowledged` status and its original acknowledgement timestamp. The app test now explicitly verifies a protected handoff read without a session returns 401, and an authenticated mutation with an incorrect CSRF token returns 403 without writing a handoff.

### Genuine defect found and fixed

`getActivity()` sorted equal-timestamp records by random activity UUID (`occurred_at, id`). When two events landed in the same millisecond, their displayed order could differ from insertion/action order. I added a deterministic regression test using intentionally reverse-sorted IDs; before the fix, `npx vitest run --config vitest.config.ts server/src/domain/handoffs.test.ts` failed exactly that assertion (1 failed, 6 passed). The query now orders by `occurred_at, rowid`, preserving insertion order for tied timestamps in the SQLite activity table. After the fix, the targeted domain/API tests passed (2 files, 17 tests). No existing test was weakened or removed.

### Final M3 checks after changes

| Command | Result |
|---|---|
| `npx vitest run --config vitest.config.ts server/src/domain/handoffs.test.ts server/src/app.test.ts` | **Pass:** 2 files, 17 tests. |
| `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | **Pass:** typecheck, lint, production build, and whitespace check passed; **17 test files / 59 tests passed**, no Vitest unhandled errors. Build size unchanged from baseline (JS 339.31 kB / 102.41 kB gzip; CSS 29.78 kB / 7.71 kB gzip). |
| `npm audit --audit-level=moderate` | **Pass:** 0 vulnerabilities (rerun during M3). |
| Secret scanner availability / tracked-pattern scan | `gitleaks`, `trufflehog`, and `detect-secrets` were **unavailable**. A tracked-file regex scan for AWS access-key, private-key-header, and GitHub-token patterns found no matches; it printed no secret values. `git check-ignore -q .env` confirmed `.env` remains ignored. |

The temporary database used `/tmp/tmp.7nnPxKLg7C/m3.sqlite` and was removed after checking. Exact migration invocations were `DATABASE_PATH=/tmp/tmp.7nnPxKLg7C/m3.sqlite npm run db:migrate` twice. The accompanying SQLite verification counted `schema_migrations` (3 rows) and ran `PRAGMA foreign_key_check` (0 rows). The tracked-file regex scan covered AWS access-key, private-key-header, and GitHub-token patterns and returned no matches; the scanner-availability check found all three named tools absent. The exact full shell expression for that regex scan was not retained, so no unverified command string is recorded here. `git check-ignore -q .env` and `git diff --check` both passed.

### M3 changes and remaining limits

- Fixed same-timestamp activity ordering in `server/src/domain/handoffs.ts`; expanded existing API/state-machine coverage and added one activity-order regression test. Test count increases from the passing M2 baseline of 58 to 59; no product workflow or Ring contract was broadened.
- Updated `docs/TESTING.md` and this log with fresh M3 outcomes. No package or migration changes were made; M3's temporary migration run validated the existing versions 1–3.
- Ring remains **not connected**. The unpublished inbound Token Exchange body/response remains unresolved and `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains false by default. The assumed `code` shape remains explicitly **UNVERIFIED**. No live Ring/API result is claimed; no tunnel, deployment, or remote operation was attempted.
- M3 is complete locally on the fixed branch. The M3 patch is exported separately after the local commit; do not push. Stop for user authorization before any M4 work.

## Milestone M4 — workflow integration verification (2026-10-17)

**Scope:** M4 only, continuing from local M3 commit `e7c0c79` on `arena/51d1d642-doorway-relay`. Work stayed on the fixed branch and preserved all prior commits. Per instruction, I did not rebuild. No push, remote/visibility change, tunnel, deployment, AWS resource, or live Ring call was made.

### Defects found and fixed

1. **Dashboard recent-activity tie ordering:** the overview query ordered equal-time activity by random UUID, which could reverse insertion/action order. Added `server/src/domain/overview.test.ts` regression coverage and changed the tie-break to `a.rowid DESC`, matching the activity timeline's insertion-order rule.
2. **Dashboard lifecycle/count mismatch:** `awaitingAcknowledgement` counted `status='new'` although the new handoff detail explicitly says it is waiting for an owner, and an assigned handoff is the state that waits for acknowledgement. The count now covers `assigned` and `reopened` work; the UI distinguishes “Awaiting acknowledgement” from “Acknowledged”, and the former links to a matching `status=awaiting_acknowledgement` filter. The filter returns assigned and reopened tasks. `docs/ARCHITECTURE.md` and `docs/API.md` now document these semantics.
3. **Optional due-date contract mismatch:** the manual and inbox forms send `dueAt: null` when no date is selected, but the API schema rejected null. `dueAtSchema` now accepts null as well as valid timestamps/empty values; malformed dates remain rejected. `server/src/app.test.ts` covers both paths.

### End-to-end workflow verified

- Added `client/src/workflow.integration.test.tsx`. It renders the actual React application in jsdom and bridges its relative `/api/...` fetches to the in-process Express app with SQLite, authentication, and CSRF. It begins with a locally signed **simulator** webhook; the resulting event is `ring_simulated`, not Ring-live. The visible label is “Ring · Simulated”; `isSynthetic: false` indicates it is not a seeded demo fixture, not that it came from Ring Live.
- Verified API and rendered dashboard counts through the workflow: initial inbox-only state; new manual task appears as unassigned, not awaiting acknowledgement; assigned state increments awaiting acknowledgement; acknowledgement moves it to acknowledged; resolution removes it from open/attention counts and increments resolved. Dashboard links to the acknowledgement filter return the same assigned/reopened state group.
- Verified inbox source label and classification, manual creation/detail, validation error for a deleted owner with no partial state/activity write, successful assignment, reassignment while acknowledged retaining the original `acknowledgedAt`, resolution note, and chronological handoff activity. After inbox classification the inbox is empty and the new handoff retains `ring_simulated` provenance.
- Existing `server/src/vertical-slice.test.ts` verifies file-backed SQLite close/reopen persistence, retained resolved status/provenance/activity, and webhook duplicate handling. It passed in the final suite. No migration or database schema change was needed.

### M4 checks actually run

| Command | Result |
|---|---|
| Baseline `npm test` before M4 edits | **Pass:** 17 files / 59 tests. |
| `npx vitest run --config vitest.config.ts client/src/workflow.integration.test.tsx server/src/domain/overview.test.ts server/src/domain/handoffs.test.ts server/src/app.test.ts` | **Pass:** 4 files / 20 tests. |
| `npm test` | **Pass:** 19 files / 62 tests; includes the full-stack workflow and SQLite persistence/restart vertical slice. |
| `npm run typecheck` | **Pass:** server and client TypeScript projects. |
| `npm run lint` | **Pass:** ESLint, zero warnings. |
| `git diff --check` | **Pass:** no whitespace errors. |
| `npm run build` | **Not run:** explicitly excluded by the M4 no-rebuild instruction. |

The full-stack test used jsdom, not a real browser. The earlier environment preflight found no Chromium/Firefox or Playwright/Puppeteer executable; visual/responsive browser review therefore remains unverified. The automated Ring event was generated with the local simulator signing key; no live Ring endpoint, Ring account, device, or Playground was used. The inbound Token Exchange contract remains unpublished, and the route remains disabled by default.

**M4 was complete locally on the fixed branch at closeout.** No push, tunnel, deployment, or external action occurred in M4.

## Milestone M5 — Ring event-to-handoff verification (2026-10-17)

**Scope:** M5 only, continuing from M4 commit `8175984` on `arena/51d1d642-doorway-relay`. M2–M4 changes remain present in the local branch history. M5 implementation commit: `97e790b` (`fix: align Ring adapter and account linking`); committed locally after verification, not pushed. The final commit-history note is a separate documentation-only closeout. No rebuild, push, public tunnel/exposure, deployment, paid resource, app registration, or real Ring interaction was performed.

### Official resources checked

- The current public [Ring Developer homepage](https://developer.ring.com/) and consolidated [Ring Partner API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html) loaded. The current [Getting Started](https://developer.amazon.com/docs/ring/get-started.html), [Configure](https://developer.amazon.com/docs/ring/configure.html), [Develop](https://developer.amazon.com/docs/ring/develop.html), and [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html) pages also loaded.
- The cited [Devpost rules](https://amazonappdev2026.devpost.com/rules) and [resources](https://amazonappdev2026.devpost.com/resources) loaded and allow Ring API/SDK/simulator/device demonstrations. They require runtime use of track technology; Doorway Relay's custom signed local fixture is not itself an official Ring simulator or proof of Ring runtime access.
- The official [AmazonAppDev Ring API Hello World](https://github.com/AmazonAppDev/ring-api-helloworld) sample was inspected as documentation. It describes a sign-in-gated short-lived Playground API token, not an event simulator. The Ring MCP is a knowledge/documentation search server, not a runtime API or event source. No Ring SDK, sample, portal tool, or external endpoint was run.
- `https://developer.amazon.com/docs/ring/` still returned 404; current consolidated deep links loaded. Earlier 404 results for standalone Notifications, Motion, Button Press, and Account Linking URLs are historical and recorded in `docs/RING_INTEGRATION.md`. The older Develop guide summarizes only three event types while the current API reference lists lifecycle, subscription, and sensor types; this discrepancy remains documented.

### Contract review and fixes

- Confirmed the documented server-to-server Ring API/OAuth bases, Bearer auth, `/v1/users/me`, `/v1/devices`, Event History, and App Integrations operations. The outgoing authorization-code and refresh form contract is now independently documented in the current API reference; `RING_OAUTH_CONTRACT_VERIFIED` applies only to that outgoing form, not the Ring-to-partner callback.
- Current Configure docs establish that Ring POSTs an authorization code to the partner Token Exchange URL and the code must be exchanged within 60 seconds, but do not establish the complete inbound content type/body/headers/response contract. `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains false; the code's optional top-level `code` JSON/form shape and local acknowledgement remain explicitly unverified.
- Current one-way account-link docs describe a `time`/`nonce` redirect, HMAC-SHA256 nonce matching, and POST then PATCH App Integrations. Replaced the previous caller-supplied account ID/static JSON override route with the documented flow: read account identity from the stored unclaimed-token record (OAuth tokens remain encrypted), verify nonce/profile match, mask the authenticated email for POST, PATCH `completed`, and claim tokens after success. Added stubbed unit/route coverage including failure-before-claim; no Ring call was made.
- A full-suite run exposed a flaky encrypted-token tamper test: changing the final base64url character can alter only unused encoding bits. Updated the test to mutate the authentication tag's first encoded character; production encryption/decryption code is unchanged.
- Updated the webhook schema to accept opaque v1.1 request IDs (including the current sensor example), prefer the currently documented `attributes.sub_type`, preserve the earlier top-level subtype only as a compatibility fallback, and keep subtype-less motion neutral. Updated Event History mapping for documented `ding` and `motion` values and device relationships; `on_demand` remains ignored. No migration or media endpoint was added.

### M5 verification actually run

| Command / check | Result |
|---|---|
| Initial Ring-focused `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass before edits — 9 files / 41 tests. |
| Ring-focused command after adapter and account-link edits: `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass — 9 files / 46 tests. |
| `npx vitest run --config vitest.config.ts client/src/workflow.integration.test.tsx server/src/vertical-slice.test.ts server/src/domain/inbox.test.ts` | Pass — 3 files / 3 tests; simulator provenance through inbox classification, handoff creation, activity, and persistence. |
| `npm run simulate:ring -- button_press` and `npm run simulate:ring -- motion_detected`, each run through an in-memory app bound only to `127.0.0.1` on an ephemeral port | Both exited 0 and returned HTTP 200 `accepted`. Temporary DB verification: 2 `ring_simulated` source events (`button_press`, `motion_detected`), `is_synthetic = 0`, 2 receipts, and no Ring-key-signed event. |
| `npm test` | Pass — 19 files / 67 tests. |
| `npm run typecheck` | Pass — server and client projects. |
| `npm run lint` | Pass — zero warnings. |
| `git diff --check` | Pass. |
| `npm run build` | **Not run**, per the no-rebuild instruction. |

### Live-verification outcome and remaining steps

A non-printing availability check confirmed the ignored `.env` contains no Ring access token, client ID/secret, Ring HMAC key, or history device ID; only local simulator/encryption configuration among Ring-specific keys was set. The official developer console and Playground redirected to Amazon sign-in. No Ring account, device, staging user, official sandbox, token, live API response, or Ring-signed webhook was used. The simulator is Doorway Relay's own fixture and remains `ring_simulated`; it never establishes `ring_live` or `ring_playground` provenance.

Ring documentation requires a publicly reachable HTTPS/TLS 1.2+ webhook endpoint and a response within five seconds. The local endpoint is not public. No tunnel or public exposure was created; a temporary proxy restricted to `/api/ring/webhook` or an isolated staging endpoint is only a proposal and requires explicit user permission. Before a real demonstration, obtain appropriate portal credentials without pasting them into chat, confirm staging/sandbox requirements and any pre-existing device/subscription eligibility without incurring cost, resolve the full inbound Token Exchange contract, verify the one-way account-link sequence using Ring-confirmed credentials and responses, then test a real Ring signature/account/event through inbox classification and handoff activity. See `docs/RING_INTEGRATION.md` for exact steps and source details.

**M5 local adapter verification is complete; live Ring verification remains blocked by missing credentials/portal access and the required public HTTPS endpoint. No M6 work had started at that closeout.**

## Milestone M6 — security, privacy, deployment readiness, and local review (2026-10-18)

**Authorization/scope:** M6 only. Reviewed the frontend/backend/configuration, authentication and authorization, Ring boundary, persistence, docs, and deployment prerequisites. No M7 work was started. No production build, push, publication, deployment, tunnel, DNS change, external service, paid resource, screenshot, or Ring endpoint was used. The existing checkout/history discrepancy was preserved.

### Changes made

- Fixed the date-dependent handoff regression test to derive its timestamps from the current clock. This was test-only; production handoff semantics did not change.
- Tightened trusted-origin comparison to an exact configured-origin match, including scheme. First-user registration now rechecks and inserts under an immediate SQLite transaction. `WEB_ORIGIN` now must be a bare HTTP(S) origin; production requires HTTPS, a 64-hex-character session secret, and an absolute non-memory SQLite path.
- Added `HOST` with a `127.0.0.1` default. The API and Vite development servers now bind loopback by default; removed Vite's unrestricted host allowance. A future private service bind requires explicit deployment configuration.
- Added `/api/health`, a no-session SQLite readiness probe with generic 200/503 responses and `Cache-Control: no-store`; tests prove it neither creates a cookie nor exposes database errors.
- Removed submitted Token Exchange field names from warning logs (values were already omitted), kept `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=false` by default, and made production configuration reject attempts to enable it while the inbound contract is unverified. Added a production guard that stops demo seeding before a database is opened.
- Corrected stale Integration-page wording to distinguish reviewed public Ring docs from the still-unverified inbound Token Exchange and staging path. Added a UI route test for not-connected status, disabled API checking, the simulator label, and current Token Exchange guidance.
- Added [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md); updated README, API, architecture, Ring, and testing documentation.

### M6 checks actually run

| Command / check | Result |
|---|---|
| Runtime: `node --version && npm --version` | Pass — Node `v22.22.3`, npm `10.9.8`. Package engines require Node `>=22.12 <23` and npm `>=10`. |
| `npm ci --nodedir=/usr/local` | Pass — installed 344 packages; npm reported zero vulnerabilities during installation. |
| `npm ls --depth=0` | Pass — no missing or extraneous declared top-level packages. |
| Focused handoff test: `npx vitest run --config vitest.config.ts server/src/domain/handoffs.test.ts` | Pass — 1 file / 7 tests after the timestamp fix. |
| `npm test` | Final serial run passed — **19 files / 71 tests**. One earlier run concurrent with other CPU-intensive commands timed out at the 5-second limit in the UI workflow test while 69 other tests passed; the serial rerun passed without a code change for timeout. |
| `npm run typecheck` | Pass — server and client projects. |
| `npm run lint` | Pass — zero warnings. |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities reported for the lockfile dependency tree. |
| Temporary file-backed `npm run db:migrate` twice | Pass — versions 1–3 applied once, then reported up to date; 3 migration rows and 0 `PRAGMA foreign_key_check` rows. Temporary DB removed. |
| Production `seed:demo` guard | Expected exit 1 before database creation; generic production-disable message verified. |
| Loopback Vite + Express smoke harness, ephemeral ports / in-memory SQLite | Pass — SPA root 200, transformed frontend entry 200, Vite-proxied `/api/health` 200. Bound only to `127.0.0.1`, then closed. No public preview or tunnel. |
| `git diff --check` and whole-working-tree whitespace scan | Pass after removing one Markdown trailing-space issue. |
| Secret-pattern heuristic | 111 readable, non-generated workspace text files scanned for six high-confidence token/private-key pattern categories; 0 matches. `.env`, `.env.local`, and `.env.production` were absent. Dedicated secret/static-analysis tools were unavailable; this is not a secret-free guarantee and did not cover missing Git objects or remote history. |
| Browser tooling | No Chromium/Firefox, Playwright, or Puppeteer executable/package found. jsdom workflow/navigation tests passed, but no real-browser visual, responsive, or accessibility review and no screenshot are claimed. |
| `npm run build` | **Not run** per the explicit no-rebuild instruction. No production build result is claimed. |

### Readiness and integration findings

The app is **not ready for deployment**. It has no production API `start` script, compiled API artifact, service/container definition, or verified static serving path. SQLite needs an access-controlled durable single-instance volume, serialized migrations, and tested backup/restore. There is no production secret manager, monitoring/alerting, or operational recovery runbook. `/api/health` tests SQLite only. HTTPS would require a separately approved managed ingress; none was configured or exposed.

No authenticated Ring portal, app, credential, device, API call, or Ring-signed event was used. The staging path and device/subscription eligibility remain unverified, as does the complete inbound Token Exchange body/acknowledgement. The M5 simulator remains synthetic. Keep `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=false`; do not claim live Ring connectivity. `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, and `docs/TESTING.md` record the detailed blockers and check coverage.

### Git/workspace discrepancy — preserved without reconciliation

At M6 start and closeout, the current branch was `arena/51d1d642-doorway-relay` at `28f9d2f0dfb6f2b4268d8d8dbf1d5afbd8b6d601` (`Initial commit`), shown by `git log` as grafted/shallow; `git rev-list --all --count` was 1. `git ls-files` reported only `README.md` (modified); the project source, docs, lockfile, and remaining files were present as untracked working-tree files. Previously reported milestone commit IDs `ac0d03b`, `766fdeb`, `1e2a785`, `f18e29a`, `e7c0c79`, `8175984`, `97e790b`, and `c38db3a` were all absent from the local object database/ref history. No reset, branch switch, staging, index repair, commit, push, or history rewrite was performed; all files were preserved. This discrepancy means prior milestone commit records cannot be independently corroborated from this checkout; it does not establish what exists remotely.

**M6 closeout (historical):** At that point M7 had not started. The separately authorized M7 recovery and verification record follows.

## Milestone M7 — recovery, final verification, and submission readiness (2026-10-18)

**Authorization/scope:** M7 only, on the fixed `arena/51d1d642-doorway-relay` branch. Preserve existing workspace data and remote state; do not publish, push, change visibility, deploy, expose an endpoint, create cloud resources, or claim Ring evidence without separate authorization. No reset, rebase, force-push, or history rewrite was used.

### Source recovery and Git/remote state

- At M7 recovery start, all **111 non-generated workspace files** matched 111 unreachable loose Git blobs exactly; there were no unmatched blobs. The object database contained no unreachable trees or commits, so the earlier M1–M6 history could not be reconstructed from these blobs. No adjacent patch/archive was found. The current working files were preserved and then updated only where required for M7 verification/readiness.
- The local branch/ref base was shallow commit `28f9d2f0dfb6f2b4268d8d8dbf1d5afbd8b6d601`. At recovery start, `README.md` was modified and the remaining 110 files were untracked. Earlier milestone commit IDs recorded in this log were absent from the local object/ref history. No Git reset, checkout, branch switch, staging, history rewrite, or push was used during initial recovery.
- Read-only `git ls-remote` showed only remote `main`; remote `HEAD` and `main` pointed to the same README-era base commit. Read-only `gh repo view` reported `isPrivate: false`, default branch `main`, viewer permission `ADMIN`. The remote tree contained only the initial README; no project source had been pushed. No remote setting, ref, or content was changed.
- No actual `.env`, `.env.local`, or `.env.production` was present; root `.env*` inventory contained only the placeholder-only `.env.example`. The MIT `LICENSE` remains a draft with a copyright-holder placeholder; no legal identity was invented.
- After recovery, verification, and documentation updates, all 111 project files were committed as a new local snapshot, `47eaac6` (`feat: add recovered Doorway Relay source and M7 verification`), on the fixed Arena branch. This preserves the recovered source as a reviewable Git tree but does not reconstruct M1–M6 commit history. The snapshot was not pushed; remote `main` remains unchanged.

### Release-blocking source issue fixed

Source review found a provenance hazard: `RING_EVENT_SOURCE` silently defaulted to `ring_live`, while `.env.example` described its optional access token as a Playground token. A user could configure Playground Event History and accidentally persist it as live. M7 now requires an explicit `ring_live` or `ring_playground` label whenever a Ring client ID/secret, HMAC key, access token, or history device is configured. The example leaves the source unset and warns against mislabeling. Added config tests for missing and explicit source labels. The chosen value remains an operator assertion and cannot independently prove source authenticity. No tests were weakened and no package/lockfile changes were needed.

### M7 commands and actual results

| Command / check | M7 result |
|---|---|
| `node --version && npm --version` | Pass — Node `v22.22.3`, npm `10.9.8`, within package engine constraints. |
| `npm ci --nodedir=/usr/local` | Pass — 344 packages added; npm reported 0 vulnerabilities during install. |
| `npm ls --depth=0` | Pass — all declared top-level dependencies resolve; no missing/extraneous packages. |
| `npm run typecheck` | Pass — server and client TypeScript projects. |
| `npm run lint` | Pass — ESLint, zero warnings. |
| `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass — **9 files / 48 tests**. |
| `npm test` | Pass — **19 files / 72 tests**. |
| `npm run build` | Pass — typecheck and Vite client production build; 1,946 modules; JS 339.48 kB (102.43 kB gzip); CSS 29.78 kB (7.71 kB gzip). This is not a production API server artifact. |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities reported. This is dependency advisory scanning, not a full source audit. |
| `npm run db:migrate` twice on a new temporary file-backed DB | Pass — migrations 1–3 applied once; repeat was idempotent; 3 migration rows; `PRAGMA foreign_key_check` returned 0 rows. Temporary DB removed. |
| `npm run seed:demo` on a separate temporary DB | Pass — 3 workspace users and 8 source-event rows; all 8 `is_synthetic=1`, 5 with `ring_simulated` provenance; migrations 1–3 present and 0 foreign-key violations. A throwaway password was generated in-process and not printed; DB removed. No Ring API/event source was used. |
| Selected secret-pattern heuristic | Pass — 111 readable non-generated files; six high-confidence pattern categories; zero matches. Only `.env.example` existed among root `.env*` files. Earlier unreachable-blob scan also found no selected secret patterns. This heuristic is not a guarantee and no dedicated scanner result is claimed. |
| `git diff --check`, all-workspace trailing-whitespace scan, and local Markdown-link check | Pass — no diff whitespace errors; 111 readable text files scanned, 0 trailing-whitespace lines, 0 missing local Markdown link targets. |
| Browser tooling / screenshots | No Chromium/Firefox, Playwright, or Puppeteer executable/package found. No real-browser review, screenshot, or preview exposure occurred. A manual capture checklist and conditional demo script are in `submission/`. |
| Current official Ring/Devpost rules | Not verified in M7; the sandbox outbound allowlist excludes `developer.ring.com` and the Devpost host. M5 public-page findings dated 2026-10-17 remain historical only. |
| Ring runtime/live evidence | Source paths were inspected; local stubs/tests passed. No Ring credential, account, app, official simulator, Playground event, device, authenticated API response, live webhook, or Ring-issued signature was available/used. The local fixture remains synthetic `ring_simulated`. |

### M7 documentation and submission kit

README, build/testing/security/deployment/Ring/API docs, project description, Built With, product feedback, Devpost question, friction log, final checklist, image-gallery plan, and demo script were updated to distinguish verified local results from historical sources, synthetic fixtures, and outstanding requirements. The demo script is gated on current rule verification plus a genuine eligible Ring source; it cannot be recorded as written until those gates pass. The image gallery remains empty; the manual checklist covers safe real captures.

### Submission/release blockers and disposition

- Current official Devpost/Ring rules, accepted technology/event source, reviewer requirements, invitation details, field limits, deadline, thumbnail dimensions, and friction-log format remain unverified. The visible user request truncates at “The required demon…”; the missing suffix may include acceptance criteria not visible here.
- No genuine/official Ring source or event was available. Keep Token Exchange disabled because its inbound contract remains unverified; do not claim live Ring connectivity or present the custom simulator as Ring-originated.
- The app has no production API build/start artifact, production serving topology, approved HTTPS ingress, durable SQLite backup/restore process, or production operations plan. The successful `npm run build` is for the client bundle only; deployment is not ready.
- No screenshot or video exists. No reviewer was verified or invited. No organizer approval or Devpost submission exists.
- The existing GitHub repository is public, but only the initial README is on remote `main`; workspace source has not been pushed. No push or visibility change is authorized or performed. `LICENSE` still needs the owner's legal copyright holder and license authorization.

**M7 disposition:** source recovery and local verification passed; this is **not submission-ready, not production-ready, and not verified for current Ring-track eligibility**. Required human input: resend the truncated request; supply/currently enable official rules access; confirm copyright holder/license; establish an eligible real/official Ring source using secrets only in local ignored `.env`; separately decide whether to authorize source push/visibility change; and perform genuine browser capture/video only after the eligibility/source gates pass.

## M8a Playground client/probe/status and M8c verification preparation (2026-10-18)

**Scope and boundary:** M8 was authorized on the fixed branch `arena/51d1d642-doorway-relay`, starting from local `HEAD` `4e92a48`. All pre-existing source was preserved; no rebuild-from-scratch, reset, rebase, or branch change occurred. No Ring call or Playground token use/display, portal session, publication, visibility change, invitation, tunnel, deployment, cloud cost, snapshot, or video-download request was made. The ignored `.env` was not manually inspected. The user-supplied official-source findings are attributed as such; they are not sandbox-fetched or verified by a live response.

### M8 implementation written

- Added `RingPlaygroundClient` as a separate server-only adapter. It pins requests to `https://api.amazonvision.com`, sends the Bearer token only from server configuration, Zod-validates JSON documents and pagination links, uses AbortController timeouts, caps response size, limits request cadence, follows only the same Event History endpoint, bounds retries/`Retry-After`, and caps pages. No profile, webhook, snapshot, video, or media endpoint was added to the probe.
- Added `npm run ring:probe`. The owner must set `RING_ACCESS_TOKEN`, `RING_EVENT_SOURCE=ring_playground`, and the noted `RING_HISTORY_DEVICE_ID` in the ignored local `.env`. The script requires that human-provided ID before constructing the client, calls `GET /v1/devices` and the history endpoint, and never infers an ID from the device response. It writes a mode-0600 structure-only JSON report under `fixtures/ring-playground/`, redacting values, identifiers, emails, and URLs. No report/fixture exists in this workspace because no real probe was run.
- Added authenticated Playground status and verify endpoints and Integration-page status. Verify calls only `GET /v1/devices`, returns a safe state and no upstream response body, distinguishes no token/source mismatch/configured-but-unverified/success/expiry/error, and never returns or persists the token. The UI Sync action is disabled; `/api/ring/playground/sync` returns 409 without a Ring request until the real report is reviewed.
- Added `RING_HISTORY_POLLING_ENABLED=false` default. The existing poller is opt-in only for `ring_live`; config rejects enabling it with `ring_playground`.
- Added mocked client, redactor, status, route, and UI tests. The old `server/src/ring/history.ts` parser assumptions are deliberately not reused for Playground.

### Blocked pending the human's real probe report

The actual Event History response fields/nesting, event IDs/stability, timestamp units, subtype/classification location, device-list/session visibility, and pagination shape remain unknown until the owner runs the probe and shares its redacted report. Therefore Event History parsing, normalization, ingestion, idempotency/identity, `ring_playground_recorded` persisted provenance, replayable/recorded fixtures, and working Sync are **not implemented or claimed**. There is no user-provided response report yet. This is an intentional safety gate, not a failed Ring call.

### M8 offline checks actually run

| Command/check | Result |
|---|---|
| `npm test` | **Most recent pre-M9 pass:** 22 files / 93 tests; all Playground fetches were mocked. It preceded the M9 typed-mock and synthetic-badge test edits; the final tree was not rerun because `node_modules` is absent. |
| `npm run build` | **Earlier M8 pass only:** typecheck + Vite client production build; 1,946 modules. JS 342.57 kB / 103.15 kB gzip; CSS 30.11 kB / 7.78 kB gzip. This is not an API server build and predates the latest edits. |
| `npm run lint` | **Most recent pre-M9 pass:** ESLint, zero warnings. Current rerun could not start because `eslint` is absent from PATH. |
| `npm run typecheck` | The pre-M9 check failed with TS2493 in the fetch mock. M9 added an explicit mock signature; the post-fix attempt could not start because `tsc` is absent from PATH. No successful post-fix typecheck is claimed. |
| `npm ls --depth=0` | **Pre-M9 pass:** declared top-level dependencies resolved. The M9 environment has no `node_modules`; no dependency installation was performed. `package-lock.json` is unchanged. |
| `npm audit --audit-level=moderate` | **Pre-M9 pass:** 0 vulnerabilities reported. This is an advisory check, not a source audit. |
| Temp DB: `npm run db:migrate` twice, `npm run seed:demo`, and read-only SQLite counts | **Pass:** migrations 1–3 applied once, repeat up to date, 3 users, 8 explicitly synthetic source events, 0 FK violations. Temporary DB was removed. No migration was added in M8. |
| Offline guard: `RING_ACCESS_TOKEN= RING_EVENT_SOURCE=ring_playground RING_HISTORY_DEVICE_ID= npm run ring:probe` | **Expected:** exit 1 with “No Playground token is configured”; script stops before constructing a client. No Ring request and no report. This is not a probe result. |
| Live Ring API / Playground probe / screenshot / public preview | **Not run.** |

During development, initial lint/typecheck caught a missing test-config property and unused import; these were fixed. A first full test run had 90 passing assertions plus one Vitest unhandled fake-timer rejection; the assertion was attached before timer advancement. Pagination test expectations were corrected after verifying repeated-link/page-cap behavior. The final full suite above passed without unhandled errors. Final `git diff --check` passed; 52 relative Markdown links had no missing targets; 36 changed text files had no trailing whitespace; a 4-category high-confidence secret heuristic found 0 matches. The ignored `.env` was intentionally not read or scanned; no dedicated secret scanner was run.

### M8c documents and human actions

Updated README, API/architecture/security/testing/Ring integration docs, and submission overview/details/friction log/demo question/product-feedback/gallery/checklist. `LICENSE` remains unchanged. The checklist contains the human steps: generate a Playground token and note device ID; set `.env` values; run/share the redacted probe; only after schema review trigger Package/Vehicle/Motion and use Sync; choose visibility/license; separately authorize publication; capture screenshots and a public sub-three-minute video.

Owner-supplied plan (not independently verified): Playground history Monday 19 October IST; optional live view Tuesday 20; freeze Wednesday night; video/submission Thursday 22 by 18:00 IST. Supplied Devpost deadline: Friday 23 October 12:00 PDT / Saturday 24 October 00:30 IST. Do not start optional M8b unless M8a passes offline tests and the owner authorizes the time-box. Read official WHEP docs first; if unavailable, request the exact section. If not completed by Monday night, record the skip. No WHEP work has started.

Private-repository reviewer invitations are owner-run, at submission time; they expire after 7 days (per the FAQ). The full list is the six GitHub usernames `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`, plus `testing@devpost.com`. No invitation has been sent; verify the email's GitHub account. The repository remains public upstream; no push or visibility edit was performed. `LICENSE` remains unchanged pending the owner's copyright-holder line and license choice.

## M9 Phase 1 closeout — local work only (2026-10-18)

**Scope:** M9 Phase 1 only. No Ring call, `.env` inspection, dependency installation/update, push, visibility change, tunnel, deployment, paid resource, or Phase 2 implementation occurred. The user's prompt supplied the current official Ring source findings; those claims are cited in `docs/RING_INTEGRATION.md` and are not presented as live API evidence.

### Local changes

- Fixed the TS2493 test mock by giving the fetch mock an explicit typed `(input, init?)` signature; no type assertions or weakened checks were added.
- Changed the seeded-data badge to explicitly say **Synthetic demo data** and added a UI test asserting it remains separate from the **Ring · Simulated** provenance badge.
- Added `docs/HUMAN_VISUAL_REVIEW.md`, a timed 10-minute owner checklist covering every visible navigation link, handoff actions, keyboard focus, 390 px width, empty/error states, provenance, and on-screen privacy.
- Replaced the image gallery suggestions with an exact six-shot plan tied to actual seeded records and their required source badges. No images were captured.
- Added the owner-supplied official Playground/API source links and facts to `docs/RING_INTEGRATION.md`, plus PowerShell/Bash probe instructions. The probe requires the operator-supplied history device ID; the owner copies the displayed Playground device ID and must stop rather than guess if the UI does not expose an unambiguous ID.
- Added `fixtures/ring-playground/` and `handoff/` to `.gitignore`. No probe report or reviewed JSON file exists; the probe cannot be marked reviewed until the owner runs and reviews a real response.

### Verification and environment limitation

`node_modules` was absent in this M9 environment. No install was performed because the user explicitly prohibited dependency installation. After the source fix, these commands were attempted and blocked before running project tools:

| Command | Actual result |
|---|---|
| `npm run typecheck` | Exit 127: `tsc: not found`. |
| `npm run lint` | Exit 127: `eslint: not found`. |
| `npm test` | Exit 127: `vitest: not found`. |
| `npm run build` | Exit 127 at its typecheck step: `tsc: not found`; Vite did not run and no current build result exists. |

The last pre-M9 successful full test run was 22 files / 93 tests, before the M9 mock-typing and synthetic-badge assertion edits. The last successful lint and dependency audit also predate those edits. The last successful Vite bundle predates the latest M8/M9 changes. Do not treat those older results as validation of the final M9 tree. The dependency tree/lockfile was not changed.

### Ring gate and official source facts

No redacted probe report was included in the user's M9 prompt. Phase 2 was not started. Event History shape, event identity, timestamps, subtype/classification placement, and Playground simulation visibility remain unknown. No normalization/ingestion, persisted `ring_playground_recorded` provenance, replay fixture, Sync enablement, or WHEP implementation was added. See `docs/RING_INTEGRATION.md` for owner-supplied official references and the PowerShell/Bash commands; no raw or reviewed-by-owner report was authored.

### Git, scan, and artifacts

The shallow boundary is `28f9d2f`; the object database contains 58 unreachable blobs and no unreachable trees/commits. Per user instruction, their contents were not inspected.

### Final M9 hygiene (after the closeout commit)

- A local heuristic checked all 119 tracked files and all 4 reachable commits. Eight high-confidence patterns (AWS access keys, PEM private-key markers, GitHub/Google/Slack/Stripe credentials, JWT-shaped values, and AWS secret assignments) had no matches. The two broad patterns for bearer strings and credential assignments matched only test-fixture code in `server/src/app.test.ts` and `server/src/config.test.ts`; no matched values were printed. This is a heuristic, not a dedicated secret-scanner certification. The ignored `.env` was never read.
- `git diff --check 28f9d2f..HEAD` passed. A tracked Markdown audit found 58 relative links and zero missing targets. A tracked-text audit found zero trailing-whitespace lines.
- `handoff/` and `fixtures/ring-playground/` are ignored; exports are generated after commit and are not committed. The final response records exact export paths/sizes and the bundle attempt/error, if shallow-history validation prevents bundle creation.
- No push or publication command was run.

## M9.1 reviewer correction and reproducible verification (2026-10-18)

**Environment and dependency restore:** the recorded starting branch was `arena/51d1d642-doorway-relay`, HEAD `95cc57b8b7c4cb8a4fc8ad96a2719b7e81835fab`; the tracked worktree was clean and only the ignored `handoff/` directory was present. `package.json`/README require Node `>=22.12 <23` and npm `>=10`; this run used Node `v22.22.3` and npm `10.9.8`. `npm ci --nodedir=/usr/local` succeeded: 344 packages added, 345 audited, 0 vulnerabilities. `package-lock.json` was not regenerated or changed.

**Verification results:**

| Command | Result |
|---|---|
| `npm run typecheck` | Pass; server and client TypeScript projects. |
| `npm test` | Final serial run passed: 22/22 files, 94/94 tests. See the timeout diagnosis below. |
| `npm run lint` | Pass; ESLint exited 0 with `--max-warnings=0`. |
| `npm run build` | Pass; typecheck plus Vite client build, 1,946 modules. JS 342.60 kB (103.18 kB gzip); CSS 30.11 kB (7.78 kB gzip). |
| `npm audit --audit-level=moderate` | Pass; 0 vulnerabilities. |

**Test-timeout diagnosis:** the first full suite ran concurrently with typecheck, lint, build, and audit. It reported 21/22 files and 93/94 tests passing; `client/src/workflow.integration.test.tsx:138` hit Vitest's 5,000 ms timeout (`Test timed out in 5000ms`). The unchanged integration test then passed by itself (1/1, about 2.46 s), and a serial `npm test` passed 22/22 files and 94/94 tests. The first timeout is consistent with resource contention from concurrent checks; that is a likely cause, not a proven one. No test, assertion, or timeout was changed or suppressed.

**Evidence boundary:** seeded records are local synthetic demo data and visibly labeled; Ring Playground HTTP tests use mocks only. The owner later said the probe was run on their own machine, but no redacted report was supplied here, so it was not verified or interpreted in this workspace. This agent made no Ring API request. No live Ring event, clean-clone verification, Phase 2, Event History ingestion, or Sync change occurred. Synthetic, mocked, real Playground, and live Ring evidence remain separate.

**Reviewer note:** the exact username search found no incorrect standalone handle; occurrences use the correct spelling `knmeiss`. Publication notes and `submission/FINAL_CHECKLIST.md` now include all six owner-specified usernames plus `testing@devpost.com`, and say invitations are owner-run, at submission time; they expire after 7 days (per the FAQ). No invitation was sent. `LICENSE` was not edited.

## M10 risk-first local release-candidate pass (2026-10-18)

**Scope and boundary:** continued only on `arena/51d1d642-doorway-relay`; prior commits and work were preserved. This agent did not read/print/edit `.env`, use Ring credentials, or make a Ring API request. The owner reports a separate local probe, but no report content was supplied here. No Phase 2, browser session, screenshot/video, push, PR, visibility change, reviewer invitation, organizer contact, Devpost action, deployment, tunnel, paid resource, reset, rebase, or unreachable-object inspection occurred. `LICENSE` and `package-lock.json` remain unchanged. The single authorized `npm ci --nodedir=/usr/local` was the prior M9.1 install; it was not repeated.

### Source findings and smallest fixes

- Prevented Ring-HMAC webhook signatures from inheriting `ring_playground` provenance. In Playground mode the Ring key is rejected before event, receipt, or signed-event state is persisted; a linked route test checks the 401 and zero writes. The local simulator HMAC remains distinct.
- Restricted legacy History ingestion to `ring_live`; removed the Playground provenance argument. It maps `ding`/`motion.*` to neutral categories without inferring intent. Parser tests use synthetic inline inputs only; response shape and timestamp assumptions remain unverified against Ring.
- Tightened probe privacy: allow-listed event strings only; subtype/classification paths and JSON types (no raw values); unrecognized/dynamic field keys redacted; bounded traversal and final token/email/URL guard. A real report is absent and must still be owner-reviewed.
- Added HTTPS/same-origin Ring URL validation, production API/OAuth origin pinning, same-origin token URL, cross-origin request-path rejection, redirect rejection for API and OAuth token/profile requests, a 12-second Ring API request deadline, max three bounded retries, and a streamed 2 MB API JSON limit. OAuth refresh is bounded to 12 seconds; the existing authorization-code/profile operation is bounded to 55 seconds. Mocks test these limits; no upstream behavior was exercised.
- Changed the UI/filter label for local simulator events to **Local · Simulated**, separate from **Synthetic demo data**. Added regression assertions for the visible label.
- Set only the full-stack workflow test's timeout to 10 seconds after measuring a ~2.4-second serial run and ~6.4-second run under the full parallel verification load. Added rationale; assertions/tests/global timeout were not weakened.
- Updated README, API/architecture/security/Ring/testing/deployment notes, human visual-review guide, demo/image plans, product-feedback draft, project overview/details, friction log, release-candidate report, and owner checklist/runbook. No screenshot, report, media, or submission text falsely asserts a real Ring event.

### Environment and verification

Node `v22.22.3`, npm `10.9.8`. The one authorized install completed in M9.1: 344 packages added, 345 audited, 0 vulnerabilities; no repeat install and no lockfile change.

| Command/check | M10 result |
|---|---|
| Serial `npm test` | Pass: **22/22 files, 99/99 tests**, Vitest duration 13.45 s; full-stack workflow test ~2.537 s. |
| Concurrent `npm test` with typecheck, lint, build, audit, and `npm ls --depth=0` | All pass: **22/22 files, 99/99 tests**, suite ~25.75 s; workflow test ~7.371 s. |
| `npm run typecheck` | Pass — server and client. |
| `npm run lint` | Pass — zero warnings (`--max-warnings=0`). |
| `npm run build` | Pass — 1,946 modules; JS 342.60 kB (103.18 kB gzip), CSS 30.11 kB (7.78 kB gzip). Client bundle only, not a production API package. |
| `npm audit --audit-level=low` | Pass — 0 vulnerabilities reported. |
| `npm ls --depth=0` | Pass — no missing/extraneous direct dependencies. |
| Temporary file-backed SQLite migrations/reopen smoke (direct DB module, `tsx`; no dotenv import) | Pass — applied versions 1–3, repeat applied 0, FK violations 0, integrity `ok`, versions 1–3 after reopen; temporary directory removed. |

No Ring token, response, event, signature, or Playground session was used. No current official rules were re-fetched; user-supplied official notes and deadline remain explicitly attributed as such. The Stage One runtime/Ring evidence gate is still blocked.

### M10 report-gated closeout (2026-10-18)

**Probe input:** the latest owner-report block contained only `[PASTE THE REDACTED REPORT HERE]`. The owner says the probe was run on their own machine, but no redacted report content was supplied here. Step A and all Phase 2 work were skipped. No Branch A/B/C was selected; no Ring field, event, or result was inferred. This agent made no Ring API call and used no credential.

**Documentation state:** README now leads with the local quick start and a source/evidence table; report/checklist distinguish local, mocked, synthetic, Playground, and live evidence. Phase 2 remains blocked. `submission/FRICTION_LOG.md`, `submission/DEMO_SCRIPT.md`, `submission/PRODUCT_FEEDBACK.md`, `submission/PROJECT_DETAILS.md`, and `submission/BUILT_WITH.md` were not changed for a nonexistent report; they do not contain invented probe findings.

**Verification scope:** only documentation files changed in this closeout. Final npm tests/typecheck/lint/build/audit/dependency-tree results remain those from after the last source change; no npm check or install was repeated for documentation. `git diff --check` passed after the final doc edits; the local-link check found 0 missing targets among 65 links in 23 Markdown files; the trailing-whitespace check found 0 offending lines among 119 tracked/non-ignored text files. The package lock is unchanged.

The heuristic scan covered 119 tracked working-tree files and 6 reachable commits / 571 file snapshots. Environment-file paths were excluded without being read; unreachable objects were not traversed. Eight high-confidence pattern families had 0 matches. Two broad heuristics matched only six test files (`server/src/app.test.ts`, `server/src/config.test.ts`, `server/src/ring/oauth-client.test.ts`, `server/src/ring/playground-probe-report.test.ts`, `server/src/ring/status.test.ts`, `server/src/ring/webhook.test.ts`). No values/lines were printed. This is not a dedicated scanner or proof of absence.

**Git/export:** the prior code/doc snapshot is `a41b00bf11526ae730e1182bba70c2741d45c154` on `arena/51d1d642-doorway-relay`; prior commits are preserved. The final documentation-only closeout is committed locally after review. The bundle, cumulative patch, numbered patch series, and local ZIP are generated after that commit. Ignored `handoff/EXPORT_MANIFEST.md` records final `HEAD`, tree, base, artifact sizes and SHA-256 values plus temporary-clone tree checks. No export is committed or pushed. No Ring output is present or fabricated.

## M11 / M11b Playground device/probe/WHEP closeout (2026-10-20)

**Scope boundary:** M11 delivers selected-device Playground API access, a devices-first redacted probe, and an optional browser receive-only WHEP relay. M11b completes hermetic Vitest setup and focused WHEP validation/cleanup/CSS/documentation work. The owner says a Playground probe was run separately, but its redacted report was not supplied to this workspace. No Ring credential was used, `.env` was not read, and no Ring request, WHEP session, screenshot, video, event, deployment, publication, push, invitation, or Devpost action occurred. History ingestion/normalization, `ring_playground_recorded`, and Sync remain blocked pending review of the real redacted report.

### Early checkpoint and actual checkout state

The M11b turn expected a previous `2b0fab5` snapshot checkpoint. On re-reading the actual repository, `HEAD` was `28f9d2f` and `git ls-files` contained only `README.md`; the rest of the existing project snapshot was in the worktree as untracked paths. The `2b0fab5` commit object was unavailable. Following the required early-checkpoint instruction, I preserved the whole present snapshot and committed it at `44abdb6` with the exact message `feat(ring): playground device selection, probe devices mode, WHEP live view` (129 files changed, 18,340 insertions, 1 deletion). No reset, rebase, force, or push was used, and the 58 unreachable blobs were not inspected. Since the expected `2b0fab5` object was unavailable, a lockfile comparison to that ID cannot be claimed. `package-lock.json` and `LICENSE` were present in the snapshot and their contents were not edited in M11b; both were added relative to the actual `28f9d2f` base as part of preserving that snapshot. The lockfile has no M11b diff against checkpoint `44abdb6`.

### M11b implementation and regression coverage

- Fixed the reported `prefer-const` lint issue in the browser WHEP client.
- Vitest setup assigns deterministic test config values, removes every inherited `RING_*`, redirects `DOTENV_CONFIG_PATH` to a random nonexistent temp path, explicitly tests a later `dotenv/config` import, and fails on inherited Ring settings. Global `fetch` and Node `http`/`https` guards allow loopback for Supertest and reject unmocked non-loopback destinations before a socket/DNS request. `unstubGlobals` and `unstubEnvs` restore test doubles.
- WHEP regressions cover stricter offer shapes and request-body size, response `Content-Length` and streamed-size caps, foreign-device `Location` rejection, repeated DELETE idempotency, create/delete authentication and CSRF/rate limits, 401 state reset, browser expiry cleanup, and setup failure cleanup. WHEP routes now set `Cache-Control: no-store` before auth/rate/body parsing, with assertions for auth, 401, 429, 413, success, and stop responses. The browser expiry timer is now cleared when answer installation fails.
- Removed CSS clipping/radius/filter/transform risks from the live video element while retaining `object-fit: contain`. Added the ICE privacy warning across user/security/architecture/Ring docs. No real frame exists to confirm the watermark; human visual review remains pending.
- `scripts/secret-scan.mjs` provides a no-dependency heuristic over tracked worktree files and reachable Git commits. It excludes `.env` paths and all unreachable objects and never prints candidate values.

The complete nine-row WHEP `OK`/`fixed` matrix is in [`docs/TESTING.md`](docs/TESTING.md). All network tests use mocks/fake timers/fake peer connections; none establishes Ring compatibility.

### Fresh verification on the M11b source (2026-10-20)

The earlier full M11 suite, before M11b's hermetic setup and additional WHEP assertions, passed **26/26 files and 132/132 tests**. The M11b suite below expanded coverage to **137** tests without reducing the existing suite.

| Command/check | Result |
|---|---|
| `npm ci --nodedir=/usr/local` | Needed because `node_modules` was absent; pass: 344 packages added, 345 audited, 0 vulnerabilities. No dependencies were added. |
| `npm run typecheck` | Pass — server and client. |
| `npm test` | Pass — **26/26 files, 137/137 tests**. |
| `npm run lint` | Pass — ESLint, zero warnings. |
| `npm run build` | Pass — Vite 8.3.4, 1,948 modules; JS 354.39 kB (106.35 kB gzip), CSS 32.19 kB (8.19 kB gzip). Client bundle only. |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities. |
| `npm ls --depth=0` | Pass — no missing/extraneous top-level dependencies. |
| Plain/fake-shell/fake-dotenv `npm test` isolation runs | Each passed **26/26 files, 137/137 tests**. The temporary fake dotenv file was removed. |

The test suite prints a redacted **mock** probe report under a temporary directory; its fixture timestamp is not live evidence. Final `git diff --check`, relative-link/trailing-whitespace checks, post-commit secret-scan counts, final export sizes/hashes, and temporary-clone tree verification are recorded in `handoff/EXPORT_MANIFEST.md` after the M11b commit/export is complete. Do not interpret this log or the mocked suite as a real Playground success claim.

## Release candidate import, bug fixes, and verification (2026-10-20 Windows environment)

**Scope:** Inspection, clean import of workspace snapshot patch `01a14a79-0a9e-7419-8c33-2cd751d1d642.patch`, code review and platform/security defect fixes, and hermetic end-to-end verification. Work executed on branch `release/devpost-submission` branched from remote `origin/main` (`28f9d2f`). No external push, PR, deployment, or network write performed.

### Patch Fingerprint & Import
- Source patch: `01a14a79-0a9e-7419-8c33-2cd751d1d642.patch`. Size: 1,110,094 bytes. SHA-256: `78dd5b54f42f80fabc7177225efc2c400d1444f265ed780c60f734737f832ea7`. 19,568 lines, 130 `diff --git` entries. Matched expected identity exactly.
- Applied cleanly via `git apply --index` onto base `28f9d2f` without conflicts. Committed as `chore: import Doorway Relay workspace snapshot (patch sha256 78dd5b54...)` (`919083e`).
- Redacted Ring Playground probe report check: checked `fixtures/ring-playground/` and workspace. None found. Status recorded: `Ring evidence BLOCKER: no reviewed redacted probe report`. Event History parsing, `ring_playground_recorded`, and Sync remain blocked (HTTP 409).

### Defects Found and Fixed
1. **Windows Path Parsing in Vite Client (`client/vite.config.ts`):** `new URL('.', import.meta.url).pathname` produced leading slashes on Windows (`/C:/...`), causing bundle resolution failures. Replaced with `fileURLToPath(new URL('.', import.meta.url))`.
2. **Path Separator in Probe Test (`server/src/ring/run-playground-probe.test.ts`):** Splitting report path strictly on `/` failed on Windows backslash paths. Switched to `path.basename`.
3. **Secret Scan Regex Separator (`scripts/secret-scan.mjs`):** Updated `environmentFilePath` to split on `/[/\\]/` so `.env` detection works on Windows.
4. **Config Ring Event Source Default & Production Token Encryption Key (`server/src/config.ts`):** Fixed `ringEventSource` to default strictly to `null` (never implicitly default to `ring_live`). Added fail-closed check for missing/placeholder/non-hex `TOKEN_ENCRYPTION_KEY` in `NODE_ENV === 'production'`. Added regression tests in `server/src/config.test.ts`.
5. **API Cache-Control Header (`server/src/app.ts`):** Mounted `noStoreResponse` middleware across `/api` so all API responses include `Cache-Control: no-store`. Added regression assertions in `server/src/app.test.ts`.
6. **Client CSRF Token Reset on 401 (`client/src/api.ts`):** Reset cached `csrfToken = null` on 401 response.
7. **WHEP STUN/ICE Boundary Notice (`client/src/ring/PlaygroundLiveView.tsx`):** Clarified host candidate gathering privacy boundaries.

### Verification Results (Node v22.22.3, npm 10.9.8)

| Command / Check | Result |
|---|---|
| `npm ci --ignore-scripts` | Pass: 340 packages installed, 0 vulnerabilities. Prebuilt `better-sqlite3@13.0.3` binary loaded without local C++ toolchain. |
| `npm run typecheck` | Pass: 0 errors (server and client TypeScript). |
| `npm test` | Pass: **26/26 files, 137/137 tests**. |
| `npm run lint` | Pass: ESLint 0 warnings (`--max-warnings=0`). |
| `npm run build` | Pass: Vite 8.3.4 (dist/index.html 0.54 kB, CSS 32.19 kB, JS 354.49 kB). |
| `npm audit --audit-level=moderate` | Pass: 0 vulnerabilities. |
| `npm ls --depth=0` | Pass: all declared top-level packages resolve cleanly. |
| SQLite Migration Idempotency & Demo Seed | Pass: Migrations 1-3 applied; second run reported already up to date; synthetic demo data seeded for 3 members. |
| Ring Local Simulator & Persistence Across Restart | Pass: Signed local event sent to `/api/ring/webhook` returned HTTP 200 `accepted`; ingested into inbox with `ring_simulated` provenance; classified to handoff; server restarted; handoff and activity audit persisted. |
| `node scripts/secret-scan.mjs` & `git diff --check` | Pass: 0 high-confidence matches; 0 trailing whitespace / CRLF diff issues. |
| Clean-checkout clone in temp dir | Pass: `git clone` into temporary directory, ran `npm ci --ignore-scripts`, typecheck, test (137 tests), lint, build cleanly. |
