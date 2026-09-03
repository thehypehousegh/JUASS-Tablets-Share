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

## Hosting options: cloud instance + local-network instance

This app is designed to run in two places at once, each solving a different
problem:

1. **A cloud instance (Render + Neon), reachable from anywhere.** This is
   the durable, canonical copy of the school's data — lets a distributor
   record assignments from home, a Supervisor check the dashboard off-site,
   and is where data ultimately needs to live so it's never at risk from a
   single machine failing.
2. **A local-network instance, for distribution days with no internet at
   the venue.** Run `docker compose up -d` on a laptop/PC brought to the
   event (bundles Postgres + the app). Every distributor's phone/tablet
   connects to that laptop over the venue's Wi-Fi/LAN — no internet needed
   — and because they're all talking to the *same* live server, assignments,
   the "one active device per student" rule, and IMEI/Serial uniqueness are
   all enforced in real time across every distributor, exactly as if
   everyone were online. (A lone distributor with no connectivity at all —
   not even to that local server, e.g. filling in a form from home before
   the event — is a separate, narrower case; see "Offline gaps for a single
   device" below.)

**These two are meant to run together, not as a choice between them:**
the local instance handles the event itself, then automatically pushes its
data to the cloud instance in the background (see "Keeping data off any one
machine" below) so the event's data doesn't ride home on a single laptop.

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

### Storing faulty-report photos in the cloud

Faulty-device photos default to local disk (`server/uploads`), which is
fine on the local-network instance (that machine's disk is what's actually
there) but is a problem on a host with no persistent disk — Render's free
tier included — since uploaded files are then lost on every redeploy/restart.

Set these on an instance to store photos in S3-compatible cloud storage
instead, so they get a stable URL reachable from anywhere and survive
redeploys (works with [Cloudflare R2](https://developers.cloudflare.com/r2/)
— 10GB free, no card required, recommended — or Backblaze B2, Supabase
Storage, or AWS S3):

```
S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL_BASE
```

Quick Cloudflare R2 setup: create a bucket, create an R2 API token
(Account Home → R2 → Manage API Tokens) scoped to that bucket for
`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, use
`https://<account-id>.r2.cloudflarestorage.com` for `S3_ENDPOINT`, `auto`
for `S3_REGION`, and enable the bucket's public access (Settings → Public
Development URL, or a custom domain) for `S3_PUBLIC_URL_BASE`. Leave all six
unset to keep using local disk.

### Keeping data off any one machine

Two mechanisms cover this, for two different situations:

**A local-network instance auto-syncs to a cloud instance in the
background**, so a full day's distribution data run on a single laptop
doesn't stay only on that laptop. Set on the **local** instance:

```
REMOTE_SYNC_URL=https://<your-cloud-instance>       # e.g. the Render URL
SYNC_SECRET=<a-long-random-shared-secret>
SYNC_INTERVAL_MINUTES=5                              # default 5
```

and set the matching `SYNC_SECRET` on the **cloud** instance (nothing else
needed there — it just needs to recognize pushes as authorized). Every few
minutes the local instance pushes a full snapshot to the cloud instance's
`POST /api/backup/sync`, authenticated by that shared secret, applied as a
non-destructive upsert (safe to push the same data twice, or push out of
order). If there's no internet, it just fails quietly and retries next
interval — nothing crashes, and it catches up automatically the moment
connectivity returns. Admin → Settings & Backup shows when it last
succeeded. This is the mechanism doing the real work: it bounds how much
data could ever be at risk from one machine to a few minutes' worth, not "a
whole event."

On top of the timer, a sync also runs immediately at two extra moments,
verified end-to-end against real instances:
- **Whenever anyone logs out**, so a distributor's work is pushed right
  after their session ends instead of waiting for the next tick. Logout
  waits up to 8 seconds for that push to finish before it actually logs
  them out, so it can tell them directly whether their session made it to
  the cloud.
- **Once more during a graceful shutdown** (`Ctrl-C`, `docker compose down`,
  or any normal stop) — the server waits up to 20 seconds for one last sync
  to finish before it actually exits, so closing up the system at the end
  of a distribution day doesn't leave that last stretch of work stranded on
  the laptop. This can only help on a *graceful* stop, though — it has no
  chance to run if the machine loses power or is simply switched off
  without stopping the app first, so it narrows the risk window, it doesn't
  eliminate it.

**When a push fails** (no internet reaching the cloud instance at that
moment — the normal case mid-event), the data it was about to send is
written to a file under `server/uploads/pending-sync/` instead of being
discarded: a concrete, on-disk "offline backup" of that snapshot, not just
a promise to try again. It's on disk (not just in memory), so it survives
a server restart and keeps showing as pending until an actual successful
push clears it out.

Two things make this visible rather than a silent background retry:
- **A badge in the top bar, shown to every logged-in role** — green
  "Backed up online" when the last push succeeded and nothing is pending,
  amber "Not backed up (N)" otherwise (hover for details). It only appears
  at all on an instance where auto-sync is configured.
- **Logging out with a failed/pending sync shows the distributor a direct
  message** explaining their session is saved safely on the machine and
  will go up automatically once there's internet, or that an Admin can push
  it sooner. Admin → Settings & Backup shows the same detail plus a
  "Retry Sync Now" button to force an attempt on demand (e.g. right after
  confirming Wi-Fi is back).

**Settings & Backup → "Download Full Backup"** is the manual, on-demand
version of the same thing — produces one JSON file with every table,
importable into any other instance (same screen). Useful as a one-off
backup saved straight to a PC or phone, for moving data around by hand, or
as a fallback wherever auto-sync isn't configured. **The backup file
contains password hashes — store it as carefully as you would the database
itself.**

### Offline gaps for a single device

For a distributor filling in the Assign Device or Report Issue form
somewhere with no network at all — not even the local-network server (e.g.
from home before an event, or a dead zone at the venue) — those two forms
work as an installable PWA: a submission that can't reach the server is
queued in that device's own local storage and sent automatically once it
can reach the server again (a banner at the top of the app shows what's
still pending, with a manual "Sync now"). This is a safety net for one
device losing its connection, not a substitute for the local-network
instance above when several distributors need to work together with no
internet at all — that scenario needs everyone actually reaching a shared
server, which per-device queuing alone can't provide.

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

For anything the built-in fields don't cover, a Super Admin can define
**Custom Fields** (Import Students screen, "Need a field that isn't listed
above?") — a reusable named field beyond the built-in list, stored under
`extraFields` by its own key so it shows up consistently everywhere: as a
mappable column at import time, as an editable field on the Assignment form
and the Student Records edit modal (for values that are per-student and
weren't in the admission data — a distributor or admin fills them in as
students are processed), and as a selectable, renamable column in Reports.
Import mapping also supports setting one fixed value for every row in a
batch instead of reading a column — useful for a field like Year Group that
is the same for the whole import but isn't a column in the file.

## Security notes

- Login is by selecting your name from a dropdown (populated from active
  accounts) plus your password; 5 failed attempts blocks the account until
  an Admin unlocks it from Manage Users.
- Only one login is valid per account at a time. Logging in on a second
  device/browser immediately invalidates the first one's session — the
  older session finds out within ~25 seconds and is shown a clear reason
  ("logged in elsewhere") rather than just starting to fail silently.
  Verified against the real login/logout endpoints, including that an
  explicit logout also invalidates its own cookie server-side.
- Faulty/missing reports need Admin approval before they count anywhere.
- Only Super Admin can edit a student's record (from Student Records, or
  inline while assigning a device) or bulk-delete students by year group
  and/or class. Editing works regardless of whether the student already
  has a device assigned, replaced, or returned. Bulk delete always requires
  picking a year group or class (there's no "delete everyone" button),
  shows exact counts of what will be removed — including cascaded device
  assignments and issue reports — before anything happens, and requires
  typing "DELETE" to confirm.
- `npm audit` is clean for both `server` and `client` as of this build. One
  moderate, non-exploitable-in-this-app transitive advisory remains from
  `exceljs`'s `uuid` dependency (a buffer-bounds issue only reachable if a
  caller passes attacker-controlled buffers into `uuid`'s parse/stringify
  functions, which this app never does) — re-run `npm audit` periodically
  and update when a fix lands upstream.
