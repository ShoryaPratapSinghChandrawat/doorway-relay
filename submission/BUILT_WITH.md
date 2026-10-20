# Built with (submission draft; M11 local implementation)

This list describes code present in the repository and locally exercised through tests/build tools. Mocked HTTP and fake-peer tests do not verify current Ring compatibility, live media, eligibility, or production readiness.

- **Node.js 22 / TypeScript 5.9** — server runtime and type system. Local work used Node `v22.22.3` and npm `10.9.8`.
- **React 19, React Router 7, Vite 8, Tailwind CSS 4, Lucide React** — browser UI, routing, styles, and icons.
- **Express 5, Helmet 8, express-rate-limit 8, Zod 4** — HTTP API, security headers/rate limiting, and runtime validation.
- **SQLite via better-sqlite3 13** — versioned migrations, persistence, transactions, uniqueness constraints, and activity history.
- **Vitest 5, Supertest 7, Testing Library 16, jsdom 30** — local server/domain and client component/workflow tests.
- **Ring API adapter (not live-verified)** — existing server-side HTTP/webhook/OAuth/account-link paths; authenticated Playground device discovery/selection; and a structure-only, redacting `npm run ring:probe` that supports devices-only mode without a History ID. The owner says they ran a probe on their machine, but its redacted report and findings were not supplied here. The agent made no Ring request and did not use Ring credentials. Event History parsing and ingestion await review of a real redacted report.
- **Receive-only WHEP client/relay** — browser WebRTC receive-only video offer after ICE gathering, server-side token relay, bounded SDP/strict session `Location` validation, one in-memory session with expiry/cleanup, and a clearly labelled **Playground · Simulated** panel. Tests use mocked HTTP/fake timers and an injected fake peer connection; no real Ring WHEP session or video stream was exercised. It creates no inbox event and stores no media.
- **Doorway Relay local webhook fixture** — signed synthetic events sent to the app's webhook route and labeled `ring_simulated`. It is not Ring's official Developer Playground and not a Ring-originated event.

Not used by this agent: Ring credentials, a live Ring request, a real Playground session, a Ring portal app, a real device, an authenticated Ring response, Ring-signed webhook, Ring MCP, AWS/Bedrock, public tunnel, hosting service, or cloud resource. No human visual review or screenshot was produced. No AWS cost was incurred. See [`docs/TESTING.md`](../docs/TESTING.md), [`docs/RING_INTEGRATION.md`](../docs/RING_INTEGRATION.md), [`docs/SECURITY.md`](../docs/SECURITY.md), and [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
