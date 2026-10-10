# Zolmi website offline operation

The owner website and combined Business app support durable offline walk-ins.
Super Admin actions remain online. Existing workspace layouts are preserved.
Owners can review staff-created conflicts, revise artist/time with server checks, or cancel the local request. Online appointments are preserved.

## Supported workflows

- Reopen the owner dashboard and other owner pages after the service worker has
  finished downloading their application documents and static assets online.
- Read downloaded calendars, clients/history, services, staff, products, reviews,
  dashboard reports, earnings and business profile information. Data is a saved
  snapshot, not a promise that no one else has changed it.
- Queue walk-ins, service/product creation, service/product edits and deletion,
  client notes, appointment notes/services/tips, and safe staff profile flags.
- Record a cash or in-shop checkout locally. Payment is not labelled paid until
  the server accepts it. Changed prices cause a conflict rather than silently
  recording a different amount. Normal stock checks still run on synchronization.
- Queue earnings payments, adjustments and reversals through the existing
  earnings API's durable idempotency key. These record money already paid; they
  never transfer money.

Accounts/permissions/commissions, staff account creation, business/payment/SMS
settings, uploads, live online-booking confirmation, cancellation/rescheduling,
receipt verification, tickets and messages require an online connection. Their
existing UI is retained; they do not silently enter the generic outbox.

Both API deployment and website deployment are required. The client checks the
authenticated `/website-sync/capabilities` before enabling the outbox. When
connected to an older backend, supported actions retain their ordinary online
behavior. Offline saving requires one successful connection to the new backend.

## Presentation

- One two-second glass notice per offline transition; no page shift or persistent
  yellow banner.
- Compact bottom-right saved-work control, styled with the website's existing
  indigo, slate, borders and rounded white surfaces.
- Matching side panel lists pending work, failures, conflicts and last sync.
- A conflict never auto-overwrites a newer value. Keep the server version and
  reopen the existing record to enter a revised change. Later queued operations
  are held if their prerequisite was discarded.
- Browser sign-out warns before deleting unsynced work. Closing the tab is not
  sign-out: saved work remains on that browser for the same account.

## Persistence and synchronization

`frontend/src/lib/offline/store.ts` stores encrypted IndexedDB records using
non-exportable per-account AES-GCM CryptoKeys. Scopes include the API base URL and
Firebase account ID. Offline identity is only a browser view; every replay is
authenticated and authorized again by the server. API tokens are not stored in
the snapshot store. This does not make data accessible to malicious scripts safe;
an unlocked browser and XSS remain part of the browser security boundary.

Snapshots are limited to 250 responses / approximately 15 MB / 30 days. Pending
writes are separate, limited to 150, and never silently evicted to make room for
cache. Storage failures reject local saves. If browser storage is cleared, the
device is lost, or sign-out deletes pending work, unsynced work cannot be recovered
from the server. Use a trusted browser/device for private business data.

The outbox commits before reporting a local save. Before first replay it freezes
the request body, baseline and key; an ambiguous response is retried unchanged.
Cross-tab sync uses Web Locks where available. Temporary IDs are mapped only
after acknowledgement, then dependent operations use the returned record version.

`POST /website-sync/:shopId` allows a deliberately small set of owner mutations.
Authorization, record versions, validation, business operation, and the unique
actor/key result ledger protect the server write. The operation and ledger commit
in one Mongo transaction. Booking/checkout transactions join that transaction;
notifications execute after commit. A housekeeping notification timestamp does
not invalidate a booking: booking content has a separate hash. Changed booking
content, stock records and appointment conflicts require review.

Sync runs on reconnection, website focus, manual retry, and periodically while the
website is visible. It is not promised while the browser is closed. New bookings,
messages and remote status changes cannot arrive while fully disconnected.

The service worker caches only anonymous owner application HTML, hashed static
assets and explicitly public Cloudinary images. It excludes API, admin, auth and
private uploads. Sensitive API data uses the scoped IndexedDB store instead.
HTTPS (or localhost for tests) is required. First-ever use still needs internet.

## Verification and release

- Backend integration: `node --import tsx src/tests/website-offline.integration.ts`
  uses a new `website_offline_test_*` database and deletes only that database.
- Browser runtime/service-worker tests and their result live under the workspace's
  `.agent_context/website-offline-*` files.
- Build with the live `NEXT_PUBLIC_API_URL` and `npm run build` from `frontend`.
- Source hashes, dirty revision and release state are recorded in
  `.agent_context/website-offline-build-source.json` at the workspace root.
- Deploy the backend before the frontend. Do not publish unrelated working changes
  from other chats. Keep the mutation ledger; do not add a short expiry to it.
- Verify signed-in production offline reload, local save, reconnection, a second
  device conflict, account switching and sign-out on a trusted test browser before
  claiming production end-to-end verification.

Implementation/build verification is separate from deployment. See the release
audit for the actual published state; this document does not assert deployment.
