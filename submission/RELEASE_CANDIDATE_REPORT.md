# Doorway Relay — release-candidate report

**Status date:** 2026-10-20 (Asia/Kolkata) · **Disposition:** locally verified candidate; external Ring and owner evidence still required · **Not submitted or published.**

## A. Verdict

Doorway Relay has a locally tested handoff workflow and M11 Playground device/probe/WHEP code. M11b's final local suite passes **26/26 files and 137/137 tests**, including mocked Ring/WHEP calls, fake peer connections, and explicit non-loopback network blocking. This is **not Ring-verified, production-ready, or submission-ready**. The owner says a probe was run on their own machine, but its redacted report and findings were not supplied here. This agent made no Ring API request, used no Ring credential, and saw no genuine Ring/Playground event or WHEP video. Do not claim a real Ring success or that all bugs are fixed.

## B. Event History Phase 2 decision

**Event History Phase 2 was skipped. No Branch A/B/C was chosen.** No History schema, ID, timestamp, subtype, classification, pagination, or simulation visibility was inferred. No Playground History ingestion, `ring_playground_recorded` persistence, functional Sync, or background Playground polling was implemented. The separate, user-triggered WHEP path is implemented and mock-tested only; it does not depend on or establish History compatibility.

## C. Verification

Environment: Node `v22.22.3`, npm `10.9.8`. `npm ci --nodedir=/usr/local` was needed because `node_modules` was absent; it passed with 344 packages added, 345 audited, and 0 vulnerabilities. No dependencies were added.

| Check | M11b result | Evidence limit |
|---|---|---|
| `npm run typecheck` | Pass — server and client. | Type correctness only. |
| M11 baseline, before M11b test additions | Pass — **26/26 files, 132/132 tests** on 2026-10-20. | Historical local run; M11b added five hermetic/WHEP test cases, reaching 137. |
| Plain M11b `npm test` | Pass — **26/26 files, 137/137 tests**. | Ring/WHEP calls are mocked; browser peer is fake. |
| Fake shell `RING_*` test run | Pass — **26/26 files, 137/137 tests** with fake token/source/device variables set in the parent shell. | Proves test setup clears them; no real credential. |
| Temporary fake `DOTENV_CONFIG_PATH` run | Pass — **26/26 files, 137/137 tests**; the fake `/tmp` file was removed. | Setup redirects dotenv to a unique nonexistent path before `dotenv/config` is imported. |
| `npm run lint` | Pass — ESLint with `--max-warnings=0`. | Local source lint. |
| `npm run build` | Pass — Vite 8.3.4, 1,948 modules; JS 354.39 kB (106.35 kB gzip), CSS 32.19 kB (8.19 kB gzip). | Client bundle only, not a production API package. |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities reported. | npm advisory check, not a source audit. |
| `npm ls --depth=0` | Pass — no missing/extraneous direct dependencies. | Package-tree check. |
| WHEP criteria | 9-row `OK`/`fixed` matrix in `docs/TESTING.md`. | All mock/fake-peer checks; no real Ring session. |
| Diff/link/whitespace/secret/export checks | Final counts, scope, artifact sizes/hashes, and clone tree comparisons in ignored `handoff/EXPORT_MANIFEST.md`. | Secret scan is a heuristic, not proof of absence. |

The suite prints a **synthetic mocked** redacted probe fixture into a temporary directory. Its fixture timestamp is not a real capture and no probe report was created in the workspace. Earlier M10 SQLite migration/reopen results are historical and were not repeated in this M11b pass.

### Actual Git boundary

At the start of the M11b turn the actual checkout was `HEAD=28f9d2f` with only `README.md` tracked; the rest of the existing source snapshot was in the worktree as untracked files. The expected `2b0fab5` commit object was unavailable. After the required typecheck/lint/test checkpoint, the preserved snapshot was committed as `44abdb6` with the exact message `feat(ring): playground device selection, probe devices mode, WHEP live view` (129 files changed, 18,340 insertions, 1 deletion). This was necessary to preserve the files present in the checkout; it is not evidence that the earlier snapshot commit existed. No reset, rebase, force, push, or unreachable-object inspection occurred. `LICENSE` and `package-lock.json` were added from the existing snapshot relative to the actual `28f9d2f` base, but their contents were not changed in M11b. The lockfile has no M11b diff against `44abdb6`; comparison against unavailable `2b0fab5` cannot be claimed.

## D. Ring provenance and evidence truth table

| Provenance | Implementation state | Evidence available here | Real Ring/Playground verified here? |
|---|---|---|---|
| `ring_live` | Ring-HMAC webhook and opt-in legacy History parser. | Local parser/route tests with synthetic inputs. | **No** — no live API call, webhook, event, or History compatibility. |
| `ring_playground` | Server-only API client, selected-device status, redacting probe, and separately triggered receive-only WHEP relay/display. | Mocked HTTP/WHEP tests, fake peer, local React tests; 26-file/137-test suite. | **No** — no real response/report was inspected and no WHEP session, video, or event was verified. The owner-reported probe's report was not supplied. |
| `ring_playground_recorded` | Reserved for a future report-reviewed adapter. | Not implemented or persisted. | **No** — no History Sync. |
| `ring_simulated` | Doorway Relay's own signed local fixture, labelled **Local · Simulated**. | Synthetic local tests. | **No** — not Ring-issued and not Ring's Developer Playground. |
| `manual` | Human-created tasks. | Local workflow tests. | **No** — not Ring evidence. |
| `isSynthetic` | Separate seeded-data marker **Synthetic demo data**. | Local seed/workflow tests. | **No** — does not prove or alter provenance. |

The owner supplied official Playground/WHEP facts and references; this agent did not independently fetch them or exercise Ring. The owner-reported probe is not evidence available for this report because its redacted content was not supplied.

## E. M11/M11b fixes and limits

- M11 delivers Playground device selection, a devices-first redacting probe, and a separate receive-only WHEP server relay/client. The browser never receives the Playground token or upstream `Location`; the server validates bounded single-video SDP and the selected-device session path, rejects redirects, times out requests, and keeps at most one in-memory session for five minutes.
- M11b fixed `prefer-const`, made Vitest hermetic against shell and dotenv `RING_*` settings, added fail-closed `fetch`/HTTP(S) guards for non-loopback traffic, and enables mock cleanup. Proof runs with plain `npm test`, fake inherited Ring variables, and a temporary fake dotenv file all pass 26/26 files and 137/137 tests.
- Additional WHEP tests cover content/body bounds, foreign and wrong-device `Location`, auth/CSRF/rate limits, idempotent stop, expiry/shutdown, 401 state reset, ICE wait/cleanup, and no inbox events. Both WHEP routes set `Cache-Control: no-store` before auth/rate/body parsing; error and success paths are covered. The browser expiry timer is cleared when answer setup fails.
- CSS no longer clips, rounds, filters, transforms, or overlays live video; it uses `object-fit: contain`. No real Ring frame was available, so actual watermark visibility remains a human-review item. The docs warn that no STUN/TURN server is configured but host ICE candidates/mDNS network identifiers may still be sent in SDP; no candidate filtering is implemented.
- WHEP does not create inbox/History events. Tests verify this only with local mocks; they do not prove Ring media/API compatibility. The local simulator and mocked probe fixture remain synthetic.

## F. Visual, product-feedback, and publication evidence

No human browser review, real screenshot, gallery image, or video was made. jsdom tests and CSS inspection are not visual evidence. No product feedback was submitted; no firsthand Ring Playground/API feedback is justified, and no AWS service was used. Actual watermark visibility, accessibility/keyboard review, and the final clean-clone review remain owner tasks.

`LICENSE`'s placeholder remains `Copyright (c) 2026 [Copyright holder — confirm before publication]`; no legal identity or license decision was invented. The owner-supplied deadline is **Sat 24 Oct 2026 00:30 IST**; current Rules/FAQ and age eligibility were not independently verified. No visibility change, push, invitation, organizer contact, deployment, tunnel, paid resource, Devpost action, or submission was performed.

## G. Owner checklist — one sitting, approximately 30-minute Playground token

1. **Generate a fresh Playground token.** In the local ignored `.env`, set only the Ring entries `RING_ACCESS_TOKEN` and `RING_EVENT_SOURCE=ring_playground`; never paste the token into chat, command history, browser code, screenshots, logs, or recordings.
2. **Verify API access.** Run `npm run dev`, sign in, open **Integration → Verify Playground API access**, and capture a success screenshot with no token, device identifier, or other secret visible.
3. **Review the live view and simulator.** Choose a listed device; in Chrome or Edge start the Playground Live view, confirm video and the mandatory watermark, then Stop. Trigger Package, Vehicle, and Motion in the official Playground as directed by the owner; keep video distinct from an inbox/webhook event.
4. **Run and review the probe.** Run `npm run ring:probe`; optionally set `RING_PROBE_PRINT_DEVICE_IDS=true` once for the local terminal only, never share that output, then set the deliberately selected `RING_HISTORY_DEVICE_ID` and rerun. Review the real output and share only the redacted report. Do not enable History ingestion or Sync until that report has been reviewed.
5. **Complete owner-only release checks.** Confirm age eligibility, license/copyright holder, visibility, clean-clone/application of exports, human visual review/screenshots, English public video under 3:00, and the complete diff. Only after those reviews, separately authorize any fast-forward push, visibility action, owner-run invitations, or Devpost submission.

If reviewer invitations are required, retain exactly `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`, and `testing@devpost.com`; invitations are owner-run and expire after 7 days per the supplied FAQ. No invitation was sent.

## H. Git/export and stop status

All work stays on `arena/51d1d642-doorway-relay`. The final local M11b commit, final tree/base, patch series, consolidated patch, bundle, ZIP, sizes/SHA-256 hashes, and temporary-clone tree comparisons are recorded in `handoff/EXPORT_MANIFEST.md`. Exports are ignored and local only. No push, visibility change, invitation, deployment, organizer contact, or submission was run. No action beyond local code/docs/tests/commits/exports is authorized by this report; keep Event History ingestion and Sync disabled until the owner supplies a real redacted probe report.
