# Friction log — Ring integration (working notes)

This is a project engineering log, not a claim that it matches the live Devpost friction-log format. Do not submit it without checking the organizer's required format. Entries 1–6 record the M5 public-source review from 2026-10-17 and were not reverified in M7. M7 could not fetch current Ring Developer or Devpost pages because those hosts were outside the sandbox's outbound allowlist. **M11 status (2026-10-20):** the owner says they ran a Playground probe on their own machine, but no redacted report or findings were supplied here. This agent made no Ring request, used no Ring credential, and did not inspect `.env`. The local WHEP relay/UI has mocked HTTP/fake-peer tests only; no real media session was established. History ingestion and Sync remain disabled pending review of a real redacted report.

## 1. Ring-to-partner Token Exchange body/acknowledgement remains unpublished

- **Task:** Implement Ring's Token Exchange callback without inventing its contract.
- **Expected:** Current official material specifies the incoming HTTP method, content type, body fields/nesting, required headers/authentication, response/acknowledgement, timeout, and retry behavior.
- **Observed (M5 review, 2026-10-17):** The Configure/deployment pages then fetched said Ring **POSTs an authorization code** to the partner Token Exchange URL and the code must be exchanged within 60 seconds. That review did not find the exact inbound content type, body field/nesting, required headers/authentication, or response Ring expects. The separate outgoing `POST https://oauth.ring.com/oauth/token` form is documented in those historical sources and is not the partner callback. M7 could not re-check whether the docs have changed.
- **Impact:** Cannot prove that the existing opt-in JSON/form top-level `code` handler or its local `200 { status: "accepted" }` acknowledgement matches Ring.
- **Workaround:** `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=false` by default; the route returns 503 before parsing while off. Keep it disabled until Ring confirms the full callback contract. Do not log or paste codes/tokens.
- **Question for Ring:** See [`RING_QUESTIONS.md`](RING_QUESTIONS.md), open question 1.

## 2. M5 docs resolved the motion subtype location (not reverified in M7)

- **Task:** Normalize `motion_detected` without losing the Ring subtype or choosing an unsupported field.
- **Observed (M5 review):** The API reference and Motion Detection section fetched then placed the canonical value at `data.attributes.sub_type`; values depend on Smart Alerts and should be treated as an open vocabulary. The earlier supplied example used `data.subType`. M7 did not re-fetch these sources.
- **Impact:** The adapter follows the M5-reviewed source, but the claim that this remains the current canonical field is unverified in M7.
- **Workaround:** M5 now prefers `attributes.sub_type`, retains `data.subType` only as a compatibility fallback, accepts a missing subtype neutrally, and does not put the subtype in the handoff summary.
- **Question for Ring:** M7 needs an accessible current source confirming the canonical field; the M5 question was treated as resolved only against the pages then fetched.

## 3. Old deep links vs current consolidated documentation

- **Task:** Independently re-check the cited official Ring references.
- **Observed:** The earlier 2026-10-17 follow-up returned 404 pages for the supplied `notifications.html`, `motion-detection.html`, `button-press.html`, and `account-linking.html` URLs. M5 fetched the current consolidated [`Ring Partner API Documentation`](https://developer.amazon.com/docs/ring/api-documentation.html), plus current Getting Started, Configure, Develop, Ring MCP, and developer.ring.com pages. The documentation root itself still returns 404.
- **Impact:** The old links should not be cited as successfully rechecked. The consolidated current page contains webhook, account-link, and history sections, but other official pages are not fully consistent: the API reference lists more webhook event types than the Develop guide's three-event summary.
- **Workaround:** Cite the current consolidated API reference and record the Develop/API event-list inconsistency; no live portal or Ring callback was inspected.
- **Question for Ring:** See [`RING_QUESTIONS.md`](RING_QUESTIONS.md), open question 2.

## 4. Cameras and Doorbells scope includes media capabilities

- **Task:** Request only the event access needed for the handoff workflow.
- **Observed (M5 review):** The Configure page fetched then described Cameras and Doorbells as one scope group covering motion events, doorbell presses, livestream, and video downloads; those camera/doorbell capabilities could not be selected separately. Lifecycle events were described as always available; sensor and chime groups were separate. M7 could not re-check the page or portal.
- **Impact:** An app requesting camera/doorbell events would also request broader camera/media capabilities.
- **Workaround / M11 boundary:** The optional Playground WHEP path is limited to an explicit, receive-only browser video session through the server relay. It uses the documented session operation, validates SDP/`Location`, and does not record, capture frames, request snapshots/downloads, or store media. The feature is labelled **Playground · Simulated** and has not been exercised against Ring here. This agent created no scope or app; independently confirm any applicable scope and obtain the owner's approval before using a real token/session.

## 5. Portal identity and one-time credentials

- **Task:** Configure the developer app without losing or exposing credentials.
- **Observed (M5 review):** Public docs fetched then required developer identity verification before app creation and said Client ID, Client Secret, and HMAC Signature Key are shown once. The console and Playground URLs redirected to Amazon sign-in; no authenticated portal access was available. M7 did not re-check these instructions.
- **Impact:** No app credentials, Playground access token, Ring account/device, or app configuration could be checked in this workspace.
- **Workaround:** If the user chooses to proceed, sign into the official portal, complete the required identity step, choose Public or Private app/scopes, and store the one-time values directly in ignored server-side `.env`. Never put them in Git, browser code, logs, screenshots, or chat. No paid resource was acquired or requested.

## 6. Public HTTPS is required for a real webhook

- **Task:** Receive a Ring-signed webhook in a later controlled staging test.
- **Observed (M5 review):** The Ring docs fetched then required an HTTPS endpoint reachable from Ring servers, TLS 1.2 or higher, and a response within five seconds. The local app used HTTP/loopback during the M5 simulator test. M7 could not re-check the current requirements.
- **Impact:** Ring cannot deliver to the local-only endpoint; no live webhook can be verified without a public HTTPS address.
- **Workaround:** None used. A future temporary HTTPS proxy restricted to the webhook route or an isolated staging endpoint is a proposal only; it broadens the public attack surface. Obtain the user's explicit permission before any tunnel, public exposure, or deployment.

## 7. Current Devpost/Ring eligibility could not be rechecked in M7

- **Task:** Confirm current Ring-track requirements, supported runtime tech/source, reviewer details, friction-log format, and submission fields.
- **Expected:** Current official Devpost rules/resources and Ring Developer documentation load from the build environment.
- **Observed:** M7's outbound host allowlist excludes `amazonappdev2026.devpost.com` and `developer.ring.com`. The M5 public-source observations are dated 2026-10-17 and do not prove the current rules. No portal session or official event source was available.
- **Impact:** Current track eligibility, the required demonstration source/evidence, reviewer/invitation instructions, thumbnail dimensions, and friction-log format remain unverified. No invitation or organizer approval is claimed.
- **Workaround:** Keep submission materials marked draft. Obtain the current official rules/resources in an accessible environment or provide a saved copy for review before any eligibility or reviewer claim.

## 8. Probe report unavailable for review in this workspace

- **Task:** Use observed Ring Playground device and Event History response shapes without guessing, while preserving privacy.
- **Expected:** A real, redacted owner-run report is available for review before implementing History normalization, stable identity/deduplication, or Sync.
- **Observed (M11, 2026-10-20):** The owner says a probe was run on their own machine. The redacted report and its findings were not supplied to this workspace; this agent did not run the probe or make a Ring request. The code and tests support a devices-only call without a History device ID, but mocked payloads are not evidence of Ring's response shape.
- **Impact:** The actual device/History shapes and field semantics remain unverified here. History ingestion, `ring_playground_recorded` persistence, and Sync cannot be implemented or claimed as verified.
- **Workaround:** Keep Sync disabled and polling off. The owner can supply the redacted report after privacy review; do not infer what it contains or claim that the owner did not run the probe.

## 9. WHEP media compatibility not live-verified

- **Task:** Add a minimal browser-based, receive-only Playground live view while keeping the Ring token server-side and preventing media persistence.
- **Expected:** The browser creates a receive-only video offer after ICE gathering; a server relay validates the SDP and session `Location`, uses bounded requests, and deletes a short-lived session.
- **Observed (M11, 2026-10-20):** The local implementation, UI, and mocked tests exist. The owner supplied the documented WHEP endpoint/answer/`Location`/DELETE and mandatory-watermark facts. No live Ring request, SDP answer, `Location`, media stream, or human visual review was available in this workspace.
- **Impact:** Real endpoint compatibility, ICE/media behavior, and watermark presentation remain unverified; the feature must not be described as live-verified or as an inbox event.
- **Workaround:** Label the panel **Playground · Simulated**, use one in-memory five-minute session with stop/expiry/shutdown cleanup, and keep History ingestion/Sync disabled. Follow [`HUMAN_VISUAL_REVIEW.md`](HUMAN_VISUAL_REVIEW.md) before presenting visual evidence.

## Simulator/tooling note

The owner-supplied official facts checked 2026-10-20 identify the Ring Developer Playground as the official simulator, with Package, Vehicle, and Motion simulations. The agent did not use it and has not inspected the owner's probe report. Doorway Relay's `npm run simulate:ring` is a separate signed local Ring-shaped fixture, not a Ring-issued event; it is always stored as `ring_simulated`. Keep these evidence sources distinct in the UI and demo. M7 also fixed an unsafe implicit provenance default: `RING_EVENT_SOURCE` must now be explicitly selected as `ring_live` or `ring_playground` when Ring credentials, token, HMAC key, or history device are configured. The source remains an operator assertion; it cannot prove origin. Historical M5 notes said the official Ring MCP is a documentation-search tool and the Playground was sign-in gated; those access notes were not a finding that Playground is unavailable.
