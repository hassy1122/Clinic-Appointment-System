# Clinic Appointment System

A single-clinic appointment booking platform: patients book real, live availability online; doctors manage their schedule and consultation notes; admins run the clinic — replacing phone-call booking and paper appointment books.

**Monorepo:** `client/` (React + Vite + Tailwind) · `server/` (Express + Prisma + PostgreSQL)

---

## Features

**Patients**
- Doctor directory with search & specialty filters
- Profile pages with working hours and fees
- Booking stepper: pick date → see only genuinely open slots → details → instant confirmation
- Reschedule / cancel (freed slots become bookable again immediately)
- Upcoming & past appointment history

**Doctors**
- Today's schedule, upcoming and past lists
- Mark visits completed / no-show
- Consultation notes with prescriptions — **encrypted at rest**, every read/write audited
- Weekly availability editor (windows, slot length, buffer) and time-off blocks

**Admins**
- Clinic-wide appointment table with search, status/date filters, pagination
- Doctor account management (invite links, activate/deactivate, edit profiles)
- Dashboard: today's numbers, upcoming load, 30-day no-show rate
- Audit log: who accessed which patient's medical notes, and when

**System**
- Booking confirmations + 24h/2h reminders delivered through a transactional outbox (MailHog locally, Resend in production)
- JWT auth (short-lived access token + rotating refresh token in an httpOnly cookie)
- Server-side RBAC on every endpoint — IDs can't be guessed into other people's data

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, TanStack Query |
| Backend | Node.js, Express 4, TypeScript, Zod validation |
| Database | PostgreSQL 16 (Docker) + Prisma ORM |
| Auth | JWT (access + refresh), bcryptjs |
| Email | SMTP → MailHog (dev), Resend API (production) |
| Tests | Vitest + Supertest (54 tests, including a concurrent double-booking race) |

---

## Quick start (local)

**Prerequisites:** Node 20+, Docker

```bash
# 1. Install dependencies (installs both workspaces)
npm install

# 2. Environment
cp .env.example .env
#    → edit secrets, or keep the dev defaults

# 3. Start Postgres + MailHog (email UI at http://localhost:8025)
docker compose up -d

# 4. Migrate + seed demo data
npm run db:migrate
npm run db:seed

# 5. Run both apps (API :4000, frontend :5173 with /api proxied)
npm run dev
```

Open http://localhost:5173

> **Port conflict?** If port 4000 is taken by another app, run the API on a different
> port (`set PORT=4100` on Windows / `PORT=4100` on macOS+Linux) and point the Vite
> proxy in `client/vite.config.ts` at the same port.

### Demo accounts (from `npm run db:seed`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@clinic.test` | `Admin1234!` |
| Patient | `sara@example.com` | `Patient1234!` |
| Patient | `omar@example.com` | `Patient1234!` |
| Doctor | `dr.ahmed@clinic.test` | `Doctor1234!` |
| Doctor | `dr.mariam@clinic.test` | `Doctor1234!` |

Doctor/admin accounts are **created by invitation only** (Admin → Doctors → *Create invite*).

---

## Tests & checks

```bash
npm run lint        # eslint (server) + oxlint (client)
npm run typecheck   # tsc for both workspaces
npm test            # vitest: slot engine, timezone, booking, RBAC, concurrency
```

The test suite runs against a separate `clinic_test` database (auto-created and migrated
by `server/tests/globalSetup.ts`), so your dev data is untouched.

Key guarantees proven by tests:
- **Double-booking is impossible** — 8 simultaneous bookings for one slot → exactly 1 wins
  (partial unique index `(doctorId, startsAt) WHERE status <> 'CANCELLED'` + atomic check-and-insert).
- **A patient cannot read another patient's appointments or notes via direct API calls.**
- **Notes are ciphertext in the database** and only readable by the treating doctor and the owning patient.
- Rescheduling releases the old slot and atomically claims the new one.

---

## How booking works

1. **Slots are computed, never stored.** For doctor + date: working windows ÷ (slot + buffer), minus existing active appointments, minus time-off blocks, minus past/lead-time entries.
2. **Display and validation share one code path** (`server/src/modules/appointments/slots.ts`) — the frontend never sees a slot the backend would reject.
3. **Booking is transactional.** The server re-validates inside the transaction; the DB's partial unique index is the race-proof backstop. A lost race returns `409 SLOT_TAKEN`.
4. **Cancel = free the slot instantly; reschedule = cancel + rebook** with a `rescheduledFromId` link preserving history.
5. **All times stored in UTC**, displayed in the clinic's timezone (`CLINIC_TZ`), with DST-correct conversion helpers.

---

## Security notes

- Role checks are enforced **server-side on every route**; the UI guards are cosmetic.
- Consultation notes and prescriptions: **AES-256-GCM field encryption** (`ENCRYPTION_KEY`).
- **Audit log** on every notes read/write and every admin change (visible in the UI).
- Refresh tokens are stored **hashed** and rotate on use; login is rate-limited.
- Admin accounts get **no access to medical notes** (least privilege).
- Signup captures explicit data-processing consent.
- TLS is terminated by the hosting platform (Vercel/Render) in production.

---

## Project structure

```
├── client/                  # React SPA
│   └── src/
│       ├── lib/             # api client (auto token refresh), types, date utils
│       ├── auth/            # AuthContext + route guards
│       ├── components/      # Layout, badges, feedback, confirm buttons
│       └── pages/           # public / patient / doctor / admin
├── server/
│   ├── prisma/              # schema, migrations, seed
│   │   └── migrations/      # incl. raw SQL for the partial unique index
│   ├── src/
│   │   ├── config/          # env validation (zod)
│   │   ├── lib/             # prisma, crypto, audit, mailer, notifications
│   │   ├── middleware/      # auth, rbac, validation, rate limits, errors
│   │   ├── modules/         # auth · doctors · appointments · notes · admin
│   │   ├── jobs/            # reminder/outbox delivery loop
│   │   └── utils/time.ts    # UTC ↔ clinic wall-clock (DST-safe)
│   └── tests/               # vitest + supertest suites
├── docker-compose.yml       # postgres + mailhog
├── vercel.json              # frontend deployment
└── render.yaml              # backend deployment
```

---

## Deployment

### 1. Backend → Render

1. Push this repo to GitHub.
2. Render → **New → Web Service** → pick the repo (Render auto-detects `render.yaml`).
3. Create a database (Render Postgres, Neon or Supabase) and set:
   - `DATABASE_URL` — your Postgres URL
   - `ENCRYPTION_KEY` — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — random ≥32 chars (Render can auto-generate)
   - `CLIENT_ORIGIN` — `https://<your-app>.vercel.app`
   - `RESEND_API_KEY` — (optional, for real email) `MAIL_TRANSPORT=provider` is preset
4. Deploy. `startCommand` runs `prisma migrate deploy` then starts the API.
   Health check: `GET /api/health`.

### 2. Frontend → Vercel

1. Vercel → **New Project** → import the same repo (root `vercel.json` handles the
   monorepo build: builds `client/`, outputs `client/dist`, SPA rewrites included).
2. Set environment variable:
   - `VITE_API_URL` = `https://<your-api>.onrender.com` (no trailing slash)
3. Deploy. Back on Render, set `CLIENT_ORIGIN` to the final Vercel domain (they match).

> Free tiers: Render web service sleeps after inactivity (first request wakes it, ~30s),
> Vercel serves the static frontend. Both are fine for demo/small-clinic use.

---

## Roadmap (from the blueprint)

- **Phase 3:** ratings & reviews, patient medical history view, waitlist for full slots, richer analytics
- **Phase 4:** telemedicine video links, online payments, WhatsApp reminders, live queue status
- **Phase 5:** multi-clinic platform (adds a `Clinic` tenancy layer + public search front-end)
