# API endpoint index

Every HTTP endpoint the backend serves, read from the live Express router
(215 endpoints). For request and response bodies of the main ones,
see [`API_REFERENCE.md`](../API_REFERENCE.md).

- Every path also works with the `/api/v1` prefix (for example
  `/api/v1/bookings/mine`). The web dashboard and apps use `/api/v1`.
- "Signed-in" means the request sends `Authorization: Bearer <Firebase ID token>`.
- Every user route under `/api/...` is also reachable under
  `/api/notifications/...` (22 aliases, not listed again). This is an old
  mount kept for older app builds.
- Not under `/api`: `GET /health` (status check) and `/uploads/...` (media files;
  payment receipts and ID cards are private and need sign-in).

To regenerate this list after adding routes, see the note at the bottom.

## Contents

- [Auth and accounts](#auth-and-accounts)
- [Current user](#current-user)
- [Businesses](#businesses)
- [Services](#services)
- [Staff (self-service)](#staff-self-service)
- [Bookings, payments, tickets and chat](#bookings-payments-tickets-and-chat)
- [Owner dashboard](#owner-dashboard)
- [Earnings](#earnings)
- [Barber workspace](#barber-workspace)
- [Independent professionals](#independent-professionals)
- [Products](#products)
- [Reviews](#reviews)
- [Categories](#categories)
- [Category suggestions](#category-suggestions)
- [Discover video feed](#discover-video-feed)
- [SMS notifications](#sms-notifications)
- [Offline sync (web dashboard)](#offline-sync-web-dashboard)
- [Business posters](#business-posters)
- [Content reports](#content-reports)
- [Account deletion requests](#account-deletion-requests)
- [Admin console](#admin-console)
- [Webhooks](#webhooks)

## Auth and accounts

Sign-up and sign-in are public. Everything else needs a Firebase ID token.

| Method | Path |
|---|---|
| `PATCH` | `/api/auth/change-password` |
| `POST` | `/api/auth/customer-checkout` |
| `PUT` | `/api/auth/customer/password` |
| `POST` | `/api/auth/customer/register` |
| `POST` | `/api/auth/customer/signin` |
| `GET` | `/api/auth/dev-seed-info` |
| `POST` | `/api/auth/google` |
| `GET` | `/api/auth/me` |
| `PATCH` | `/api/auth/me/update` |
| `POST` | `/api/auth/signin` |
| `POST` | `/api/auth/signup` |
| `GET` | `/api/auth/workspaces` |

## Current user

Signed-in user: profile, favorites, notification settings, device tokens, inbox.

| Method | Path |
|---|---|
| `DELETE` | `/api/users/me` |
| `GET` | `/api/users/me/blocked-users` |
| `POST` | `/api/users/me/blocked-users` |
| `DELETE` | `/api/users/me/blocked-users/:id` |
| `GET` | `/api/users/me/bookings` |
| `POST` | `/api/users/me/community-guidelines` |
| `POST` | `/api/users/me/device-tokens` |
| `DELETE` | `/api/users/me/device-tokens` |
| `GET` | `/api/users/me/favorites` |
| `POST` | `/api/users/me/favorites` |
| `DELETE` | `/api/users/me/favorites/:businessId` |
| `GET` | `/api/users/me/notification-preferences` |
| `PATCH` | `/api/users/me/notification-preferences` |
| `GET` | `/api/users/me/notifications` |
| `GET` | `/api/users/me/notifications/:id/destination` |
| `PATCH` | `/api/users/me/notifications/:id/read` |
| `POST` | `/api/users/me/notifications/read-all` |
| `GET` | `/api/users/me/notifications/unread-count` |
| `GET` | `/api/users/me/receipts` |
| `GET` | `/api/users/me/reviews` |
| `GET` | `/api/users/me/tickets` |

## Businesses

Browsing is public (optional sign-in). Creating and editing needs the business owner; moderation needs a moderator.

| Method | Path |
|---|---|
| `GET` | `/api/businesses` |
| `POST` | `/api/businesses` |
| `GET` | `/api/businesses/:businessId` |
| `GET` | `/api/businesses/:businessId/product-reviews` |
| `GET` | `/api/businesses/:businessId/reviews` |
| `GET` | `/api/businesses/:businessId/services` |
| `GET` | `/api/businesses/:businessId/staff` |
| `PATCH` | `/api/businesses/:id` |
| `POST` | `/api/businesses/:id/cover` |
| `POST` | `/api/businesses/:id/gallery` |
| `DELETE` | `/api/businesses/:id/gallery/:imageIndex` |
| `POST` | `/api/businesses/:id/id-card` |
| `POST` | `/api/businesses/:id/logo` |
| `POST` | `/api/businesses/:id/quote` |

## Services

Reading is public. Changes need the business owner.

| Method | Path |
|---|---|
| `GET` | `/api/services/:businessId` |
| `POST` | `/api/services/:businessId` |
| `PATCH` | `/api/services/:serviceId` |
| `DELETE` | `/api/services/:serviceId` |
| `GET` | `/api/services/item/:serviceId` |

## Staff (self-service)

Signed-in user with the staff or owner role. Powers the staff mobile app.

| Method | Path |
|---|---|
| `POST` | `/api/staff` |
| `GET` | `/api/staff/me/absences` |
| `POST` | `/api/staff/me/absences` |
| `DELETE` | `/api/staff/me/absences/:id` |
| `GET` | `/api/staff/me/availability` |
| `POST` | `/api/staff/me/availability` |
| `GET` | `/api/staff/me/bookings` |
| `PATCH` | `/api/staff/me/bookings/:id/complete` |
| `PATCH` | `/api/staff/me/bookings/:id/no-show` |
| `PATCH` | `/api/staff/me/bookings/:id/start` |
| `GET` | `/api/staff/me/bookings/calendar` |
| `GET` | `/api/staff/me/bookings/timeline` |
| `GET` | `/api/staff/me/profile` |
| `GET` | `/api/staff/me/stats` |
| `PATCH` | `/api/staff/me/visibility` |

## Bookings, payments, tickets and chat

Signed-in customer, owner or assigned staff. Receipts are checked with Verify.ET.

| Method | Path |
|---|---|
| `POST` | `/api/bookings` |
| `PATCH` | `/api/bookings/:id/cancel` |
| `POST` | `/api/bookings/:id/chapa/initialize` |
| `GET` | `/api/bookings/:id/chapa/return` |
| `POST` | `/api/bookings/:id/chapa/verify` |
| `PATCH` | `/api/bookings/:id/checkout` |
| `PATCH` | `/api/bookings/:id/confirm-payment` |
| `GET` | `/api/bookings/:id/conversation` |
| `GET` | `/api/bookings/:id/messages` |
| `POST` | `/api/bookings/:id/messages` |
| `POST` | `/api/bookings/:id/pay` |
| `GET` | `/api/bookings/:id/payment-guidance` |
| `POST` | `/api/bookings/:id/payment-verification/refresh` |
| `GET` | `/api/bookings/:id/receipt` |
| `PATCH` | `/api/bookings/:id/reschedule` |
| `GET` | `/api/bookings/:id/ticket` |
| `PATCH` | `/api/bookings/:id/upload-screenshot` |
| `POST` | `/api/bookings/availability/check` |
| `POST` | `/api/bookings/availability/range` |
| `GET` | `/api/bookings/mine` |
| `POST` | `/api/bookings/tickets/verify` |

## Owner dashboard

Signed-in owner of the shop in the URL (`:shopId`).

| Method | Path |
|---|---|
| `GET` | `/api/dashboard/:shopId/analytics` |
| `GET` | `/api/dashboard/:shopId/bookings` |
| `PATCH` | `/api/dashboard/:shopId/bookings/:id` |
| `PATCH` | `/api/dashboard/:shopId/bookings/:id/cancel` |
| `PATCH` | `/api/dashboard/:shopId/bookings/:id/status` |
| `GET` | `/api/dashboard/:shopId/clients/:id/history` |
| `PATCH` | `/api/dashboard/:shopId/clients/:id/notes` |
| `GET` | `/api/dashboard/:shopId/clients/search` |
| `GET` | `/api/dashboard/:shopId/customers` |
| `GET` | `/api/dashboard/:shopId/dashboard` |
| `GET` | `/api/dashboard/:shopId/end-of-day` |
| `GET` | `/api/dashboard/:shopId/products` |
| `POST` | `/api/dashboard/:shopId/products` |
| `PATCH` | `/api/dashboard/:shopId/products/:id` |
| `DELETE` | `/api/dashboard/:shopId/products/:id` |
| `POST` | `/api/dashboard/:shopId/products/upload-image` |
| `GET` | `/api/dashboard/:shopId/revenue` |
| `POST` | `/api/dashboard/:shopId/services` |
| `PATCH` | `/api/dashboard/:shopId/services/:id` |
| `DELETE` | `/api/dashboard/:shopId/services/:id` |
| `GET` | `/api/dashboard/:shopId/staff` |
| `POST` | `/api/dashboard/:shopId/staff` |
| `GET` | `/api/dashboard/:shopId/staff-stats` |
| `PATCH` | `/api/dashboard/:shopId/staff/:id` |
| `GET` | `/api/dashboard/:shopId/staff/:id/absences` |
| `POST` | `/api/dashboard/:shopId/staff/:id/absences` |
| `DELETE` | `/api/dashboard/:shopId/staff/:id/absences/:absenceId` |
| `PATCH` | `/api/dashboard/:shopId/staff/:id/archive` |
| `GET` | `/api/dashboard/:shopId/staff/:id/availability` |
| `POST` | `/api/dashboard/:shopId/staff/:id/availability` |
| `POST` | `/api/dashboard/:shopId/staff/:id/avatar` |
| `PATCH` | `/api/dashboard/:shopId/staff/:id/visibility` |
| `POST` | `/api/dashboard/:shopId/walk-in` |

## Earnings

Signed-in owner, staff member or independent professional.

| Method | Path |
|---|---|
| `GET` | `/api/earnings/:businessId` |
| `GET` | `/api/earnings/:businessId/:beneficiary` |
| `POST` | `/api/earnings/:businessId/:beneficiary` |
| `GET` | `/api/earnings/independent/me` |
| `GET` | `/api/earnings/staff/me` |

## Barber workspace

Signed-in staff member of a shop: their profile, bookings, clients, time off and inbox. Pick the shop with the `x-business-id` header if they work at more than one.

| Method | Path |
|---|---|
| `GET` | `/api/barber/absences` |
| `POST` | `/api/barber/absences` |
| `DELETE` | `/api/barber/absences/:id` |
| `GET` | `/api/barber/bookings` |
| `POST` | `/api/barber/bookings` |
| `PATCH` | `/api/barber/bookings/:id` |
| `GET` | `/api/barber/clients` |
| `GET` | `/api/barber/clients/:key/bookings` |
| `GET` | `/api/barber/inbox` |
| `POST` | `/api/barber/inbox/read` |
| `GET` | `/api/barber/me` |
| `POST` | `/api/barber/me/avatar` |
| `PATCH` | `/api/barber/profile` |
| `GET` | `/api/barber/schedule` |
| `PUT` | `/api/barber/schedule` |
| `PATCH` | `/api/barber/visibility` |

## Independent professionals

Signed-in independent professional (works without a shop).

| Method | Path |
|---|---|
| `GET` | `/api/independent/absences` |
| `POST` | `/api/independent/absences` |
| `DELETE` | `/api/independent/absences/:id` |
| `GET` | `/api/independent/bookings` |
| `GET` | `/api/independent/bookings/:id` |
| `POST` | `/api/independent/bookings/:id/cancel` |
| `POST` | `/api/independent/bookings/:id/cash-payment` |
| `PATCH` | `/api/independent/bookings/:id/status` |
| `GET` | `/api/independent/customers/:id/bookings` |
| `GET` | `/api/independent/me` |
| `GET` | `/api/independent/schedule` |
| `PUT` | `/api/independent/schedule` |
| `POST` | `/api/independent/setup` |

## Products

Reading is public (optional sign-in). Changes need the business owner.

| Method | Path |
|---|---|
| `GET` | `/api/products` |
| `GET` | `/api/products/:productId` |
| `GET` | `/api/products/:productId/reviews` |
| `POST` | `/api/products/:productId/reviews` |
| `DELETE` | `/api/products/reviews/:reviewId` |

## Reviews

Reading is public. Writing needs a signed-in customer.

| Method | Path |
|---|---|
| `POST` | `/api/reviews` |
| `GET` | `/api/reviews/:reviewId` |
| `PATCH` | `/api/reviews/:reviewId` |
| `DELETE` | `/api/reviews/:reviewId` |
| `GET` | `/api/reviews/business/:businessId` |

## Categories

Reading is public. Changes need an admin or moderator.

| Method | Path |
|---|---|
| `GET` | `/api/categories` |

## Category suggestions

Signed-in owner, active staff, admin or moderator.

| Method | Path |
|---|---|
| `GET` | `/api/category-options` |

## Discover video feed

Reading is public. Managing videos needs an admin or moderator.

| Method | Path |
|---|---|
| `GET` | `/api/discover/videos` |
| `GET` | `/api/discover/videos/:id` |

## SMS notifications

Signed-in business owner.

| Method | Path |
|---|---|
| `GET` | `/api/sms/:businessId` |
| `PUT` | `/api/sms/:businessId` |
| `PUT` | `/api/sms/:businessId/admin` |
| `POST` | `/api/sms/:businessId/pause` |
| `POST` | `/api/sms/:businessId/request` |
| `POST` | `/api/sms/:businessId/test` |
| `POST` | `/api/sms/:businessId/trial` |
| `GET` | `/api/sms/admin/businesses` |

## Offline sync (web dashboard)

Signed-in owner. Replays changes queued while offline.

| Method | Path |
|---|---|
| `POST` | `/api/website-sync/:shopId` |
| `DELETE` | `/api/website-sync/:shopId/conflicts/:id` |
| `GET` | `/api/website-sync/capabilities` |
| `GET` | `/api/website-sync/conflicts` |
| `GET` | `/api/website-sync/operations/:key` |

## Business posters

Signed-in staff, owner or admin. Admins manage posters under `/api/admin/business-posters`.

| Method | Path |
|---|---|
| `GET` | `/api/business-posters` |

## Content reports

Signed-in user reporting content.

| Method | Path |
|---|---|
| `POST` | `/api/content-reports` |

## Account deletion requests

Public. Does not reveal whether an account exists.

| Method | Path |
|---|---|
| `POST` | `/api/account-deletion-requests` |

## Admin console

Admin or moderator only.

| Method | Path |
|---|---|
| `GET` | `/api/admin/account-deletion-requests` |
| `POST` | `/api/admin/account-deletion-requests/:id/verify` |
| `GET` | `/api/admin/business-posters` |
| `POST` | `/api/admin/business-posters` |
| `PATCH` | `/api/admin/business-posters/:id` |
| `DELETE` | `/api/admin/business-posters/:id` |
| `POST` | `/api/admin/categories` |
| `PATCH` | `/api/admin/categories/:id` |
| `DELETE` | `/api/admin/categories/:id` |
| `GET` | `/api/admin/content-reports` |
| `PATCH` | `/api/admin/content-reports/:id` |
| `GET` | `/api/admin/discover/categories` |
| `POST` | `/api/admin/discover/categories` |
| `DELETE` | `/api/admin/discover/categories/:id` |
| `GET` | `/api/admin/discover/videos` |
| `POST` | `/api/admin/discover/videos` |
| `PATCH` | `/api/admin/discover/videos/:id` |
| `DELETE` | `/api/admin/discover/videos/:id` |
| `GET` | `/api/admin/global-stats` |
| `GET` | `/api/admin/notification-delivery` |
| `POST` | `/api/admin/register-tenant` |
| `GET` | `/api/admin/tenants` |
| `PATCH` | `/api/admin/tenants/:id/category` |
| `PATCH` | `/api/admin/tenants/:id/products-enabled` |
| `PATCH` | `/api/admin/tenants/:id/verify` |
| `GET` | `/api/admin/users` |
| `PATCH` | `/api/admin/users/:id/ban` |
| `GET` | `/api/admin/verification-queue` |
| `PATCH` | `/api/admin/verify-barber/:id` |

## Webhooks

Called by Verify.ET. Signed with HMAC (`VERIFY_ET_WEBHOOK_SECRET`).

| Method | Path |
|---|---|
| `POST` | `/api/webhooks/verify-et` |

---

**How this list was made.** It was generated on 2026-11-05 by loading
`src/routes/index.ts` and `src/routes/verifyEt.routes.ts` and recording every
`get/post/put/patch/delete` registered on the Express routers, including nested
routers. If you add or rename routes, update this file in the same change.
