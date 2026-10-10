# Privacy and Safety Release Notes

Scope: notification preferences, misleading Discover demos, account deletion,
iOS permission configuration, user-generated content safety, and privacy copy.

## Implemented

- Authenticated notification preferences persist in MongoDB. Marketing defaults
  to off. The push sender honors booking, reminder, and marketing preferences.
- The customer client registers and refreshes native push tokens only after device
  permission, and unregisters its token on sign-out. Browser previews save account
  preferences but do not claim that native push is available.
- The three unrelated playback demos have accurate titles and are hidden. The
  seed repairs only records with their original misleading title and matching ID.
- Customer and business account pages offer explicit, typed-confirmation deletion.
  Production deletion requires a recent verified Firebase sign-in. The public
  `/account-deletion` page creates a support request without revealing whether an
  account exists; administrators must verify ownership before acting.
- Cleanup locks the account, deletes its Firebase identity, removes personal
  records and local media, scrubs customer contacts, closes owned businesses,
  and unlinks paid bookings. Paid records expire after 730 days. Completed request
  metadata expires after 30 days; unverified public requests expire after 90 days.
  Failed cleanup remains queued and retries, rather than reporting false success.
  Slow cleanup returns an accepted/pending response after a bounded five-second
  wait and continues in the durable job, so the app does not wait indefinitely.
- Business and product reviews, Discover videos, and businesses have reporting controls.
  Review authors can be blocked and unblocked. Authenticated chat checks both
  participation and blocks. Basic text screening is supplemental, not a substitute
  for human moderation. Posting reviews requires agreement to community guidelines.
- `/admin/safety` supplies report dismissal/removal and account-request queues.
  Removed reviews no longer contribute to ratings. Owners cannot edit or delete
  another person's review just because it concerns their business.
- Public business responses exclude private home coordinates and ID documents.
  ID-card and payment-proof uploads require authorized authentication; they are
  not exposed by the general static upload server. Business debug logging does
  not log request or response bodies and is disabled in release builds.
- Both apps contain privacy manifests and photo purpose strings. The customer
  app also declares foreground location and receipt-camera purposes. Its Podfile
  disables the geolocator background-location permission requirement. Native push
  signing uses development/release APNs entitlements appropriately.

## Still Requires Production Configuration or External Verification

These cannot be verified from Windows or fabricated as project credentials:

- Register the actual Firebase apps and supply their native configuration files.
  Configure Firebase Admin credentials and the Apple APNs key. Test push delivery,
  permission denial, token refresh, sign-out and deletion on physical devices.
- On macOS, install iOS dependencies and archive both apps with the actual Apple
  team and registered bundle identifiers. Inspect the merged privacy manifest and
  test camera, photo and location denial and limited-photo access. No native iOS
  build or store approval is implied by passing web checks.
- Publish the privacy and account-deletion pages at real HTTPS URLs and enter
  those URLs in store listings. Configure production API URLs; localhost is only
  the development preview. Verify the legal operator identity and support inbox.
- Verify hosting encryption/access controls and actual backup and access-log
  retention. The policy intentionally avoids unsupported encryption and retention
  claims. Update its deployment-specific details before publication.
- Complete Apple App Privacy and Google Play Data Safety declarations from the
  final shipped build and SDKs. Account identifiers/contact details, appointments,
  payment references/proof, location when requested, selected media, reviews,
  messages, reports, blocks and push tokens are relevant. Embedded third-party
  content needs review too. Do not select "no data collected" or claim no sharing
  solely because the app has no advertising SDK.
- Assign people to the moderation and deletion queues, establish response and
  appeal procedures, and test ownership verification. Automated filtering cannot
  guarantee detection of harmful media or every language. The queue requires
  operational staffing, not just code.

## Verification

Backend: `npm run typecheck` and `npm run test:privacy`. The latter uses a unique
temporary database, checks its name before cleanup, and never deletes real users.
Customer: `flutter analyze` and `flutter test`, including preference rollback and
exact deletion confirmation. Business: `flutter analyze` and existing workflow
tests. Admin: TypeScript and targeted ESLint checks; local browser verification.
