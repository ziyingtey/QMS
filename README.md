# Intelligent Hybrid Queue Management System (IH-QMS)

Bank branch queue system (FYP): unified per-lane queue for **online bookings** and **walk-ins**, hybrid counter dispatch, live updates over **SignalR**, and an **ML-assisted wait-time ETA**.

## Architecture

| Part | Path | Port | Notes |
|------|------|------|-------|
| API (.NET 8) | `src/QMS.Api` | **5154** | REST + SignalR hub `/hubs/queue`, JWT + RBAC, background jobs. Swagger at `/swagger`. |
| Domain / logic / EF | `src/QMS.Domain`, `src/QMS.Application`, `src/QMS.Infrastructure` | – | Entities, capacity + dispatch + formula estimator, `QmsDbContext`. |
| ML sidecar (Python) | `ml/` | **5099** | `serve_wait_model.py` serving `wait_model.joblib`. **Auto-started by the API** (`MlSidecarHostedService`). |
| Staff web (Vite + React) | `apps/staff-web` | 5173 | Staff Deck (`/`), Manager (`/manager`), public walk-in page (`/walk-in`), printable branch QR (`/walk-in-qr`, staff login). |
| Customer app (Expo) | `apps/customer` | Expo | Booking, geofenced check-in, Track. |
| SQL scripts | `database/` | – | Schema and seed inserts (branches, services, counters, staff). |

## How walk-in works

Walk-in tickets are **not** taken in the customer app.

1. **QR scan (public):** staff open `/walk-in-qr` (calls `GET /api/branches/{branchId}/walk-in-link`, Staff policy) and display/print the branch QR. It links to the public `/walk-in` page with a **daily HMAC token** (`WalkIn:TokenSecret`; HMAC-SHA256 of branch + branch-local date, 8 chars; yesterday's token stays valid for `GraceMinutesAfterMidnight`, default 30 min). The page refreshes the token every 5 min.
2. Customers scan the QR, pick a service, and get a ticket via `POST /api/queue/walk-in` — **anonymous, no capacity/daily limit**. The only limit is the `walk-in-public` rate-limit policy: **3 requests / 10 min per `X-Device-Id`** (fallback **30 / 10 min per IP**; staff/manager are not limited). `GET /api/queue/walk-in/mine` lets the page restore that device's tickets.
3. **Staff-issued:** staff can issue a walk-in at the counter from the Staff Deck (`POST /api/queue/walk-in/staff`, no token, no rate limit).

Set `WalkIn:PublicWebBaseUrl` to the staff-web public origin so QR URLs point to the right host (otherwise the request origin is used).

## Customer app scope

- **Booking** of service slots (branch search, map/distance, saved branches).
- **Check-in** for a booking, **geofenced**: the device location must be within the branch `GeofenceMeters` (default **80 m**; GPS accuracy tolerance up to 100 m is applied server-side).
- **Track**: live position / ETA / now serving (SignalR + poll backup), notifications.

## Wait-time ETA

Shared by Track, Staff and Manager (`QmsQueueService`):

- **Counter simulation** (`CounterSimulationEstimator`) — simulates active counters serving the lane.
- **ML** — HTTP call to the sidecar (`MlWait:BaseUrl`, default `http://127.0.0.1:5099`) with a hard **400 ms timeout** (`MlWait:TimeoutMs`).
- **Formula** (`FormulaWaitTimeEstimator`) — baseline / fallback.

Priority: if ML answers, its value is used after a **sanity clamp** (between 0.5× formula and 1.5× simulation, or 2.5× formula if no simulation); otherwise the simulation value; otherwise the formula. Set `MlWait:Enabled=false` to disable ML.

## Database

- `ConnectionStrings:Default` set → **SQL Server**; schema created with `EnsureCreated()` on startup (no migrations applied automatically).
- Connection string **empty** → **EF InMemory** database (demo, data lost on restart).
- **Breaking schema change:** `QueueEntries.ServiceDay` was added (unique index on `BranchId, ServiceDay, TicketNumber`). `EnsureCreated` does not alter an existing DB — **drop and recreate** the database (then reload seed data from `database/`), or add the column/index with a manual migration.
- No demo data is inserted on startup. Load branches/services/counters/staff via `database/*.sql`; customers register through the app (`POST /api/auth/register`).

## Run locally

### 1. ML environment (once)

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt   # wait_model.joblib was trained with scikit-learn 1.6.1
pip install scikit-learn==1.6.1   # pin to match the saved model
```

The API looks for `ml/.venv/bin/python` (then `python3` on PATH) and starts the sidecar itself. If it can't, ETA falls back to simulation/formula. To run it manually: `python serve_wait_model.py --port 5099`. See `ml/README_ML_SIDECAR.md`.

### 2. API

```bash
cd src/QMS.Api
ASPNETCORE_ENVIRONMENT=Development dotnet run --urls "http://0.0.0.0:5154"
```

Binding to `0.0.0.0` makes it reachable from phones on the same LAN. Configure `ConnectionStrings:Default`, `WalkIn:TokenSecret`, `Smtp`, `MlWait` in `appsettings*.json` / user secrets.

### 3. Staff web

```bash
cd apps/staff-web
npm install
npm run dev -- --host     # --host exposes Vite on the LAN (test /walk-in from a phone)
```

Point it at the API with `VITE_API_URL` or the Vite proxy (`VITE_DEV_USE_PROXY=true`, `VITE_DEV_API_PROXY_TARGET`) in `.env.local` — see `apps/staff-web/README.md`. For phone testing, set `WalkIn:PublicWebBaseUrl` (or open `/walk-in-qr` via the LAN IP) so the QR points to `http://<LAN_IP>:5173/walk-in`.

### 4. Customer app (Expo)

```bash
cd apps/customer
npm install
cp .env.example .env      # set EXPO_PUBLIC_API_URL=http://<LAN_IP>:5154 for a physical device
npx expo start
```

Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:5154`. Allow location to check in.

## Email (SMTP)

Registration / password reset send mail via `Smtp` settings (`DryRun: true` logs instead of sending). Set `PublicUrls:ApiPublicBaseUrl` for production links. See [docs/real-email-verification-smtp.md](docs/real-email-verification-smtp.md) and [docs/email-setup-step-by-step.md](docs/email-setup-step-by-step.md).

## Key endpoints

- Auth: `POST /api/auth/login|register|verify-otp|resend-verification|forgot-password|reset-password`, `GET /api/auth/verify-email`
- Branches: `GET /api/branches`, `GET /api/branches/{b}/services/{s}/summary`, `GET /api/branches/{b}/services/{s}/slots?day=`, `GET /api/branches/{b}/walk-in-link` (staff)
- Bookings: `POST /api/bookings`, `POST /api/bookings/{id}/check-in` (`{latitude, longitude, accuracy}`), `PATCH .../reschedule`, `POST .../cancel`
- Queue: `POST /api/queue/walk-in?t=` (public), `GET /api/queue/walk-in/mine`, `POST /api/queue/walk-in/staff`, `GET /api/queue/status?branchId=&ticket=`
- Staff: `POST /api/staff/call-next|start-service|end-service`, `GET /api/staff/my-counter`
- Manager: `/api/manager/branches/{b}/counters…`, `operational-settings`, `insights`; dashboard `GET /api/branches/{b}/dashboard/live`

Check Swagger for exact request shapes.

## Queue rules (summary)

- Each ticket belongs to a service lane; **Call next** only considers **Active** counters allowed for that lane.
- Hybrid dispatch ≈ **2 online : 1 walk-in**, with a walk-in boost when walk-ins dominate the line; checked-in online customers go ahead of not-checked-in.
- Background jobs: booking lifecycle (late → `LateDegraded`, no check-in → `NoShow`), daily queue rollover per branch, after-hours counter close, ML snapshot collection.

SignalR hub `/hubs/queue` is anonymous; clients call `WatchBranch(branchId)` and receive `QueueUpdated`, `TicketCalled`, `CountersUpdated`.
