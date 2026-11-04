# Backend API

The Elvezet REST and realtime API: Node.js, Express 5 and TypeScript, on
MongoDB, with Redis for job queues, caching and rate limits. Every client (the
customer app, the business/staff app, and the web dashboard) uses it.

The commands below are run from the **repo root** (where `package.json` is),
not from `src/`.

## Run it

```bash
npm ci
cp .env.example .env     # fill in MONGO_URI at least; see docs/ENVIRONMENT.md
npm run seed:mustdash    # optional demo shop
npm run dev              # http://localhost:5000, reloads on change
curl http://localhost:5000/health
```

Step-by-step setup, including the database: [docs/INSTALLATION.md](../docs/INSTALLATION.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API with `tsx watch` (TypeScript, auto-reload). |
| `npm run typecheck` | Type-checks without building. |
| `npm run build` / `npm run start` | Compiles to `dist/`, then runs `node dist/server.js`. |
| `npm run lint` | ESLint. |
| `npm run setup:dev` | `docker compose up -d` and then `seed:mustdash`. |
| `npm run seed:mustdash` | Demo shop "Must Dash": owner, admin, customer, three staff, services, products, clients, today's bookings. Prints dev sign-in IDs. |
| `npm run seed:mustdash-reviews` | Demo reviews for Must Dash. |
| `npm run seed:demo-marketplace` | 24 demo businesses with owner logins (written to `demo-output/`). |
| `npm run seed:discover` | Demo videos for the Discover feed. |
| `npm run recalc:ratings` | Recomputes every business's rating from its reviews. |
| `npm run enable:shop-products` | One-off: turns on product selling for all active shops and fills in product details for the customer Marketplace. |
| `npm run update:mustdash-location` | Moves the demo shop (uses `MUSTDASH_*`). |
| `npm run notifications:check` | Read-only check of push-notification device tokens and database indexes. |
| `npm run test:*` | Integration test scripts: `verify`, `notifications`, `sms`, `tickets`, `ticket-archive`, `privacy`, `ratings`, `product-reviews`. |

## Configuration

All settings are environment variables, checked at startup by
`config/env.ts`. The full list with defaults is in
[docs/ENVIRONMENT.md](../docs/ENVIRONMENT.md). Required: `MONGO_URI`,
`REDIS_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`.

What happens when an outside service is missing:

| Missing | Result |
|---|---|
| MongoDB | The API exits at startup. |
| Redis | The API starts, but without queues (push, reminders, SMS, expiry), cache or shared rate limits. |
| Real Firebase credentials | The API starts, but real tokens can't be checked. Use `x-dev-user-id` in development. |
| `VERIFY_ET_API_KEY` | Payment receipts can't be verified, so bookings stay pending. |
| SMS settings | SMS is off. Use `SMS_DRY_RUN=true` to simulate. |

## API

- Base path: `/api/v1` (`/api` also works).
- Sign-in: `Authorization: Bearer <Firebase ID token>`.
- Responses: `{ "status": "success", "data": ... }` or
  `{ "status": "error", "message": "...", "data": null }`.
- Every endpoint: [docs/API_ENDPOINTS.md](../docs/API_ENDPOINTS.md).
- Request and response bodies: [API_REFERENCE.md](../API_REFERENCE.md).

## Layout

```
src/
  server.ts        startup: database, Redis, workers, Socket.IO, HTTP server
  app.ts           Express app: security headers, CORS, rate limits, uploads, routes
  config/          environment, MongoDB, Redis, Firebase, proxy settings
  routes/          URL to handler mapping (index.ts mounts them all)
  middlewares/     sign-in, roles, validation, rate limits, errors
  validators/      Joi schemas for request bodies and queries
  controllers/     turn HTTP requests into service calls
  services/        business logic: bookings, payments, notifications, SMS, chat, ...
  models/          Mongoose models (User, Business, Booking, Service, StaffProfile, ...)
  jobs/            BullMQ queues and workers (notifications, reminders, sms, booking-expiry)
  scripts/         seeders and maintenance scripts
  tests/           *.test.ts (unit) and *.integration.ts (need MongoDB)
  utils/, types/   shared helpers and types
```

How the pieces connect, including the booking and payment flow:
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Known gaps

- No single test runner: each suite is a separate `tsx` script.
- `CLOUDINARY_*` and `FIREBASE_WEB_API_KEY` are accepted but not used. Media
  is stored on local disk in `uploads/`, which does not survive a redeploy
  on hosts with temporary disks.
- The Chapa payment endpoints still exist but always return `410 Gone`.
- Every user route is also mounted a second time under `/api/notifications/`
  (an old path kept for older app builds).
