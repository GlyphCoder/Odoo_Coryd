# 🚗 Enterprise CoRYD Platform

Multi-tenant ride-sharing for organizations. Employees find rides, offer rides,
track trips live on a map, chat / voice-call the other participant, and settle
fares — with a company-admin console for oversight and reports.

**Stack:** React (Vite) · Node + Express · Socket.IO · PostgreSQL (Supabase)
**All maps/routing are free & keyless:** OpenStreetMap tiles, Nominatim geocoding, OSRM routing.
**Live tracking** = browser Geolocation → Socket.IO. **Voice calls** = WebRTC (P2P) with Socket.IO signaling.

---

## Architecture

```
client/  React SPA (Vite) — pages, Leaflet maps, socket client, WebRTC
server/  Express REST API + Socket.IO realtime + Postgres (pg)
db/      schema.sql (multi-tenant), rls.sql (optional), migrations run via server
```

Every tenant table carries `organization_id`. Isolation is enforced at **three layers**:
1. **Query layer** — every query filters by the caller's `organization_id` (baked into the JWT at login).
2. **Schema layer** — composite foreign keys `(organization_id, <id>)` make cross-org references structurally impossible.
3. **DB layer (optional)** — Postgres Row-Level Security (`db/rls.sql`), gated by `ENABLE_RLS`.

Chat & live location are delivered over a per-trip Socket.IO room that a socket
can only join after the server verifies it belongs to that trip's driver or
passenger — so messages/locations are visible **only to that trip's two participants**.

---

## Prerequisites

- Node.js 18+ (20+ recommended — the API uses global `fetch`)
- A free Supabase project (or any PostgreSQL 14+)

---

## 1. Database (Supabase)

1. Create a project at supabase.com.
2. Get the connection string: **Project Settings → Database → Connection string (URI)**.
3. Copy env files and paste your `DATABASE_URL`:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env   # can stay empty in dev (uses Vite proxy)
```

Edit `server/.env` → set `DATABASE_URL` and a strong `JWT_SECRET`.

4. Apply the schema and seed a demo org:

```bash
npm run install:all      # installs server + client deps
npm run migrate          # runs db/schema.sql
npm run seed             # demo org "ACME" + users + a sample ride
```

> You can also paste `db/schema.sql` directly into the Supabase SQL Editor.
> To enable DB-level RLS, run `db/rls.sql` and set `ENABLE_RLS=true` (use a
> non-superuser DB role, otherwise policies are bypassed).

---

## 2. Run

Two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

Open http://localhost:5173.

### Demo credentials (after `npm run seed`)

| Role     | Login                                   | Org code |
|----------|-----------------------------------------|----------|
| Admin    | `admin@acme.com` / `admin123`           | `ACME`   |
| Employee | `ravi@acme.com` / `password123`         | `ACME`   |
| Employee | `priya@acme.com` / `password123`        | `ACME`   |
| Employee | `arjun@acme.com` / `password123`        | `ACME`   |

New users can self-register with org code **ACME**.

To exercise the full flow end-to-end, open two browsers (e.g. Ravi as driver,
Priya as passenger): Priya books Ravi's ride, Ravi starts the trip and shares
location, both see the car move on the map and can chat / call, then Priya pays.

---

## Feature → spec mapping

| Spec module | Where |
|---|---|
| Authentication (splash/login/signup/profile) | `client/src/pages/{Splash,Login,Signup}.jsx`, `server/src/routes/auth.js` |
| Find a Ride (route confirm + matching + booking) | `pages/FindRide.jsx`, `routes/rides.js`, `routes/bookings.js` |
| Offer a Ride (vehicle gate + publish) | `pages/OfferRide.jsx`, `routes/rides.js` |
| Trip Management (lifecycle state machine) | `pages/TripDetail.jsx`, `routes/trips.js` |
| Live Trip Tracking (map, ETA) | `TripDetail.jsx` + `MapView.jsx` + `sockets/index.js` |
| Chat + Voice Call | `TripDetail.jsx` (WebRTC) + `sockets/index.js` (signaling & persistence) |
| Payments & Wallet (Cash/Card/UPI/Wallet) | `pages/{Wallet,TripDetail}.jsx`, `routes/{payments,wallet}.js` |
| Ride History | `pages/RideHistory.jsx`, `routes/reports.js` |
| Vehicle Management | `pages/Vehicles.jsx`, `routes/vehicles.js` |
| Reports & Analytics | `pages/{Dashboard,AdminDashboard}.jsx`, `routes/{reports,admin}.js` |
| Company Administration | `pages/AdminDashboard.jsx`, `routes/admin.js` |
| Saved Places | `pages/SavedPlaces.jsx`, `routes/savedPlaces.js` |
| Notifications (bonus) | `routes/notifications.js`, header bell |

---

## API surface (all under `/api`, JWT required except auth)

`auth` (signup/login/me/profile) · `vehicles` · `saved-places` · `geo`
(search/reverse/route) · `rides` (search/mine/publish/cancel) · `bookings`
(book/cancel) · `trips` (list/detail/status/messages/pings) · `payments` (pay)
· `wallet` (balance/recharge) · `notifications` · `reports` (me/history) ·
`admin` (overview/employees/vehicles/settings).

### Socket.IO events
`trip:join` · `location:update` · `chat:send` / `chat:new` · `chat:typing` ·
`presence:join`/`presence:leave` · `call:signal` (invite/offer/answer/ice/end).

---

## Notes / production hardening

- Swap the Tailwind CDN (in `client/index.html`) for a PostCSS build.
- The OSRM/Nominatim public demo servers are rate-limited — self-host for load.
- Razorpay test-mode keys can be wired into `routes/payments.js` for CARD/UPI;
  the current flow marks non-wallet payments complete (sandbox behavior per spec).
- Consider partitioning `live_location_ping` by day and purging after trip completion.
