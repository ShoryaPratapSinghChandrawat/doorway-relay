# Doorway Relay

**Door events become accountable handoffs.** Doorway Relay helps a carer or shared-space team track who owns an event, what has happened, and whether it was actually resolved.

## Start locally (Windows, macOS, or Linux)

Requirements: Node.js **22.x** (`>=22.12 <23`) and npm **10 or newer**. **Node 24 is unsupported.** `better-sqlite3` is a native dependency. Do not put Ring credentials in this local synthetic quick start.

1. Install the locked dependencies:

   ```sh
   npm ci
   ```

   *(Windows note: if a local C++ compiler toolchain is absent, run `npm ci --ignore-scripts` to use the verified prebuilt `better-sqlite3` binary).*

2. Create the ignored root `.env` from the template. Use the command for your shell:

   **PowerShell**
   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

   **macOS/Linux (Bash, Zsh)**
   ```sh
   if [ ! -e .env ]; then cp .env.example .env; fi
   ```

   Edit `.env` locally. Generate a fresh random 32-byte hex value with this cross-platform Node command (run it separately for each of `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `RING_SIMULATOR_HMAC_KEY`; paste values only into the ignored file):

   ```sh
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

   Replace `DEMO_PASSWORD` with a local password of at least 12 characters. Never commit `.env` or paste credentials into chat, browser variables, screenshots, logs, or recordings.

3. Initialize, seed clearly marked synthetic examples, and start:

   ```sh
   npm run db:migrate
   npm run seed:demo
   npm run dev
   ```

   Open the Vite URL printed by the dev server (normally `http://localhost:5173`) and sign in with `DEMO_EMAIL` and `DEMO_PASSWORD`. Seeded rows show **Synthetic demo data**. This path uses no Ring account or token.

## Evidence snapshot (2026-10-20)

**Ring Stage One is not demonstrated by the evidence available here.** It requires Ring technology to be imported and called at runtime and a genuine Ring Developer Playground or authorized-device demonstration. The owner says a probe was run on their own machine, but its redacted report and findings were not supplied to this workspace. This agent made no Ring request and used no Ring credential. No real event, live WHEP session, screenshot, or video is present here. Do not present Doorway Relay's local generator as Ring's official simulator.

| Source / path | What is implemented | Evidence available here | What is not verified |
|---|---|---|---|
| `manual` | Human-created tasks and the handoff lifecycle. | Local API/UI/SQLite tests, including persistence. | Not Ring evidence. |
| `ring_simulated` | Doorway Relay's own signed local fixture; displayed **Local · Simulated**. | Synthetic local unit/workflow tests. | Not Ring-issued and not the Ring Developer Playground. |
| `ring_live` | Ring-HMAC webhook path and opt-in legacy History parser. | Mocked/local route and parser tests. | No live webhook signature/event or History compatibility result has been verified here. |
| `ring_playground` | Authenticated device listing/selection, safe status, optional devices-first probe, and a receive-only WHEP session relay/display. Inbox provenance is labeled **Playground · Simulated**. | Mocked HTTP tests, an injected fake peer connection, local React tests, and a hermetic 26-file/137-test suite that blocks unmocked non-loopback fetch/HTTP. The owner reports a separate probe run; its report is not available here. | No Ring response/report was inspected and no real browser WHEP session, video, or event was verified here. WHEP does not create inbox entries. |
| `ring_playground_recorded` | Reserved for a future report-reviewed History adapter. | None. | Not implemented or persisted; no Sync. |

This is a **local engineering candidate**, not Ring-verified, submission-ready, or production-ready. Event History parsing/ingestion, stable identity/deduplication, and Sync remain blocked until the owner supplies a real redacted probe report for review. See [`submission/RELEASE_CANDIDATE_REPORT.md`](submission/RELEASE_CANDIDATE_REPORT.md), [`submission/FINAL_CHECKLIST.md`](submission/FINAL_CHECKLIST.md), and [`docs/HUMAN_VISUAL_REVIEW.md`](docs/HUMAN_VISUAL_REVIEW.md).

## What works locally

- A local signed simulator event can enter the inbox, remain neutral until a person classifies it, and become a persisted handoff with assignment, acknowledgement, resolution, and activity history.
- Seeded examples are separately marked **Synthetic demo data**. That marker does not change `ring_simulated` provenance, and no local synthetic item is presented as Ring-originated.
- Authenticated Playground device listing returns only bounded opaque IDs and short type strings. Selection is held in server memory, is restricted to the latest list, and clears when the token/source identity changes.
- The optional Playground WHEP panel uses the selected device and a server-only relay. The browser sends a receive-only video offer through the authenticated API; the server validates bounded SDP and a same-origin session `Location`, sends no token or upstream `Location` to the browser, and keeps at most one in-memory session for five minutes. Stop, expiry, and server shutdown attempt a remote DELETE. Creation and deletion require authentication + CSRF and are rate-limited.
- The WHEP panel is explicitly **Playground simulation**, not a live household feed, production connection, or event webhook. It displays video in the browser only: no recording, frame capture, snapshots, download, or media storage is implemented. Ring's mandatory watermark must remain visible and unaltered; the video uses `object-fit: contain` without crop/filter/transform or a live overlay, but human visual review is still pending. No live Ring WHEP session was tested here.
- **ICE privacy:** no STUN/TURN server is configured, but browser ICE gathering may still include host candidates or mDNS/network identifiers in SDP. That offer goes to the app server and is relayed to Ring. Do not use this feature if local network metadata disclosure is unacceptable; candidate filtering and real browser/Ring behavior are not verified.
- Playground video does not generate or store inbox events. Any event carrying `ring_playground` provenance is labelled **Playground · Simulated**; History ingestion and Sync remain disabled.

## Playground device check, probe, and live view

The Ring Developer Playground token is server-only. Start with a device check; **a History device ID is not needed** to verify access or list devices.

1. Generate a short-lived access token in the official Ring Developer Playground and set `RING_ACCESS_TOKEN` plus `RING_EVENT_SOURCE=ring_playground` in the ignored root `.env`. The owner supplied the roughly 30-minute token lifetime and documented WHEP path as official facts checked 2026-10-20; this agent did not independently fetch those pages or exercise Ring. Keep the API base at `https://api.amazonvision.com`.
2. Sign in, open **Integrations**, and choose **Verify Playground API access** or **Refresh device list**. The server returns only safe opaque IDs/types and a device-count summary/timestamp, never the raw payload or token. Select a listed device; the selection remains in server memory only.
3. For a structure-only CLI report, run `npm run ring:probe` **without** `RING_HISTORY_DEVICE_ID`. It calls `GET /v1/devices` only, writes a redacted report under `fixtures/ring-playground/`, and prints next steps. Optional `RING_PROBE_PRINT_DEVICE_IDS=true` prints IDs to the local terminal only with the label **local terminal only, do not paste**; no ID is written to a report or other file.
4. Only after selecting a device, set `RING_HISTORY_DEVICE_ID` locally and rerun the probe to request Event History. Pagination is sequential and capped at five pages; requests have timeouts, safe errors, a response-size cap, and bounded `Retry-After` handling. Reports contain bounded structure only, are not replayable fixtures, and need the owner's privacy review before sharing. Mocked tests are not Ring evidence.
5. The Integration page's receive-only WHEP simulation is a separate operation: the browser offers video only, waits for ICE gathering, and uses the server relay. It does not call Event History and does not create inbox events. Review the exact owner steps in [`docs/HUMAN_VISUAL_REVIEW.md`](docs/HUMAN_VISUAL_REVIEW.md). Do not use a real device or household feed for this task.

The History Sync action remains disabled, and `/api/ring/playground/sync` returns 409 without an upstream request until a real redacted probe report is supplied and reviewed and an observed adapter is implemented. Background Playground polling remains off.

## Local synthetic path

To exercise Doorway Relay's local Ring-shaped webhook fixture while the API is running:

```sh
npm run simulate:ring
```

This sends a signed local fixture to `/api/ring/webhook` using `RING_SIMULATOR_HMAC_KEY`. It does not use a Ring account, prove Ring sent an event, or create live/Playground provenance. Keep `ring_live`, `ring_playground`, `ring_playground_recorded`, `ring_simulated`, and `manual` distinct.

## Scripts

- `npm run dev` — Vite frontend and Express API for local development.
- `npm test` — API, Ring adapter, lifecycle, and UI tests; Ring/WHEP HTTP tests use mocks only.
- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript checks for server and client.
- `npm run build` — typecheck and production client bundle; it does not build/package a production API server.
- `npm run db:migrate` — apply versioned SQLite migrations.
- `npm run seed:demo` — insert clearly marked synthetic demo data; blocked in production.
- `npm run simulate:ring` — send a signed local simulated event.
- `npm run ring:probe` — owner-run, authenticated and redacting Playground probe; no real request was made by this agent.

## Verification and security limits

The latest exact local commands/results and freshness limits are in [`docs/TESTING.md`](docs/TESTING.md), [`BUILD_LOG.md`](BUILD_LOG.md), and [`submission/RELEASE_CANDIDATE_REPORT.md`](submission/RELEASE_CANDIDATE_REPORT.md). Typechecks, mocked tests, builds, and security heuristics do not establish live Ring access, a real History schema, media compatibility, event ingestion, eligibility, certification, human visual review, or production deployment.

This is a demo-grade, single-workspace application, not a hardened production service. The browser never receives the Playground token. The API uses auth/CSRF/rate-limit controls for WHEP, strictly validates the SDP and upstream `Location`, bounds requests, keeps one session in memory, and does not persist media or session state. See [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and [`docs/API.md`](docs/API.md).

There is no production API start/build package, service/container definition, approved ingress, durable SQLite backup/restore plan, or tested production operations path. No tunnel, public endpoint, deployment, cloud resource, or cost was created. Do not expose the development server.

## Submission and repository status

This is not submission-ready. The supplied schedule and Devpost deadline have not been independently re-verified. No screenshots, public video, reviewer invitations, Ring evidence, or submission are claimed here. `LICENSE` is finalized as MIT (held by Shorya Pratap Singh Chandrawat). The public project website ("Try it" link) is live at https://shoryapratapsinghchandrawat.github.io/doorway-relay/ . See [`submission/FINAL_CHECKLIST.md`](submission/FINAL_CHECKLIST.md).

## Project docs

- [Build log and human actions](BUILD_LOG.md)
- [Ring integration findings](docs/RING_INTEGRATION.md)
- [Architecture/state machine](docs/ARCHITECTURE.md)
- [Security review](docs/SECURITY.md)
- [Deployment readiness](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
- [Test/verification record](docs/TESTING.md)
- [Human visual review steps](docs/HUMAN_VISUAL_REVIEW.md)
- [Submission text, friction log, and demo kit](submission/)
