# Testing and verification record

This file records commands actually run against this working tree. A local simulator test is **not** a Ring-live test.

## M8 Playground path — written, not run against Ring

M8 added a separate typed/Zod-validated client for the owner-run Playground API path, a structure-only redacting `npm run ring:probe`, safe status/verify routes, and an Integration-page status plus a disabled Sync action. The client uses a fixed official API origin, server-side Bearer header, AbortController timeout, response cap, bounded `Retry-After`, and same-history-endpoint pagination. Device IDs must be provided by the owner in local ignored `.env`; the code does not infer an ID from `/v1/devices`. The probe reports only bounded structure/field paths/types and array lengths, allow-listed event-type strings, subtype/classification paths and JSON types (not values), timestamp-format categories, and pagination shape. No raw response, token, ID, email, or URL is saved in the report.

All M8 Playground tests use mocked fetch responses; they establish local behavior only. No Ring API call, portal app/session, actual API response, real event, or real probe report is evidenced in this workspace. M7's non-printing check recorded no Ring credentials at that time; the ignored `.env` was not inspected during M8/M9, so current local credential presence is unconfirmed. The Event History adapter, ingestion, normalization, identity/dedup, `ring_playground_recorded` provenance persistence, and recorded Playground fixtures remain blocked pending the owner's real redacted probe report. `/api/ring/playground/sync` is fail-closed and returns 409 without a Ring request. Background history polling is default-off and disallowed for `ring_playground`; no snapshot/video endpoint is called. Exact M8 offline commands/results follow in the M8 section below.

## Environment and Ring boundary

- Node `v22.22.3`; npm `10.9.8`; Git `2.39.5`.
- No Ring Client ID/secret, HMAC key, Playground token, authenticated Ring account, or device was available in M7. No authenticated portal or official sandbox interaction was performed.
- M5 historically fetched Ring Developer/API/Configure/Develop/MCP, Devpost rules/resources, and official sample references on 2026-10-17; some standalone docs links returned 404. M7 could not re-fetch Ring or Devpost because those hosts are outside this sandbox's outbound allowlist. These historical sources are not current M7 rule or eligibility verification. See [`RING_INTEGRATION.md`](RING_INTEGRATION.md).
- The local v1.1-shaped webhook adapter is tested, but no live Ring webhook/API verification is claimed. The M5 documentation review reported that Ring's Configure guide described a POST to the partner Token Exchange URL without the full inbound body/acknowledgement contract. M7 could not re-check current docs; `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains `false`, and the code's optional JSON/form top-level `code` path is explicitly **UNVERIFIED**.

## M3 baseline verification (historical at M3 closeout; M4 results below)

| Command | Result |
|---|---|
| `npm ci --nodedir=/usr/local` | Pass — installed 344 packages; npm reported 0 vulnerabilities at install time. |
| `npm ls --depth=0` | Pass — all declared dependencies resolve to the lockfile versions; no missing/extraneous packages reported. |
| `npm run typecheck` | Pass — server and client TypeScript projects. |
| `npm run lint` | Pass — ESLint, zero warnings. |
| `npm test` | Pass — **17 test files, 59 tests**; no Vitest unhandled errors. |
| `npm run build` | Pass — TypeScript and Vite production build; JS 339.31 kB (102.41 kB gzip), CSS 29.78 kB (7.71 kB gzip). |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities reported. |
| Temporary `DATABASE_PATH=… npm run db:migrate` (twice) | Pass — first run applied migrations 1, 2, 3; second reported already up to date. `schema_migrations` count was 3; `PRAGMA foreign_key_check` returned 0 rows. Temporary database removed. |
| `git diff --check` | Pass — no whitespace errors. |
| Tracked secret-pattern scan | Pass — no matches for checked AWS access-key, private-key header, or GitHub-token patterns; scan printed no secret values. `.env` remains ignored. `gitleaks`, `trufflehog`, and `detect-secrets` were not installed. |

The 58-test baseline passed before M3 changes. One additional regression test captures an actual activity-timeline defect: when two entries share the same timestamp, sorting by random activity UUID could reverse their insertion order. The test failed against the baseline (1 failed, 6 passed in `server/src/domain/handoffs.test.ts`); sorting by timestamp and SQLite insertion rowid fixed it. At M3 closeout, the suite had 59 tests. Tests also verify reassignment while acknowledged preserves state/acknowledgement time, and protected reads / invalid-CSRF mutations remain blocked.

Coverage includes manual/event handoffs, assign/reassign, acknowledgement, resolution/reopen, activity history, duplicate webhook delivery/event IDs, SQLite persistence after reopen, migration invariants, API input validation, authenticated/unauthenticated access, CSRF/origin checks, and Ring webhook status/idempotency behavior. These are local implementation tests, not Ring certification.

## M3 targeted verification and historical M2 record

- `npx vitest run --config vitest.config.ts server/src/domain/handoffs.test.ts server/src/app.test.ts` — pass, 2 files / 17 tests, after M3 changes.
- `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` — pass at M3 closeout; the test suite reported 17 files / 59 tests.
- The prior M2 follow-up had 17 files / 58 tests passing and a clean build. That is a prior milestone result; the M3 result above is current.

## M4 workflow verification (2026-10-17)

**Scope:** Local M4 workflow verification only on `arena/51d1d642-doorway-relay`. No migration, dependency, or lockfile changes were made. No Ring API or live Ring webhook was called.

- Fixed dashboard activity tie ordering: equal `occurred_at` values now use SQLite `rowid DESC`, with a regression test that would fail under UUID sorting.
- Corrected dashboard state semantics. `new` is unassigned/waiting for an owner; `assigned` and `reopened` are awaiting acknowledgement; `acknowledged` remains open/in progress. The dashboard shows separate Awaiting acknowledgement and Acknowledged counts, and the former links to an API filter that returns exactly `assigned` + `reopened` handoffs.
- Fixed the manual handoff API/UI contract: `dueAt: null` is accepted for an omitted optional date. The API test still rejects malformed dates.
- Added a jsdom full-stack workflow test using the real React pages, in-process Express API, SQLite, session/CSRF flow, and an explicitly simulator-signed `ring_simulated` event. It verifies dashboard cards/counts, inbox provenance and classification, manual create/detail, failed and successful assignment, acknowledgement, reassignment preserving acknowledgement time, resolution note/activity order, and refreshed dashboard/inbox state. The simulated event is not Ring-live data. `isSynthetic: false` means it was not a seeded demo fixture; its provenance remains `ring_simulated`.
- The existing `server/src/vertical-slice.test.ts` continues to verify SQLite close/reopen persistence and duplicate simulator webhook handling. No schema migration was needed.

| Command | M4 result |
|---|---|
| Baseline `npm test` before M4 edits | Pass — 17 files / 59 tests. |
| `npx vitest run --config vitest.config.ts client/src/workflow.integration.test.tsx server/src/domain/overview.test.ts server/src/domain/handoffs.test.ts server/src/app.test.ts` | Pass — 4 files / 20 tests. |
| `npm test` | Pass — 19 files / 62 tests; includes the full-stack workflow, dashboard counts/tie-order, existing file-backed persistence/restart and duplicate-event tests. |
| `npm run typecheck` | Pass — server and client TypeScript projects. |
| `npm run lint` | Pass — ESLint with zero warnings. |
| `git diff --check` | Pass — no whitespace errors. |
| `npm run build` | **Not run:** explicitly excluded by the M4 no-rebuild instruction. |

The full-stack UI/API test runs in jsdom, not a real browser. No Chromium/Firefox or Playwright/Puppeteer executable was available, so visual/responsive browser review remains unverified. Simulator provenance is correctly labeled `Ring · Simulated`; no live Ring connectivity is claimed. At M4 closeout, Token Exchange remained disabled and no push, tunnel, deployment, or M5 work had been done.

## M5 Ring adapter verification (2026-10-17)

M5 reviewed the current official Ring and Devpost material, corrected webhook/history adapter gaps, and aligned the existing one-way account-link boundary with the published flow:

- `meta.request_id` is now treated as a bounded opaque identifier rather than a UUID-only value; the official sensor example includes a suffix. Unsupported signed sensor/lifecycle events can be acknowledged and ignored instead of being rejected with a permanent 400.
- Motion normalization now treats `data.attributes.sub_type` as canonical, retains the earlier supplied `data.subType` only as a compatibility fallback, and preserves a neutral motion event if subtype is absent.
- Event History now maps official `ding` and `motion` values to the app's supported door-event types, reads the device ID from `relationships.source.data.id`, and ignores `on_demand`. The optional poller still reads one page only and was not exercised against Ring.
- Account linking now accepts only documented `time`/`nonce`, uses the stored unclaimed-token account ID (OAuth tokens remain encrypted), verifies the nonce/profile, sends the masked partner identifier plus nonce, then patches `completed` before claiming the pair. Stubbed tests cover the route and upstream call order/failure handling; no Ring API was contacted. Removed the unverified static integration-body overrides.
- Made the encrypted-token tamper regression deterministic by mutating an authentication-tag data character instead of a final base64url character that may change only unused encoding bits; production crypto code is unchanged.
- `RING_OAUTH_CONTRACT_VERIFIED=true` is confirmed only for the documented outgoing form exchange/refresh contract. The distinct inbound Ring callback body/acknowledgement is still incomplete in the docs, so `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains false.

| Command / check | M5 result |
|---|---|
| Initial Ring-focused baseline: `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass before edits — 9 files / 41 tests. |
| Ring-focused post-change command: `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` | Pass — 9 files / 46 tests. |
| `npx vitest run --config vitest.config.ts client/src/workflow.integration.test.tsx server/src/vertical-slice.test.ts server/src/domain/inbox.test.ts` | Pass — 3 files / 3 tests; simulator-provenance event → inbox classification → handoff/activity and persistence. |
| `npm run simulate:ring -- button_press` and `npm run simulate:ring -- motion_detected`, run by a harness with an in-memory app bound only to `127.0.0.1` and an ephemeral port | Both exited 0 and returned HTTP 200 `accepted`. The temporary database verified two `ring_simulated` events, `is_synthetic = 0`, two receipts, and no signed Ring event. |
| `npm test` | Pass — 19 files / 67 tests. |
| `npm run typecheck` | Pass — server and client TypeScript projects. |
| `npm run lint` | Pass — zero warnings. |
| `git diff --check` | Pass. |
| `npm run build` | **Not run**, per the standing no-rebuild instruction. |

No Ring credentials were available: the ignored `.env` has no Ring access token, client ID/secret, Ring HMAC key, or history device ID; only local simulator/encryption settings were set among the Ring-specific keys checked. The official console and Playground redirected to Amazon sign-in. No Ring API call, app creation, paid plan/resource, public HTTPS tunnel, deployment, push, or external exposure was attempted. Current public docs describe public HTTPS/TLS 1.2+ and a five-second webhook response; see [`RING_INTEGRATION.md`](RING_INTEGRATION.md) for the endpoint/security blocker and exact remaining demonstration steps.

## Unresolved limitations

No external Ring system was contacted; no live Ring status is claimed. The Token Exchange inbound body/response remains unknown and the route remains disabled. The account-link route is aligned with the published `time`/`nonce` and dynamic App Integrations sequence and covered by stubbed tests, but has not been exercised against Ring; an unclaimed token still depends on the unverified callback. The official sandbox path and staging device/subscription eligibility were not verified in the signed-in portal. No public tunnel, screenshot, cloud resource, deployment, or preview process was created. Human browser review remains pending. That was the M5 closeout state; M6 was subsequently authorized and is recorded below.

## M6 security, deployment, and local verification (2026-10-18)

**Scope:** M6 only. Work stayed on `arena/51d1d642-doorway-relay` and preserved the checkout. No build, public preview, tunnel, DNS change, push, deployment, paid resource, or live Ring call was made. The Git metadata discrepancy is described below; it was not reset or repaired.

### Changes and source review

- Reviewed frontend routes/styles/tests, backend auth/CSRF/authorization/validation/error handling, Ring signature/deduplication/account-link/token paths, SQLite operations/migrations, runtime scripts/configuration, and existing documentation.
- Fixed the date-dependent handoff state-machine test by deriving its timestamps from the current clock; the focused file passed 7/7. Production handoff logic was not changed.
- Made the Ring status note precise about what remains unverified; the Integration page no longer suggests that all official Notifications/OAuth documentation is unchecked. Added a jsdom route test for the not-connected state, disabled API-check action, simulator label, and Token Exchange guidance.
- Tightened Origin validation to require the exact configured origin (including scheme), made first-user registration recheck and insert inside an immediate SQLite transaction, validated `WEB_ORIGIN` as a bare HTTP(S) origin, and in production required HTTPS, a 64-hex session secret, and an absolute non-memory SQLite path. Added `HOST` with a loopback default; API/Vite development servers now bind loopback and Vite no longer permits arbitrary hosts.
- Added a database-backed `/api/health` readiness endpoint (200/503, generic body, no session/cookie) and tests for both healthy and closed SQLite states. Token Exchange rejection logging now omits submitted field names as well as values. `seed:demo` fails before opening a database in production.
- Added [`SECURITY.md`](SECURITY.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md); updated API, architecture, Ring, README, test, and build-log documentation. Token Exchange remains disabled by default because its inbound contract is still unverified; production config also rejects enabling it.

### Commands and results

| Command/check | M6 result |
|---|---|
| `node --version && npm --version` | Pass: Node `v22.22.3`, npm `10.9.8`; `package.json` requires Node `>=22.12 <23` and npm `>=10`. |
| `npm ci --nodedir=/usr/local` | Pass: 344 packages installed; npm reported zero vulnerabilities during install. |
| `npm ls --depth=0` | Pass: all declared top-level dependencies resolve; no missing or extraneous packages. |
| `npx vitest run --config vitest.config.ts server/src/domain/handoffs.test.ts` | Pass after the date-relative test fix: 1 file / 7 tests. |
| First post-change `npm test` run alongside other CPU-intensive checks | Timed out in the 5-second UI workflow-test limit while the other 69 tests passed; no assertion failure was reported. A serial full-suite rerun below passed. |
| `npm test` (serial rerun) | Pass: **19 files / 71 tests**. Includes auth/origin, concurrent first-user registration, health, Ring boundary, workflow, UI route/navigation, and SQLite persistence tests. |
| `npm run typecheck` | Pass: server and client projects. |
| `npm run lint` | Pass: zero warnings. |
| `npm audit --audit-level=moderate` | Pass: 0 vulnerabilities reported for the lockfile dependency tree. This is not a secret/static-code scan. |
| `npm run db:migrate` twice against a temporary file-backed database | Pass: migrations 1–3 applied once; second invocation reported up to date; migration row count 3; `PRAGMA foreign_key_check` returned 0 rows. Temporary DB removed. |
| `NODE_ENV=production … npm run seed:demo` with a temporary path | Expected guard verified: exit 1 with the generic production-disable message; no database file created. |
| Loopback Vite + Express smoke harness, ephemeral ports and in-memory SQLite | Pass: SPA root 200, transformed `/src/main.tsx` 200, Vite-proxied `/api/health` 200 `{ status: "ok" }`; both listeners bound only to `127.0.0.1` and closed at test end. No public preview or tunnel. |
| `git diff --check` and whole-working-tree whitespace scan | Pass: no whitespace errors. |
| Selected secret-pattern heuristic | 111 readable, non-generated workspace text files; six high-confidence pattern categories; zero matches. Values were not printed. `.env`, `.env.local`, and `.env.production` were absent. Dedicated secret/static-analysis tools were unavailable, so this is **not** a repository secret-free claim and did not inspect missing Git objects or remote history. |
| Browser/tooling preflight | No browser executable or Playwright/Puppeteer tooling found. jsdom route/workflow/keyboard tests passed, but there was **no real-browser visual/responsive/accessibility review and no screenshot**. CSS breakpoints and focus/reduced-motion implementation were inspected at source level only. |
| `npm run build` | **Not run** as explicitly instructed. No production bundle/build result is claimed. |

### Deployment and external-service outcome

Deployment is **not ready**: there is no production API `start` script or server build/release artifact, no service/container definition, and no tested production static serving, secret manager, backup/restore plan, or monitoring. SQLite requires a durable, access-controlled, single-instance volume and a serialized migration process. The health endpoint checks SQLite only. HTTPS must be provided by a separately approved ingress; no endpoint or tunnel was created. No Ring app/credentials/device/API response/event was used. Ring's public callback prerequisites, portal staging eligibility, and exact inbound Token Exchange body/acknowledgement are not all verified; keep `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=false`.

### Git and workspace discrepancy (preserved)

At M6 start and final review, `git` reported branch `arena/51d1d642-doorway-relay` at `28f9d2f0dfb6f2b4268d8d8dbf1d5afbd8b6d601` (`Initial commit`), marked grafted/shallow; `git rev-list --all --count` was 1. Only `README.md` was tracked (and modified); the application, docs, lockfile, and other project files were present as untracked working-tree files. Previously reported milestone IDs (`ac0d03b`, `766fdeb`, `1e2a785`, `f18e29a`, `e7c0c79`, `8175984`, `97e790b`, `c38db3a`) were not present in the local object database/ref history. No reset, checkout, staging, index repair, commit, push, or history rewrite was made. All workspace files were preserved; this local mismatch does not establish remote history.

At M6 closeout, M7 had not started. The M7 recovery and verification record follows.

## M7 recovery, verification, and submission readiness (2026-10-18)

**Scope:** M7 only, on `arena/51d1d642-doorway-relay`. No source was scaffolded from scratch, no reset/rebase/history rewrite was performed, and no files/refs were replaced to match the remote. No push, release, publication, visibility change, tunnel, public endpoint, deployment, cloud resource, cost, or live Ring call occurred.

### Recovery and Git state

- At M7 recovery start, the workspace had 111 non-generated files spanning the app, tests, migrations, docs, and submission kit. Each of those 111 files exactly matched one unreachable loose Git blob. There were no unmatched blobs and no unreachable commits or trees; prior milestone history could not be reconstructed from this object database. M7 has since updated the verified provenance configuration and submission/build docs.
- The only reachable local commit was the shallow README-era commit `28f9d2f0dfb6f2b4268d8d8dbf1d5afbd8b6d601`. `origin/main` and remote `HEAD` pointed to the same commit. GitHub metadata reported the repository public, default branch `main`, and viewer permission ADMIN. The remote's tree contained only the initial README; no source had been pushed. No remote changes were made.
- M7 did not infer that the remote contained this workspace's source, did not rewrite history, and did not publish any local files. Historical commit IDs named in older build-log entries are not present in the current object database and are not represented as recoverable commits.
- After verification, the recovered source/docs were saved as a new local snapshot commit `47eaac6` on the fixed branch. This is not a reconstruction of prior M1–M6 history and was not pushed; `origin/main` remains unchanged.

### M7 changes and checks

- Source review found that `RING_EVENT_SOURCE` silently defaulted to `ring_live` while the `.env.example` called the optional access token a Playground token. That could mislabel Playground Event History as live if a user copied the example without changing the label. Config now requires an explicit `ring_live`/`ring_playground` value whenever a Ring credential, access token, HMAC key, or history device is configured; the example leaves it unset and warns not to mislabel. Added config tests for missing/explicit provenance. No test was weakened.
- `npm ci --nodedir=/usr/local` — pass; installed 344 packages and npm reported 0 vulnerabilities.
- `npm ls --depth=0` — pass; no missing or extraneous top-level dependencies.
- `npm run typecheck` — pass for server and client.
- `npm run lint` — pass with zero warnings.
- `npx vitest run --config vitest.config.ts server/src/ring/*.test.ts server/src/app.test.ts` — pass, **9 files / 48 tests**.
- `npm test` — pass, **19 files / 72 tests**.
- `npm run build` — pass; the client production build transformed 1,946 modules; JS 339.48 kB (102.43 kB gzip), CSS 29.78 kB (7.71 kB gzip). This does not create a production API server package.
- `npm audit --audit-level=moderate` — pass, 0 vulnerabilities. `npm ls` and audit are lockfile/dependency checks, not a complete source security review.
- `npm run db:migrate` twice on a fresh temporary file-backed database — pass; versions 1–3 applied once; repeat was idempotent; 3 migration rows; `PRAGMA foreign_key_check` had 0 violations. Temporary DB removed.
- `npm run seed:demo` against a separate fresh temporary DB — pass; startup applied migrations 1–3, seeded 3 workspace users and 8 source-event rows, all marked `is_synthetic=1` (5 carried `ring_simulated` provenance), and `PRAGMA foreign_key_check` had 0 violations. A throwaway test password was generated in-process and not printed; the temporary database was removed. No Ring API/event source was used.
- Selected high-confidence secret-pattern scan — 111 readable non-generated files, six categories, zero matches. Root environment-file inventory contained only `.env.example`; no real `.env` was inspected or printed. Earlier unreachable-blob scan also found no selected patterns. This is a heuristic, not a guarantee or dedicated Gitleaks/TruffleHog scan.
- `git diff --check`, a whole-workspace trailing-whitespace scan, and local Markdown-link check — pass; 111 readable text files, 0 trailing-whitespace lines, 0 missing local Markdown link targets.
- Browser preflight — no browser executable, Playwright, or Puppeteer available; no real-browser review or screenshot was made. No preview server was exposed.

### Ring, rules, and submission limits

- Source inspection confirms the intended runtime integration uses a server-side HTTP client for Ring profile/device/Event History paths and the raw-body webhook receiver. Local stubs/tests exercise that code, but no Ring token, portal, app, device, official simulator, authenticated API response, or genuine Ring event was available. The local fixture is Doorway Relay's synthetic `ring_simulated` source only.
- M5 sources were historically checked on 2026-10-17. M7 could not re-fetch the current Ring Developer site or Devpost rules/resources because those hosts are outside this sandbox's outbound allowlist. Current technology eligibility, required runtime evidence, reviewer instructions, invitation details, field limits, deadline, and thumbnail dimensions remain unverified. Do not claim a reviewer invitation or current eligibility.
- The inbound Token Exchange callback contract remains unverified and disabled by default. Any Ring API/history credential must remain local in ignored `.env`; never paste secrets into chat. A public HTTPS callback, tunnel, or deployment would require separate explicit authorization.
- `LICENSE` remains a draft MIT license with a copyright-holder placeholder; no legal identity was invented. No screenshots, demo video, invitations, Devpost submission, or live Ring evidence were produced.
- The repository is currently public on GitHub, but the source is not on its remote `main`; no source push or visibility change was authorized or performed. The local workspace is not a published public source release.
- The visible user message truncates at “The required demon…”. The missing suffix may contain additional acceptance criteria, so this report cannot claim to have completed requirements not visible in the request.

**Disposition:** Local source recovery and M7 verification passed, but this is **not submission-ready, production-ready, or verified for current Ring-track eligibility**. Remaining human inputs are: resend the truncated request; provide current official rules/resources or an accessible official-source copy; confirm the legal copyright holder/license; establish an eligible real/official Ring source using credentials entered only in local `.env`; decide whether to authorize any source push/visibility change; and provide/perform real browser screenshots and a compliant demo recording only after eligibility and source are confirmed.

## M8 offline Playground client, probe, status, and build (2026-10-18)

**Important boundary:** all Playground HTTP tests below use mocked fetch responses. No Ring call was made. `npm run ring:probe` was exercised only with an explicitly empty token to prove the early guard; the client was not constructed and no report or network request was made. No real Event History schema, fixture, or ingestion result exists.

### Changes covered by local tests

- The separate `RingPlaygroundClient` is fixed to `https://api.amazonvision.com`, sends the Bearer token only from the server, uses a 12-second default AbortController timeout, caps response text at 2 MB, limits request cadence, follows only same-history-endpoint pagination, and caps retries and `Retry-After`. The probe caps history traversal at five pages.
- Zod validates top-level JSON and safe pagination-link forms. A string `links.next` and a JSON:API `{ href }` link object are supported; unknown or unsafe link shapes stop traversal while retaining the page shape. Unknown response fields are not coerced into an invented Event History model.
- The report builder emits bounded structure/field paths/types, array lengths, allow-listed event-type strings, subtype/classification field paths and JSON types (not their values), and timestamp-format categories. Unknown event strings and unrecognized/dynamic keys are omitted or redacted. Raw values, IDs, emails, URLs, and token material are redacted/omitted, and a final serialization guard rejects accidental Bearer tokens, email addresses, or URLs.
- The owner must supply `RING_HISTORY_DEVICE_ID` in ignored `.env`; without it the probe exits before constructing the client. It never infers an ID from device data and only records that the operator-supplied value was configured. The report is generated only by a real owner-run probe; test mocks are inline and no `fixtures/ring-playground` data file was created in this workspace.
- Status/verify routes and the Integration page distinguish safe token/API states. The browser receives no token or upstream body. Sync remains blocked with 409 and makes no Ring request until the real report is reviewed.
- Background history polling defaults off; the config rejects enabling the legacy poller for `ring_playground`.

### Commands and results

| Command/check | M8 result |
|---|---|
| `npm test` | **Most recent pre-M9 pass:** 22 test files / 93 tests. This preceded the M9 explicit fetch-mock type annotation and synthetic-badge assertion; the final M9 tree has not been test-run because dependencies are absent. |
| `npm run build` | **Earlier M8 pass only:** Vite production client build; 1,946 modules transformed. JS 342.57 kB (103.15 kB gzip); CSS 30.11 kB (7.78 kB gzip). It predates the latest M8/M9 changes and is not a current build result. This is not a production API bundle. |
| `npm run lint` | **Most recent pre-M9 pass:** zero warnings. Not rerun on the final M9 tree because `node_modules` is absent. |
| `npm run typecheck` | **Latest pre-M9 attempt failed:** TS2493 at `server/src/ring/playground-client.test.ts(60,50)`. The fetch mock was given an explicit typed signature in M9; no successful typecheck of that fix is claimed. |
| `npm ls --depth=0` | **Pre-M9 pass:** declared top-level dependencies resolved. At M9, `node_modules` is absent; no dependency installation was performed. `package-lock.json` is unchanged. |
| `npm audit --audit-level=moderate` | **Pre-M9 pass:** 0 vulnerabilities reported. Dependency advisory check only; not a source security audit. |
| Temporary `npm run db:migrate` twice, then `npm run seed:demo` | **Pass:** migrations 1–3 applied once; repeat was up to date; temporary seed contained 3 users and 8 explicitly synthetic source events; 0 foreign-key violations. Temporary DB removed. No migration was added in M8. |
| `RING_ACCESS_TOKEN= RING_EVENT_SOURCE=ring_playground RING_HISTORY_DEVICE_ID= npm run ring:probe` | **Expected offline guard:** exit 1 with “No Playground token is configured”; wrapper confirmed status 1. Empty env value prevents `.env` from supplying a token; script exits before constructing the client. No Ring network request or output report occurred. This is not a probe result. |
| `git diff --check` | **Pass:** no whitespace errors. |
| Local Markdown-link check | **Pass:** 52 relative links checked; 0 missing targets. |
| Changed-file whitespace / selected secret heuristic | **Pass:** 36 changed text files checked, 0 trailing-whitespace lines; 4 high-confidence token/key patterns, 0 matches. The ignored `.env` was excluded from this heuristic scan and its contents were not manually inspected; this heuristic is not a dedicated secret scanner. |
| Live Ring request / real Playground report / event history sync | **Not run:** explicitly blocked by the owner-provided no-live-call boundary. |
| Browser visual review / screenshot / public preview | **Not run:** no real-browser review or public preview was performed. |

During implementation, early typecheck/lint surfaced a missing test-config polling flag and one unused import; those were fixed. An initial full test command reported all 90 assertions passing but Vitest also caught an unhandled rejection from the new fake-timer timeout test; the test was corrected to attach its rejection assertion before advancing timers. The final `npm test` run above passed without unhandled errors. A focused pagination run also caught two test expectation issues (repeated-link vs page-limit, and a synchronous throw assertion); the client/test behavior was corrected and the final full suite passed. No test uses a real Ring response.

### Pending real-probe gate

The current branch intentionally does **not** implement Event History normalization, persistence, idempotency keys, identity matching, recorded fixtures, or `ring_playground_recorded` provenance. Existing M5 parser assumptions in `server/src/ring/history.ts` are not reused for Playground. The human must generate a Playground token, note a device ID, set local `RING_ACCESS_TOKEN`, `RING_EVENT_SOURCE=ring_playground`, and `RING_HISTORY_DEVICE_ID`, run `npm run ring:probe` on a network-enabled machine, inspect the structure-only report, and share only that redacted report. Only then should the observed adapter be implemented and tested with owner-authorized recorded responses. No snapshot/video-download endpoint is requested. See [`FINAL_CHECKLIST.md`](../submission/FINAL_CHECKLIST.md) for dates, human steps, and publication authorization boundaries.

## M9 Phase 1 closeout (2026-10-18)

- Fixed the reported TS2493 test typing issue by giving the `vi.fn` fetch mock an explicit `(input, init?)` signature; the test assertion remains typed and was not weakened. Added a UI assertion for the explicit **Synthetic demo data** provenance marker.
- The current environment has no `node_modules`. Per the no-install instruction, no dependency installation was attempted. After the fix, `npm run typecheck` and `npm run build` stopped with `tsc: not found`; `npm run lint` stopped with `eslint: not found`; `npm test` stopped with `vitest: not found`. These are missing-tool results, not passing verification and not application diagnostics.
- The last pre-M9 run passed 22 files / 93 tests and lint; the TypeScript check in that run had failed on TS2493 before the test typing fix. The last successful Vite client build predates that run and the latest M8/M9 edits. No current build result is claimed.

## M10 risk-first release-candidate verification (2026-10-18)

**Boundary:** this was a local source/configuration/doc review only. It did not call Ring, use credentials, open `.env`, produce a real report, or perform browser review. M10's actual changes and remaining gaps are summarized in [`submission/FINAL_CHECKLIST.md`](../submission/FINAL_CHECKLIST.md). No install was repeated after the one authorized `npm ci --nodedir=/usr/local` restore.

### Confirmed changes and regression coverage

- A Ring-HMAC webhook can no longer inherit `ring_playground` provenance: Playground mode rejects it before an event/receipt/signed-status write. A regression test asserts the 401 and zero writes. The simulator HMAC remains a separate local `ring_simulated` source.
- The legacy Event History parser now writes only `ring_live`, has no Playground provenance parameter, and maps supported `ding`/`motion.*` event labels to neutral local categories. Its response-field and timestamp-unit assumptions remain unverified; all parser fixtures are explicitly synthetic test input, not captured Ring data.
- Probe reports now include only allow-listed event vocabulary; subtype/classification field paths and JSON types, not raw values; and schema-like field keys. Dynamic/unrecognized keys and values are redacted. The final token/email/URL check remains a guard, not a substitute for owner privacy review.
- Ring API URL validation now enforces HTTPS and same-origin request paths; production config pins the documented API/OAuth origins and rejects a cross-origin token URL. API and OAuth token/profile requests reject redirects. API reads have a 12-second default timeout, max 3 bounded retries, and a streamed 2 MB JSON cap. OAuth refresh has a 12-second deadline; the existing full code-exchange/profile operation remains bounded to 55 seconds. These are local mock tests, not upstream compatibility evidence.
- The local simulator is now visibly **Local · Simulated**, separate from seeded **Synthetic demo data**.
- Only the full-stack workflow test timeout changed: 10 seconds for a measured ~2.4-second serial journey that reached ~6.4 seconds under full concurrent verification load. No assertion, test coverage, or global timeout was weakened.

### Final commands run

| Command/check | Result |
|---|---|
| `npm test` (serial) | Pass — 22/22 files, **99/99 tests**; Vitest duration 13.45 s, workflow test about 2.537 s. |
| `npm test` with `npm run typecheck`, `npm run lint`, `npm run build`, `npm audit --audit-level=low`, and `npm ls --depth=0` running concurrently | All pass — 22/22 files, **99/99 tests**; workflow test about 7.371 s, below its test-specific 10-second limit. Vitest suite duration about 25.75 s. |
| `npm run typecheck` | Pass — server and client TypeScript projects. |
| `npm run lint` | Pass — ESLint with `--max-warnings=0`. |
| `npm run build` | Pass — typecheck plus Vite client build, 1,946 modules; JS 342.60 kB (103.18 kB gzip), CSS 30.11 kB (7.78 kB gzip). This is not a production API package. |
| `npm audit --audit-level=low` | Pass — 0 vulnerabilities reported by npm's lockfile advisory check. |
| `npm ls --depth=0` | Pass — no missing or extraneous top-level dependencies. |
| Direct temporary file-backed SQLite migration/reopen smoke (`tsx`; no dotenv import) | Pass — migrations 1–3 applied; repeat applied 0; 0 foreign-key violations; `integrity_check=ok`; all 3 versions remained after reopen. Temporary directory removed. |
| `npm ci --nodedir=/usr/local` | One authorized run in M9.1: 344 packages added, 345 audited, 0 vulnerabilities. Not repeated in M10; `package-lock.json` unchanged. |

## M10 report-gated verification and closeout (2026-10-18)

**Owner report:** the prompt's report block contained only `[PASTE THE REDACTED REPORT HERE]`. The owner says their probe was run on their own machine, but no redacted report content was supplied here. Phase 2 and Branch A/B/C selection were skipped. This agent made no Ring request and used no Ring credential.

Only documentation changed in this closeout. The final npm results above were run after the last source/test change; they were not rerun for docs. One authorized `npm ci --nodedir=/usr/local` ran earlier (M9.1) and was not repeated; the lockfile remains unchanged.

After final doc edits, `git diff --check` passed. The local relative-link check found **0 missing targets among 65 links in 23 Markdown files**. The trailing-whitespace scan found **0 offending lines among 119 tracked/non-ignored text files**. The package lock remains unchanged.

The heuristic scan covered **119 tracked working-tree files and 6 reachable commits / 571 file snapshots**, excluding all environment-file paths without reading them and not traversing unreachable objects. Eight high-confidence pattern families had no matches; two broad patterns matched only six test files (`server/src/app.test.ts`, `server/src/config.test.ts`, `server/src/ring/oauth-client.test.ts`, `server/src/ring/playground-probe-report.test.ts`, `server/src/ring/status.test.ts`, `server/src/ring/webhook.test.ts`). Values/lines were not printed. This is a heuristic, not a dedicated scanner or guarantee.

A prior bundle/patch recovery passed at commit `a41b00b` but did not include the final docs. The closeout commit's final bundle, consolidated patch, numbered patches, and ZIP are generated and verified afterward; `handoff/EXPORT_MANIFEST.md` records the final commit/tree, base, sizes, hashes, and clone tree comparisons. These ignored handoff outputs are not committed or pushed. No real Ring probe, Phase 2, browser review, screenshot, video, deployment, or submission occurred.

## M9.1 reproducible verification (2026-10-18)

### Environment and restore

The repository requires Node `>=22.12 <23` and npm `>=10`; verification ran under Node `v22.22.3` and npm `10.9.8`. `npm ci --nodedir=/usr/local` succeeded (344 packages added, 345 audited, 0 vulnerabilities). `package-lock.json` remained unchanged. No clean-clone verification was performed; the owner will run that independently.

### Current results

| Command | Result |
|---|---|
| `npm run typecheck` | Pass: server and client TypeScript checks. |
| `npm test` | Final serial run: **22/22 files, 94/94 tests passed**. Initial parallel-run timeout is described below. |
| `npm run lint` | Pass: ESLint, zero warnings (`--max-warnings=0`). |
| `npm run build` | Pass: typecheck and Vite client production bundle; 1,946 modules. JS 342.60 kB (103.18 kB gzip); CSS 30.11 kB (7.78 kB gzip). |
| `npm audit --audit-level=moderate` | Pass: 0 vulnerabilities. |

### Timeout diagnosis

The first full `npm test` ran concurrently with typecheck, lint, build, and audit. It reported 21/22 files and 93/94 tests passing; `client/src/workflow.integration.test.tsx:138` failed with Vitest's exact error `Test timed out in 5000ms`. The unchanged test then passed alone (1/1, about 2.46 s), and the serial full-suite rerun passed all 22 files / 94 tests. This is consistent with resource contention during parallel checks, but the cause is not proven. No assertions or timeouts were weakened, and no failure was suppressed.

### Evidence boundary

- **Synthetic:** seeded local demo data is explicitly marked **Synthetic demo data**; it is not a Ring source.
- **Mocked:** Ring Playground client/report/status tests use mocked responses and verify local code behavior only.
- **Real Playground:** **Not verified against the real Ring Playground (probe not yet run).** No probe report exists.
- **Live Ring:** no Ring API request, real device event, or webhook was made or received.
- No Event History ingestion, normalization, `ring_playground_recorded` persistence, or functional Sync was implemented. No clean-clone verification was performed; the owner will run that independently.

## M11 / M11b WHEP and hermetic-test closeout (2026-10-20)

**Scope and evidence boundary.** M11 adds selected Playground device handling, a devices-first structure probe, and a user-triggered receive-only WHEP relay/view. M11b hardens test isolation, closes browser-session cleanup and watermark-CSS gaps, adds focused regression coverage, and updates the privacy/evidence record. The owner says they separately ran a probe, but its redacted report was not supplied here. This agent did not read `.env`, use a Ring credential, make a Ring request, establish a WHEP session, or create real Ring evidence. Inline mock data and the test runner's temporary redacted report are synthetic fixtures only; the fixture's `2026-10-21` capture timestamp is not a live capture.

### Hermetic Vitest setup

- `client/src/test-setup.ts` sets deterministic test values for every non-Ring application environment variable read by the server/client, deletes every inherited `RING_*` key, and asserts that none remain. Vitest sets Vite's `envDir: false` so Vite does not load project `.env` files. The setup also replaces `DOTENV_CONFIG_PATH` with a random nonexistent path under the platform temp directory before test modules load; `server/src/config.test.ts` dynamically imports `dotenv/config` and asserts that no `RING_*` variable appears.
- The setup wraps global `fetch` and Node `http`/`https` request/get methods. Only loopback destinations are allowed for Supertest; non-loopback calls throw before DNS/socket use. A regression test checks all three interfaces against `.invalid` hosts. `unstubGlobals`/`unstubEnvs` are enabled in Vitest.
- Normal use is the plain, cross-platform `npm test`; no shell-specific dotenv override is required. The setup uses Node's `os.tmpdir()` and `randomUUID()`.

| Isolation proof | Result |
|---|---|
| Plain `npm test` | **26/26 files, 137/137 tests passed.** |
| `RING_ACCESS_TOKEN=FAKE_TEST_TOKEN RING_EVENT_SOURCE=ring_playground RING_HISTORY_DEVICE_ID=FAKE_DEVICE_ID npm test` (Bash proof run) | **26/26 files, 137/137 tests passed**; the test setup removed the fake inherited Ring settings before importing dotenv/config. |
| `DOTENV_CONFIG_PATH=<temporary /tmp file containing fake Ring settings> npm test` | **26/26 files, 137/137 tests passed**; setup replaced the path before the test explicitly imported dotenv/config. The temporary file was removed after the run. |

The command syntax above is only the Linux proof invocation; the project command itself remains plain `npm test` on Windows, macOS, and Linux. No Windows execution was performed in this sandbox.

### WHEP acceptance criteria

| # | Criterion | Result | Evidence / limit |
|---:|---|---|---|
| 1 | Bounded SDP validation: one video media section, `recvonly` offer, CRLF, required ICE/fingerprint fields, no malformed/oversized offer. | **OK** | Unit and route tests reject send-capable, audio, multi-media, incomplete, wrong-line-ending, and oversized offers before upstream fetch. Express caps request bodies at 64 KiB. |
| 2 | Server-held token; redirect, timeout, size, and leak safety. | **OK** | Only the server relay adds `Authorization`; upstream requests use `redirect: 'error'` and a 10-second deadline. Request/answer SDP are capped at 64 KiB (advertised and streamed response size tested). Safe errors/responses omit the token, upstream body, and `Location`. All HTTP tests use mocks. |
| 3 | Selected-device endpoint and session `Location` are exact. | **OK** | Route test verifies the exact selected-device WHEP endpoint; validation rejects a `Location` for another device, a foreign origin, or a path outside that device's session resource. |
| 4 | Create and delete routes require authentication/CSRF/trusted origin and are rate-limited. | **OK** | Tests cover unauthenticated and no-CSRF create/delete, 10-per-minute limiting on both methods, and `no-store` on authentication, 401, rate-limit, oversized-body, success, and stop responses. |
| 5 | One session; expiry, stop, identity/device change, shutdown, idempotent delete, and 401 state reset. | **fixed** | Existing server lifecycle checks plus duplicate-delete and 401 device/status-reset assertions pass. M11b also fixed a browser expiry timer left armed when answer installation failed; regression tests verify peer/session cleanup and no later expiry callback. Shutdown aborts/awaits a pending create; upstream cleanup remains best effort. |
| 6 | Receive-only ICE gathering and cleanup. | **OK** | Fake-peer tests verify video `recvonly`, no POST until ICE gathering completes, the 10-second ICE timeout, cancellation on stop, peer close, and session deletion. |
| 7 | Mandatory watermark remains visible/unmodified. | **fixed** | CSS now uses `object-fit: contain`, no overflow crop, radius clip, filter, transform, or live overlay. No real Ring frame was available; actual watermark visibility still requires the owner's human visual review. |
| 8 | WHEP creates no inbox/History events. | **OK** | The route test confirms no History request and zero `source_events` after session creation; WHEP does not call ingestion. This is mock-backed, not Ring evidence. |
| 9 | STUN/ICE privacy is documented. | **fixed** | README, Security, Architecture, and Ring integration docs now state that no STUN/TURN server is configured, but host candidates/mDNS network identifiers may still appear in SDP sent to the app and Ring; no candidate filtering is implemented. |

### Fresh local verification

The earlier full M11 suite, before M11b's new hermetic/WHEP assertions, passed **26/26 files and 132/132 tests** on 2026-10-20. M11b's final expanded suite below passes **26/26 files and 137/137 tests**.

| Command | M11b result |
|---|---|
| `npm ci --nodedir=/usr/local` | Needed because `node_modules` was absent; pass, 344 packages added, 345 audited, 0 vulnerabilities. No dependencies were added. |
| `npm run typecheck` | Pass for server and client. |
| `npm test` | Pass: **26/26 files, 137/137 tests**. |
| `npm run lint` | Pass, zero warnings (`--max-warnings=0`). |
| `npm run build` | Pass: Vite 8.3.4, 1,948 modules; JS 354.39 kB (106.35 kB gzip), CSS 32.19 kB (8.19 kB gzip). This is the client bundle, not a production API package. |
| `npm audit --audit-level=moderate` | Pass: 0 vulnerabilities reported. |
| `npm ls --depth=0` | Pass: no missing or extraneous direct dependencies. |

The scoped secret heuristic is `node scripts/secret-scan.mjs`; final counts/scope are recorded with the handoff manifest. It scans tracked worktree files and reachable commit blobs only, omits environment-file paths, prints no matched values, and never traverses unreachable objects. It is not a dedicated scanner or proof of absence. Markdown-link, trailing-whitespace, diff, and bundle/patch checks are recorded in the final closeout section below after their final run.

**Git reconciliation:** the actual M11b checkout was re-read as `HEAD=28f9d2f` with only `README.md` tracked; the application/docs snapshot was present in the worktree as untracked files. The expected `2b0fab5` commit object was unavailable. To preserve the existing snapshot, the required early checkpoint commit `44abdb6` (`feat(ring): playground device selection, probe devices mode, WHEP live view`) includes the full present tree (129 files changed). No reset, rebase, force, push, or unreachable-object inspection was used. The lockfile and `LICENSE` were included from the existing worktree snapshot and were not edited during M11b; the requested comparison against unavailable `2b0fab5` cannot be claimed. The lockfile has no M11b diff against checkpoint `44abdb6`.
