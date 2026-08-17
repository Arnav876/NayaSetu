# NyayaSetu (न्यायसेतु)
> **SIH Hackathon Pitch**: "NyayaSetu ensures that no undertrial's legal journey gets lost between the prison, lawyer, legal-aid authority and court."

NyayaSetu is a secure, AI-assisted **Undertrial Justice Coordination & Early-Action Platform**. It acts as a coordination, notification, and analytics layer sitting on top of existing judicial/custodial records, driving access-to-justice rather than surveillance.

---

## 🏗️ Architecture & Tech Stack

- **Frontend**: React (v19) + TypeScript + Tailwind CSS (vanilla-styled glassmorphic panels) + Lucide Icons + Recharts (for systemic delay dashboards).
- **Backend**: Node.js (Express) with ESModule routing and CommonJS scopes.
- **Database**: PostgreSQL-equivalent relational model implemented with Node's native zero-dependency **`node:sqlite`** (available in Node 22.5+), ensuring stable execution on Windows with zero local database daemon configuration.
- **Security & Cryptography**: Native Node.js `crypto` PBKDF2 SHA512 hashing (no binary `bcrypt` build requirements) and JWT tokens.
- **Voice Q&A & Voice Check-In**: Frontend integration via the browser's native **Web Speech API** (`SpeechRecognition` & `SpeechSynthesis`) for offline multilingual voice operation.

---

## 🔌 Simulated Integration Boundaries (Mock vs. Real)

To ensure this prototype remains realistic yet deployable as a standalone demo:
- **e-Prisons / ICJS Systems**: Simulated via an Express middleware route `/api/mock-egov/sync`. It simulates database syncing, returns JSON payloads, logs audit logs, and adds latency.
- **NALSA / DLSA Roster**: Populated with a comprehensive seeding script (`server/seed.js`) generating 10–20 realistic mock undertrials capturing various procedural delays (missing lawyers, detention half-terms, scheduling gaps).
- **OCR / PDF Legal Summarizer**: Simulated via a predefined keywords analyzer. Uploading remand orders, bail petitions, or charge sheets extracts real text, creates plain-language summaries, and outputs editable structures for human confirmation.

---

## 🛡️ Security & Auditing Model

1. **Role-Based Access Control (RBAC)**: Enforced via Express middleware `requireRole(['role_name'])` validating signed JWT payloads. Available roles:
   - `prison_official`: Views rosters, inputs rehabilitation check-ins, tracks trial production schedules.
   - `dlsa_officer`: Assigns legal-aid panel counsel, evaluates UTRC release queues, views Delay Radar.
   - `lawyer`: Manages assigned clients, uploads orders, manages hearings.
   - `prisoner`: Accesses read-only personal timelines, submits legal aid request forms, chats with scoped QA bot.
   - `family_member`: Views general status only (charges, sections, and lawyer logs are masked).
   - `admin`: Full system oversight, reviews security audit trails.
2. **Data Minimization**: Programmatically implemented in backend controllers. Sensitive details (e.g., offense sections, lawyer notes, case sections) are deleted before JSON serialization when accessed by a `family_member` role.
3. **Security Audit Trails**: Every sensitive action (login, record view, lawyer assignment, AI document commit, chatbot query) is logged in the `audit_logs` table documenting operator ID, action details, record ID, and accessed fields.

---

## 🚀 How to Run the Prototype

### 1. Prerequisite
Ensure you have **Node.js v24** installed.

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize & Seed Database
Initialize the SQLite schema and seed mock case data:
```bash
node server/seed.js
```

### 4. Run Automated Verification Tests
Run the security and integration checks (testing RBAC blocking, data minimization, and chatbot guardrails):
```bash
node server/test.js
```

### 5. Start Frontend & Backend
Run the development environment (concurrently launches Express on `localhost:5000` and Vite on `localhost:5173`):
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your web browser.
