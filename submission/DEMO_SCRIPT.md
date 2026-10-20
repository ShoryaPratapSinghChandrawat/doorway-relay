# Doorway Relay — Truthful Video Demo Script & Recording Instructions

> **Target Video Length:** Under 2 minutes 50 seconds (< 2:50)  
> **Status:** Script and shot list prepared; recording & YouTube/Vimeo upload **PENDING — owner to add**.  
> **Platform Rule:** English narration; no unauthorized music or third-party trademarks; strict provenance honesty.

---

## 1. Owner Screen Capture Instructions

1. **Resolution & Environment:**  
   - Record in **1080p (1920x1080)** at 30 or 60 FPS using OBS Studio, QuickTime, or Windows Game Bar / Snipping Tool.
   - Use a clean browser profile with bookmarks bar hidden and dark mode enabled.
2. **Privacy & Redaction Safeguards:**  
   - **NEVER** display `.env`, access tokens, client secrets, API keys, personal emails, or private network paths on screen.
   - Clear or crop shell history before recording so prior directory paths or credentials are not visible.
3. **Audio & Narration:**  
   - Clear, spoken English narration following the timed shot breakdown below.
   - Do **NOT** use copyrighted background music. If background audio is desired, use royalty-free instrumental music at low volume (-20 dB).
4. **Post-Recording & Upload:**  
   - Upload to **YouTube** or **Vimeo** with visibility set strictly to **PUBLIC** (unlisted videos may disqualify or cause judging friction).
   - Video Title: `Doorway Relay — Amazon Developer Hackathon (Ring Track)`
   - Video Description: Include the repository URL (`https://github.com/ShoryaPratapSinghChandrawat/doorway-relay`) and a summary of the project.
   - Paste the public URL into `submission/DEVPOST_PASTE_READY.md`.

---

## 2. Shot List & Timed Script (< 2:50 total)

| Timestamp | Visual on Screen | Spoken English Narration | Provenance Notes |
|---|---|---|---|
| **0:00 – 0:20** (20s) | Title card or clean browser overview showing Doorway Relay at `localhost:5173`. | *"Welcome to Doorway Relay. For families, caregivers, and shared spaces, smart doorbell notifications often cause diffusion of responsibility: everyone assumes someone else is answering. Doorway Relay bridges the gap by turning door alerts into accountable, auditable handoffs."* | Overview of the core problem. |
| **0:20 – 0:40** (20s) | Terminal showing `npm run dev`, then logging into `http://localhost:5173` with seeded demo account (`demo@doorway.local`). | *"We start our local application server running on Node 22 and SQLite. Signing in with our seeded demo credentials, we reach the main dashboard. Notice that all demonstration fixtures are clearly marked 'Synthetic demo data'."* | Seeded data highlighted (`isSynthetic: 1`). |
| **0:40 – 1:05** (25s) | Side-by-side terminal: execute `npm run simulate:ring button_press`. Browser Inbox updates instantly. | *"In our terminal, we trigger our local Ring-shaped simulator. The server verifies the HMAC-SHA256 signature and ingests the doorbell press into our neutral inbox. Notice the badge: 'Local · Simulated'. It is cryptographically verified with our local test key, clearly distinguishing it from live Ring hardware."* | Local simulation (`ring_simulated`). |
| **1:05 – 1:40** (35s) | Click on the inbox event. Form opens: categorize as `visitor`, set priority to `high`, summary `Visitor at front entrance`. Click Create. In Handoffs, click **Claim Task**, then **Acknowledge**, and finally **Resolve** with note *"Visitor greeted and assisted"*. Show Activity Log. | *"In the inbox, we review the event and classify it into a handoff. It enters state 'new'. A team member claims the task, transitioning it to 'assigned', and acknowledges responsibility. Finally, when the visitor is met, the handoff is resolved with an explicit completion note. Every transition is immutably logged in our SQLite activity timeline."* | Full lifecycle progression. |
| **1:40 – 2:05** (25s) | Navigate to the **Integration** page. Show connection status cards: Ring Partner Webhook, Developer Playground, and Token Exchange. | *"Navigating to the Integration dashboard, we inspect the status of our external adapters. The local simulator status is verified. The official Ring Token Exchange is intentionally kept fail-closed because its inbound callback schema is unpublished. Similarly, Event History sync remains disabled until a real redacted probe report is reviewed."* | Honest architectural boundaries. |
| **2:05 – 2:30** (25s) | *(Conditional)* If owner has a live Playground token in local `.env`: Click **Verify Playground API access** &rarr; list devices &rarr; start Live View with watermark &rarr; Stop. <br>*(Fallback)* If no token: Show the device selection UI with mocked fixture and explain receive-only WHEP architecture. | *"Here we verify access to the Ring Developer Playground API. Our server extracts only bounded, opaque device IDs. Opening the receive-only WHEP live view, WebRTC streaming starts directly in the browser while credentials remain secure on the server, keeping Ring's mandatory watermark fully visible. No video is recorded or stored."* | Ring Playground & WHEP. |
| **2:30 – 2:48** (18s) | Return to dashboard overview showing resolved counts, refresh browser to prove SQLite persistence. | *"Refreshing the application confirms that all handoff states and audit trails persisted across reloads in SQLite. Doorway Relay: bringing accountability and trust to entrance events. Thank you."* | Persistence & closing. |

---

## 3. Mandatory Provenance Disclosures in Video

1. **Synthetic Seed Data:** Clearly say *"These sample rows are marked Synthetic demo data."*
2. **Local Simulator:** Clearly say *"The local signed fixture is marked Local · Simulated; it is generated by our local CLI test tool and is not issued by Ring."*
3. **Playground vs Live:** Clearly state whether the WHEP video is running against Ring's Developer Playground sandbox. Never claim that the local test fixture represents live Ring hardware.
