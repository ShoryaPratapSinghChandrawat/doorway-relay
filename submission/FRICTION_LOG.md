# Ring friction log (submission draft; not posted)

**Status (updated 2026-10-20):** This is a factual project note, not a verified Devpost-required format. M8 added a Playground probe path, now with devices-only discovery when no History ID is set. The owner says they ran a probe on their own machine, but no redacted report or findings were supplied here; this agent did not run it, make a Ring request, use a Ring credential, or inspect `.env`. Event History remains disabled pending report review. M7 could not re-check the current friction-log instructions because Devpost was outside the sandbox's outbound host allowlist. Do not submit without checking the live form's format. No Ring support request, organizer question, or invitation was sent or received by this agent.

## Entry 1 — Ring Token Exchange callback contract (historical M5 observation)

- **Task:** Implement the partner Token Exchange callback without inventing its request/response contract.
- **Steps:** During M5 on 2026-10-17, reviewed the public Ring Configure/deployment material and attempted the supplied Account Linking documentation URL.
- **Expected:** Official docs specify the incoming method, content type, full body/fields, authentication/headers, acknowledgement, and retry/timeout behavior.
- **Observed then:** The fetched Configure/deployment pages said Ring POSTs an authorization code to the partner URL and that it must be exchanged within 60 seconds, but did not provide the complete inbound request and acknowledgement contract. The supplied Account Linking URL returned 404. M7 could not confirm whether the docs changed.
- **Impact:** No evidence that an assumed JSON/form top-level `code` request or local `200 { status: "accepted" }` response is compatible with Ring.
- **Workaround:** `RING_TOKEN_EXCHANGE_ROUTE_ENABLED=false` by default; the route returns 503 before parsing while disabled, and production config rejects enabling it. Do not enter or log tokens/codes.
- **Suggestion:** Publish a versioned partner request and acknowledgement example, required headers, response codes, timeout, and retry behavior.

## Entry 2 — Current official rules and Ring docs unavailable to M7

- **Task:** Verify current Ring-track eligibility, the eligible runtime technology and event source, reviewer instructions, screenshot fields, and required friction-log format.
- **Expected:** Current official Devpost Rules/Resources and Ring Developer documentation are accessible to the review environment.
- **Observed:** M7's outbound host allowlist excludes `amazonappdev2026.devpost.com` and `developer.ring.com`. M5 observations date to 2026-10-17 and cannot confirm the current rules. No authenticated portal or Ring account was used.
- **Impact:** Current eligibility, accepted demo evidence, reviewer names/invitation requirements, field limits, deadline, thumbnail dimensions, and friction-log format remain unverified. No reviewer invitation, organizer approval, or submission is claimed.
- **Workaround:** Keep all submission copy as a draft; confirm against the live official pages or provide a saved official copy for review before making a claim.

## Entry 3 — Ring event provenance must be explicit (M7 code fix)

- **Task:** Avoid labeling Playground Event History as live Ring history.
- **Expected:** Runtime event provenance matches the actual authorized source and cannot silently default to a live label.
- **Observed:** Source inspection found `RING_EVENT_SOURCE` defaulted to `ring_live`, while `.env.example` described the optional access token as a Playground token. A user could copy that configuration and mislabel Playground history.
- **Impact:** Potentially misleading provenance in persisted Event History or webhook status.
- **Fix:** Configuration now requires explicit `ring_live` or `ring_playground` whenever Ring credentials, access token, HMAC key, or history device are supplied. The example leaves it unset and warns against mislabeling. Tests cover missing and explicit values. The label is still an operator assertion, not cryptographic proof.

## Entry 4 — Playground Event History report pending review (M8/M11)

- **Task:** Retrieve and review genuine Ring Developer Playground device and Event History structure without guessing field names, identifiers, timestamp units, classification, or pagination details.
- **Expected:** A real, redacted owner-run report shows bounded response structure and field paths/types, array lengths, allow-listed event-type strings, subtype/classification paths and JSON types without their values, timestamp-format categories, and pagination shape.
- **Observed (M11, 2026-10-20):** The owner says they ran a probe on their own machine. The redacted report and findings were not supplied here. This agent made no Ring request; local client/probe/status tests are mocked/offline only. Endpoints noted by the owner are `GET /v1/devices` and `GET /v1/history/devices/{device_id}/events`, but the actual response schema is unknown in this workspace.
- **Impact:** Event History parsing, normalization, stable identity/deduplication, report-derived fixtures, and Sync ingestion cannot be honestly implemented or verified here.
- **Workaround:** Keep the UI Sync action disabled; `POST /api/ring/playground/sync` returns 409 without contacting Ring. A device-only probe can run without `RING_HISTORY_DEVICE_ID`; only an owner-selected device ID is needed for a later History probe. Do not infer IDs or reuse the older M5 history parser as Playground evidence. Background polling defaults off.
- **Next human action:** If the owner chooses, provide the actual redacted report after privacy review. Keep raw response/token/IDs private. Do not claim that no probe was run or infer the report's findings.

## Historical M5 documentation friction

M5 reported that the supplied Notifications, Motion Detection, Button Press, and Account Linking deep links returned 404, while a consolidated API reference loaded. That same M5 review found `data.attributes.sub_type` as the preferred motion-subtype field and described a different older `data.subType` example. M7 did not re-fetch these pages; treat those details as historical, not current confirmation. See [`docs/RING_INTEGRATION.md`](../docs/RING_INTEGRATION.md).

## Tooling and evidence boundary

Doorway Relay's local `npm run simulate:ring` sends its own signed Ring-shaped fixture through the local webhook route. It is stored as `ring_simulated`; it is **not** Ring's official simulator, a Playground event, a Ring-issued signature, or a real device event. The owner-supplied official facts checked 2026-10-20 identify the Ring Developer Playground as the official simulator; this agent did not use it or inspect the owner's probe report. The optional WHEP view is separately labelled **Playground · Simulated** and creates no inbox event. Mocked HTTP/fake-peer tests are not a real media session. No screenshot or demo video was made here.

## Release-candidate source review (2026-10-18; local tests only)

The audit confirmed a provenance bug: a Ring-HMAC-signed webhook could previously inherit `RING_EVENT_SOURCE=ring_playground`. The webhook now rejects Ring-key signatures in Playground mode; a linked-account regression test checks the 401 and verifies that no source event, receipt, or signed-event status is written. The legacy history parser/test no longer accepts or emits `ring_playground`; the test input is explicitly synthetic and does not represent a captured API response. Current owner-supplied History facts prompted neutral mapping for `motion.*`, but the parser's old response-field and timestamp assumptions remain unverified and are not used for Playground.

A probe privacy review also found that heuristic matching could copy arbitrary subtype/classification strings or short dynamic object keys into a report. The reporter now emits only allow-listed event names, subtype/classification paths plus types (not values), and redacts unrecognized field keys; the owner must still inspect any real report before sharing it. The Ring API client/production config also gained same-origin HTTPS checks, redirect rejection for API and OAuth token/profile requests, request/refresh deadlines, and a bounded API JSON response reader. All these corrections have local regression tests; no real Ring request was made in that earlier review. This is an engineering code review note, not observed Ring product friction or an official-format submission.

## M11 WHEP implementation boundary (engineering status, not observed product friction)

The browser receive-only simulation uses a server relay to the documented WHEP session endpoint, strict bounded SDP/`Location` validation, auth/CSRF/rate limits, one in-memory five-minute session, and cleanup attempts. Tests use mocked HTTP, fake timers, and an injected fake peer connection. The owner supplied the official endpoint and watermark facts, but no live WHEP request/session/media or human visual review occurred in this workspace. The UI clearly labels the view **Playground · Simulated** and does not create a webhook or inbox event. No recording, frame capture, snapshots, or media storage is implemented. See [`docs/HUMAN_VISUAL_REVIEW.md`](../docs/HUMAN_VISUAL_REVIEW.md); no product behavior or Ring response is claimed from the mocks.
