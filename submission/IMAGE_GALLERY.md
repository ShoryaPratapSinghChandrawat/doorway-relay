# Screenshot and image gallery plan (manual capture required)

**Status (2026-10-20):** No screenshots, thumbnails, or human visual review exist in this workspace. This is a capture plan, not evidence. The current UI—including the new Playground device picker and WHEP panel—has not been visually inspected by a human. Current Devpost image dimensions/count/ratio/file-size rules need owner verification before capture.

## Required capture rules

- Capture directly from the running local app; do not fabricate, redraw, or annotate UI elements. Crop only to meet a verified platform spec and retain an untouched original.
- Use only the seeded demo workspace for the shots below. Seeded rows must display **Synthetic demo data**. For a seeded simulated record, the provenance must read **Local · Simulated** **and** **Synthetic demo data**. A manual seed row must read **Manual** and **Synthetic demo data**.
- Caption every shot: “Local seeded synthetic demo data; not a Ring event.” Do not present these as Ring Developer Playground output, Ring Live data, or official simulator evidence.
- Hide or crop only sensitive browser chrome/private contact details; never alter the underlying product screen to imply a different source. Do not show tokens, `.env`, signing keys, real names/emails, account/device/event identifiers, raw API bodies, or private data.
- Only add screenshots after the owner completes [`../docs/HUMAN_VISUAL_REVIEW.md`](../docs/HUMAN_VISUAL_REVIEW.md), reviews each image, and confirms the live Devpost image specifications. Store approved images in `submission/gallery/` only after that review.

## Exact proposed shot list

| # | Screen and composition | Data to show | Required provenance/labels | Caption / purpose |
|---|---|---|---|---|
| 1 | **Overview** (`/`) at desktop width; include metrics, “Needs attention”, and one recent activity row. | Seeded assigned/stalled handoffs, such as “Meet the visitor at the shared entrance” and “Check the side entrance after a motion alert”. | Every seeded row: **Local · Simulated** + **Synthetic demo data** (for simulated rows). The manual seeded rows, if visible: **Manual** + **Synthetic demo data**. | “Local seeded synthetic demo data; not a Ring event.” Shows dashboard-derived work counts and explicit provenance. |
| 2 | **Event inbox** (`/inbox`); include both seeded event cards and their human-classification controls. | Seeded `button_press` and `motion_detected` pending events; no live or Playground events. | Each card: **Local · Simulated** + **Synthetic demo data**. Keep the neutral event description visible; do not preselect a classification. | “Two local synthetic test events, not Ring events. A person decides whether either needs a handoff.” |
| 3 | **Handoff queue** (`/handoffs`) with the full seeded list; choose a viewport where the source and status columns are legible. | The six seeded states: new/unassigned, assigned, acknowledged/stalled, assigned/overdue, resolved, reopened. | All six show **Synthetic demo data**; provenance is **Manual** or **Local · Simulated** as seeded. No **Ring · Live** or **Ring · Playground** badge. | “Seeded synthetic examples across the handoff lifecycle; not Ring events.” |
| 4 | **Assigned handoff detail** for “Meet the visitor at the shared entrance”; show activity timeline and next action. | Seeded `assigned` visitor handoff and its assignment activity. | Header/source badges: **Local · Simulated** + **Synthetic demo data**. | “Synthetic example: assignment is recorded; acknowledgement is a separate action.” |
| 5 | **Resolved handoff detail** for “Help a visitor find the correct entrance”; show the resolution note and full activity timeline. | Seeded `resolved` handoff, including the existing non-sensitive demo resolution note. | Header/source badges: **Local · Simulated** + **Synthetic demo data**. | “Synthetic example: a human-owned task is explicitly resolved; not a Ring event.” |
| 6 | **Integrations** (`/integrations`) showing the actual current safe Playground state and disabled History Sync control. | If no separately authorized human call has been made, use the non-connected state; otherwise show only the state/summary after verifying the true source. Do not show token, private device ID, raw payload, or owner report. | State the true connection status; History remains unverified here and Sync stays disabled. The local simulator card must say **Local · Simulated**. Do not imply an authenticated call succeeded unless it actually did. | “Playground device discovery and History review are separate; the local simulator is not Ring evidence.” |

## Optional evidence — only after owner review

Do not capture or include a Playground/API screenshot until the owner supplies and reviews the actual redacted probe report and independently confirms what the image represents. Never expose a private device ID, token, raw payload, or report detail. Distinguish **Playground · Simulated**, **Local · Simulated**, **Ring · Live**, and synthetic seed labels truthfully. This gallery plan is not evidence.

The WHEP panel is a separate receive-only simulated video path; it is not an inbox event. Do not capture, save, or include a frame of the WHEP stream. If the owner wants an Integration screenshot, first complete [`../docs/HUMAN_VISUAL_REVIEW.md`](../docs/HUMAN_VISUAL_REVIEW.md), stop the stream, and capture only the stopped panel and controls with no private IDs. No screenshot is authorized by this plan. Do not imply the browser session was Ring-verified unless it actually was.

**Current gallery contents:** empty; no screenshots, live video, or thumbnail have been captured.
