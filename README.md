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
server/       Express API + Prisma schema/migrations
client/       React app (Vite + PWA)
Dockerfile    Multi-stage build: client + server into one runtime image
docker-compose.yml   Postgres + the app, for local-network hosting
render.yaml   Render Blueprint (see "Deploying to Render + Neon" below)
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
npm run dev                  # http://localhost:4000

# 3. Client (separate terminal)
cd client
npm install
npm run dev                  # http://localhost:5173 (proxies /api to :4000)
```

The very first time the server starts against an empty database, it
automatically creates the first Super Admin account (this also covers hosts
with no shell access, like Render's free tier — see below) and prints its
login email and a one-time password to the server logs. Log in with that,
then change the password immediately (Manage Users → Reset Password, or
"Forgot password" and have another Admin reset it). Set `SEED_ADMIN_EMAIL`
/ `SEED_ADMIN_PASSWORD` in the environment beforehand to control what that
first account's credentials are, instead of reading them out of the logs.

`npm run seed` still exists and is useful for local development — besides
the same first-Super-Admin bootstrap, it also drops in a few sample
students so there's something to search for immediately.

## Production build (single service)

```bash
cd client && npm run build     # outputs client/dist
cd ../server && npm run build  # outputs server/dist
cd server && npm run prisma:migrate && npm start
```

The server serves `client/dist` itself, so only the server process needs to
run in production — point a browser at it and the full app (API + UI) is
there.

There's also a single multi-stage `Dockerfile` at the repo root that builds
both halves into one image (used by `docker-compose.yml` and by
`render.yaml`, below):

```bash
docker build -t juass-tablets-share .
docker run -p 4000:4000 --env-file server/.env juass-tablets-share
```

## Hosting options ("local network now, internet later")

This app is designed to run the exact same way in either place:

1. **On a school PC / local server, for LAN-only use.** Run
   `docker compose up -d` (bundles Postgres + the app) or run the server
   directly against a local Postgres install. Distributors on the school
   Wi-Fi/LAN open it in a browser; no internet required day-to-day.
2. **On a free/low-cost cloud host, reachable from anywhere.** Render's free
   web service tier, paired with a free [Neon](https://neon.tech) Postgres
   instance, is what this repo is set up for out of the box (see the next
   section) — but any Docker-friendly host works the same way. This is what
   lets a distributor record assignments from home, or a Supervisor check
   the dashboard off-site.

### Deploying to Render + Neon

**1. Create the database (Neon):**
1. Sign up free at [neon.tech](https://neon.tech) (no card required).
2. Create a project (e.g. `juass-tablets`). Neon creates a default database
   and gives you a connection string on the project dashboard — copy the one
   labeled "Pooled connection", which looks like
   `postgresql://<user>:<password>@<host>/<db>?sslmode=require`.

**2. Deploy the app (Render):**
1. Sign up free at [render.com](https://render.com) and connect your GitHub
   account.
2. New → Blueprint → pick this repository/branch. Render reads
   `render.yaml` automatically and proposes one web service
   (`juass-tablets-share`) on the free plan, building from the root
   `Dockerfile`.
3. Before the first deploy completes, open the service → Environment and
   fill in the two variables the blueprint leaves blank:
   - `DATABASE_URL` — the Neon connection string from step 1.
   - `SEED_ADMIN_PASSWORD` — optional; if left blank, the server generates
     one on first boot and prints it to the Logs tab (Manage Users →
     Reset Password afterwards either way).
   `JWT_SECRET` is generated for you automatically by the blueprint.
4. On first boot the server runs the Prisma migrations against Neon, then
   creates the first Super Admin account since the database starts empty
   (see "Local development" above for how that works) — check the Logs tab
   for its login email and password.
5. Every push to the connected branch redeploys automatically.

**Known limitation — photo uploads on Render's free tier:** faulty-device
photos are stored to local disk (`server/uploads`). Render's free web
service plan has no persistent disk, so uploaded files are lost on every
redeploy/restart. The faulty/missing *report itself* (description, status,
approval) is unaffected since that's all in Postgres — only the attached
photo is at risk. If photo retention matters before you're ready to pay for
a Render disk, the fix is swapping local disk storage for a free object
store (e.g. Cloudflare R2 or Supabase Storage); ask and this can be wired
in as a follow-up.

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

The app is themed around the JUASS crest's navy/gold/red palette, using the
real crest and a campus photo:

- `client/public/logo.png` — the JUASS crest, shown in the top nav bar and
  on the login card.
- `client/public/campus-bg.jpg` — the campus photo used as the login page
  background under a navy gradient overlay for text contrast.

Both are compressed for fast loading on mobile data (campus photo ~215KB,
logo ~106KB) and have graceful fallbacks if ever removed — replace either
file (same filename) and it's picked up automatically, no code changes
needed.

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
