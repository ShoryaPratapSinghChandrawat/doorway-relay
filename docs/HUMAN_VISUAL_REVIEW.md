# Owner manual visual review — Playground receive-only WHEP

**Status:** not yet reviewed by a human owner. Automated tests use mocked Ring HTTP and an injected fake `RTCPeerConnection`; they are not proof that the official Playground returns the expected WHEP response or that a real browser can receive video. Do not mark this review passed until the owner completes it.

## Safety boundary

- Use only a device/session explicitly simulated in the official Ring Developer Playground. Do not use a real household camera or a real Ring account/device.
- Keep the short-lived Playground token in the ignored root `.env` only. Never paste it into the browser, chat, an issue, a screenshot, a HAR/network export, or a shared terminal transcript. The browser should receive no Ring token.
- The browser submits one receive-only video offer through Doorway Relay's authenticated server route. The server keeps the upstream WHEP `Location` private, returns the SDP answer, a random local session identifier, and an expiry timestamp, and deletes the upstream session on stop, expiry (five minutes), or server shutdown when possible.
- Do not record, take a snapshot, capture a frame, export a HAR, or save/forward any live media. Do not crop, cover, blur, recolor, or otherwise alter Ring's mandatory watermark. The app has no recording, frame-capture, snapshot, or media-storage path; the human review must not add one.
- This WHEP display is Playground simulation evidence only. It does not verify an event webhook, Event History schema, History ingestion, Sync, a real Ring device, production readiness, certification, or submission eligibility. History and Sync remain disabled without a real redacted probe report reviewed by the owner.

## Exact review steps

1. Start from the owner's independent clean clone and verify the expected branch/revision before making local changes. Do not use this workspace's installed `.env`, database, or test artifacts as owner evidence.
2. Copy the example environment file to the ignored root `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`). Set a fresh local `SESSION_SECRET`, `RING_EVENT_SOURCE=ring_playground`, and a short-lived `RING_ACCESS_TOKEN` generated in the official Playground. Leave `RING_HISTORY_DEVICE_ID` unset for this first review. Do not enable History polling.
3. Install and start locally (`npm ci`, then `npm run dev`). Use a local browser and the owner-controlled test account. Never place a Ring credential in a Vite/client variable or browser storage.
4. Open **Integrations → Ring Developer Playground**. Verify that the token status is server-side and that the page does not show the token. Use **Verify Playground API access** or **Refresh device list**. Record only the safe device-count summary and check timestamp; do not copy device IDs into the review notes.
5. Select one device returned by the latest list. Confirm the in-memory selection display updates. The WHEP control must remain disabled until a device is selected and `RING_EVENT_SOURCE=ring_playground` plus the token are available.
6. Start **Playground simulation · Receive-only live view**. Confirm that the displayed image is the official Playground simulation, that the watermark is visible and unaltered, and that the video is not cropped by the UI. Confirm there is no audio-send path, recording control, screenshot/snapshot control, or frame-saving behavior. If the official WHEP response fails or is ambiguous, stop and record a failure; do not improvise a response shape or use a real camera.
7. Stop the view. Confirm the video element clears and the page reports that the session was closed. If reviewing cleanup behavior, use the automated expiry/shutdown tests as evidence; do not leave an owner session running. The app's server session expires after five minutes even if the browser is closed unexpectedly.
8. Open **Event inbox**. Confirm its Playground notice says simulation data is not live Ring activity. Confirm starting/stopping WHEP does not add an inbox event. The live-view stream is never transformed into an event or image record.
9. Confirm the Event History schema is still “Not yet verified” and **Sync from Ring** remains blocked. Do not request History or enable ingestion as part of this visual review.
10. For the owner's required UI screenshots, first stop the video and confirm the video area is blank/stopped. Capture only the surrounding UI; exclude tokens, device IDs, personal data, live media, and browser/network diagnostics. Do not capture a frame, a playing stream, an SDP body, an ICE candidate, or a HAR.
11. Close the browser tab, stop the local server, and remove the test token from the ignored `.env` when no longer needed. Review any screenshot locally before deciding whether it may be shared.

## Record the result

The owner should fill this in after the manual review. Do not pre-fill a pass or attach fabricated images.

- Reviewer and review date/time:
- Clean-clone revision and OS/browser version:
- Playground-only device used (describe without copying its opaque ID):
- Devices list and selection: pass / fail (notes):
- WHEP receive-only video and unaltered watermark: pass / fail / not available (notes):
- Stop/delete and blank video area: pass / fail (notes):
- Inbox unchanged by WHEP; Playground labels remain simulated: pass / fail (notes):
- History schema/Sync still blocked: pass / fail (notes):
- Screenshot files (UI only, stopped state; no media/secrets):
- Any unexpected request, display, or data retention (stop and investigate):
