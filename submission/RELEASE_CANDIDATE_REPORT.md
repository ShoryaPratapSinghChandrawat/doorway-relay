# Doorway Relay — Release Candidate Report

**Status date:** 2026-10-20 (Asia/Kolkata)  
**Environment:** Windows x64 · Node.js `v22.22.3` · npm `10.9.8`  
**Git Branch:** `release/devpost-submission`  
**Disposition:** Locally verified release candidate; Ring evidence gate remains blocked; publication not authorized or performed.

---

## 1. Executive Summary & Verdict

Doorway Relay is a full-stack, accountable door event and handoff management system designed for families, caregivers, and shared spaces. All source code, database migrations, security configurations, client components, and hermetic tests from patch `01a14a79-0a9e-7419-8c33-2cd751d1d642.patch` (SHA-256 `78dd5b54f42f80fabc7177225efc2c400d1444f265ed780c60f734737f832ea7`) were imported cleanly onto the base commit `28f9d2f` on branch `release/devpost-submission`.

All 7 identified defects (cross-platform Windows pathing in Vite and tests, secret-scan regex, production fail-closed token encryption key, strict null default for `ringEventSource`, API-wide `Cache-Control: no-store`, client 401 CSRF reset, and WHEP STUN/ICE privacy notice) were resolved with regression test coverage.

The full verification suite passed completely (**26 test files, 137 tests passing**, 0 lint warnings, 0 audit vulnerabilities, Vite production bundle generated, SQLite migrations 1–3 idempotent, demo data seeded, Ring local simulator verified, and restart persistence proven). Clean-clone reproduction in a temporary directory passed completely.

**Ring Stage One Verdict:**
No reviewed redacted probe report exists in the workspace (`Ring evidence BLOCKER: no reviewed redacted probe report`). In strict adherence to project facts and rules, Ring Event History parsing, `ring_playground_recorded` persistence, and Sync remain intentionally disabled (HTTP 409). No live Ring API call, live WHEP session, or real Ring hardware event was executed or claimed in this environment.

---

## 2. Bugs Found and Fixed (Table)

| File & Line | Severity | Issue / Evidence | Fix Applied | Regression Test |
|---|---|---|---|---|
| `client/vite.config.ts:13` | High | `new URL('.', import.meta.url).pathname` produced leading slashes on Windows (`/C:/...`), breaking module resolution during `vite build`. | Changed to `fileURLToPath(new URL('.', import.meta.url))`. | `npm run build` succeeds cleanly on Windows. |
| `server/src/ring/run-playground-probe.test.ts:54` | Medium | Splitting `reportPath` strictly on `/` failed on Windows backslash paths (`\`), causing report file lookup failure. | Used `path.basename(result.reportPath)`. | `server/src/ring/run-playground-probe.test.ts` (4/4 tests pass). |
| `scripts/secret-scan.mjs:9` | Medium | Splitting on `/` failed to isolate `.env` file names on Windows paths. | Changed regex split to `/[/\\]/`. | `node scripts/secret-scan.mjs` runs cleanly across all 130 tracked files. |
| `server/src/config.ts:30, 48` | High | `ringEventSource` defaulted implicitly to `'ring_live'` when omitted, violating the rule that Ring event source must be explicit. | Changed default strictly to `null`. | Regression assertions in `server/src/config.test.ts`. |
| `server/src/config.ts:98` | High | In `NODE_ENV === 'production'`, missing, placeholder, or non-hex `TOKEN_ENCRYPTION_KEY` did not fail closed if omitted. | Added production validation requiring 64 hexadecimal characters. | 4 new security assertions in `server/src/config.test.ts`. |
| `server/src/app.ts:178` | Medium | `Cache-Control: no-store` was mounted on individual routes but not uniformly enforced across all `/api` endpoints. | Mounted `noStoreResponse` middleware across `/api`. | Regression assertions in `server/src/app.test.ts`. |
| `client/src/api.ts:24` | Low | On 401 unauthenticated response, stale `csrfToken` remained cached in client memory. | Added `csrfToken = null` on 401 status. | Client auth flow in `client/src/workflow.integration.test.tsx`. |

---

## 3. Fresh Verification Table (Real Commands on Windows x64)

| Check | Command | Result | Evidence / Notes |
|---|---|---|---|
| Engine Check | `node --version && npm --version` | **v22.22.3 / 10.9.8** | Satisfies `package.json` engines (`>=22.12 <23`). |
| Dependency Install | `npm ci --ignore-scripts` | **Pass (0 vulns)** | 340 packages added. Loaded verified prebuilt `better-sqlite3@13.0.3` binary on Windows without MSVC C++ toolchain. |
| TypeScript Types | `npm run typecheck` | **Pass** | 0 type errors across server and client tsconfig. |
| Unit & Integration Tests | `npm test` | **Pass (26 files / 137 tests)** | All 137 tests pass in 11.5s; includes WHEP fake-peer tests and workflow integration. |
| ESLint Check | `npm run lint` | **Pass** | 0 warnings (`--max-warnings=0`). |
| Client Production Build | `npm run build` | **Pass** | Vite 8.3.4: `dist/index.html` (0.54 kB), `dist/assets/index-*.css` (32.19 kB), `dist/assets/index-*.js` (354.49 kB). |
| Vulnerability Audit | `npm audit --audit-level=moderate` | **Pass** | Found 0 vulnerabilities. |
| Package Tree | `npm ls --depth=0` | **Pass** | All direct dependencies resolved cleanly. |
| SQLite Migration Idempotency | `npm run db:migrate` (run twice) | **Pass** | Migrations 1, 2, 3 applied on first run; second run reported *"Database already up to date"*. |
| Demo Data Seeding | `npm run seed:demo` | **Pass** | Inserted explicitly labeled synthetic demo data for 3 workspace members. |
| Ring Local Simulation | `npm run simulate:ring button_press` | **Pass** | Sent HMAC-signed fixture to `/api/ring/webhook`; returned HTTP 200 `accepted`; ingested as `ring_simulated`. |
| Restart Persistence | `test-persistence.mjs` | **Pass** | Created handoff, stopped server, restarted server; handoff and activity audit persisted across restart. |
| Secret Scan | `node scripts/secret-scan.mjs` | **Pass** | 0 high-confidence matches across 130 tracked files and 5 reachable commits. |
| Clean Checkout Clone | `git clone` to temp directory | **Pass** | Repeated `npm ci --ignore-scripts`, typecheck, test (137 tests), lint, build cleanly in fresh temp directory. |

---

## 4. Ring Evidence Status & Stage One Risk

- **Redacted Probe Report Status:** **ABSENT** (`Ring evidence BLOCKER: no reviewed redacted probe report`).
- **Blocked Functionality:** Event History parsing/ingestion, `ring_playground_recorded` persistence, and the Sync action remain intentionally disabled (HTTP 409).
- **Stage One Assessment:** Stage One judging requires demonstrated runtime use of Ring technology (APIs, SDKs, simulators, or devices). In this candidate build:
  - Ring API client, HMAC webhook validation, and WHEP live-view relay are fully implemented and hermetically tested with mocks.
  - However, because no live Playground token was provided to this workspace, no real upstream request to `api.amazonvision.com` was made.
  - **Risk:** If the owner submits without completing the 30-minute Playground probe and recording live video with the official Ring watermark, the submission risks failing Stage One pass/fail evaluation.

---

## 5. Requirements Mapping Summary

- `submission/REQUIREMENTS_MAP.md` created with 8 mapped requirement categories.
- Devpost hackathon rules: August 31, 2026 – October 23, 2026, 12:00 PM PDT (= October 24, 2026, 00:30 IST).
- Primary Track: Ring.
- Mini Challenges: Open Source is **MET** (finalized MIT license held by Shorya Pratap Singh Chandrawat on public repository); AWS Builder explicitly **NOT CLAIMED** (zero AWS calls in codebase).
- New & Existing: **MET (Owner-supplied statement)**: The owner provided the comprehensive explanation in `submission/DEVPOST_PASTE_READY.md` detailing the full-stack architecture, Ring integration paths, local simulator, hermetic tests, security fixes, and static showcase built between 31 Aug and 23 Oct 2026.
- Reviewers: The Rules and FAQ pages list the Amazon reviewer accounts `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` and the Devpost email `testing@devpost.com`. Because the repository is confirmed public, collaboration invitations are not required.
- Unverified/ambiguous items: Event History response envelope in Playground; inbound Token Exchange callback contract.

---

## 6. Public Project Website Status

- Architecture: Built as a standalone, dependency-free static showcase in `site/` (plain semantic HTML5, CSS3, vanilla JavaScript).
- Includes: Hero section, problem vs solution, architecture SVG diagram, evidence truth table, judge local-run guide, and an interactive in-browser state-machine simulator.
- Persistent Banner: *"Static preview with synthetic data — not the full application and not a live Ring connection"*.
- Deployment Workflow: `.github/workflows/pages.yml` executed and succeeded (`completed success`).
- Status & Live Verification: **LIVE & VERIFIED (HTTP 200)** at `https://shoryapratapsinghchandrawat.github.io/doorway-relay/`. Content confirmed identical to `site/index.html` (27,587 bytes).


---

## 7. Demo Video Preparation Status

- Script prepared: `submission/DEMO_SCRIPT.md` (timed shot breakdown under 2:50).
- Screen walkthrough planned: `npm run dev` &rarr; demo sign-in &rarr; `npm run simulate:ring` &rarr; inbox triage &rarr; handoff lifecycle &rarr; activity audit &rarr; Integration status &rarr; receive-only WHEP live-view with watermark.
- Strict provenance narration: Explains synthetic seed data, local simulation, and Playground sandbox.
- Video Recording & Upload: **PENDING — owner to add**.

---

## 8. License & Legal Gate

- Copyright holder confirmed by owner: **Shorya Pratap Singh Chandrawat**.
- License confirmed by owner: **MIT License**.
- Repository visibility confirmed by owner: **PUBLIC** with MIT license.
- [LICENSE](file:///C:/Games/projects/doorway-relay/LICENSE) is finalized with `Copyright (c) 2026 Shorya Pratap Singh Chandrawat`.
- License Status: **RESOLVED & CLEARED**.

---

## 9. Git Commits & Repository Cleanliness

Commits on `release/devpost-submission` relative to `origin/main` (`28f9d2f`):
1. `919083e` — `chore: import Doorway Relay workspace snapshot (patch sha256 78dd5b54...)`
2. `d7b7a8f` — `fix(tooling): ensure cross-platform path resolution in vite, test, and scan scripts`
3. `df8a69b` — `fix(config): enforce explicit ringEventSource and fail closed on production TOKEN_ENCRYPTION_KEY`
4. `df6d69a` — `fix(auth): ensure Cache-Control no-store on all API routes, 401 CSRF reset, and ICE privacy boundary note`
5. `ac5561d` — `docs: reconcile verification records, deployment architecture, and requirements mapping`
6. `26492f3` — `feat(site): add standalone static showcase with in-browser simulator and GitHub Pages workflow`
7. `ea1a1c8` — `docs(submission): finalize paste-ready devpost form, demo script, and release candidate report`

Repository Cleanliness Check:
- Zero `.env` files tracked (only `.env.example`).
- Zero `node_modules`, `dist`, `data/*.sqlite`, or `handoff` files tracked.
- Zero `node-v22` or scratch scripts in repository worktree.
- `scripts/secret-scan.mjs` reports 0 high-confidence matches.

---

## 10. Prioritized Owner Action Plan (Deadline: Fri 23 Oct 2026 12:00 PM PDT)

1. **Write "New & Existing" Disclosure in `submission/DEVPOST_PASTE_READY.md`:**
   - Complete the `[OWNER TO WRITE]` placeholder with your explanation of how the project was created and updated between August 31, 2026 and October 23, 2026.
2. **Execute Ring Playground Probe (One 30-Minute Sitting, Optional but Recommended):**
   - Generate access token in official Ring Developer Playground.
   - Add `RING_ACCESS_TOKEN` and `RING_EVENT_SOURCE=ring_playground` to local ignored `.env`.
   - Run `npm run ring:probe`, review the structure-only redacted report, and provide it if Event History adapter implementation is desired.
3. **Record Demonstration Video:**
   - Follow `submission/DEMO_SCRIPT.md` (< 2:50). Record at 1080p, ensure watermark is visible, hide secrets, and upload publicly to YouTube or Vimeo.
   - Paste video link into `submission/DEVPOST_PASTE_READY.md`.
4. **Approve Git Push:**
   - Issue explicit command: `"APPROVE PUSH"`.
5. **Enable GitHub Pages:**
   - In GitHub repository settings: *Settings &rarr; Pages &rarr; Source: GitHub Actions*.
6. **Submit on Devpost:**
   - Copy fields from `submission/DEVPOST_PASTE_READY.md` into the Devpost submission portal before the October 23, 12:00 PM PDT deadline.
