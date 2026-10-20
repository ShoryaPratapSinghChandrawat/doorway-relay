# Product feedback (draft; not submitted)

**Evidence boundary (updated 2026-10-20):** This is not a report of firsthand authenticated Ring product use. The owner says a probe was run on their own machine, but no redacted report or findings were supplied to this workspace; this agent made no Ring request, used no Ring credential, and did not inspect `.env`. The Playground client/probe and WHEP path have only mocked/fake-peer test coverage here. No live video, real event, or human visual review was observed in this workspace. No product feedback has been submitted.

## Ring Partner API / webhook documentation

- **Use in this project:** The repository contains a server-side HTTP adapter and raw-body webhook verifier. Their paths have local unit/route tests only; no authenticated Ring call or signed Ring webhook was exercised.
- **What worked in local development:** The server-only boundary can be tested without placing credentials in browser code. Mocks cover request timeout, response-size bounds, retry behavior, origin/redirect rejection, and safe error handling. The optional WHEP relay keeps the token server-side and uses strict SDP/`Location` checks, bounded requests, and in-memory cleanup. This is feedback on Doorway Relay's implementation—not a claim of Ring compatibility or real media success.
- **What needs clarification:** The owner-supplied official-source notes describe the Developer Playground as the Ring track simulator, but no actual response/report was supplied here. A versioned Event History response example, stable-ID/timestamp guidance, subtype/classification placement, and clear simulator-versus-live/event-provenance guidance would help. The historical M5 public-doc review also reported that the inbound partner Token Exchange request/acknowledgement was incomplete; current docs were not independently rechecked here. The supplied live-video facts describe the WHEP flow, but its compatibility was not exercised in this workspace.
- **Would I recommend it for a live integration?** Undetermined. No authenticated onboarding, token issuance, real API request, staging, device event, or webhook delivery was tested.

## Ring Developer Playground and Ring MCP

- **Playground:** The owner says they ran a probe separately; its redacted report and findings were not provided here. This agent did not use the Playground, inspect the report, or establish a WHEP session. No feedback about current onboarding, actual API response shape, event visibility, or reliability is justified from this workspace.
- **Ring MCP:** Not used. No claim is made that a documentation search tool provides a runtime integration or simulator.

## AWS services

None used. No AWS account, service, model, resource, or paid feature was accessed; no AWS cost was incurred. If the current form requests feedback for unused tools, report that fact rather than inventing an experience.

## Other tools used to build and verify this repository

These are local engineering observations, not sponsor-product reviews. They are included so the owner can answer any broad “tools used” question accurately.

| Tool | Observed use and bounded feedback |
|---|---|
| Node.js 22 / npm 10 | The runtime and lockfile-based scripts supported local typecheck, tests, lint, build, audit, and dependency-tree checks. The native SQLite dependency needed the already-authorized local Node headers in this sandbox; the one install completed and was not repeated. |
| TypeScript | Server and client type checks are separate and make API/UI contracts explicit. No upstream Ring behavior is validated by typechecking. |
| React 19 / React Router 7 | Supports the handoff and inbox workflow; route/workflow coverage ran in jsdom. No human browser or visual review occurred. |
| Vite 8 / Tailwind CSS 4 / Lucide React | Client build and responsive styles/icons are locally exercised. The build is a client bundle, not a production API package. |
| Express 5 / Helmet / express-rate-limit / Zod | Useful local API boundaries, security headers, rate limits, and validation; tests cover them locally, not behind a deployed proxy. |
| SQLite / better-sqlite3 | Transactions and close/reopen tests support the local workflow. Deployment remains single-instance with backup/restore and operational limits. |
| Vitest | Unit and integration tests ran locally. The full-stack UI test exceeded its default 5-second limit during deliberate concurrent verification load, so one test now has a documented, measured 10-second timeout; its measured load run and full-suite result are recorded in `docs/TESTING.md`. |
| Supertest | Exercises API routes against an in-process Express app without public endpoints or a live Ring service. |
| Testing Library / user-event / jsdom | Validates UI behavior and keyboard interactions in a simulated DOM; this does not replace desktop/mobile visual inspection. |
| ESLint | Enforced zero-warning lint in the local checks. |
| Supporting JS packages and build/test adapters (`cookie`, `dotenv`, `tsx`, `concurrently`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `typescript-eslint`, and type packages) | Used as project/runtime/build plumbing; they are not separate Ring/AWS product evaluations. No claim is made about untested features or production suitability. |
| Git / GitHub CLI | Local branch/status/diff/commit and read-only metadata work only. No push, visibility edit, invitation, issue, or release was made in this task. |

## Submission status

No product feedback has been sent. The current submission materials are drafts, and no source says Ring, Playground, AWS, or Devpost was used live by this agent. Before submission, the owner must follow current official form instructions and provide product feedback for each sponsor/tool actually used. The owner-reported probe is not evidence available for this workspace until its actual redacted report is supplied and reviewed; no WHEP visual review occurred here. No organizer was contacted.
