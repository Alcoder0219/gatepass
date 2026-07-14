# GatePass Pro

**Enterprise Gate Pass Management System** — MERN stack, production-ready.

One company, many units. An employee raises a gate pass; it routes to their reporting
manager, then to HR, then to the security desk, where a guard scans a QR code and records
the actual exit and return. Every action is audited. Every role sees exactly — and only —
the data it is entitled to.

---

## Table of contents

- [The workflow](#the-workflow)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Architecture](#architecture)
- [The permission model](#the-permission-model)
- [Environment variables](#environment-variables)
- [Docker deployment](#docker-deployment)
- [API reference](#api-reference)
- [Project structure](#project-structure)

---

## The workflow

```
  EMPLOYEE            MANAGER              HR                SECURITY
 ─────────────────────────────────────────────────────────────────────────
  Raise pass  ──▶  PENDING
                      │
                      ├── Reject ─────────▶ REJECTED  (terminal)
                      │
                      ├── Request changes ─▶ CHANGES_REQUESTED
                      │                          │
                      │   ◀── resubmit ──────────┘
                      │
                      └── Approve ────────▶ HR_REVIEW
                                               │
                                               ├── Not OK ──▶ back to PENDING
                                               │
                                               └── OK ──────▶ APPROVED  ──┐
                                                              (QR minted)  │
                                                                           ▼
                                                              Scan QR ▸ Mark Exit
                                                                           │
                                                                          OUT
                                                                           │
                                                              Scan QR ▸ Mark Return
                                                                           │
                                                                      COMPLETED
```

Every stage is configurable. Turn off `hrReviewRequired` in Settings and an approved pass
goes straight to Security. Turn off `approvalRequired` and it is born approved. The
transition table in `backend/src/constants/index.js` is the single source of truth, and
`gatepass.service.js` refuses any move that is not in it.

**A gate pass always belongs to the logged-in employee.** The identity fields (name, code,
department, unit, reporting manager) are taken from the session on the server — the client
cannot name someone else, even by forging the request body.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Framer Motion, React Query, React Hook Form + Zod, Recharts, Socket.io client, Lucide |
| Backend | Node 20, Express, MongoDB, Mongoose, JWT + refresh rotation, Multer, Nodemailer, Socket.io, Winston |
| Infra | Docker Compose, nginx, MongoDB 7 |

---

## Quick start

**Prerequisites:** Node 20+, and MongoDB (or Docker).

```bash
# 1 — MongoDB (skip if you already run one locally)
docker run -d --name gatepass-mongo -p 27017:27017 -v gatepass-mongo-data:/data/db mongo:7

# 2 — API
cd backend
cp .env.example .env          # works as-is for local development
npm install
npm run seed                  # units, departments, roles, users, 42 demo passes
npm run dev                   # → http://localhost:5000/api/v1

# 3 — Web  (a second terminal)
cd frontend
npm install
npm run dev                   # → http://localhost:5173
```

Open <http://localhost:5173> and sign in with any account below.

> **Email:** with `SMTP_HOST` blank (the default), emails are logged to the console instead
> of being sent. The whole app runs with zero external services.

---

## Demo accounts

All seeded accounts share the password **`Passw0rd@123`**.

| Email | Role | Sees |
|---|---|---|
| `superadmin@gatepasspro.io` | Super Admin | Everything, including role management |
| `admin@gatepasspro.io` | Admin | Everything |
| `hr@gatepasspro.io` | HR | Every pass that has cleared its manager |
| `security@gatepasspro.io` | Security | **Approved passes only** |
| `hod.manesar@gatepasspro.io` | HOD (Manager) | Only their own reportees' passes |
| `rohit.verma@gatepasspro.io` | Employee | Only their own passes |

**To watch the full workflow:** sign in as `rohit.verma@` and raise a pass → sign in as
`hod.manesar@` and approve it → `hr@` and review it OK → `security@` and scan/mark exit,
then mark return. The pass lands in COMPLETED with a full audit trail.

---

## Architecture

```
gatepass/
├── backend/
│   └── src/
│       ├── config/         env + database + logger wiring
│       ├── constants/      ◀ THE CONTRACT: roles, permissions, statuses, transitions
│       ├── models/         12 Mongoose collections
│       ├── controllers/    thin — load, authorize, delegate, respond
│       ├── services/       ◀ THE LOGIC: gatepass workflow, scope, settings, notify, audit
│       ├── middlewares/    auth, rbac, validate (zod), upload (multer), error
│       ├── validators/     zod schemas per module
│       ├── routes/         15 route modules
│       ├── helpers/        gate pass numbering, QR, email templates
│       ├── jobs/           expiry + reminder sweep
│       └── seeds/          idempotent seeder
└── frontend/
    └── src/
        ├── components/ui/  the design system — Button, Card, Table, Modal, …
        ├── components/     gatepass/, charts/, security/, common/
        ├── pages/          one folder per module
        ├── layouts/        DashboardLayout (sidebar + topbar), AuthLayout
        ├── contexts/       Auth, Theme, Socket
        ├── permissions/    usePermissions(), <Can>, the mirrored catalogue
        ├── services/       axios client + typed endpoints
        ├── hooks/          filters, debounce, gate pass actions
        ├── animations/     shared Framer Motion variants
        └── routes/         router + permission-derived navigation
```

**Two files carry most of the design weight:**

- `backend/src/services/gatepass.service.js` — the workflow engine. Every status change,
  notification, audit write and QR mint happens here. Controllers never re-implement it.
- `backend/src/services/scope.service.js` — the data-restriction chokepoint. Every list and
  read query is intersected with `buildGatePassScope(user)`. That is why an employee cannot
  see a colleague's pass and a guard cannot see anything still awaiting approval.

---

## The permission model

Roles are **dynamic** — an admin can create new ones at runtime from the Roles screen. A
role is a flat list of `module.action` permissions plus a **data scope**:

| Scope | The user may read |
|---|---|
| `OWN` | Only records they created |
| `DEPARTMENT` | Their department's records |
| `REPORTEES` | Records of people reporting to them (+ their own) |
| `UNIT` | Everything in their unit |
| `ALL` | Everything |

Permissions gate *actions*; the data scope gates *rows*. Both are enforced server-side.
The frontend mirrors the vocabulary in `frontend/src/permissions/constants.ts` — but only
to decide what to **render**. A hidden button is a UX affordance, not a security control.

The sidebar is **derived**, never hardcoded per role: each nav entry declares the
permissions that reveal it. Grant a permission, and the navigation appears — no code change.

---

## Environment variables

`backend/.env` (copy from `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5000` | |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/gatepass_pro` | **Required** |
| `JWT_ACCESS_SECRET` | — | **Required.** Change in production. |
| `JWT_REFRESH_SECRET` | — | **Required.** Change in production. |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | `30d` when "remember me" is ticked |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin + email deep links |
| `SMTP_HOST` | *(blank)* | **Blank = emails print to the console** |
| `MAX_FILE_SIZE_MB` | `5` | |
| `SEED_DEFAULT_PASSWORD` | `Passw0rd@123` | |

`frontend/.env` (optional): `VITE_API_URL` (default `/api/v1`, proxied by Vite in dev).

---

## Docker deployment

```bash
cat > .env <<'EOF'
JWT_ACCESS_SECRET=<a long random string>
JWT_REFRESH_SECRET=<a different long random string>
CLIENT_URL=http://localhost:8080
EOF

docker compose up -d --build
docker compose exec api npm run seed     # first boot only
```

- Web → <http://localhost:8080>
- API → <http://localhost:5000/api/v1>

nginx serves the built SPA and proxies `/api`, `/uploads` and `/socket.io` to the API
container. The API runs as a non-root user; uploads and logs are on named volumes.

**Before going to production:** set strong JWT secrets, put TLS in front of nginx, configure
real SMTP, and set `JOBS_ENABLED=false` on every API replica but one (the expiry sweep is
in-process and should not run concurrently).

---

## API reference

Base URL: `/api/v1`. All routes except `/auth/*` require `Authorization: Bearer <token>`.
Every response is `{ success, message, data, meta? }`.

<details>
<summary><b>Auth</b></summary>

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Sign in; sets the refresh cookie |
| POST | `/auth/refresh` | Rotate the refresh token, mint a new access token |
| POST | `/auth/logout` | Revoke the current session |
| POST | `/auth/forgot-password` | Email a reset link |
| POST | `/auth/reset-password` | Consume the reset token |
| POST | `/auth/send-otp` · `/auth/verify-otp` | One-time-code sign-in |
| GET/PATCH | `/auth/me` | Current user; update own profile |
| PATCH | `/auth/me/password` | Change own password |
| POST | `/auth/me/avatar` | Upload avatar |
</details>

<details>
<summary><b>Gate passes</b></summary>

| Method | Path | Permission |
|---|---|---|
| POST | `/gate-passes` | `gatepass.create` |
| GET | `/gate-passes/prefill` | — (auto-fill + quota for the form) |
| GET | `/gate-passes` · `/mine` · `/pending-approval` · `/stats` | scoped |
| GET | `/gate-passes/:id` · `/:id/qr` · `/:id/print` | scoped |
| PATCH | `/gate-passes/:id` | `gatepass.update` |
| POST | `/gate-passes/:id/approve` | `gatepass.approve` |
| POST | `/gate-passes/:id/reject` | `gatepass.reject` |
| POST | `/gate-passes/:id/request-changes` | `gatepass.request_changes` |
| POST | `/gate-passes/:id/cancel` | `gatepass.cancel` |
| DELETE | `/gate-passes/:id` | `gatepass.delete` |
</details>

<details>
<summary><b>HR · Security · Dashboard · Reports · Admin</b></summary>

| Method | Path | Permission |
|---|---|---|
| GET | `/hr/queue` · `/hr/reviews` · `/hr/stats` | `hr.review_view` |
| POST | `/hr/:id/review` | `hr.review` |
| GET | `/security/queue` · `/out` · `/history` · `/stats` | `security.access` |
| POST | `/security/verify` | `security.scan` |
| POST | `/security/:id/exit` · `/:id/return` | `security.mark_exit` / `mark_return` |
| GET | `/dashboard/stats` · `/charts` · `/activity` · `/insights` · `/calendar` | `dashboard.view` |
| GET | `/reports/summary` · `/gate-passes` · `/export?format=xlsx\|csv\|pdf` | `reports.view` / `reports.export` |
| GET | `/search?q=` | scoped, global |
| CRUD | `/users` · `/roles` · `/units` · `/departments` · `/holidays` | per-module |
| GET/PATCH | `/settings` | `settings.view` / `settings.update` |
| GET | `/audit-logs` | `audit.view` |
| GET/PATCH/DELETE | `/notifications` | own only |
</details>

---

## Project structure

Both apps ship with:

- **Error handling** — a global handler normalises Mongoose/JWT/Multer failures into one
  envelope; an `ErrorBoundary` catches render crashes on the client.
- **Validation** — Zod on both sides. The server's schemas *strip* unknown keys, which is
  what makes identity spoofing on gate pass creation structurally impossible.
- **Audit** — every login, approval, rejection, review, gate movement, settings change and
  export is written to `AuditLogs`, with a field-level diff on updates.
- **Real time** — Socket.io rooms per user, per role and per unit. An approval reaches the
  employee's browser and the guard's console without a refresh.
- **Rate limiting, Helmet, mongo-sanitize, bcrypt, hashed + rotated refresh tokens.**

---

Built with the MERN stack. Licensed for internal enterprise use.
