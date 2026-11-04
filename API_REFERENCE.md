# Barber Shop Backend API Reference (Code-Derived)

This reference covers request and response bodies for the main endpoints. It is
not the full list: **every** endpoint (200+) is listed in
[`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md). Paths here use the `/api`
prefix; `/api/v1` works the same way.

## 1) Base URLs

- API base: `http://localhost:5000/api`
- Health: `GET http://localhost:5000/health`

Health response:

```json
{
  "status": "success",
  "data": {
    "status": "ok"
  }
}
```

## 2) Response Envelope

All JSON responses use this envelope:

- Success:

```json
{
  "status": "success",
  "data": {}
}
```

- Error:

```json
{
  "status": "error",
  "data": null,
  "message": "Error message"
}
```

Validation errors return `data` as an array of messages.

```json
{
  "status": "error",
  "data": ["\"field\" is required"],
  "message": "Validation failed"
}
```

## 3) Authentication

Protected endpoints require:

- Header: `Authorization: Bearer <FIREBASE_ID_TOKEN>`

Common auth errors:

- `401 Missing or invalid authorization header`
- `401 Unauthorized`
- `401 Invalid or expired Firebase ID token`

## 4) Data Contracts by Endpoint

Request body fields are grouped as:

- Required: enforced by validator and/or model constraints
- Optional: accepted in request
- Model defaults: omitted fields automatically set by model/service

---

## Auth

### POST /api/auth/signup

Auth: Public

Request body:

- Required:
  - `firebaseUid`: string, min 6, max 128
  - `fullName`: string, min 2, max 120
  - `email`: valid email
  - `phoneNumber`: string, min 7, max 20
- Optional:
  - `profilePicture`: string (`http(s)` URL or image data URI). If provided, it is uploaded to Cloudinary and the stored user field contains the Cloudinary secure URL.

Success `201` (`data` = user document):

```json
{
  "status": "success",
  "data": {
    "_id": "661111111111111111111111",
    "firebaseUid": "firebase_uid_123456",
    "fullName": "John Doe",
    "email": "john@example.com",
    "roles": ["customer"],
    "phoneNumber": "+251900000000",
    "profilePicture": "https://res.cloudinary.com/your-cloud/image/upload/v1/barber-shop/profile-pictures/firebase_uid_123456.jpg",
    "noShowCount": 0,
    "createdAt": "2026-04-03T10:00:00.000Z",
    "updatedAt": "2026-04-03T10:00:00.000Z"
  }
}
```

### POST /api/auth/signin

Auth: Public

Request body:

- Required:
  - `idToken`: string
    Success `200` (`data` = session payload):

  Response envelope (success):
  {
  "status": "success",
  Authentication
  "user": {
  "\_id": "661111111111111111111111",
  "firebaseUid": "firebase_uid_123456",
  Auth: Public
  "email": "john@example.com",
  "roles": ["customer"]
  Auth: Public
  "tokens": {
  "idToken": "eyJhbGciOi..."
  Auth: Protected
  }
  }

```
   Auth: Public
### GET /api/auth/me

   Auth: Protected

Request body: none
Success `200` (`data` = current user):

   Auth: Public
{
  "status": "success",
   Auth: Public
    "_id": "661111111111111111111111",
    "firebaseUid": "firebase_uid_123456",
   Auth: Public
    "email": "john@example.com",
    "roles": ["customer"]
  }
   Auth: Protected (owner)
```

Auth: Public

## Businesses

Auth: Public

### GET /api/businesses

Auth: Protected (owner)

Request body: none
Auth: Protected (owner)
Success `200` (`data` = business[]):

```json
   Auth: Protected (owner)
  "status": "success",
  "data": [
    {
   Auth: Protected
      "name": "Fade Masters",
      "location": {
   Auth: Protected
        "coordinates": [38.7578, 8.9806]
      },
   Auth: Protected
      "rating": 4.8,
      "cancellationWindowMinutes": 120,
      "openingTime": "09:00",
   Auth: Protected
      "slotInterval": 15
    }
   Auth: Public
}
```

Auth: Public

### POST /api/businesses

Auth: Protected

Request body:
Auth: Protected

- Required:
  - `name`: string, min 2, max 120
  - `longitude`: number, -180 to 180
    Auth: Protected
- Optional:
  - `cancellationWindowMinutes`: integer, 0..1440
    Auth: Protected
  - `rating = 0`
  - `openingTime = "09:00"`
  - `closingTime = "18:00"`
    Request body: none

Success `201` (`data` = business):
Query params:

```json
{
   Request body:
  "data": {
    "_id": "662222222222222222222222",
   Request body:
    "location": {
      "type": "Point",
   Request body:
    },
    "ownerId": "661ownerownerownerowner001",
   Request body:
    "cancellationWindowMinutes": 180,
    "openingTime": "09:00",
   Request body:
    "slotInterval": 15
  }
   Request body: none
```

Request body:

Auth: Public
Query params:
Request body: none

Auth: Protected (owner)

```json
   Auth: Protected (owner)
  "status": "success",
  "data": {
   Auth: Protected (owner)
    "name": "Fade Masters",
    "rating": 4.8
   Auth: Protected (owner)
}
```

Auth: Protected (owner)

### GET /api/businesses/:businessId/services

Auth: Protected (owner)

Request body: none

````json

```json
```json
"status": "success",
"data": [
```json
   "_id": "663333333333333333333333",
   "businessId": "662222222222222222222222",
```json
   "category": "cut",
   "duration": 30,
```json
 }
]
```json
````

````json

Auth: Public

Request body: none

Success `200` (`data` = active staff[]):

```json
{
"status": "success",
"data": [
 {
   "_id": "664444444444444444444444",
   "userId": {
     "_id": "661staffstaffstaffstaff001",
     "fullName": "Alemayehu K",
     "email": "alem@example.com",
     "roles": ["staff"]
   },
   "businessId": "662222222222222222222222",
   "services": []
 }
]
}
````

### GET /api/businesses/:businessId/reviews

Auth: Public

Request body: none

Success `200` (`data` = review[]):

```json
{
  "status": "success",
  "data": [
    {
      "_id": "665555555555555555555555",
      "userId": {
        "_id": "661111111111111111111111",
        "fullName": "John Doe"
      },
      "businessId": "662222222222222222222222",
      "rating": 5,
      "comment": "Great service"
    }
  ]
}
```

---

## Services

### POST /api/services/:businessId

Auth: Protected (`owner` role)

Request body:

- Required:
  - `name`: string, min 2, max 100
  - `category`: string, min 2, max 50
  - `duration`: integer, 5..600
  - `basePrice`: number, >= 0

Success `201` (`data` = service):

```json
{
  "status": "success",
  "data": {
    "_id": "663333333333333333333333",
    "businessId": "662222222222222222222222",
    "name": "Beard Trim",
    "category": "beard",
    "duration": 20,
    "basePrice": 150
  }
}
```

### GET /api/services/:businessId

Auth: Public

Request body: none

Success `200` (`data` = service[]):

```json
{
  "status": "success",
  "data": [
    {
      "_id": "663333333333333333333333",
      "businessId": "662222222222222222222222",
      "name": "Haircut",
      "category": "cut",
      "duration": 30,
      "basePrice": 250
    }
  ]
}
```

### GET /api/services/item/:serviceId

Auth: Public

Request body: none

Success `200` (`data` = service):

```json
{
  "status": "success",
  "data": {
    "_id": "663333333333333333333333",
    "businessId": "662222222222222222222222",
    "name": "Haircut",
    "category": "cut",
    "duration": 30,
    "basePrice": 250
  }
}
```

### PATCH /api/services/:serviceId

Auth: Protected (`owner` role)

Request body:

- Optional (at least one required):
  - `name`: string, min 2, max 100
  - `category`: string, min 2, max 50
  - `duration`: integer, 5..600
  - `basePrice`: number, >= 0

Success `200` (`data` = updated service)

### DELETE /api/services/:serviceId

Auth: Protected (`owner` role)

Request body: none

Success `200` (`data` = deleted service)

---

## Staff

### POST /api/staff

Auth: Protected (`owner` role)

Request body:

- Required:
  - `userId`: ObjectId string
  - `businessId`: ObjectId string
- Optional:
  - `services`: ObjectId[] (default `[]`)
  - `overrides`: array of objects (default `[]`)
    - `serviceId`: ObjectId string (required per item)
    - `price`: number >= 0 (required per item)
- Model defaults:
  - `isActive = true`
  - `specialties = []`

Success `201` (`data` = staff profile):

```json
{
  "status": "success",
  "data": {
    "_id": "664444444444444444444444",
    "userId": "661staffstaffstaffstaff001",
    "businessId": "662222222222222222222222",
    "services": ["663333333333333333333333"],
    "specialties": [],
    "isActive": true
  }
}
```

---

## Bookings

### POST /api/bookings/availability/check

Auth: Protected

Request body:

- Required:
  - `shopId`: ObjectId string
  - `date`: string (`YYYY-MM-DD` or ISO date)
  - `serviceIds`: ObjectId[] (min 1)
- Optional:
  - `professionalId`: ObjectId string or `null`

Success `200` (`data` = availability payload):

```json
{
  "status": "success",
  "data": {
    "availableSlots": [
      {
        "startTime": "2026-04-10T09:00:00.000Z",
        "staffPlan": [
          {
            "professionalId": "664444444444444444444444",
            "serviceId": "663333333333333333333333",
            "startTime": "2026-04-10T09:00:00.000Z",
            "endTime": "2026-04-10T09:30:00.000Z"
          }
        ]
      }
    ],
    "isFullyBooked": false,
    "nextAvailableDate": "2026-04-13"
  }
}
```

### POST /api/bookings

Auth: Protected

Current code contract note (critical for frontend):

- Validator currently requires:
  - `businessId`, `staffId`, `serviceId`, `startTime`, `paymentMethod?`
- Service currently expects and uses:
  - `businessId`, `serviceIds[]`, `staffPlan[]`, `startTime`, `paymentMethod?`
- Because unknown fields are stripped by validator, sending service-required fields can fail validation.
- This endpoint has an active contract mismatch in code and should be aligned before production frontend integration.

Request body accepted by validator today:

- Required:
  - `businessId`: ObjectId string
  - `staffId`: ObjectId string
  - `serviceId`: ObjectId string
  - `startTime`: ISO datetime string
- Optional:
  - `paymentMethod`: `cash` | `in-shop` (default `in-shop`)

Model/runtime defaults on created booking:

- `status = confirmed`
- `paymentMethod = in-shop` (if omitted)
- `paymentStatus = unpaid`

Success `201` (`data` = booking document):

```json
{
  "status": "success",
  "data": {
    "_id": "666666666666666666666666",
    "userId": "661111111111111111111111",
    "businessId": "662222222222222222222222",
    "staffId": "664444444444444444444444",
    "serviceId": "663333333333333333333333",
    "startTime": "2026-04-10T10:00:00.000Z",
    "endTime": "2026-04-10T10:30:00.000Z",
    "status": "confirmed",
    "paymentMethod": "in-shop",
    "paymentStatus": "unpaid"
  }
}
```

### PATCH /api/bookings/:id (removed)

This single "action" endpoint no longer exists. Use these instead:

- Customer cancels: `PATCH /api/bookings/:id/cancel`
- Customer reschedules: `PATCH /api/bookings/:id/reschedule`
- Owner changes status (complete, no-show, and so on):
  `PATCH /api/dashboard/:shopId/bookings/:id/status`
- Owner cancels: `PATCH /api/dashboard/:shopId/bookings/:id/cancel`

---

## Reviews

### POST /api/reviews

Auth: Protected

Request body:

- Required:
  - `businessId`: ObjectId string
  - `rating`: integer 1..5
- Optional:
  - `comment`: string max 1000 (default `""`)

Success `201` (`data` = review):

```json
{
  "status": "success",
  "data": {
    "_id": "665555555555555555555555",
    "userId": "661111111111111111111111",
    "businessId": "662222222222222222222222",
    "rating": 5,
    "comment": "Great service"
  }
}
```

### GET /api/reviews/business/:businessId

Auth: Public

Request body: none

Success `200` (`data` = review[]):

```json
{
  "status": "success",
  "data": [
    {
      "_id": "665555555555555555555555",
      "userId": {
        "_id": "661111111111111111111111",
        "fullName": "John Doe"
      },
      "businessId": "662222222222222222222222",
      "rating": 5,
      "comment": "Great service"
    }
  ]
}
```

### GET /api/reviews/:reviewId

Auth: Public

Request body: none

Success `200` (`data` = review)

### PATCH /api/reviews/:reviewId

Auth: Protected

Authorization note:

- Only the review author or the review business owner can update.

Request body:

- Optional (at least one required):
  - `rating`: integer 1..5
  - `comment`: string max 1000 (allow empty string)

Success `200` (`data` = updated review)

### DELETE /api/reviews/:reviewId

Auth: Protected

Authorization note:

- Only the review author or the review business owner can delete.

Request body: none

Success `200` (`data` = deleted review)

---

## Notifications

### POST /api/notifications/users/me/device-tokens

Auth: Protected

Request body:

- Required:
  - `fcmToken`: string, min 10

Success `201` (`data` = device token):

```json
{
  "status": "success",
  "data": {
    "_id": "667777777777777777777777",
    "userId": "661111111111111111111111",
    "fcmToken": "fcm_device_token_example_very_long"
  }
}
```

### GET /api/notifications/users/me/bookings

Auth: Protected

Request body: none

Success `200` (`data` = booking[] with populated relations):

```json
{
  "status": "success",
  "data": [
    {
      "_id": "666666666666666666666666",
      "businessId": {
        "_id": "662222222222222222222222",
        "name": "Fade Masters"
      },
      "serviceId": {
        "_id": "663333333333333333333333",
        "name": "Haircut",
        "duration": 30,
        "basePrice": 250
      },
      "staffId": {
        "_id": "664444444444444444444444",
        "userId": {
          "fullName": "Alemayehu K",
          "email": "alem@example.com"
        }
      },
      "startTime": "2026-04-10T10:00:00.000Z",
      "status": "confirmed"
    }
  ]
}
```

---

## Dashboard (Owner)

Important routing note:

- Router mount + route definitions currently produce duplicated shopId in path.
- Effective paths are:
  - `/api/dashboard/:shopId/...`

All dashboard endpoints require:

- valid bearer token
- authenticated user owns the `shopId` business

### GET /api/dashboard/:shopId/dashboard

Request body: none

Success `200` (`data` = summary):

```json
{
  "status": "success",
  "data": {
    "todayBookings": 12,
    "confirmed": 7,
    "completed": 3,
    "noShow": 1,
    "cancelled": 1,
    "revenue": 1750
  }
}
```

### GET /api/dashboard/:shopId/bookings

Query params:

- Optional:
  - `date`: ISO datetime
  - `status`: `pending|confirmed|cancelled|completed|no_show`
  - `staffId`: ObjectId string
  - `page`: integer >= 1 (default `1`)
  - `limit`: integer 1..100 (default `50`)

Success `200` (`data` = paginated result):

```json
{
  "status": "success",
  "data": {
    "bookings": [],
    "total": 0,
    "page": 1,
    "totalPages": 1
  }
}
```

### PATCH /api/dashboard/:shopId/bookings/:id/cancel

Request body:

- Optional:
  - `reason`: string, max 300

Success `200` (`data` = booking):

```json
{
  "status": "success",
  "data": {
    "_id": "666666666666666666666666",
    "status": "cancelled"
  }
}
```

### PATCH /api/dashboard/:shopId/bookings/:id/status

Request body:

- Required:
  - `status`: `completed` | `no_show`
- Optional:
  - `reason`: string, max 300

Success `200` (`data` = booking):

```json
{
  "status": "success",
  "data": {
    "_id": "666666666666666666666666",
    "status": "completed",
    "completedAt": "2026-04-03T12:00:00.000Z"
  }
}
```

### POST /api/dashboard/:shopId/staff

Request body:

- Required:
  - `userId`: ObjectId string
- Optional:
  - `specialties`: string[] (default `[]`)
  - `services`: ObjectId[] (default `[]`)
  - `overrides`: array of objects (default `[]`)
    - `serviceId`: ObjectId string (required per item)
    - `price`: number >= 0 (required per item)
- Model defaults:
  - `isActive = true`

Success `201` (`data` = staff profile):

```json
{
  "status": "success",
  "data": {
    "_id": "664444444444444444444444",
    "userId": "661staffstaffstaffstaff001",
    "businessId": "662222222222222222222222",
    "specialties": [],
    "services": [],
    "isActive": true
  }
}
```

### PATCH /api/dashboard/:shopId/staff/:id

Request body:

- Optional (all):
  - `specialties`: string[]
  - `services`: ObjectId[]
  - `isActive`: boolean

Success `200` (`data` = updated staff profile)

### POST /api/dashboard/:shopId/staff/:id/availability

Request body:

- Required:
  - `dayOfWeek`: integer 0..6
  - `startTime`: string `HH:mm`
  - `endTime`: string `HH:mm`

Success `201` (`data` = availability):

```json
{
  "status": "success",
  "data": {
    "_id": "668888888888888888888888",
    "staffId": "664444444444444444444444",
    "dayOfWeek": 1,
    "startTime": "09:00",
    "endTime": "17:00"
  }
}
```

### GET /api/dashboard/:shopId/staff/:id/availability

Request body: none

Success `200` (`data` = availability[]):

```json
{
  "status": "success",
  "data": [
    {
      "dayOfWeek": 1,
      "startTime": "09:00",
      "endTime": "17:00"
    }
  ]
}
```

### POST /api/dashboard/:shopId/staff/:id/absences

Request body:

- Required:
  - `startTime`: ISO datetime
  - `endTime`: ISO datetime, must be greater than `startTime`
- Optional:
  - `reason`: string, max 300

Success `201` (`data` = absence):

```json
{
  "status": "success",
  "data": {
    "_id": "669999999999999999999999",
    "staffId": "664444444444444444444444",
    "businessId": "662222222222222222222222",
    "startTime": "2026-04-20T09:00:00.000Z",
    "endTime": "2026-04-20T12:00:00.000Z",
    "reason": "Medical"
  }
}
```

### GET /api/dashboard/:shopId/staff/:id/absences

Query params:

- Optional:
  - `from`: ISO datetime
  - `to`: ISO datetime

Success `200` (`data` = absence[]):

```json
{
  "status": "success",
  "data": []
}
```

### DELETE /api/dashboard/:shopId/staff/:id/absences/:absenceId

Request body: none

Success `204`: no response body

### POST /api/dashboard/:shopId/services

Request body:

- Required:
  - `name`: string, min 2, max 100
  - `duration`: integer, 5..600
  - `basePrice`: number >= 0
- Optional:
  - `category`: not required by validator; model defaults to `"general"` when omitted

Success `201` (`data` = service):

```json
{
  "status": "success",
  "data": {
    "_id": "663333333333333333333333",
    "businessId": "662222222222222222222222",
    "name": "Beard Trim",
    "category": "general",
    "duration": 20,
    "basePrice": 150
  }
}
```

### PATCH /api/dashboard/:shopId/services/:id

Request body:

- Optional (all):
  - `name`: string, min 2, max 100
  - `duration`: integer, 5..600
  - `basePrice`: number >= 0

Success `200` (`data` = updated service)

### DELETE /api/dashboard/:shopId/services/:id

Request body: none

Success `204`: no response body

### GET /api/dashboard/:shopId/customers

Request body: none

Success `200` (`data` = customer aggregates):

```json
{
  "status": "success",
  "data": [
    {
      "_id": "661111111111111111111111",
      "fullName": "John Doe",
      "phoneNumber": "+251900000000",
      "totalBookings": 8,
      "completedBookings": 6,
      "noShowCount": 1,
      "lastVisit": "2026-04-01T11:00:00.000Z"
    }
  ]
}
```

### GET /api/dashboard/:shopId/revenue

Query params:

- Optional:
  - `range`: `day|week|month` (default `day`)
  - `date`: ISO datetime

Success `200` (`data` = revenue summary):

```json
{
  "status": "success",
  "data": {
    "total": 3500,
    "completedBookings": 14,
    "range": "week",
    "from": "2026-03-28T00:00:00.000Z",
    "to": "2026-04-03T23:59:59.999Z"
  }
}
```

---

## 5) Common Error Examples

### 400 Validation Error

```json
{
  "status": "error",
  "data": ["\"status\" must be one of [completed, no_show]"],
  "message": "Validation failed"
}
```

### 401 Unauthorized

```json
{
  "status": "error",
  "data": null,
  "message": "Unauthorized"
}
```

### 403 Forbidden

```json
{
  "status": "error",
  "data": null,
  "message": "You are not allowed to perform this action"
}
```

### 404 Not Found

```json
{
  "status": "error",
  "data": null,
  "message": "Business not found"
}
```

### 409 Conflict

```json
{
  "status": "error",
  "data": null,
  "message": "Slot no longer available"
}
```

### 500 Internal Server Error

```json
{
  "status": "error",
  "data": null,
  "message": "Internal server error"
}
```
