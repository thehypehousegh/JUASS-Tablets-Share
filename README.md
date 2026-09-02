# JUASS Tablets Share

Tablet distribution and tracking system for **Juaben Senior High School (JUASS)**.
Distributors assign learning tablets to students (scanning the device's IMEI /
Serial Number barcode straight off the label), Admin manages users and
approves faulty/missing reports, and Supervisors get a read-only dashboard.

## Stack

- **Server**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL
- **Client**: React, TypeScript, Vite, installable as an offline-capable PWA
- Single deployable service: the server serves the built React app itself, so
  there is only one thing to run/host.

## Repository layout

```
server/   Express API + Prisma schema/migrations
client/   React app (Vite + PWA)
docker-compose.yml   Postgres + server, for local-network hosting
```

## Local development

Requirements: Node.js 20+, a PostgreSQL server (local, Docker, or a free
cloud instance — see "Hosting options" below).

```bash
# 1. Database
createdb juass_tablets     # or: docker compose up -d db

# 2. Server
cd server
cp ../.env.example .env    # edit DATABASE_URL / JWT_SECRET
npm install
npm run prisma:migrate:dev
npm run seed                # creates the first Super Admin account
npm run dev                  # http://localhost:4000

# 3. Client (separate terminal)
cd client
npm install
npm run dev                  # http://localhost:5173 (proxies /api to :4000)
```

The seed script prints the Super Admin's login email and a temporary
password — log in and change it (via Manage Users → Reset Password, or by
using "Forgot password" and having the Admin reset it) right after setup.

## Production build (single service)

```bash
cd client && npm run build     # outputs client/dist
cd ../server && npm run build  # outputs server/dist
cd server && npm run prisma:migrate && npm start
```

The server serves `client/dist` itself, so only the server process needs to
run in production — point a browser at it and the full app (API + UI) is
there.

## Hosting options ("local network now, internet later")

This app is designed to run the exact same way in either place:

1. **On a school PC / local server, for LAN-only use.** Run
   `docker compose up -d` (bundles Postgres + the server) or run the server
   directly against a local Postgres install. Distributors on the school
   Wi-Fi/LAN open it in a browser; no internet required day-to-day.
2. **On a free/low-cost cloud host, reachable from anywhere.** Any Node
   host works (Render, Railway, Fly.io free tiers, etc.) paired with a free
   PostgreSQL instance (e.g. [Neon](https://neon.tech) or
   [Supabase](https://supabase.com) both have a free tier that's enough for
   a school's worth of data). This is what lets a distributor record
   assignments from home, or a Supervisor check the dashboard off-site.

**Moving data between the two / periodic sync:** Settings & Backup →
"Download Full Backup" produces one JSON file with every table. Import that
file into the other instance (same screen) to bring it up to date — imports
are non-destructive upserts, so importing the same backup twice, or
importing in either direction, is always safe. Use this to periodically push
a local-network instance's data up to the cloud copy (or the reverse), and
also just as an offline safety backup saved straight to a PC or phone.
**The backup file contains password hashes — store it as carefully as you
would the database itself.**

**Offline gaps in the field** (e.g. a distributor working somewhere with no
signal): the Assign Device and Report Issue forms work as an installable
PWA. If a submission can't reach the server, it's queued in the browser's
local storage on that device and sent automatically once connectivity comes
back (a banner at the top of the app shows what's still pending, with a
manual "Sync now").

## Branding assets

The app is themed around the JUASS crest's navy/gold/red palette already,
but the two actual image files aren't in the repo yet — drop them in and
they'll be picked up automatically (both have graceful fallbacks if missing,
so nothing breaks in the meantime):

- `client/public/logo.png` — the JUASS crest, used in the top nav bar and on
  the login card. A square image works best (it's displayed in a circular
  frame).
- `client/public/campus-bg.jpg` — a landscape photo of the campus (the
  administration block or an aerial shot both work well), used as the
  login page background under a navy gradient overlay for text contrast.

## Data model notes

The real admission-data Excel template wasn't available while building
this, so `Student` has the common fields used by Ghanaian SHS registers
(index number, name, gender, class, programme, house, guardian, admission
year) plus an `extraFields` catch-all that stores any additional columns
found in whatever file gets imported — so nothing from the real template is
lost, it just may need re-mapping once you import it (Import Students screen
lets you match each of the real file's columns to a field, or leave it as an
"extra" field).

## Security notes

- Login is by selecting your name from a dropdown (populated from active
  accounts) plus your password; 5 failed attempts blocks the account until
  an Admin unlocks it from Manage Users.
- Faulty/missing reports need Admin approval before they count anywhere.
- `npm audit` is clean for both `server` and `client` as of this build. One
  moderate, non-exploitable-in-this-app transitive advisory remains from
  `exceljs`'s `uuid` dependency (a buffer-bounds issue only reachable if a
  caller passes attacker-controlled buffers into `uuid`'s parse/stringify
  functions, which this app never does) — re-run `npm audit` periodically
  and update when a fix lands upstream.
