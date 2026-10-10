# Booking receipts, conversations and SMS access

Checkpoint before changes: parent d20b1b4, backend 8f4366b.

Customer bookings remain pending until receipt verification succeeds. Current and
History use the existing customer segmented-control styling. Pending bookings
can reopen their conversation to continue payment. Text messages are stored in
MongoDB and accessible only to the customer and business owner. The customer,
owner web dashboard, owner mobile app and independent app have conversation
controls. Receipt uploads use the protected payment-proof storage route.

Verify.ET: https://verify.et/docs/api

The adapter merges transaction data with processing metadata, uses stable image
idempotency keys and bounded request timeouts. Payment confirmation requires
successful verification, an explicitly matched receiving account, exact ETB
amount and a bank transaction reference. A unique transaction index prevents
one reference from paying multiple bookings. Confirmation atomically checks
that the booking is still pending/unpaid. Expired/cancelled bookings are not
revived. Background polling resumes queued verification without resending the
image. Unsigned webhooks are rejected; successful acknowledgments follow saved
processing. Missing transaction details never count as a paid booking.

Shop owners configure receiving details in Settings > Payment account on web,
or Shop profile on mobile. Independent professionals use their existing payment
settings. An SMS phone number is not a payment account fallback.

SMS requests can be captured during admin onboarding or independent setup, and
businesses can request access later from SMS settings. Super admins manage
access, segment quota, suspension and a new 30-day period at /admin/sms.
Admin approval is checked both when events are queued and when messages send;
owner consent and event settings still apply. Existing subscriptions without
adminEnabled=true require administrator approval. Usage is not reset merely by
changing access. Renewal with outstanding reservations is rejected.

Verification performed locally:
- TypeScript backend and frontend checks.
- Customer release web build and booking-toggle browser check.
- Flutter checks for customer booking, owner and independent modifications.
- Temporary-database integration checks for receipt amount/recipient/reference
  reuse, pending and expired states, participant-only messages and admin SMS.
- SMS simulation integration checks including admin approval and quotas.

External configuration still required:
- Read-only provider check: the existing key works; image processing is disabled,
  image balance is 0, and regular verification balance is 200. The account owner
  must enable image processing and fund image credits before real uploads work.
- No real receipt was submitted and no verification credits were spent in tests.
- VERIFY_ET_WEBHOOK_SECRET is not set locally. Register a public HTTPS webhook
  and store its endpoint secret to use callbacks. Polling is available locally.
- SMS workers remain in simulation. No additional live SMS was sent.

The automated tests do not certify a real bank receipt or native phone delivery.
