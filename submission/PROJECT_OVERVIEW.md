# Doorway Relay — project overview (draft; updated 2026-10-20; not submitted)

**Status:** Local engineering candidate only. The owner says a Playground probe was run on their own machine, but its redacted report/findings were not supplied here. This agent made no Ring request or credential use. No live WHEP session, real Ring event, human visual review, screenshot, video, reviewer invitation, publication, or Devpost submission is evidenced in this workspace.

## Name and pitch

**Doorway Relay** turns a supported door-event input—or a manually created task—into an accountable handoff with an owner, acknowledgement, resolution, and durable activity history. The product addresses the gap between receiving an alert and knowing who is responsible for the next step.

## Intended track and gates

- **Intended primary track:** Ring. Current 2026 rules and eligibility have not been independently reverified. The application contains runtime server-side Ring API clients and a Ring webhook route, but no genuine authenticated Ring call, event, or WHEP session was exercised in this workspace. Do not claim Ring Stage One eligibility or a pass based on code or mocks alone.
- **AWS Builder mini-challenge:** not selected; no AWS service was used.
- **Open Source mini-challenge:** not selected; no qualifying contribution has been verified.

## What works locally

A local signed simulator event can enter the inbox, remain neutral until a person classifies it, then become a handoff with assignment, acknowledgement, resolution, and an activity timeline. The in-process UI/API/SQLite workflow test covers dashboard/inbox state, the local source label, handoff lifecycle, errors, and persistence. Seeded examples are separately marked **Synthetic demo data**. Local simulator events are labelled **Local · Simulated**; neither is presented as Ring-originated.

The Integration page supports authenticated Playground device listing and selection; the selected device is held in memory and restricted to the latest list. A separate, user-triggered receive-only WHEP panel is labelled **Playground · Simulated**. It can display a video stream but does not create an inbox event or History record and does not record, capture frames, download snapshots, or store media. No real WHEP stream was verified here.

## Technology and implementation

The app uses React, TypeScript, Vite, Express, Zod, and SQLite. A raw-body HMAC webhook receiver and local signed fixture are separate from the authenticated server-side Ring Developer Playground API path. The `npm run ring:probe` reporter emits bounded structure and redacted field/type summaries; device-only discovery works without a History device ID. The owner-reported probe result is not available to this workspace. Playground History Sync remains disabled until a real redacted report is reviewed and an observed adapter is implemented. The legacy History parser is restricted to `ring_live`; it is not live-verified and is not used as Playground evidence.

## Verification performed locally

Section 3 milestone checks: Section 3.1 passed typecheck and 4 targeted test files / 36 tests; Section 3.2 passed typecheck and 3 targeted files / 19 tests; the latest Section 3.3 isolated snapshot passed typecheck and 5 targeted files / 50 tests. These targeted checks do not replace the required final Section 4 full verification, secret heuristic, lockfile/export checks; those are pending while this draft was updated. Full outputs and final freshness will be recorded in [`../docs/TESTING.md`](../docs/TESTING.md) and [`RELEASE_CANDIDATE_REPORT.md`](RELEASE_CANDIDATE_REPORT.md).

Local tests and builds validate only local code. They are not Ring certification, a human visual review, proof of a real Ring API response, production approval, or Devpost eligibility.

## Ring evidence and unknowns

The owner-supplied official facts (checked 2026-10-20) identify the Ring Developer Playground as the official simulator, with Package, Vehicle, and Motion simulations and a token valid for about 30 minutes. The owner also supplied the documented WHEP path: receive-only WebRTC video offer after ICE gathering, POST to `https://api.amazonvision.com/v1/devices/{device_id}/media/streaming/whep/sessions`, answer SDP plus `Location`, then DELETE; keep the Ring watermark unaltered. The agent did not independently fetch these pages or exercise the APIs.

No real device/history response was reviewed here. Event History field names, stable identity, timestamp units, subtype/classification placement, pagination behavior, and whether simulated sessions appear in History remain unverified in this workspace. Until a real redacted report is supplied and reviewed, no Playground History ingestion, `ring_playground_recorded` persistence, or Sync is implemented. `ring_live`, `ring_playground`, `ring_playground_recorded`, `ring_simulated`, and `manual` remain distinct. The inbound Token Exchange request/acknowledgement also remains unverified and disabled.

## Submission and repository state

Draft only; not submission-ready. No browser-based human visual review, screenshot, video, product feedback, reviewer invitation, or submission was produced by this agent. The conditional demo script distinguishes the WHEP simulation from an inbox event and separates local synthetic data from Ring evidence. Any final recording must be English and under three minutes, with no copyrighted music or unauthorized third-party marks/footage. Product feedback should cover only tools actually used; no AWS was used.

The work remains local on the fixed branch `arena/51d1d642-doorway-relay`; it has not been pushed. No visibility change, PR, release, invitation, organizer contact, deployment, or Devpost action occurred. `LICENSE` was not edited; the owner must choose a license and supply the correct legal copyright holder.

## Owner-supplied schedule and next actions

- **Date:** Tue 20 Oct 2026.
- **Supplied deadline:** Fri 23 Oct 2026 12:00 PDT / Sat 24 Oct 00:30 IST; not independently reverified.
- The owner must review the actual redacted probe report (if supplied), complete an independent clean-clone test, visually inspect desktop/mobile and WHEP UI, decide age eligibility/license/copyright/visibility, re-check the rules/deadline, and conduct a final diff review.
- Any upload, reviewer invitation, publication, or submission requires separate owner authorization. If invitations are later required, retain exactly `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`, and `testing@devpost.com`; verify current instructions first.

See [`FINAL_CHECKLIST.md`](FINAL_CHECKLIST.md), [`RELEASE_CANDIDATE_REPORT.md`](RELEASE_CANDIDATE_REPORT.md), and [`../docs/HUMAN_VISUAL_REVIEW.md`](../docs/HUMAN_VISUAL_REVIEW.md). No claim is made that every bug is fixed, Ring has been verified, or production deployment is ready.
