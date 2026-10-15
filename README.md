# Barber Project (Zolmi / Verify.ET salon booking)

A booking marketplace for barber shops and salons: a production-style REST API
with realtime updates, plus an owner dashboard and a super-admin console.
Customers book services, owners manage staff, walk-ins, checkout and earnings,
and payments are verified against Verify.ET receipts. It also covers SMS
notifications (SMS Ethiopia), a product marketplace, a Discover video feed,
and an offline-capable owner workspace.

This repo is the API and the owner/admin web app. It is **not** the customer
mobile app; that is a separate client that consumes this API.

## Stack

- **Backend** (`src/`): Node.js, Express 5, TypeScript, MongoDB (Mongoose),
  Redis (cache + BullMQ job queues), Socket.IO, Firebase Admin (push).
- **Frontend** (`frontend/`): Next.js (App Router), NextAuth, Tailwind.

## How to run

Backend, from the repo root:

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev            # starts the API with tsx watch
```

Verified in a clean checkout: `npm install` and `npm run typecheck` both pass.
`npm run dev` and everything below need live services (MongoDB, Redis, and at
least placeholder Firebase credentials; see `.env.example`), so they were not
run as part of writing this README:

- `npm run build` / `npm run start`: compile to `dist/` and run it.
- `npm run setup:dev`: `docker compose up -d` (local Redis) plus demo seed.
- `npm run seed:demo-marketplace`, `seed:mustdash`, `seed:discover`: seeders.
- `npm run test:verify`, `test:notifications`, `test:sms`, `test:tickets`,
  `test:privacy`, `test:ratings`, `test:product-reviews`,
  `test:ticket-archive`: integration test scripts, run individually with tsx
  (there is no single `npm test`).

Frontend:

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000, expects the API on port 5000
```

## What it needs

See `.env.example` for the full list. In short: `MONGO_URI`, `REDIS_URL`,
Firebase admin credentials (`FIREBASE_*`), `VERIFY_ET_API_KEY` for payment
receipt verification, and `SMS_*` for the SMS provider. SMS and Verify.ET can
run in dry-run/placeholder mode for local development.

## Where things are

- `src/models`, `src/services`, `src/controllers`, `src/routes`: the API,
  layered by module (auth, business, booking, staff, products, discover, ...).
- `src/jobs`: BullMQ queues and workers (reminders, notifications, SMS, expiry).
- `src/tests`: unit (`*.test.ts`) and integration (`*.integration.ts`) scripts.
- `frontend/src/app`: owner dashboard pages plus the `/admin` console.
- `uploads/`: committed demo/seed media served by the API.
- `API_REFERENCE.md` and the other root `*.md` files: deeper flow docs
  (booking receipts, SMS, offline mode, privacy/safety).

## Known gaps

- Tests are standalone tsx scripts, not wired to a single test runner.
- `uploads/` mixes demo seed media into the repo; real deployments should use
  external storage.
