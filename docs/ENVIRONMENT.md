# Environment variables

The backend and the web dashboard read settings from environment variables.
Locally they come from a `.env` file (backend) and `frontend/.env.local` (web
dashboard). Neither file is committed. In production they are set in the
hosting dashboard (Render for the API).

The backend checks its variables at startup (`src/config/env.ts`). If a
required one is missing, it stops with `Environment validation error: ...`.

## Backend (`.env` at the repo root)

Start from the template:

```bash
cp .env.example .env
```

### Required

The API will not start without these.

| Variable | What it is | Example |
|---|---|---|
| `MONGO_URI` | MongoDB connection string. Must be a **replica set** (Atlas is one; the local Docker setup starts one) because bookings and SMS quotas use transactions. | `mongodb://localhost:27017/barber_os?directConnection=true` |
| `REDIS_URL` | Redis connection (job queues, cache, rate limits). Use the TCP URL, not Upstash's REST URL. | `redis://localhost:6379` |
| `FIREBASE_PROJECT_ID` | Firebase project used to check sign-in tokens and send push notifications. | `your-project-id` |
| `FIREBASE_CLIENT_EMAIL` | Service account email from the Firebase console. | `firebase-adminsdk@your-project.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Service account private key. Keep the `\n` escapes and the quotes. | `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` |

For local work without a real Firebase project, placeholder values let the
server start, but real sign-in and push will not work. Use the development
sign-in shortcut instead (see [Installation](INSTALLATION.md#signing-in-locally)).

### Server

| Variable | Default | What it does |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production`. The `x-dev-user-id` sign-in shortcut only works in `development`. |
| `PORT` | `5000` | Port the API listens on. |
| `APP_URL` | (none) | Public URL of the API. Used to build links, for example in payment flows. |
| `REDIS_PASSWORD` | empty | If set, replaces the word `PASSWORD` inside `REDIS_URL`. |
| `MONGO_USER`, `MONGO_PASSWORD` | empty | If set, replace `<db_username>` and `<db_password>` inside `MONGO_URI`. |
| `RENDER` | (set by Render) | When `true`, the API trusts Render's proxy for client IP addresses (rate limiting). Do not set it yourself elsewhere. |

### Payments: Verify.ET

Customers pay by bank transfer and upload the receipt. The API checks the
receipt with [Verify.ET](https://verify.et/docs/api). These are **server-only**
secrets: never put them in an app or the web dashboard.

| Variable | What it does |
|---|---|
| `VERIFY_ET_API_KEY` | API key. Without it, receipts cannot be verified and bookings stay pending. |
| `VERIFY_ET_BASE_URL` | Defaults to `https://verify.et`. |
| `VERIFY_ET_WEBHOOK_SECRET` | `whsec_...` secret used to check that webhook calls really come from Verify.ET. Unsigned webhooks are rejected. |

### SMS: SMS Ethiopia

All three switches must line up for real messages to be sent. See
[`SMS_NOTIFICATIONS.md`](../SMS_NOTIFICATIONS.md) for the delivery rules.

| Variable | What it does |
|---|---|
| `SMS_PROVIDER` | Must be `smsethiopia` for live sending. |
| `SMS_ENABLED` | `true` to send. |
| `SMS_DRY_RUN` | `true` = simulate (nothing is sent or charged; messages are marked "simulated"). **Use `true` locally.** |
| `SMS_API_KEY` | SMS Ethiopia API key. Never commit it. |

Mode summary: `SMS_DRY_RUN=true` means simulated. Otherwise, live only if
`SMS_ENABLED=true`, `SMS_PROVIDER=smsethiopia` and `SMS_API_KEY` is set.
Anything else means SMS is off (push notifications still work).

### Booking rules (optional tuning)

| Variable | Default | Allowed | What it does |
|---|---|---|---|
| `BOOKING_LOCK_TTL_SECONDS` | `180` | 120–300 | How long a time slot is held while a customer is booking it. |
| `REMINDER_LEAD_MINUTES` | `60` | 5–1440 | How long before an appointment the reminder is sent. |
| `CANCELLATION_WINDOW_MINUTES` | `120` | 0–1440 | Customers cannot cancel closer to the appointment than this. |
| `NO_SHOW_GRACE_MINUTES` | `15` | 1–240 | How late a customer can be before being marked a no-show. |
| `NO_SHOW_SWEEP_INTERVAL_MINUTES` | `5` | 1–120 | How often the no-show check runs. |
| `CACHE_TTL_SECONDS` | `300` | 60–3600 | How long cached reads live in Redis. |

### Declared but not used yet

The validator accepts these, but no code reads them today. Setting them has no
effect: `FIREBASE_WEB_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `CLOUDINARY_PROFILE_PICTURE_FOLDER`. Uploaded media is
stored on the server's disk in `uploads/`.

### Seed scripts and tests only

| Variable | Used by |
|---|---|
| `MUSTDASH_LATITUDE`, `MUSTDASH_LONGITUDE`, `MUSTDASH_ADDRESS` | `npm run seed:mustdash`: where to place the demo shop. |
| `SMS_TEST_RECIPIENT`, `SMS_TEST_APPROVED` | `src/scripts/testSmsDelivery.ts`: sends one real test SMS. |
| `TEST_REDIS_URL` | Rate-limit tests against a real Redis. |
| `ISOLATED_MONGO_MODULE`, `ISOLATED_MONGO_BINARIES` | Integration tests that start a throwaway MongoDB. |

## Web dashboard (`frontend/.env.local`)

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes for local work | API base URL **including** `/api/v1`. Example: `http://localhost:5000/api/v1`. If unset, it falls back to `http://localhost:5000/api/v1` in the browser, but `next.config.ts` falls back to the production API on Render. Set it explicitly. |
| `NEXTAUTH_SECRET` | Yes | Random string that signs login sessions. Generate one with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | In production | Public URL of the dashboard, read by NextAuth. Locally `http://localhost:3000`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | For real sign-in | Firebase **web** app config (Firebase console, Project settings, Your apps). These are public by design. |
| `NEXT_PUBLIC_DEV_OWNER_FIREBASE_UID`, `NEXT_PUBLIC_DEV_ADMIN_FIREBASE_UID` | No | Which seeded user the development sign-in buttons log in as. |
| `API_URL` | No | Server-side override of the API URL, used only by the dev seed info route. |

Example `frontend/.env.local` for local work:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-to-a-long-random-string
```

## Mobile apps

The Flutter apps live in separate repositories. They need the API base URL
(`.../api/v1`) and their own Firebase config files. They must never contain the
Verify.ET or SMS keys.
