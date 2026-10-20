# Doorway Relay — Devpost Paste-Ready Submission Copy

> **Instructions for Project Owner:**  
> Use the exact content below to populate the Devpost submission form fields.  
> Fields labeled `PENDING — owner to add` must be finalized by you before clicking "Submit".

---

### Project Name
Doorway Relay

---

### Tagline
Accountable handoffs for door events and shared spaces

---

### Primary Track
Ring

---

### Mini Challenges
- **Open Source:** Selected (Code repository with open-source license, full source code, and reproduction steps).
- **AWS Builder:** *NOT SELECTED* (Doorway Relay uses a local Node.js/SQLite architecture and does not make runtime calls to AWS services; adhering strictly to hackathon submission rules, AWS Builder is not claimed).

---

### Description

#### Inspiration
In shared homes, assisted living facilities, and co-living cooperatives, a door alert is only half of the solution. When a smart doorbell rings or motion is detected, someone still needs to greet the visitor, bring in a delivery, or check an unlatched gate. In group spaces, notifications often result in diffusion of responsibility: everyone assumes someone else responded, or multiple people interrupt what they are doing. Doorway Relay bridges the gap between raw hardware event detection and human accountability.

#### What It Does
Doorway Relay transforms door events and manual tasks into structured, accountable handoffs:
- **Event Ingestion & Triage:** Doorbell presses and motion events arrive into an unassigned triage inbox. Events remain neutral until a workspace member reviews and classifies them.
- **Explicit Lifecycle State Machine:** Handoffs progress through strictly guarded transitions: `new` → `assigned` → `acknowledged` → `resolved` (with an optional `reopened` path). Acknowledgement acknowledges ownership but never resolves the task without explicit resolution notes.
- **Operational Health & Attention Triggers:** Automatically highlights tasks that are overdue or stalled (e.g., acknowledged for over 24 hours without progress).
- **Ring Developer Playground Integration:** Connects server-side to the Ring Developer Playground API (`/v1/devices`) to safely list devices and inspect device status using bounded opaque identifiers.
- **Server-Relayed Receive-Only WHEP Live View:** Provides an on-demand, WebRTC HTTP Egress Protocol (WHEP) live video viewer for the selected device. Access tokens remain server-side; video is displayed directly in-browser with mandatory Ring watermarks intact and zero media persistence or surveillance capture.

#### How We Built It
- **Frontend:** React 19, TypeScript, React Router 7, Vite 8, and Tailwind CSS 4. Built with keyboard navigation, WCAG high-contrast typography, and reduced-motion support.
- **Backend API:** Node.js 22, Express 5, and Zod schema validation. Employs Helmet security headers, signed HTTP-only session cookies, strict origin verification, and CSRF token enforcement on all state-changing endpoints.
- **Database & Persistence:** SQLite with `better-sqlite3`. Enforces foreign key constraints, idempotent migrations (versions 1–3), and append-only activity auditing.
- **Ring Integration:** Built against the official Ring Partner API contracts (`https://api.amazonvision.com`). Implements HMAC-SHA256 webhook signature verification, timing-safe equality comparisons, replay protection, AES-256-GCM token encryption with random IVs, and a receive-only WHEP relay.
- **Testing & Verification:** Comprehensive test suite written in Vitest (26 test files / 137 tests passing), testing hermetic offline behavior, fake-peer WebRTC connections, and full-stack workflow integration.

#### Challenges We Ran Into
1. **Unpublished Inbound Contracts:** While outgoing Ring OAuth token endpoints are documented, the inbound payload structure for partner Token Exchange and detailed Event History attributes for simulated Playground events are not publicly specified in API reference schemas. Rather than hallucinating mock formats, we engineered strict architectural fail-closed boundaries (HTTP 503 for Token Exchange; HTTP 409 for History Sync) until verified schemas are confirmed.
2. **Ephemeral Playground Credentials:** Ring Playground access tokens expire after approximately 30 minutes, requiring robust server-side identity synchronization and state reset whenever credentials rotate.
3. **Cross-Platform Native Modules:** Compiling native SQLite binaries on Windows systems without C++ build tools required utilizing prebuilt binaries and carefully structuring hermetic CLI tools.

#### Accomplishments That We're Proud Of
- **100% Provenance Honesty:** Every item in the UI is explicitly labeled with its exact origin (`manual`, `ring_simulated`, `ring_playground`, or `Synthetic demo data`). Synthetic generator data is never disguised as live Ring evidence.
- **Hermetic Engineering Discipline:** Zero hardcoded credentials or committed secrets. Production configurations fail closed if cryptographic keys are omitted.
- **Deterministic Audit Trail:** Every status change, assignment, acknowledgement, and resolution creates an immutable, timestamp-ordered activity log.

#### What We Learned
- How to structure clean WHEP streaming handshakes separating browser SDP gathering from server-side credential management.
- The importance of designing fail-safe systems for smart home automation where human accountability is as critical as device connectivity.

#### What's Next for Doorway Relay
- Incorporating official Ring Event History ingestion once the playground schema is finalized.
- Multi-household tenancy and role-based permissions for commercial caregiver facilities.
- Proactive escalation alerts (SMS/push) when handoffs remain stalled past configurable SLA thresholds.

---

### "New & Existing" Projects Disclosure
**How the project was significantly updated during the hackathon window:**  
[OWNER TO WRITE — REQUIRED BEFORE SUBMISSION]  
*Note for owner: Because the Git history shows an import commit (`919083e`) onto the initial base (`28f9d2f`), you must write your own specific explanation here describing how the project was created and/or significantly updated between August 31, 2026 and October 23, 2026.*

---

### Built With
- `react`
- `typescript`
- `vite`
- `tailwindcss`
- `express`
- `better-sqlite3`
- `zod`
- `vitest`
- `lucide-react`
- `helmet`
- `cookie`
- `ring-developer-playground-api`
- `whep-webrtc`

---

### Repository URL
https://github.com/ShoryaPratapSinghChandrawat/doorway-relay

---

### Project Website URL ("Try It" Link)
PENDING — owner to add

*(Note: Expected static showcase link upon owner enabling GitHub Actions Pages: `https://shoryapratapsinghchandrawat.github.io/doorway-relay/`)*

---

### Demo Video URL
PENDING — owner to add

*(Must be a public YouTube or Vimeo video under 3:00 showing functioning app with English narration).*

---

### Product Feedback ("Shape")

#### 1. Ring Developer Playground & APIs
- **What Worked Well:** The RESTful endpoints for `/v1/devices` provide clean separation of concerns. The WHEP live-view protocol is remarkably responsive and modern, offering a standard WebRTC mechanism that eliminates cumbersome legacy RTSP streaming.
- **What Needs Improvement:**
  - *Playground Token Lifetime:* A 30-minute token expiration makes automated integration testing and local developer workflows cumbersome. A 2-to-4 hour developer session token or automated CLI refresh token would dramatically improve the developer onboarding experience.
  - *Schema Documentation for Event History:* The public documentation lacks JSON schema specifications for historical event attributes (e.g., `ding` vs `motion` subtype fields). Documenting standard response envelopes would allow developers to parse event history confidently without exploratory reverse engineering.
  - *Token Exchange Contract:* The exact HTTP request body and headers expected when Ring posts an authorization code to a partner's token-exchange endpoint should be documented with concrete examples.
- **Onboarding Experience:** Clear layout on `developer.ring.com`, though navigation between the Appstore console and API docs can occasionally result in redirection loops.
- **Would You Build With Ring Again?** Yes. The breadth of Ring hardware in shared spaces creates tremendous potential for caregiving and operational software.

---

### Testing Instructions for Judges

Judges can run and test Doorway Relay locally in less than 3 minutes without needing Ring credentials. Pre-seeded synthetic data and a local Ring-shaped event simulator allow complete end-to-end evaluation.

#### Prerequisites
- **Node.js:** v22.12.0 – v22.x (Recommended: Node 22 LTS)
- **npm:** v10 or newer

#### 1. Clone & Install
```bash
git clone https://github.com/ShoryaPratapSinghChandrawat/doorway-relay.git
cd doorway-relay
npm ci --ignore-scripts
```
*(Note: `--ignore-scripts` uses the verified prebuilt `better-sqlite3` binary on Windows/macOS/Linux without requiring local C++ compilers).*

#### 2. Configure Local Environment
Create your local `.env` from the template:
```bash
# Windows PowerShell:
Copy-Item .env.example .env

# macOS / Linux:
cp .env.example .env
```
Generate random secrets (run this Node command and paste into `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `RING_SIMULATOR_HMAC_KEY` in `.env`):
```bash
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```
Set `DEMO_PASSWORD` in `.env` to any password of at least 12 characters (e.g. `LocalDemoPassword123!`).

#### 3. Initialize SQLite & Seed Demo Data
```bash
npm run db:migrate
npm run seed:demo
```
This initializes the database migrations and populates marked synthetic items for 3 workspace members.

#### 4. Start the Application
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser.

#### 5. Sign In & Explore
- **Email:** `demo@doorway.local`
- **Password:** The password you set in `DEMO_PASSWORD` (e.g. `LocalDemoPassword123!`)
- Observe the **Dashboard**, **Inbox**, **Handoffs**, and **Audit Activity Timeline**.

#### 6. Simulate a Ring Doorbell Event
In a second terminal window, run:
```bash
npm run simulate:ring
```
A button-press event will be cryptographically signed with your local HMAC key and delivered to the webhook endpoint. Return to the browser, open the **Inbox**, and observe the new item labeled **Local · Simulated**. Claim and resolve it to see the real-time state machine update!
