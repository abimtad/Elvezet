# Booking notifications and SMS

Implemented from the supplied SMS and non-interference plans.

## Delivery rules

- A subscribed shop alerts its explicitly configured shop number and each active assigned staff user's phone. Mongo IDs and Firebase UIDs are resolved. Normalized duplicate phone numbers receive one message per event.
- An independent alerts its SMS contact override, falling back to its owner's phone. No second staff message is sent.
- Pending creations and genuine pending-to-confirmed transitions are separate events. Directly confirmed bookings generate the creation alert without a redundant confirmation alert. Walk-ins use the same rules.
- Customer push preferences only affect push. Business subscription/event settings only affect SMS.
- Customer reminders are skipped for cancelled, completed, past or moved appointments. No SMS reminders are enabled.

## Reliability

Booking creation and status saves persist notification event names with the booking. A recovery loop retries undispatched events every 15 seconds. Notification enqueue failures do not undo booking/payment success. Existing socket refreshes remain separate.

The SMS Mongo outbox survives queue outages. Push, reminder and SMS BullMQ queues remain independent. Stable job/message keys deduplicate repeated confirmations. Jobs retry five times with exponential backoff; SMS delivery uses a processing lease. Atomic transaction-based quota reservations prevent concurrent workers exceeding quota. Only actual successful SMS increments usage; failed or simulated sends release reservations. Subscriptions, consent and event eligibility are checked again before sending.

Unique database indexes must exist before production traffic (`SmsMessage.idempotencyKey`, `SmsSubscription.businessId`). Mongo transactions require a replica set, as used by this project's Atlas deployment. Keep completed queue jobs while events can replay; do not indiscriminately purge deduplication state.

## Configuration

`SMS_DRY_RUN=true` enables the simulation adapter. Its messages are marked **simulated**, never **sent**, and do not consume paid usage. No external requests or recipient phone/body logs are made.

SMSEthiopia v2 is now implemented using the documented `KEY` header, `msisdn`/`text` payload, real message IDs and status lookup. Server-only `.env.sms.local` is ignored by Git and contains the supplied campaign credential; do not expose it through Flutter, browser builds or logs. `SMS_PROVIDER=smsethiopia`, `SMS_ENABLED=true` and `SMS_DRY_RUN=false` are all required for normal live sending. Keep simulation enabled until the intended recipient phones and campaign are ready. Rotate the key shared in chat before production deployment.

Source: https://smsethiopia.com/#/landing/docs/api-v2 . Sending has a 10-second timeout and rejects redirects. Accepted, sent and handset-delivered states are distinct. Delivery lookup runs at most once per minute per tracked message for seven days. Multipart GSM/Unicode segments, rather than messages, consume quota. Known whitelist (10007), balance, authentication and sender approval errors fail without five duplicate retries; rate-limited sends retry with backoff.

The provider documentation does not expose a send idempotency field. An interrupted or ambiguous request is marked **unknown** and is not resent automatically. Its quota reservation remains until an operator reconciles the provider logs. A saved provider ID allows quota finalization and delivery lookup without resending. Do not claim exactly-once network delivery.

The explicitly approved one-message probe on 2026-10-14 returned **DELIVERED**, consuming one segment. It used an isolated temporary database and the same outbox delivery function, not a real customer appointment. As of 2026-10-17, the local SMS configuration is enabled for live sending (SMS_ENABLED=true, SMS_DRY_RUN=false). Restart the backend to load these changes. Live delivery still requires an eligible shop subscription, owner consent, event settings, quota and provider credit. Render must receive the same settings and API key through its environment settings; the ignored local file is not deployed through Git. No new real message was sent during this configuration change. `src/scripts/testSmsDelivery.ts` requires an explicit recipient and `SMS_TEST_APPROVED=true`; it never retries the send request.

Push still requires valid Firebase Admin credentials and registered device tokens. The current local private key is invalid, and native Firebase config files are absent. Real handset push is not verified. SMS does not depend on Firebase. Push batches respect the 500-token FCM limit; per-device transient failures are retried without including known successful devices, and invalid device tokens are removed. A transport-level ambiguous FCM failure can still cause at-least-once delivery.

## Settings and access

- Independent app: Business > SMS booking alerts.
- Zolmi owner app: Subscription opens SMS booking alerts.
- Web owner dashboard: Settings > Notifications opens `/settings/sms`.
- Owner-scoped API: `/api/v1/sms/:businessId` GET/PUT; POST `/trial`, `/pause`, `/test`.
- Admin-only PUT `/api/v1/sms/:businessId/admin`: status, monthlyQuota and optional renewPeriod. Renewal is rejected while deliveries have reserved quota. Admin grants do not bypass owner consent.

Owners can opt in, save contact/event settings, start one 200-message/30-day trial, pause, test and view the last 50 delivery statuses. A trial cannot be re-granted through the owner endpoint. Test sending is rate-limited and uses normal subscription/quota checks. Numbers and SMS content are excluded from default message queries. Contact saving does not claim OTP verification.

## Verification

`node --import tsx src/tests/sms.integration.ts` creates and removes only a uniquely named `sms_test_*` database, using simulated or fake providers. It covers routing, normalized dedupe, replay, push-preference independence, simulation accounting, concurrent quota reservation, provider failures, subscription pause and durable events when Redis is unavailable.

## Not claimed as complete

Billing/automatic paid renewal, phone OTP, Amharic templates, SMS cancellation/reschedule/reminder templates, customer inbox, push delivery audit dashboard and infrastructure alerting remain future integrations. Exactly one approved real test SMS has been delivered. This change does not certify native push or store release readiness.
