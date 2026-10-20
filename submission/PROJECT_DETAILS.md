# Doorway Relay — Devpost project description (draft; factual as of 2026-10-20)

## Inspiration

For a family carer or a small shared space, a door alert is only half the problem. A notification can be seen and still leave everyone unsure who will collect a delivery, meet a visitor, or follow up. Doorway Relay focuses on the gap between an event being detected and a task being genuinely resolved.

## What it does

Doorway Relay turns a supported door-event input—or a manually created task—into a handoff with an owner, priority, optional due date, activity timeline, and explicit state. An incoming button-press or motion event stays neutral until a person classifies it. The app distinguishes new, assigned, acknowledged, resolved, and reopened work; acknowledgement does not resolve a handoff. Overdue and stalled indicators are calculated from stored dates and state.

The Ring Developer Playground path can list devices and select one in the Integration page. A separate, explicit user action can start a receive-only WHEP video session in the browser, relayed through the server. It is labelled **Playground · Simulated**; the video does not create an inbox event, webhook, or History item. The UI does not record, capture frames, download snapshots, or store media. Ring's mandatory watermark must remain visible and unaltered.

## How it is built

The application uses a React/TypeScript/Vite frontend and a Node/TypeScript/Express API. Sequential SQLite migrations and transactions persist events, handoffs, and append-only activity. The webhook receiver verifies HMAC over the raw request body. A local signed fixture is stored as `ring_simulated` and displayed **Local · Simulated**; it is not Ring-issued and is not Ring's official Developer Playground. Seeded rows have a separate **Synthetic demo data** marker.

Playground device listing and selection use an authenticated, server-only HTTP client. The app extracts only bounded opaque IDs and short types, caps the list at 50, handles unknown/malformed response shapes explicitly, and keeps selection in memory only. The optional `npm run ring:probe` supports device discovery without a History device ID; a History ID is needed only for a separate Event History request. Reports are structure-only and redacted; optional terminal-only ID output is never written to a report.

The WHEP path uses a video-only receive-only WebRTC offer after ICE gathering. The server validates bounded SDP and a strict same-origin session `Location`, keeps the token server-side, limits requests, allows one in-memory session for up to five minutes, and attempts DELETE on stop/expiry/shutdown. Tests use mocked HTTP, fake timers, and an injected fake peer connection. No real Ring response or WHEP stream was exercised in this workspace.

## Local engineering verification

Section 3 implementation checks recorded so far: Section 3.1 passed typecheck and 4 targeted test files / 36 tests; Section 3.2 passed typecheck and 3 targeted files / 19 tests; the latest Section 3.3 isolated snapshot passed typecheck and 5 targeted files / 50 tests. These are separate milestone-focused checks, not the final Section 4 full-suite result. Final verification, secret heuristic, lockfile check, and exports are pending at the time this draft was updated; see [`../docs/TESTING.md`](../docs/TESTING.md) for the final record once Section 4 is complete. Local test success does not establish Ring compatibility, human visual review, Stage One eligibility, or production approval.

## Ring technology and limitations

The owner says a Playground probe was run on their own machine. Its redacted report and findings were not supplied to this workspace, and this agent did not run it, make a Ring request, use Ring credentials, or inspect `.env`. No real device/history response was reviewed here. No live WHEP session, media stream, inbox event from Playground, Ring-signed webhook, screenshot, or human visual review is available in this workspace.

The owner-supplied official facts checked 2026-10-20 say the Ring Developer Playground is the official simulator, has Package, Vehicle, and Motion simulations, and uses a short-lived token (about 30 minutes). The supplied live-video documentation describes WHEP: a browser receive-only offer after ICE gathering, a POST to `https://api.amazonvision.com/v1/devices/{device_id}/media/streaming/whep/sessions`, a response containing answer SDP and `Location`, and DELETE to stop the session. Ring's watermark is mandatory. These notes were supplied by the owner; the agent did not independently fetch or exercise the pages.

Event History fields, stable event identity, timestamp units, subtype/classification placement, pagination behavior, and whether simulated sessions appear in History remain unverified here. Until a real redacted report is supplied and reviewed, Doorway Relay does not enable Event History ingestion, identity/deduplication, recorded-response fixtures, `ring_playground_recorded` persistence, or Sync. The legacy parser is restricted to `ring_live`; its historical response-field and timestamp assumptions are not Playground facts. `ring_live`, `ring_playground`, `ring_playground_recorded`, `ring_simulated`, and `manual` remain distinct. The inbound Token Exchange request/acknowledgement contract also remains unverified and disabled.

No claim is made that the evidence in this workspace demonstrates Ring Stage One runtime use or eligibility. Current Ring-track and Devpost requirements must be confirmed against the live official rules before submission.

## Submission and release status

This is a local engineering candidate only, **not submission-ready or production-ready**. Human visual review, screenshots, a public demo video, product-feedback submission, reviewer invitations, publication, and Devpost submission have not been performed by this agent. The owner checklist requires an independent clean-clone test, human desktop/mobile visual review, a truthful English demo under three minutes with no copyrighted music or unauthorized trademarks, a final diff/licensing review, and separate owner authorization for any external action. Do not represent WHEP video as an inbox event or mocked tests as Ring evidence.

The repository is public upstream, but this source remains local on `arena/51d1d642-doorway-relay`; no push, visibility change, release, invitation, deployment, or Devpost action was authorized or performed. `LICENSE` remains untouched pending the owner's copyright-holder and license choice.

Owner-supplied target dates: Tue 20 Oct 2026; Fri 23 Oct 12:00 PDT / Sat 24 Oct 00:30 IST deadline. The deadline and current official rules have not been independently reverified. No edits should be made after the owner's deadline without new authorization.

See [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md), [`FINAL_CHECKLIST.md`](FINAL_CHECKLIST.md), [`RELEASE_CANDIDATE_REPORT.md`](RELEASE_CANDIDATE_REPORT.md), and [`../docs/HUMAN_VISUAL_REVIEW.md`](../docs/HUMAN_VISUAL_REVIEW.md). No claim is made that every bug is fixed, Ring is verified, or production deployment is ready.
