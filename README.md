# Healthcare Appointment & Follow-up Manager

A full-stack clinic platform (MERN) with separate patient, doctor, and admin
portals. Patients book appointments and submit symptoms in advance, doctors
get an AI-generated pre-visit summary, patients get an AI-generated
post-visit summary, and both sides are kept in sync via email and Google
Calendar.

## Tech Stack

- **Frontend:** React 18 (Vite), React Router, Axios
- **Backend:** Node.js, Express
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT, role-based (`patient` / `doctor` / `admin`)
- **LLM:** Pluggable provider — `mock` (default, deterministic, no API key
  needed) / `anthropic` / `openai`
- **Email:** Nodemailer — `mock` (console logging, default) / `smtp`
  (SendGrid, Mailgun, etc.)
- **Calendar:** Google Calendar API via OAuth 2.0 — `mock` (default) /
  `google`
- **Background jobs:** `node-cron` for medication reminders, appointment
  reminders, and email retries

The whole app runs out of the box with **zero external API keys** because
LLM, Email, and Calendar all default to safe mock providers that exercise
the full code path (including data persistence) without making real network
calls. Flip one env var per integration to go live.

---

## Project Structure

```
healthcare-appointment-manager/
├── backend/
│   ├── server.js                 # Express app entrypoint
│   ├── src/
│   │   ├── config/db.js          # Mongo connection
│   │   ├── models/                # Mongoose schemas
│   │   ├── controllers/           # Route handlers
│   │   ├── routes/                 # Express routers
│   │   ├── middleware/             # auth, error handling
│   │   ├── services/               # llm, email, calendar, slot logic
│   │   ├── jobs/                    # cron jobs
│   │   └── utils/                   # slot generation, seed script
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/patient/, doctor/, admin/
│   │   ├── components/
│   │   ├── context/AuthContext.jsx
│   │   └── api/axios.js
│   └── .env.example
├── README.md
└── SYSTEM_DESIGN.md
```

---

## Setup Guide

### Prerequisites

- Node.js 18+
- MongoDB running locally (`mongodb://localhost:27017`) or a MongoDB Atlas
  connection string

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed     # creates demo admin, 2 doctors, 1 patient (see below)
npm run dev       # starts on http://localhost:5000
```

Demo accounts created by `npm run seed`:

| Role    | Email                        | Password   |
|---------|-------------------------------|------------|
| Admin   | admin@clinic.test             | admin123   |
| Doctor  | asha.mehta@clinic.test        | doctor123  |
| Doctor  | rohan.iyer@clinic.test        | doctor123  |
| Patient | priya.sharma@example.test     | patient123 |

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev       # starts on http://localhost:5173
```

Open `http://localhost:5173`, log in with one of the demo accounts above.

### 3. Try the flow

1. Log in as the patient → **Find a Doctor** → search "Cardiology" → **Book
   Appointment** → pick a date/slot → fill in symptoms → confirm.
2. Log in as `asha.mehta@clinic.test` → **My Schedule** → see the AI
   pre-visit summary → **Complete Visit** → enter notes + prescription →
   see the AI-generated patient-friendly summary.
3. Log in as the patient again → **My Appointments** → view the post-visit
   summary and prescription.
4. Log in as admin → **Manage Doctors** → mark a doctor on leave for a date
   that has bookings → see the affected appointment auto-cancel and a
   notification get queued.

---

## Environment Variables

See `backend/.env.example` and `frontend/.env.example` for the full list.
Key toggles:

| Variable | Values | Effect |
|---|---|---|
| `LLM_PROVIDER` | `mock` / `anthropic` / `openai` | Which service generates pre/post-visit summaries |
| `EMAIL_PROVIDER` | `mock` / `smtp` | `mock` logs emails to console; `smtp` sends via Nodemailer |
| `CALENDAR_PROVIDER` | `mock` / `google` | `mock` returns fake event IDs; `google` hits the real Calendar API |

Switching any of these to "real" requires filling in the corresponding
credentials (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `SMTP_*`,
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) — no code changes needed.

---

## Google Calendar Setup (OAuth 2.0)

To go beyond the mock calendar provider:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   a project (or reuse one).
2. Enable the **Google Calendar API** under "APIs & Services > Library".
3. Under "APIs & Services > Credentials", create an **OAuth 2.0 Client ID**
   (Application type: Web application).
4. Add an authorized redirect URI matching `GOOGLE_REDIRECT_URI` in your
   `.env`, e.g. `http://localhost:5000/api/calendar/google/callback`.
5. Copy the generated **Client ID** and **Client Secret** into
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `backend/.env`.
6. Set `CALENDAR_PROVIDER=google`.
7. In the app, a logged-in user hits `GET /api/calendar/google/auth-url` to
   get a consent URL, is redirected to Google, grants access, and Google
   redirects back to `/api/calendar/google/callback`, which stores their
   `access_token`/`refresh_token` on their `User` document. From then on,
   booking/cancelling appointments creates/updates/deletes events on their
   primary calendar automatically.

While in `mock` mode, calendar event IDs are still generated and stored on
the appointment (as `mock-event-...` strings) so the rest of the booking
flow — and the UI that displays "calendar invite sent" — behaves exactly as
it would in production.

---

## LLM Prompts (as specified, used verbatim in `services/llmService.js`)

**Pre-visit summary** (run when a patient submits their symptom form):

```
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>
```

**Post-visit summary** (run when a doctor submits clinical notes +
prescription):

```
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>
```

Both prompts are wrapped with an instruction to respond in strict JSON so
the backend can parse and persist structured fields
(`urgencyLevel`, `chiefComplaint`, `suggestedQuestions` /
`summaryText`, `medicationSchedule`, `followUpSteps`) rather than free text.

**Failure handling:** every LLM call goes through a retry-with-backoff
wrapper (`LLM_MAX_RETRIES`, default 2) and a hard timeout
(`LLM_TIMEOUT_MS`, default 8s). If all retries fail, the service returns a
structured `{ status: 'failed', errorMessage }` object instead of throwing.
The booking/visit-completion flow always proceeds — the appointment is
still created/completed, and the UI falls back to showing the raw
symptoms/notes with a "summary unavailable" note instead of blocking the
user. Urgency defaults to `Medium` (not `Low`) on failure, so a symptom
that couldn't be triaged is never silently deprioritized.

---

## Database Schema (MongoDB / Mongoose)

### `User`
| Field | Type | Notes |
|---|---|---|
| name, email, password (hashed), phone | String | |
| role | enum: patient / doctor / admin | |
| doctorProfile | ObjectId → DoctorProfile | only for doctors |
| googleTokens | { access_token, refresh_token, expiry_date } | per-user OAuth |
| isActive | Boolean | |

### `DoctorProfile`
| Field | Type | Notes |
|---|---|---|
| user | ObjectId → User | 1:1, unique |
| specialisation | String | indexed for search |
| slotDurationMinutes | Number | e.g. 30 |
| workingHours | [{ day (0-6), startTime, endTime }] | recurring weekly |
| leaveDays | [{ date, reason, notifiedPatients }] | one-off leave |
| consultationFee | Number | |

### `Appointment`
| Field | Type | Notes |
|---|---|---|
| patient, doctor | ObjectId → User | |
| doctorProfile | ObjectId → DoctorProfile | |
| date, startTime, endTime | String | `YYYY-MM-DD`, `HH:mm` |
| status | enum: booked / completed / cancelled / cancelled_by_leave / no_show | |
| symptomForm | { rawSymptoms, llmSummary: {...} } | pre-visit |
| postVisit | { clinicalNotes, prescription[], followUp, llmPatientSummary: {...} } | post-visit |
| calendarEvents | { patientEventId, doctorEventId } | |
| notifications | { bookingConfirmationSent, reminderSent, cancellationSent } | |

**Unique index:** `{ doctor, date, startTime }` with a partial filter on
`status: { $in: ['booked', 'completed'] }` — this is the core double-booking
guard (see `SYSTEM_DESIGN.md`).

### `SlotHold`
Short-lived hold created when a patient picks a slot, before they finish
the symptom form. Unique index on `{ doctor, date, startTime }` plus a TTL
index on `expiresAt` (auto-deleted by MongoDB after `SLOT_HOLD_TTL_SECONDS`,
default 300s).

### `Notification`
Durable outbound-email queue: every email is written here first
(`status: pending`), then an immediate send is attempted. Failures are
retried by a background job with exponential backoff up to `maxAttempts`.

---

## API Reference

Base URL: `http://localhost:5000/api`. All routes except
`/auth/register` and `/auth/login` require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Patient self-registration |
| POST | `/auth/login` | public | Returns JWT + user |
| GET | `/auth/me` | any | Current user + doctor profile if applicable |

### Doctors
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/doctors?specialisation=` | any | Search/list doctors |
| GET | `/doctors/:profileId` | any | Doctor details |
| GET | `/doctors/:profileId/availability?date=YYYY-MM-DD` | any | Free slots for a date |

### Appointments
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/appointments/hold` | patient | Step 1: temporarily hold a slot |
| DELETE | `/appointments/hold/:holdId` | patient | Release a hold (abandon flow) |
| POST | `/appointments/confirm` | patient | Step 2: submit symptoms, finalize booking |
| GET | `/appointments/mine?date=&status=` | patient/doctor | My bookings / my schedule |
| GET | `/appointments/:id` | owner/admin | Appointment detail |
| PATCH | `/appointments/:id/cancel` | owner/admin | Cancel + notify + remove calendar events |
| POST | `/appointments/:id/post-visit` | doctor | Submit notes + prescription, triggers LLM summary |

### Admin
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/admin/doctors` | admin | Create doctor (User + DoctorProfile) |
| GET | `/admin/doctors` | admin | List all doctors |
| PUT | `/admin/doctors/:profileId` | admin | Update profile/working hours |
| POST | `/admin/doctors/:profileId/leave` | admin | Add leave day; cancels + notifies conflicts |
| DELETE | `/admin/doctors/:profileId/leave/:date` | admin | Remove leave day |
| PATCH | `/admin/doctors/:profileId/deactivate` | admin | Activate/deactivate doctor |

### Calendar
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/calendar/google/auth-url` | any | Get Google OAuth consent URL |
| GET | `/calendar/google/callback` | public | OAuth redirect target |

---

## Background Jobs

| Job | Schedule (default) | Purpose |
|---|---|---|
| `emailRetryJob` | every 5 min | Retries pending/failed notifications with backoff; also queues 24h-ahead appointment reminders |
| `medicationReminderJob` | every 30 min | Computes which prescribed doses are due and queues reminder emails, deduped per hour bucket |

Slot holds don't need a cleanup job — MongoDB's TTL index deletes expired
`SlotHold` documents automatically.

---

## Deliverable Notes

- This repo is provided as source code you run locally (`npm run dev` in
  both `backend/` and `frontend/`). To deploy, `backend/` can go on Render
  or Railway (set env vars from `.env.example`, use a MongoDB Atlas URI),
  and `frontend/` on Vercel or Netlify (`vite build`, set
  `VITE_API_BASE_URL` to your deployed backend URL).
- See `SYSTEM_DESIGN.md` for the write-up on double-booking prevention,
  leave conflict handling, slot hold mechanism, and notification
  reliability.
