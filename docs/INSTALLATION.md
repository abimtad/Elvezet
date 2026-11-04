# Installation guide

How to run the whole platform on your own machine: the API, the web
dashboard, and how the mobile apps connect to them.

**What was tested.** On 2026-11-05, on Linux with Node 26 and npm 12, every
command in sections 1–4 was run from a fresh clone: install, type check and
build for both parts; the API started against a local single-node MongoDB
replica set; the demo seed ran; the dev sign-in worked; and the dashboard showed
the seeded shop's booking calendar. Docker was **not** available on that
machine, so the Docker commands in section 2, option B, have not been run.

## What you need

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer (tested on 26) | |
| npm | comes with Node | |
| MongoDB | 7, **as a replica set** | MongoDB Atlas (free tier is fine) or local Docker. A plain standalone `mongod` will not work: bookings use transactions. |
| Redis | 7 | Optional for a first run (see below). Needed for reminders, push and SMS jobs. |
| Firebase project | | Optional for a first run. Needed for real sign-in and push. |

## 1. Get the code and install

```bash
git clone https://github.com/abimtad/AI-ML.git
cd AI-ML
npm ci              # backend dependencies
npm run typecheck   # optional: checks the TypeScript compiles
cd frontend && npm ci && cd ..
```

## 2. Start a database

### Option A: MongoDB Atlas (recommended)

Create a free cluster at <https://www.mongodb.com/atlas>, allow your IP, and
copy the connection string. Atlas clusters are already replica sets.

### Option B: Docker (untested here)

`docker-compose.yml` starts MongoDB 7 (as replica set `rs0`) and Redis 7:

```bash
docker compose up -d
# One time only: turn the empty MongoDB into a working replica set.
docker exec barberos-mongodb mongosh --quiet --eval \
  "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
```

Then use `MONGO_URI=mongodb://localhost:27017/barber_os?directConnection=true`
and `REDIS_URL=redis://localhost:6379`.

Nothing in the repo runs that `rs.initiate` step for you, and without it the
database will not accept connections as a replica set.

## 3. Configure and start the API

```bash
cp .env.example .env
```

Edit `.env`. For a first local run you only need:

```bash
NODE_ENV=development
MONGO_URI=<your connection string>
REDIS_URL=redis://localhost:6379
FIREBASE_PROJECT_ID=placeholder
FIREBASE_CLIENT_EMAIL=placeholder@example.com
FIREBASE_PRIVATE_KEY=placeholder
SMS_DRY_RUN=true
```

Every variable is explained in [ENVIRONMENT.md](ENVIRONMENT.md).

Load demo data, then start the API:

```bash
npm run seed:mustdash   # demo shop "Must Dash" with staff, services, clients, bookings
npm run dev             # API on http://localhost:5000, restarts on file changes
```

Check it:

```bash
curl http://localhost:5000/health
# {"status":"success","data":{"status":"ok", ...}}
```

**Without Redis or Firebase** the API still starts. It prints warnings and
carries on, but without job queues (reminders, push, SMS), caching or real
sign-in. That is fine for trying the dashboard.

`npm run seed:mustdash` prints the demo users' IDs and also rewrites
`frontend/public/dev-seed.json` with them, so the dashboard's dev sign-in
buttons point at your database. That file is committed; don't commit your
local version of it unless you mean to.

## 4. Start the web dashboard

```bash
cd frontend
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-to-a-long-random-string
EOF
npm run dev   # http://localhost:3000
```

### Signing in locally

Open <http://localhost:3000/auth/signin> and click **Login as Test Owner** to
enter the Must Dash owner dashboard, or **Login as Test Admin** for the admin
console at `/admin`. These buttons only work while the API runs with
`NODE_ENV=development`. They send the `x-dev-user-id` header instead of a
Firebase token, and the API ignores that header in any other mode.

To call the API yourself as the demo owner:

```bash
curl -H "x-dev-user-id: mustdash-owner-dev" http://localhost:5000/api/v1/auth/me
```

## 5. Mobile apps

The customer app and the staff/business app are Flutter apps kept in
**separate repositories**, not in this one. To run them against your local
API, point their API base URL at your machine's address with `/api/v1`, for
example `http://192.168.1.20:5000/api/v1` (an Android emulator reaches the
host at `http://10.0.2.2:5000/api/v1`). They use Firebase for sign-in, so
real sign-in needs a real Firebase project on both sides.

## More demo data

| Command | What it adds |
|---|---|
| `npm run seed:mustdash-reviews` | Reviews for the Must Dash shop. |
| `npm run seed:discover` | Videos for the Discover feed. |
| `npm run seed:demo-marketplace` | 24 demo businesses across Addis Ababa, with owner logins. Writes their credentials to `demo-output/`. |

`npm run setup:dev` runs `docker compose up -d` and then `seed:mustdash` in one
go (Docker required; the replica set step above is still needed the first time).

## Production build

```bash
npm run build && npm run start          # API: compiles to dist/, runs node dist/server.js
cd frontend && npm run build && npm run start
```

Both builds were run successfully on 2026-11-05. The live API is hosted on
Render. Set the environment variables there, not in files.

## Tests

There is no single `npm test`. Each suite is its own script, for example:

```bash
npm run test:verify          # Verify.ET receipt checks
npm run test:notifications
npm run test:sms
npm run test:tickets
```

The full list is in `package.json`. These integration tests need MongoDB (and
some need Redis), so they were not run as part of writing this guide.

## Common problems

| Message | Fix |
|---|---|
| `Environment validation error: "MONGO_URI" is required` | `.env` is missing or not in the repo root. |
| `Database connection failed` | Wrong `MONGO_URI`, IP not allowed in Atlas, or the local replica set was never initiated (section 2). |
| `Transaction numbers are only allowed on a replica set member` | MongoDB is running standalone. Use Atlas or initiate the replica set. |
| Dashboard stays on "Checking your workspace..." | The API is not running on port 5000, or `NEXT_PUBLIC_API_URL` is wrong. |
| Dev sign-in shows "Dev user not found" | Run `npm run seed:mustdash` against the same database the API uses. |
