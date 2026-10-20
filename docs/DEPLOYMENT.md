# Deployment readiness (M7 history; M10 release-candidate update)

**Disposition: not ready for production deployment.** The latest local verification (2026-10-18) passed typecheck, zero-warning lint, the Vite client build, 22 files / 99 tests, npm audit, and the dependency-tree check; a temporary SQLite migration/reopen smoke check also passed. The current build is a client bundle only. No service, deployment, tunnel, public endpoint, DNS change, cloud resource, paid service, Ring connection, or production-like secret was created. See [`TESTING.md`](TESTING.md) and [`../submission/RELEASE_CANDIDATE_REPORT.md`](../submission/RELEASE_CANDIDATE_REPORT.md) for exact results and evidence boundaries.

## Verified local packaging

- Required runtime: Node.js `>=22.12 <23`, npm `>=10`. M7 ran on Node `v22.22.3` and npm `10.9.8`.
- `npm ci --nodedir=/usr/local` passed with 344 packages added; `npm ls --depth=0` passed with no missing/extraneous top-level dependencies.
- `npm run build` passed. It typechecks server/client TypeScript and creates the Vite **client** bundle: 1,946 modules; JS 339.48 kB (102.43 kB gzip); CSS 29.78 kB (7.71 kB gzip).
- This is not a production API package: there is no production `start` script, compiled API artifact, service/container definition, process manager, or documented static-file/API serving path. `npm run dev` runs `tsx watch` and Vite for local development only.
- The full suite passed (**19 files / 72 tests**); focused Ring/API coverage passed (**9 files / 48 tests**). `npm run typecheck`, `npm run lint`, and `npm audit --audit-level=moderate` passed; audit reported 0 vulnerabilities. Details are in [`TESTING.md`](TESTING.md).

## SQLite initialization and migrations

M7 ran `npm run db:migrate` twice against a new temporary file-backed database. The first run applied migrations 1, 2, and 3; the second reported the database already up to date. The database had 3 `schema_migrations` rows and `PRAGMA foreign_key_check` returned 0 violations. The temporary database was removed.

A separate fresh temporary DB was also initialized by `npm run seed:demo`: it created 3 workspace users and 8 source-event rows; all 8 were explicitly synthetic, 5 carried `ring_simulated` provenance, and the foreign-key check had 0 violations. The throwaway test password and database were not retained. `npm run db:migrate` uses the development `tsx` runner, as does startup/migration code. A production migration/release mechanism has not been designed or tested. SQLite enables foreign keys, WAL mode, and a five-second busy timeout. It is suitable only for a deliberately single-instance deployment on a durable local filesystem; multiple instances or shared-file network storage are not a supported topology. No backup, restore, retention, or disaster-recovery procedure has been exercised.

## Network, HTTPS, and health

- API and Vite development servers default to `127.0.0.1`. `HOST` configures the API bind address; Vite does not accept arbitrary hosts. Do not expose the development server directly.
- The application does not terminate TLS. Any future endpoint requires a separately authorized and reviewed HTTPS ingress, exact `WEB_ORIGIN`, trusted-proxy configuration, TLS settings, firewall scope, rate-limit review, and monitoring. No public endpoint or tunnel was created.
- Origin checks require an exact configured origin; there is no wildcard CORS policy. Express `trust proxy` is not configured. Configure only explicitly trusted proxy hop(s) if a future deployment requires client-IP-aware rate limiting.
- `GET /api/health` runs a lightweight SQLite query and returns generic 200/503 status with no session cookie or database details. It does not prove Ring, ingress/TLS, or frontend availability.

## Configuration and secret handling

The production parser requires an HTTPS bare `WEB_ORIGIN`, the documented official HTTPS Ring API/OAuth origins, a same-origin HTTPS token URL, a 64-hex `SESSION_SECRET`, and an absolute non-memory `DATABASE_PATH`; it rejects non-HTTPS Ring URLs, `RING_SIMULATOR_HMAC_KEY`, and `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=true`. The Ring API client rejects cross-origin request paths/redirects, while OAuth token/profile requests reject redirects; request time, retries, and API JSON body size are bounded, and OAuth refresh is bounded separately. These code-level checks were tested locally but do not prove a production deployment, durable storage, random secrets, or live Ring compatibility.

| Variable | Deployment consideration |
|---|---|
| `NODE_ENV` | Set to `production` only after a production-ready API entry point and serving topology exist. |
| `HOST`, `PORT` | Bind only on an approved private service interface; loopback is the default. |
| `WEB_ORIGIN` | Exact browser origin, HTTPS, with no credentials, path, query, or fragment. |
| `SESSION_SECRET` | Unique random 32-byte hex value, held in a secret manager; never reuse the example or commit it. |
| `DATABASE_PATH` | Absolute path on durable, access-controlled local storage. |
| `TOKEN_ENCRYPTION_KEY` | Unique 32-byte hex key if Ring token persistence is used; protect/backup separately from the database. |
| `RING_CLIENT_ID`, `RING_CLIENT_SECRET`, `RING_HMAC_SIGNING_KEY` | Supply only after Ring app/credential setup, through an approved secret manager; never expose in frontend code or logs. |
| `RING_EVENT_SOURCE` | Required explicitly when Ring credentials, an access token, HMAC key, or history device is configured. A Ring-HMAC webhook is accepted only under `ring_live`; `ring_playground` is authenticated Playground API access, not a webhook. Never label Playground data as live. |
| `RING_ACCESS_TOKEN`, `RING_HISTORY_DEVICE_ID` | Optional server-side API/history configuration; no real token/device was configured or tested in M7. |
| `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` | Keep `false`; the inbound Ring callback contract is unverified, and production config rejects `true`. |
| `RING_SIMULATOR_HMAC_KEY` | Local-only; production config rejects it. The simulator is synthetic and not Ring-certified. |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | Local demo seed only; do not seed a production workspace. |

Never share secrets in chat, documentation, shell transcripts, screenshots, or public issue trackers. `.env.example` contains placeholder values only; the actual root environment-file inventory contained only `.env.example` during M7 verification.

## Ring-specific external prerequisites

No live Ring integration is established. The code includes a server-side HTTP client for profile, device, and Event History paths plus a raw-body HMAC webhook receiver. M7 inspected the runtime call paths and ran local Ring/API stub tests, but made no authenticated API request, received no Ring signature/event, and used no official Ring simulator/device.

The M5 source review (2026-10-17) reported Ring app, OAuth, API, webhook, Account Link, Playground, and Devpost references. Those findings are historical: M7 could not re-fetch `developer.ring.com` or Devpost because those hosts are outside the sandbox's outbound allowlist. Therefore current API contract details, track eligibility, accepted simulator/device paths, reviewer requirements, and submission rules are not verified. The inbound Token Exchange body/acknowledgement remains unverified from the earlier review, so the route stays disabled. No paid plan, device, account, app, credit, or cloud resource was acquired or used.

A future real integration test requires (at minimum) a current documented and eligible Ring source, user-authorized app/account/device access, secrets configured locally and kept out of chat, an explicit correct `RING_EVENT_SOURCE`, and an approved network plan for any Ring-reachable webhook. No tunnel, public endpoint, deployment, or account creation is authorized by this review.

## Remaining blockers before production deployment

1. Obtain separate written approval for deployment/public exposure and agree on endpoint, ingress, and threat model.
2. Design and test a production API build/start path, static frontend delivery, process supervision, graceful shutdown, readiness behavior, and serialized migration/release process.
3. Choose a supported single-instance SQLite volume; implement access-controlled encrypted backup/restore and retention, and complete a restore drill.
4. Provision/rotate secrets through a managed secret store; add suitable monitoring/logging without storing credentials, private device data, or unnecessary personal data; complete independent security review.
5. Revalidate current Ring docs/rules, confirm eligible staging/simulator/device path and inbound Token Exchange contract, and use only a separately authorized real/official source.
6. With browser tooling, perform real-browser visual, responsive, keyboard, accessibility, and proxy/TLS checks. M7 found no browser executable or Playwright/Puppeteer tooling; no screenshot or browser review was made.

This readiness report does not authorize deployment, source publication, public HTTPS exposure, Ring account/app creation, a tunnel, or any paid resource.
