# Doorway Relay — final owner checklist (local release candidate)

**Status date:** 2026-10-20 (Asia/Kolkata). **Disposition:** locally verified only; Ring/owner evidence required. **Submission:** not submitted. **Publication:** not authorized or performed.

## Verdict and report gate

M11 delivers Playground device selection, a devices-first redacting probe, and an optional receive-only WHEP relay/view. The earlier M11 full suite passed **26/26 files, 132/132 tests**; M11b expanded it to **26/26 files, 137/137 tests**, with hermetic environment and non-loopback network guards. These are local/mock/fake-peer results only. This agent did not read `.env`, use a Ring credential, make a Ring request, or establish a real WHEP session. The owner says a probe was run separately, but no redacted report or findings were supplied here. Therefore **Event History Phase 2 is skipped; no Branch A/B/C was selected; no History ingestion, `ring_playground_recorded` persistence, or Sync was enabled.**

Stage One is not demonstrated in this workspace: there is no real Ring API result, genuine Playground/device event, real WHEP video, screenshot, or video. The local signed simulator is Doorway Relay's synthetic source, not Ring's official simulator. Do not claim Ring success, eligibility, production readiness, or that all bugs are fixed.

## Evidence truth table

| Source | Implementation state | Evidence in this workspace | Claim limit |
|---|---|---|---|
| `ring_live` | Ring-HMAC webhook and opt-in legacy History parser. | Mocked/local parser and route tests. | No live API call, webhook, signature, event, or History compatibility. |
| `ring_playground` | Server-only client, safe device selection/status, redacting probe, receive-only WHEP relay/view. | Mocked HTTP, fake-peer, local React tests; 26-file/137-test suite. | No real response/report was inspected; no real WHEP session/video/event was verified. Owner's separately run probe report was not supplied. |
| `ring_playground_recorded` | Reserved for a future report-reviewed adapter. | Not implemented or persisted. | No recorded provenance or Sync. |
| `ring_simulated` | Doorway Relay's own signed local fixture, labelled **Local · Simulated**. | Synthetic local tests. | Not Ring-issued and not Ring's Developer Playground. |
| `manual` | Human-created tasks. | Local workflow tests. | Not Ring evidence. |
| `isSynthetic` | Separate seeded-data marker **Synthetic demo data**. | Local seed/workflow tests. | Does not prove or change provenance. |

The WHEP implementation uses mocks/fake peers only. `docs/TESTING.md` contains the nine-item `OK`/`fixed` verification matrix, network guard and dotenv proof, and the STUN/ICE privacy warning. Actual watermark visibility still requires human review.

## Local verification record

Environment: Node `v22.22.3`, npm `10.9.8`. `npm ci --nodedir=/usr/local` was needed because `node_modules` was absent; it passed with 344 packages added, 345 audited, and 0 vulnerabilities. No dependency was added.

- Plain `npm test`: **26/26 files, 137/137 tests passed**.
- Proof with fake inherited `RING_ACCESS_TOKEN`, `RING_EVENT_SOURCE`, and `RING_HISTORY_DEVICE_ID`: **26/26 files, 137/137 tests passed**.
- Proof with `DOTENV_CONFIG_PATH` pointing to a temporary fake `/tmp` dotenv file: **26/26 files, 137/137 tests passed**; the file was removed.
- `npm run typecheck`: pass for server/client. `npm run lint`: pass with zero warnings.
- `npm run build`: pass; Vite 8.3.4, 1,948 modules; JS 354.39 kB (106.35 kB gzip), CSS 32.19 kB (8.19 kB gzip). This is not a production API package.
- `npm audit --audit-level=moderate`: pass, 0 vulnerabilities. `npm ls --depth=0`: pass, no missing/extraneous direct dependencies.
- The suite writes only synthetic/mock probe output under a temporary directory; its fixture timestamp is not live data. Earlier M10 SQLite migration/reopen checks were not repeated in M11b.
- Final diff/link/whitespace/heuristic/export verification and exact artifact hashes/sizes are recorded in ignored `handoff/EXPORT_MANIFEST.md`. The heuristic excludes `.env` paths and unreachable Git objects, prints no values, and is not a dedicated scanner or proof of absence.

## Actual Git boundary

The actual M11b checkout began at `28f9d2f` with only `README.md` tracked; the remaining existing source snapshot was present as untracked worktree files. The expected `2b0fab5` commit object was unavailable. The required early checkpoint is `44abdb6` with message `feat(ring): playground device selection, probe devices mode, WHEP live view` (129 files changed, 18,340 insertions, 1 deletion), preserving the full present snapshot. No reset, rebase, force, push, or unreachable-blob inspection occurred. `LICENSE` and `package-lock.json` were added relative to the actual `28f9d2f` base as part of preserving the pre-existing snapshot, but their contents were not changed during M11b. The lockfile has no diff against checkpoint `44abdb6`; comparison against unavailable `2b0fab5` cannot be claimed.

## Owner checklist — one sitting with the approximately 30-minute Playground token

1. **Generate a Playground token.** In the local ignored `.env`, set the Ring entries `RING_ACCESS_TOKEN` and `RING_EVENT_SOURCE=ring_playground`; keep the token out of chat, command history, browser code, screenshots, logs, and recordings.
2. **Verify access.** Run `npm run dev`, sign in, open **Integration → Verify Playground API access**, and take a success screenshot with no secrets visible.
3. **Review the selected-device live view.** Choose a listed device; in Chrome or Edge start Live view, confirm the stream and mandatory watermark, then Stop. Trigger Package, Vehicle, and Motion in the official Playground as directed; do not represent video as an inbox/webhook event.
4. **Run/review the probe.** Run `npm run ring:probe`; optionally set `RING_PROBE_PRINT_DEVICE_IDS=true` once for local terminal use only (never share that output). Set the deliberately selected `RING_HISTORY_DEVICE_ID` and rerun. Review the resulting real report and share only its redacted form. Keep History ingestion and Sync disabled until that report is supplied and reviewed.
5. **Complete owner-only release checks.** Confirm age eligibility, license/copyright holder, visibility, clean-clone application of the exports, human visual review/screenshots, English video under 3:00, and the complete diff. Only after these checks, separately authorize any fast-forward push, visibility action, owner-run invitations, or Devpost submission.

The owner-supplied deadline is **Sat 24 Oct 2026 00:30 IST**; it and current Rules/FAQ were not independently re-verified here. `LICENSE` still contains `Copyright (c) 2026 [Copyright holder — confirm before publication]`; choose the license and correct legal holder before publishing. If invitations are required, retain exactly `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`, and `testing@devpost.com`; invitations are owner-run and expire after 7 days per the supplied FAQ. No invitation, visibility change, push, deployment, organizer contact, Devpost action, or submission occurred.

**Stop point:** local implementation, tests, commits, and export verification are not Ring evidence or publication authorization. Wait for the real redacted probe report before any History Phase 2 work; wait for separate owner authorization before any public action.
