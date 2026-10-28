# QGo Staff Web

Vite + React + TypeScript front-end for staff and managers.

## Routes

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Staff | Staff Deck: call next, start/end service, issue walk-in at counter |
| `/manager` | Manager | Dashboard, queues, counters, schedule, analytics |
| `/walk-in` | Public | Page opened by scanning the branch QR (`?t=` daily token) to take a walk-in ticket |
| `/walk-in-qr` | Staff/Manager | Shows/prints today's branch walk-in QR |
| `/preview/*` | Dev | Mock-data previews of the deck/manager UI |

## Run

```bash
npm install
npm run dev -- --host   # --host to open from a phone on the LAN
npm run build           # type-check + production build
```

The staff UI calls **QMS.Api** for login, branches, queue, and SignalR.

## “Failed to fetch” on one laptop but not another

The browser only runs `fetch` / SignalR on **that** machine. **`http://127.0.0.1:5154` is always “this laptop”**, not your Windows API host.

**Recommended (dev): use the Vite proxy** so the browser only talks to the Vite dev server; Node forwards to the API (works even when the browser cannot reach the API IP directly).

In `apps/staff-web/.env.local`:

```env
VITE_DEV_USE_PROXY=true
VITE_DEV_API_PROXY_TARGET=http://<WINDOWS_LAN_IP>:5154
```

Then **restart** `npm run dev`. Open the site at the URL Vite prints (e.g. `http://localhost:5173`). Login calls go to `http://localhost:5173/api/...` and Vite proxies them to Windows.

**Without proxy:** set `VITE_API_URL=http://<WINDOWS_LAN_IP>:5154` and ensure the **browser’s** machine can reach that IP (firewall, `dotnet run --urls "http://0.0.0.0:5154"`).
