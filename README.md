# Intelligent Hybrid Queue Management System (IH-QMS)

Backend reference implementation for your specification: **unified queue**, **online vs walk-in capacity split**, **2:1 hybrid dispatch** (with walk-in backlog boost), **JWT + RBAC**, **SignalR** live updates, **EF Core** to **SQL Server** or **InMemory** (dev), optional **Python/scikit-learn** training skeleton.

## Solution layout

| Project | Responsibility |
|--------|----------------|
| `QMS.Domain` | Entities and enums (users, branches, services, bookings, queue entries, session logs). |
| `QMS.Application` | Pure logic: capacity engine, wait-time estimator, hybrid dispatch selector. |
| `QMS.Infrastructure` | EF Core `QmsDbContext`, in-memory dispatch round state (swap for Redis in production). |
| `QMS.Api` | REST API, SignalR `QueueHub`, `QmsQueueService`, **background late / no-show policy**. |
| `apps/customer` | **Expo (React Native)** — booking, walk-in, **SignalR live refresh**, optional **GPS check-in**, queue tracking. |
| `apps/staff-web` | **Vite + React + TypeScript** — teller deck & manager console, **SignalR** live KPIs and queues. |

## Run locally

### API (required first)

```bash
cd src/QMS.Api
dotnet run
```

Open Swagger at `http://localhost:5154/swagger` (see `Properties/launchSettings.json`).

The API enables **CORS** for local front-ends. Use the same host/port your apps call (defaults assume `http://127.0.0.1:5154`).

### Customer (Expo)

```bash
cd apps/customer
npm install   # first time only
cp .env.example .env   # optional: set EXPO_PUBLIC_API_URL to your PC's LAN IP for a physical device
npx expo start
```

Then press `i` / `a` / `w` for iOS simulator, Android emulator, or web. For **Android emulator** talking to the API on your machine, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:5154` in `.env`.

The customer app subscribes to **`/hubs/queue`** (works **with or without** a login token so **walk-in** tracking stays live). Grant **location** when prompted if you want **geofence check-in**; you can still check in without GPS (server only enforces geofence when coordinates are sent).

### Staff (Vite + TypeScript)

```bash
cd apps/staff-web
cp .env.example .env.local   # optional: override VITE_API_URL
npm install   # first time only
npm run dev
```

Default dev server: `http://localhost:5173`.

- **SignalR:** if the live log shows `Failed to complete negotiation` / `Failed to fetch`, the browser could not reach the API (server stopped, wrong host, or `VITE_API_URL` in `.env.local` not matching the API, e.g. `http://127.0.0.1:5154`). KPIs still refresh on the **8s poll**; fix the URL and reload.
- **Call next → Complete:** the API requires **Start service** before **End service**. The teller UI now **auto-starts** after a successful Call next; use **Start service** in the sidebar only if auto-start fails.

- **Teller / counter:** use a **Staff** row you created in SQL (or future admin tools) — same JWT flow as before once that user exists.
- **Branch manager:** same for a **Manager** role user on a branch.

- If `ConnectionStrings:Default` is **empty**, the API uses an **EF InMemory** database (good for demos).
- Set `ConnectionStrings:Default` to a **SQL Server** connection string to persist data; run `dotnet ef database update` if you add migrations (currently `EnsureCreated()` is used for quick start).

## Data (branches, staff, customers)

The API **does not** insert demo branches or demo users on startup. After `EnsureCreated`, tables are **empty** until you load data:

- **Branches / services / counters / staff:** use SQL scripts under `database/` (e.g. `schema.sql`, `insert-branches-*.sql`, `insert-service-types-all-branches.sql`) in SSMS or your pipeline, or add your own **admin/import** flow later.
- **Customers:** `POST /api/auth/register` (sends a verification code; sign-in still works with email/password if `EmailVerified` is false), or insert into `CUSTOMERS` with a valid password hash. Set `EmailVerified = 1` when you want the account treated as verified (e.g. scripted test users or after they complete OTP / link verification).

### Customer email verification (SMTP)

1. Run `database/add-customer-email-verification.sql` on your SQL Server if the database already existed before this feature (`EnsureCreated` only applies on empty databases).
2. Run `database/add-customer-password-reset.sql` if you need **forgot password** on an existing database (otherwise `EnsureCreated` on an empty DB picks up `schema.sql` / model changes when applicable).
3. Set **`PublicUrls:ApiPublicBaseUrl`** to the **public HTTPS URL** of this API for production (e.g. `https://api.yourdomain.com`). If you leave it empty, the API **infers** `http(s)://Host` from each incoming request (fine when your Expo app uses your PC’s **LAN IP** and port, e.g. `http://192.168.0.12:5154` — the verification link matches that host). For real users on the public internet, set the explicit HTTPS URL behind your reverse proxy.
4. Set **`Smtp`** (`Host`, `Port`, `UseStartTls`, `User`, `Password`, `FromEmail`, `FromName`) for real outbound mail. Port **587** + `UseStartTls: true` is typical; port **465** often uses `UseStartTls: false` (implicit SSL). Gmail / Outlook usually require an **app password** or SMTP relay.

   **Development** defaults to **real SMTP** (`Smtp:DryRun` is `false`, `Host` is `smtp.gmail.com`). Fill **`User`**, **`Password`** (Gmail **app password**), and **`FromEmail`** in `appsettings.Development.json` (or [user secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets)) — see **[docs/real-email-verification-smtp.md](docs/real-email-verification-smtp.md)** and the **[step-by-step checklist](docs/email-setup-step-by-step.md)**. Set **`DryRun` to `true` only** if you intentionally want no mail (URL in API logs only).

There are **no** pre-seeded accounts like `customer@qms.demo` unless you insert them yourself.

## Key HTTP endpoints

- `POST /api/auth/login` — JWT for SignalR (`?access_token=...`) and `[Authorize]` APIs.
- `POST /api/auth/register` — Create **customer** account; sends a verification code when SMTP is configured, or **dry-run** in Development (code in API logs). Response is **pending verification** (no JWT from register); the user can **sign in** with `POST /api/auth/login` using the same email/password without completing verification first. Staff unchanged. **Password policy:** at least **6** characters with **uppercase**, **lowercase**, **digit**, and **symbol** (e.g. `@#%`); the customer app shows the same rules while registering.
- `GET /api/auth/verify-email?token=` — Link from the email (browser); marks the customer verified.
- `POST /api/auth/verify-otp` — JSON `{ "email", "otp" }` for the 6-digit in-app verification flow.
- `POST /api/auth/resend-verification` — JSON `{ "email" }` to send a new link (pending accounts only).
- `POST /api/auth/forgot-password` — JSON `{ "email" }`; same response whether the address exists (**verified customers only** receive mail). Email contains a link to `GET /reset-password.html?t=…` on the API host plus in-app reset instructions.
- `POST /api/auth/reset-password` — JSON `{ "token", "newPassword" }`; one-time token (**15 minutes**). Same password policy as register.
- `GET /api/branches` — Branches + services (includes **geofence**, **service day window** for slot generation).
- `GET /api/branches/{branchId}/services/{serviceId}/summary` — **Crowd** (Low/Medium/High), waiting count, ETA for that lane (anonymous).
- `GET /api/branches/{branchId}/walk-in-link?serviceTypeId=` — **QR URL** (`…/qms-walk-in?branchId=&serviceTypeId=`) for the mobile app to parse and call walk-in.
- `GET /api/branches/{branchId}/services/{serviceId}/slots?day=yyyy-MM-dd` — Slot capacity (branch **local calendar** date; customer token).
- `POST /api/bookings` — Online booking + queue ticket (customer token).
- `POST /api/bookings/{id}/check-in` — Optional JSON `{ latitude, longitude }`; if sent, must be within branch **geofence** for check-in.
- `PATCH /api/bookings/{id}/reschedule` — New `slotStart` / `slotEnd` with capacity re-check.
- `POST /api/bookings/{id}/cancel` — Booking lifecycle.
- `POST /api/queue/walk-in` — Anonymous walk-in ticket. Response includes **`walkInCapacitySlotStart` / `walkInCapacitySlotEnd`**: the **walk-in buffer window** this ticket consumes (if the arrival-time window is full, the **next** window with space is used—see README).
- `GET /api/queue/status?branchId=&ticket=` — Position + ETA, **now serving** for the lane, **“you are next…”** hint when applicable.
- `POST /api/staff/call-next` — Hybrid dispatch to next ticket (staff or manager token).
- `POST /api/staff/start-service` / `end-service` — Service timers + `ServiceSessionLogs` row.
- `GET /api/staff/my-counter` — Assigned counter, branch, **allowed lane ids** (must list every lane this counter may serve), display label, **current mode (read-only)**.
- `GET /api/staff/branches/{branchId}/services/{serviceId}/waiting` — Ordered waiting tickets + rough ETA for the lane list UI.
- `GET /api/branches/{branchId}/dashboard/live` — Live KPIs (includes **customersServedToday**, **priorityWaiting** checked-in online).
- `GET /api/manager/branches/{branchId}/counters` — List counters (manager only).
- `PATCH /api/manager/branches/{branchId}/counters/{counterId}/mode` — **Open / Break / Closed** (manager only). **Active** is rejected until the counter has **at least one** allowed lane.
- `PATCH .../counters/{counterId}/staff` — Assign or clear `staffUserId` (staff/manager users only).
- `PATCH .../counters/{counterId}/allowed-services` — Body `{ "serviceTypeIds": ["guid", ...] }`. **At least one lane is required** (no “General / all lanes” counters). Counters may only call listed lanes.
- `GET /api/manager/branches/{branchId}/assignable-staff` — Staff and manager users **for that branch only** (counter assignment dropdown).
- `GET /api/manager/branches/{branchId}/operational-settings` — Online %, walk-in %, slot length, service hours, zone offset.
- `PATCH /api/manager/branches/{branchId}/operational-settings` — Update capacity controls (pushes **SignalR** so apps refresh).
- `GET /api/manager/branches/{branchId}/insights` — **Alerts** (overcrowding, long wait, lane with queue but no counter, understaffing) + **per-lane analytics** (avg observed service time, completed today) + **no-shows today**.

**Customer → service queue → eligible counters → call (bank-style):** each ticket sits on a **service lane**. **Call next** only considers **Active** counters that **include that lane** in their allowed-service set. Managers change mappings live via `allowed-services` to shift capacity (e.g. move a counter from account services to teller during a deposit rush).

**Online booking position:** “People ahead” uses `EnqueueSequence` ordered by **appointment slot start** (earlier windows get lower numbers than later ones in the same lane), not the order you tapped “book”—so a 13:00–13:30 ticket stays **ahead** of a 13:30–14:00 ticket even if you booked the later window first.

**Walk-in capacity windows:** each lane’s slot has an **online cap** and a **walk-in buffer** (`GetSlots` shows `walkInUsed` / `walkInCapacity`). Walk-ins are aligned to the branch **service zone** clock. If the **current** window’s walk-in buffer is full, the API **rolls forward** to the next service window that still has walk-in space and stores that choice on `QueueEntries.WalkInCapacityBucketStart/End` (so overflow occupies the **next** bucket, not the crowded one). `EnqueueSequence` for walk-ins is based on that bucket so queue order stays time-consistent.

**Walk-in vs online at the counter (hybrid priority):** staff **Call next** uses a **2 : 1** weighting—up to **two** online-booked picks, then **one** walk-in, repeating (`HybridDispatch` + per-lane round state). **Checked-in** online customers are sorted ahead of not-yet-checked-in for the same lane. If walk-ins make up a **large fraction** of the waiting line, the next call can **boost** a walk-in to avoid starving walk-ins. This is **service discipline at the counter**; it is separate from **capacity accounting** (who is allowed to join the queue in each window).

**Capacity / ETA** count only **Active** counters that list that lane in `CounterAllowedServices`, so opening/closing counters or editing allowed lanes updates crowding immediately (**SignalR**).

**Walk-in QR:** print a static QR that encodes the HTTPS URL from `walk-in-link` (or a custom deep link with the same query params). The app opens the URL, reads `branchId` + `serviceTypeId`, and `POST`s `/api/queue/walk-in`.

## SignalR

Hub: `/hubs/queue`. After the connection starts, call `WatchBranch(branchId)` from the client. Events: `QueueUpdated`, `TicketCalled`, `CountersUpdated`.

The hub is **`[AllowAnonymous]`** so **walk-in customers** (no JWT) still get live queue updates; REST endpoints remain protected by JWT/RBAC.

## Background policy (late & no-show)

A hosted service runs every **30s**: **confirmed** bookings that are **not checked in** and whose slot started **≥ 10 minutes** ago are **degraded** to `LateDegraded` (fairer hybrid mix). After **slot end + 5 minutes** with no check-in, the booking becomes **`NoShow`** and the queue row is **`Absent`** (online capacity frees for reporting).

## End-to-end demo checklist

1. Start **API**, then **staff-web** and **customer** apps (see above).
2. **Customer:** book a slot or take a **walk-in** ticket; open **Track** — numbers should update **live** when staff call the next ticket (SignalR), with a slow poll as backup.
3. **Customer:** **Check-in** on a booking (optional GPS near branch coordinates from **your** branch data, or omit coords).
4. **Staff:** **Call next** → **Start service** → **Complete** — KPIs and customer ETA update live.
5. **Manager** (`/manager`): adjust **online % / slot length / hours**, tick **at least one allowed lane per counter** (and optional primary lane), assign **staff** from the same branch list, open/break/close counters — watch **live lane table**, **KPIs**, and **alerts** update in real time.

## Python ML

```bash
cd ml
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python train_wait_model.py
```

Produces `ml/model_metrics.json` as a stand-in for publishing moving averages to SQL/Redis.

## Legacy BDS tables

Operational exports `BDS_QMS_AUDIT`, `BDS_QMS_TICKET`, `BDS_QMS_DAILY_TRANSACTION` align with analytics (ticket timings, teller activity). Ignore `VALID_DTTM` / `PROCESSED_DTTM` per your data dictionary; map `TICKET_NUM` and `BRANCH_CD` to this API’s `TicketNumber` / `BranchCode` in ETL jobs.

### Assignment / lecturer ERD column names (SQL views)

If you use `database/teacher_erd_views.sql` (when present in your fork), it may create schema **`TeacherErd`** with views that **project** the live `dbo.*` tables for diagrams or BI. Slot windows are **not** stored per row: the API builds them from `BRANCH_OPERATING_HOURS` and `BRANCHES.SlotDurationMinutes`; capacity uses `BOOKINGS` overlap counts plus counter-driven math.

### Optional in-database BDS mirror (same SQL Server)

1. Run `database/bds_public_layout.sql` on the same database as `database/schema.sql` (adds `BDS_QMS_*` alongside IH-QMS tables).
2. Set `"Bds": { "Enabled": true }` in `appsettings.json` (or environment). InMemory / non–SQL Server providers keep the bridge as a no-op.
3. The API then **writes** `BDS_QMS_TICKET` on booking/walk-in and updates it on **Call next**; on **End service** it updates `WAITING_TIME` and inserts `BDS_QMS_AUDIT`. Failures are logged only — queue operations are unchanged. Column types use SQL Server natives (see file header comments); adjust if the bank mandates exact SAS numeric encodings.

## Security note

Change `Jwt:Key` in configuration for any shared or production environment.

## Troubleshooting (customer cannot book)

1. **Use plain HTTP in dev** — The API disables **HTTPS redirection** while `ASPNETCORE_ENVIRONMENT=Development`, so the customer app can call `http://127.0.0.1:5154` (or your LAN IP) without being forced to `https://localhost:7183` (which often breaks Expo / self-signed certs).
2. **Physical device** — Set `EXPO_PUBLIC_API_URL` in `apps/customer/.env` to your computer’s **LAN IP** (not `127.0.0.1`). Example: `http://192.168.1.10:5154`.
3. **JSON body** — Booking `POST` uses camelCase (`branchId`, `serviceTypeId`, `slotStart`, `slotEnd`). The API accepts this via **case-insensitive** JSON binding; if you still see `400`, check the alert for `401` (log in again) or `409` (slot full).
