# Doorway Relay — Hackathon Requirements Mapping

**Target Competition:** "Build, Ship, Shape: Amazon Developer Hackathon" (Devpost)  
**Primary Track:** Ring  
**Date Evaluated:** 2026-10-20 (Asia/Kolkata)  
**Submission Window:** August 31, 2026 – October 23, 2026, 12:00 PM PDT (= October 24, 2026, 00:30 IST)

---

## 1. Online Source Accessibility & Verification Log

| Source URL | Reachable? | Date Seen | Notes / Observed Status |
|---|---|---|---|
| `https://amazonappdev2026.devpost.com/rules` | HTTP 403 (Scraper protection) | 2026-10-20 | Blocked by Cloudflare/WAF on automated fetch; verified via grounded search index and historical owner extracts. |
| `https://amazonappdev2026.devpost.com/resources` | HTTP 403 (Scraper protection) | 2026-10-20 | Blocked on automated HTTP GET. |
| `https://amazonappdev2026.devpost.com/details/faqs` | HTTP 403 (Scraper protection) | 2026-10-20 | Blocked on automated HTTP GET; judge usernames and invite expiry recorded in project records. |
| `https://amazonappdev2026.devpost.com/updates/46539-final-stretch` | HTTP 403 (Scraper protection) | 2026-10-20 | Blocked on automated HTTP GET. |
| `https://amazonappdev2026.devpost.com/updates/46538-strong-submission-tips` | HTTP 403 (Scraper protection) | 2026-10-20 | Blocked on automated HTTP GET. |
| `https://developer.ring.com/` | Yes (HTTP 200) | 2026-10-20 | Live developer portal overview. Documents Ring Appstore, MCP Server, live video (WebRTC/RTSP), motion events, doorbell presses, and event history. |
| `https://developer.amazon.com/docs/ring/api-documentation.html` | Yes (HTTP 200) | 2026-10-20 | Partner API documentation shell (JavaScript SPA/AUI client). Documents endpoints for `/v1/users/me`, `/v1/devices`, `/v1/history/devices/`, and WHEP streaming. |
| `https://github.com/ShoryaPratapSinghChandrawat/doorway-relay` | Yes (HTTP 200) | 2026-10-20 | Remote repository currently holds base commit `28f9d2f` (README.md only); pending release push on branch `release/devpost-submission`. |

---

## 2. Requirements Matrix

| # | Requirement Category | Specific Rule / Requirement | Source | Status in Repo | Implementation & Evidence |
|---|---|---|---|---|---|
| 1 | **Ring Track: Real Technology Usage** | Working app/feature utilizing Ring APIs/SDKs/simulators/devices; code must import and actually call Ring technology at runtime. Stage One is pass/fail on reasonable use. | Devpost Rules | **PARTIAL** (Local Mock / Simulator Pass; Real Ring Token Pending) | Ring client, OAuth token manager, signed webhook verifier, WHEP live-view relay, and Playground probe are implemented in `server/src/ring/*` and tested hermetically. However, no live Ring request was executed in this environment; `ring_playground` requires owner-supplied token; Ring Event History parsing/Sync is intentionally blocked (HTTP 409) awaiting real redacted probe report. |
| 2 | **Source Code Repository** | Public repo with detectable open-source license OR private repo shared with judges (`chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`, `testing@devpost.com`). Clear run/setup instructions. | Devpost Rules & FAQs | **MET (Local Code)** / **OWNER ACTION (Legal/Visibility Gate)** | Complete source, tests, migrations, and scripts present on branch `release/devpost-submission`. Setup and execution steps documented in `README.md`. Owner must confirm license name and choose public vs. private before push. |
| 3 | **Demonstration Video** | Public video (< 3:00) on YouTube or Vimeo showing functioning project on its intended platform; no unauthorized copyrighted audio or third-party trademarks. | Devpost Rules | **PARTIAL** (Script Complete; Recording Pending) | Comprehensive narration script, shot breakdown (< 2:50), and capture instructions prepared in `submission/DEMO_SCRIPT.md`. Actual recording and public URL upload require owner execution. |
| 4 | **Text Description** | English text description explaining features, user experience, and architecture. | Devpost Rules | **MET** | Drafted and synchronized in `README.md`, `submission/PROJECT_DETAILS.md`, and `submission/DEVPOST_PASTE_READY.md`. |
| 5 | **Product Feedback ("Shape")** | Mandatory structured feedback on tools/APIs/SDKs used: what worked, what needs work, onboarding experience, would build again (Y/N + why). Scored: friction log and feature requests. | Devpost Rules / Submission Form | **MET** | Truthful developer feedback and friction log documented in `submission/PRODUCT_FEEDBACK.md` and `submission/FRICTION_LOG.md` (addressing Ring token expiry, lack of documented Event History schema, and WHEP handshake details). |
| 6 | **Mini Challenges** | Open Source mini challenge (needs contribution URL, repo, description). AWS Builder (requires genuine AWS service usage). | Devpost Rules | **MET (Open Source)** / **NOT CLAIMED (AWS)** | Open Source mini challenge can be selected once repo is published with open-source license. AWS Builder is explicitly NOT claimed because Doorway Relay runs on local Node/SQLite and does not invoke AWS services. |
| 7 | **New & Existing Submissions** | If project predates August 31, 2026, explain how it was significantly updated during the hackathon window. | Devpost Rules | **MET** | Project was created and completely authored during the submission window (initial base commit September/October 2026; complete snapshot imported October 2026). Documented in `submission/DEVPOST_PASTE_READY.md`. |
| 8 | **Eligibility & Compliance** | Legal age of majority in country of residence; no export/sanction conflicts; employee conflict verification. | Devpost Rules | **OWNER ACTION** | Must be verified directly by project owner prior to Devpost form submission. |

---

## 3. Unverified or Ambiguous Items

1. **Ring Event History Response Envelope:**  
   The official documentation does not publish the definitive JSON schema or attribute hierarchy for historical Ring events in the Playground. Doorway Relay correctly refuses to guess the payload shape and keeps History Ingestion/Sync disabled pending owner review of a real redacted probe report.
2. **Ring Token Exchange Inbound Contract:**  
   The exact HTTP payload expected when exchanging an OAuth authorization code or refresh token in partner integrations is not fully documented in public Ring endpoints. `RING_TOKEN_EXCHANGE_ROUTE_ENABLED` remains `false` by default to prevent accepting unvalidated schemas.
3. **Judge Account Invitations Expiration:**  
   FAQ notes indicate GitHub private repository collaboration invites expire after 7 days. If a private repository strategy is chosen, the owner must monitor and re-send invitations if judging extends beyond the expiration window.
