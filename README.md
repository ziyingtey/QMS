# Intelligent Hybrid Queue Management System (IH-QMS)

Backend reference implementation for your specification: **unified queue**, **online vs walk-in capacity split**, **2:1 hybrid dispatch** (with walk-in backlog boost), **JWT + RBAC**, **SignalR** live updates, **EF Core** to **SQL Server** or **InMemory** (dev), optional **Python/scikit-learn** training skeleton.

## Solution layout

| Project | Responsibility |
|--------|----------------|
| `QMS.Domain` | Entities and enums (users, branches, services, bookings, queue entries, session logs). |
| `QMS.Application` | Pure logic: capacity engine, wait-time estimator, hybrid dispatch selector. |
| `QMS.Infrastructure` | EF Core `QmsDbContext`, in-memory dispatch round state (swap for Redis in production). |
| `QMS.Api` | REST API, SignalR `QueueHub`, `QmsQueueService`, **background late / no-show policy**, seed data. |
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

- **Teller / counter:** `staff@qms.demo` / `Demo123!` — **counter workspace**: KPIs, hybrid queue list, call next, start/complete service. Counter **open / break / closed** is manager-only.
- **Branch manager:** `manager@qms.demo` / `Demo123!` — **`/manager`**: live KPI strip + counter modes. **Counter workspace** link opens the teller view.

- If `ConnectionStrings:Default` is **empty**, the API uses an **EF InMemory** database (good for demos).
- Set `ConnectionStrings:Default` to a **SQL Server** connection string to persist data; run `dotnet ef database update` if you add migrations (currently `EnsureCreated()` is used for quick start).

## Demo accounts (seeded on first run)

| Email | Password | Role |
|-------|----------|------|
| `customer@qms.demo` | `Demo123!` | Customer |
| `cust01@qms.demo` … `cust15@qms.demo` | `Demo123!` | Extra customers (seeded for load / multi-device tests) |
| `staff@qms.demo` | `Demo123!` | Staff (assigned to counter 1) |
| `manager@qms.demo` | `Demo123!` | Manager |

Seeding runs only when the database has **no branches** (first API start). With **InMemory**, restart clears data; with SQL Server, drop/recreate or delete rows to re-seed. The seed also inserts a few **today** bookings in the wait queue (mixed lanes + one walk-in) so dashboards are non-empty.

## Key HTTP endpoints

- `POST /api/auth/login` — JWT for SignalR (`?access_token=...`) and `[Authorize]` APIs.
- `POST /api/auth/register` — Create customer account (email/password; OTP can be added later).
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
- `GET /api/staff/my-counter` — Assigned counter, branch, **allowed lane ids** (empty = general), display label, **current mode (read-only)**.
- `GET /api/staff/branches/{branchId}/services/{serviceId}/waiting` — Ordered waiting tickets + rough ETA for the lane list UI.
- `GET /api/branches/{branchId}/dashboard/live` — Live KPIs (includes **customersServedToday**, **priorityWaiting** checked-in online).
- `GET /api/manager/branches/{branchId}/counters` — List counters (manager only).
- `PATCH /api/manager/branches/{branchId}/counters/{counterId}/mode` — **Open / Break / Closed** (manager only).
- `PATCH .../counters/{counterId}/staff` — Assign or clear `staffUserId` (staff/manager users only).
- `PATCH .../counters/{counterId}/allowed-services` — Body `{ "serviceTypeIds": ["guid", ...] }`. **Empty list** = **General** counter (may call any lane). Non-empty = counter may only serve those lanes (manager crowd control).
- `GET /api/manager/assignable-staff` — Staff/manager users for counter assignment.
- `GET /api/manager/branches/{branchId}/operational-settings` — Online %, walk-in %, slot length, service hours, zone offset.
- `PATCH /api/manager/branches/{branchId}/operational-settings` — Update capacity controls (pushes **SignalR** so apps refresh).
- `GET /api/manager/branches/{branchId}/insights` — **Alerts** (overcrowding, long wait, lane with queue but no counter, understaffing) + **per-lane analytics** (avg observed service time, completed today) + **no-shows today**.

**Customer → service queue → eligible counters → call (bank-style):** each ticket sits on a **service lane**. **Call next** only considers **Active** counters whose **allowed-service set is empty** (General) **or includes that lane**. Managers change mappings live via `allowed-services` to shift capacity (e.g. move a counter from account services to teller during a deposit rush).

**Online booking position:** “People ahead” uses `EnqueueSequence` ordered by **appointment slot start** (earlier windows get lower numbers than later ones in the same lane), not the order you tapped “book”—so a 13:00–13:30 ticket stays **ahead** of a 13:30–14:00 ticket even if you booked the later window first.

**Walk-in capacity windows:** each lane’s slot has an **online cap** and a **walk-in buffer** (`GetSlots` shows `walkInUsed` / `walkInCapacity`). Walk-ins are aligned to the branch **service zone** clock. If the **current** window’s walk-in buffer is full, the API **rolls forward** to the next service window that still has walk-in space and stores that choice on `QueueEntries.WalkInCapacityBucketStart/End` (so overflow occupies the **next** bucket, not the crowded one). `EnqueueSequence` for walk-ins is based on that bucket so queue order stays time-consistent.

**Walk-in vs online at the counter (hybrid priority):** staff **Call next** uses a **2 : 1** weighting—up to **two** online-booked picks, then **one** walk-in, repeating (`HybridDispatch` + per-lane round state). **Checked-in** online customers are sorted ahead of not-yet-checked-in for the same lane. If walk-ins make up a **large fraction** of the waiting line, the next call can **boost** a walk-in to avoid starving walk-ins. This is **service discipline at the counter**; it is separate from **capacity accounting** (who is allowed to join the queue in each window).

**Capacity / ETA** count only **Active** counters that can serve that lane (General or lane listed in `CounterAllowedServices`), so opening/closing counters or editing allowed lanes updates crowding immediately (**SignalR**).

**Walk-in QR:** print a static QR that encodes the HTTPS URL from `walk-in-link` (or a custom deep link with the same query params). The app opens the URL, reads `branchId` + `serviceTypeId`, and `POST`s `/api/queue/walk-in`.

## SignalR

Hub: `/hubs/queue`. After the connection starts, call `WatchBranch(branchId)` from the client. Events: `QueueUpdated`, `TicketCalled`, `CountersUpdated`.

The hub is **`[AllowAnonymous]`** so **walk-in customers** (no JWT) still get live queue updates; REST endpoints remain protected by JWT/RBAC.

## Background policy (late & no-show)

A hosted service runs every **30s**: **confirmed** bookings that are **not checked in** and whose slot started **≥ 10 minutes** ago are **degraded** to `LateDegraded` (fairer hybrid mix). After **slot end + 5 minutes** with no check-in, the booking becomes **`NoShow`** and the queue row is **`Absent`** (online capacity frees for reporting).

## End-to-end demo checklist

1. Start **API**, then **staff-web** and **customer** apps (see above).
2. **Customer:** book a slot or take a **walk-in** ticket; open **Track** — numbers should update **live** when staff call the next ticket (SignalR), with a slow poll as backup.
3. **Customer:** **Check-in** on a booking (optional GPS near branch coordinates from seed data, or omit coords).
4. **Staff:** **Call next** → **Start service** → **Complete** — KPIs and customer ETA update live.
5. **Manager** (`/manager`): adjust **online % / slot length / hours**, set each counter to **General** or a **dedicated lane**, assign **staff**, open/break/close counters — watch **live lane table**, **KPIs**, and **alerts** update in real time.

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

Run `database/teacher_erd_views.sql` after `database/schema.sql` on SQL Server. It creates schema **`TeacherErd`** with views **`USERS`**, **`BRANCHES`**, **`STAFF`**, **`SERVICES`**, **`COUNTERS`**, **`TIME_SLOTS`** (empty shell — slots are computed in the API), **`BOOKINGS`**, **`QUEUE_TICKETS`**, **`SERVICE_LOGS`**, **`NOTIFICATIONS`**, **`ANALYTICS_SUMMARY`**, **`ML_TRAINING_DATA`** that **project** the live `dbo.*` tables. The REST API and apps **unchanged**; use these views for diagrams, BI, or coursework ERDs that require exact entity names.

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
