# ONE80 App Management API

**Document version:** 1.0  
**Last verified:** 2026-09-10  
**Production base URL:** `https://one80.alatheertech.com/api`

This is the integration contract for the ONE80 web App Management module and the
member mobile application. The HTTP surface is compatible with the PHAROS App
Management module, while ONE80 keeps its own brand, branch scope, RBAC, package
promotions, and operational trainer records.

## 1. Authentication and conventions

- Public endpoints are marked **Public** and do not require a token.
- Admin endpoints require a staff JWT or the `access_token` cookie plus the listed RBAC permission.
- Member endpoints require a member JWT: `Authorization: Bearer <accessToken>`.
- All paths below are relative to `/api`.
- JSON fields are camelCase.
- Dates are ISO `YYYY-MM-DD` unless an example shows a full timestamp.
- `PUT` is used for both full and partial updates by the current admin clients.

### Pagination

List endpoints under `/app` accept:

| Query | Type | Default | Notes |
|---|---:|---:|---|
| `page` | integer | `1` | Minimum 1 |
| `pageSize` | integer | project default | Bounded by the global pagination DTO |
| `search` | string | — | Case-insensitive database search |

Typical paginated response:

```json
{
  "data": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 0
}
```

### Error response

```json
{
  "statusCode": 400,
  "message": "رسالة الخطأ"
}
```

Common codes are `400` validation, `401` unauthenticated, `403` missing permission or branch scope,
`404` missing record, and `409` conflict.

## 2. Canonical data sources — important

The mobile app must use the canonical endpoints in this table. The legacy endpoints remain
available for PHAROS compatibility, but the ONE80 admin UI intentionally does not write to
the two legacy tables listed below.

| Feature | Admin source of truth | Member/mobile source | Compatibility endpoint |
|---|---|---|---|
| Package offers | `GET /club-subscription-types`, `PUT /club-subscription-types/{id}/promo` | `GET /member/packages` | `GET /app/offers` |
| Trainers | `/club-trainers` + availability endpoints | `GET /member/trainers` | `GET /app/trainers` |
| Exercise categories | `/app/exercise-categories` | same public GET | — |
| Exercises | `/app/exercises` | same public GET | — |
| News | `/app/news` | same public GET | — |
| Ads | `/app/ads` | same public GET | — |
| Notifications | `/app/notifications` | `/member/notifications` | — |
| Payment methods | `/app/payment-methods/manage` | `GET /app/payment-methods?branchId={id}` | — |

Do not build the member offer screen from `/app/offers`: ONE80 package promotions live on
`club_subscription_types.promo_*` and are returned by `/member/packages`. Do not build the
member trainer screen from `/app/trainers`: the operational records, availability, and ratings
come from `club_trainers` through `/member/trainers`.

## 3. About the app

### `GET /app/about` — Public

Returns the ONE80 app name, version, content, contact details, privacy policy, and terms.

### `PUT /app/about`

Permission: `app-management.about:update`

```json
{
  "appName": "ONE80",
  "appVersion": "1.0.0",
  "description": "ONE80 member app",
  "features": "Membership, classes and offers",
  "contactEmail": "support@example.com",
  "contactPhone": "01000000000",
  "website": "https://one80.alatheertech.com",
  "privacyPolicy": "...",
  "termsOfService": "..."
}
```

Every field is optional on update.

## 4. Package promotions — canonical offers API

### `GET /club-subscription-types`

Staff JWT. One of the controller view permissions is required, including
`club.packages.settings:view`. Optional query: `branchId` and `isSpecialOffer`.

Promotion fields returned on each package:

```json
{
  "id": 12,
  "name": "اشتراك 3 شهور",
  "price": 3500,
  "promoEnabled": true,
  "promoPrice": 2999,
  "promoDiscountPercent": 14.31,
  "promoImage": "public-file:<uuid>",
  "promoEndsAt": "2026-09-30T00:00:00.000Z",
  "promoMarketingMessage": "لفترة محدودة",
  "applyToAllBranches": false
}
```

### `PUT /club-subscription-types/{id}/promo`

Permission: `club.packages.settings:update`. A package assigned to every branch can only be
changed by a system admin.

Enable or update:

```json
{
  "enabled": true,
  "price": 2999,
  "discountPercent": 14.31,
  "durationDays": 14,
  "image": "public-file:<uuid>",
  "marketingMessage": "لفترة محدودة"
}
```

`discountPercent` is optional; the server derives it from the original price when omitted.
`price` must be positive and lower than the package price. `durationDays` must be a positive integer.

Disable:

```json
{ "enabled": false }
```

### `GET /member/packages`

Member JWT. Returns packages visible in the logged-in member's branch. Only active, unexpired
promotions are exposed as active promotion fields.

## 5. Operational trainers — canonical trainers API

### Admin endpoint summary

| Method | Path | Permission |
|---|---|---|
| GET | `/club-trainers?page=1&pageSize=20&search=&isActive=true` | `club.fitness.trainers:view` or `app-management.trainers:view` |
| GET | `/club-trainers/{id}` | Same view family |
| POST | `/club-trainers` | `club.fitness.trainers:create` or `app-management.trainers:create` |
| PUT | `/club-trainers/{id}` | `club.fitness.trainers:update` or `app-management.trainers:update` |
| DELETE | `/club-trainers/{id}` | `club.fitness.trainers:delete` or `app-management.trainers:delete` |
| GET | `/club-trainers/{id}/availability` | Same view family |
| PUT | `/club-trainers/{id}/availability` | Trainer update permission |
| GET | `/club-trainers/{id}/ratings` | Same view family |

Create/update payload:

```json
{
  "employeeId": 25,
  "name": "Ahmed Ali",
  "email": "trainer@example.com",
  "phone": "01000000000",
  "specialization": "Strength, Mobility",
  "experience": "8 years",
  "bio": "Trainer profile shown to members",
  "imageUrl": "public-file:<uuid>",
  "isActive": true
}
```

`employeeId` may be `null` for an external trainer. Deletion is a soft operational removal and
also cancels future scheduled classes according to the service rules.

Availability replaces the complete list for that trainer:

```json
{
  "slots": [
    { "weekday": 0, "startTime": "17:00", "endTime": "20:00", "isActive": true },
    { "weekday": 2, "startTime": "10:00", "endTime": "14:00", "isActive": true }
  ]
}
```

`weekday` is `0..6`. End time must be later than start time, and active windows on the same day
must not overlap.

### `GET /member/trainers`

Member JWT. Returns active operational trainers assigned to the member's branch, including
member-visible profile data and availability.

## 6. Exercise categories

| Method | Path | Auth/permission |
|---|---|---|
| GET | `/app/exercise-categories` | Public |
| POST | `/app/exercise-categories` | `app-management.exercise-categories:create` |
| PUT | `/app/exercise-categories/{id}` | `app-management.exercise-categories:update` |
| DELETE | `/app/exercise-categories/{id}` | `app-management.exercise-categories:delete` |

List filters: `search`, `isActive`, and pagination.

```json
{
  "name": "Cardio",
  "description": "Cardio exercise library",
  "isActive": true
}
```

A category that still has exercises cannot be deleted.

## 7. Exercises

| Method | Path | Auth/permission |
|---|---|---|
| GET | `/app/exercises` | Public |
| POST | `/app/exercises` | `app-management.exercises:create` |
| PUT | `/app/exercises/{id}` | `app-management.exercises:update` |
| DELETE | `/app/exercises/{id}` | `app-management.exercises:delete` |

List filters: `search`, `categoryId`, `isActive`, and pagination.

```json
{
  "name": "Treadmill Run",
  "categoryId": 3,
  "description": "30-minute cardio session",
  "instructions": "Warm up before increasing speed",
  "duration": 30,
  "difficulty": "medium",
  "imageUrl": "public-file:<uuid>",
  "isActive": true
}
```

Difficulty values: `easy`, `medium`, `hard`.

## 8. News

| Method | Path | Auth/permission |
|---|---|---|
| GET | `/app/news` | Public |
| POST | `/app/news` | `app-management.news:create` |
| PUT | `/app/news/{id}` | `app-management.news:update` |
| DELETE | `/app/news/{id}` | `app-management.news:delete` |

List filters: `search`, `isPublished`, and pagination.

```json
{
  "title": "New class schedule",
  "content": "The new schedule is now available.",
  "publishDate": "2026-09-10",
  "imageUrl": "public-file:<uuid>",
  "isPublished": true
}
```

## 9. Banner ads

| Method | Path | Auth/permission |
|---|---|---|
| GET | `/app/ads` | Public |
| POST | `/app/ads` | `app-management.ads:create` |
| PUT | `/app/ads/{id}` | `app-management.ads:update` |
| DELETE | `/app/ads/{id}` | `app-management.ads:delete` |

List filters: `search`, `isActive`, and pagination.

```json
{
  "title": "September offer",
  "description": "Open the packages screen",
  "imageUrl": "public-file:<uuid>",
  "linkUrl": "/packages",
  "startDate": "2026-09-10",
  "endDate": "2026-09-30",
  "isActive": true
}
```

The server rejects an end date earlier than the start date.

## 10. Member notifications

### Admin endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `/app/notifications` | `app-management.notifications:view` |
| POST | `/app/notifications` | `app-management.notifications:create` |
| DELETE | `/app/notifications/{id}` | `app-management.notifications:delete` |

Admin list filters: `memberId`, `branchId`, `type`, and pagination.

Send to one member:

```json
{
  "memberId": 45,
  "title": "Membership reminder",
  "body": "Your membership expires soon.",
  "type": "subscription",
  "imageUrl": null,
  "data": "{\"subscriptionId\":103}"
}
```

Broadcast to active members with mobile accounts:

```json
{
  "broadcast": true,
  "appUsersOnly": true,
  "branchId": 1,
  "title": "Branch offer",
  "body": "A new offer is available.",
  "type": "offer"
}
```

Omit `branchId` to target all permitted active members. Set `appUsersOnly` to `false` only when
the notification should also be stored for active members who have not created an app login.

Response:

```json
{ "sent": 120 }
```

These records are the member's in-app notification inbox. This endpoint does not itself promise
an operating-system push notification.

### Member endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/member/notifications?unread=true&limit=50` | List inbox + unread count |
| GET | `/member/notifications/unread-count` | Badge count |
| POST | `/member/notifications/{id}/read` | Mark one read |
| POST | `/member/notifications/read-all` | Mark all read |

All four require a member JWT and are scoped to the logged-in member.

## 11. Payment methods

Supported providers:

`vodafone_cash`, `instapay`, `etisalat_cash`, `orange_cash`, `we_pay`,
`bank_transfer`, `other`.

### Admin endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `/app/payment-methods/manage` | `app-management.payment-methods:view` |
| POST | `/app/payment-methods` | `app-management.payment-methods:create` |
| PUT | `/app/payment-methods/{id}` | `app-management.payment-methods:update` |
| DELETE | `/app/payment-methods/{id}` | `app-management.payment-methods:delete` |

```json
{
  "provider": "instapay",
  "label": "ONE80 InstaPay",
  "value": "one80@instapay",
  "instructions": "Add the member code in the note",
  "branchId": 1,
  "sortOrder": 10,
  "isActive": true
}
```

`branchId: null` is a global default and can only be administered by a system admin. Other staff
can only manage rows inside their allowed branch scope.

### `GET /app/payment-methods?branchId=1` — Public

Returns active payment methods for the requested branch. If that branch has at least one active
row, only branch rows are returned; otherwise active global rows are returned as fallback.

```json
[
  {
    "id": 4,
    "provider": "instapay",
    "label": "ONE80 InstaPay",
    "value": "one80@instapay",
    "instructions": "Add the member code in the note",
    "sortOrder": 10
  }
]
```

## 12. Invitations

Invitation status values: `pending`, `accepted`, `attended`, `rejected`.

| Method | Path | Permission |
|---|---|---|
| GET | `/app/invitations?status=pending&branchId=1` | Matching `app-management.invitations.<status>:view` |
| GET | `/app/invitations/status/{status}` | Matching status view permission |
| POST | `/app/invitations` | `app-management.invitations.sent:create` |
| PUT | `/app/invitations/{id}` | Current status update permission |
| PUT | `/app/invitations/{id}/status` | Current status update permission |

Create:

```json
{
  "recipientName": "Sara Ahmed",
  "recipientEmail": "sara@example.com",
  "recipientPhone": "01000000000",
  "branchId": 1,
  "inviterMemberId": 45
}
```

Update status:

```json
{
  "status": "accepted",
  "rejectionReason": null
}
```

If `status` is omitted from the list request, the caller must be allowed to view every invitation
status. Otherwise the API requires choosing an allowed status.

## 13. Legacy PHAROS-compatible resources

The following endpoints are still supported for external compatibility:

- `/app/offers` — public GET plus permissioned POST/PUT/DELETE.
- `/app/trainers` — public GET plus permissioned POST/PUT/DELETE.

Their DTOs remain compatible with PHAROS, but they are not the ONE80 admin/mobile source of truth.
New integrations must use the canonical package-promo and operational-trainer endpoints described
above.

Legacy offer payload:

```json
{
  "title": "Legacy offer",
  "description": "Compatibility record",
  "imageUrl": "public-file:<uuid>",
  "discount": 10,
  "startDate": "2026-09-10",
  "endDate": "2026-09-30",
  "isActive": true
}
```

Legacy trainer payload:

```json
{
  "name": "Trainer name",
  "employeeId": 25,
  "email": "trainer@example.com",
  "phone": "01000000000",
  "specialization": "Strength",
  "experience": 8,
  "bio": "Profile",
  "imageUrl": "public-file:<uuid>",
  "isActive": true
}
```

## 14. Uploading app media

### `POST /uploads/{category}`

Staff JWT. Multipart form field: `file`. Maximum request file size is 25 MB, while each category
applies a stricter policy.

Relevant public-media categories:

| Category | Max | Types | Upload permission family |
|---|---:|---|---|
| `club-package-promo` | 5 MB | JPEG, PNG, WebP | `club.packages.settings:create/update` |
| `app` | 10 MB | JPEG, PNG, GIF, WebP | `app-management.offers:create/update` |

Response:

```json
{
  "path": "public-file:<uuid>",
  "filename": "offer.png",
  "url": "/api/uploads/public/{fileId}"
}
```

Store `path` in mutation payloads. Use the returned `url`, or the full image URL returned by a
read endpoint, for display. Public media is delivered from `GET /uploads/public/{file-id}`; do not
construct a filesystem `/uploads/...` URL.

## 15. Complete `/app` route inventory

| Method | Route | Access |
|---|---|---|
| GET / PUT | `/app/about` | Public GET / about update permission |
| GET / POST | `/app/invitations` | Status view / sent create permission |
| GET | `/app/invitations/status/{status}` | Status view permission |
| PUT | `/app/invitations/{id}` | Current status update permission |
| PUT | `/app/invitations/{id}/status` | Current status update permission |
| GET / POST | `/app/offers` | Public GET / create permission |
| PUT / DELETE | `/app/offers/{id}` | Update / delete permission |
| GET / POST | `/app/trainers` | Public GET / create permission |
| PUT / DELETE | `/app/trainers/{id}` | Update / delete permission |
| GET / POST | `/app/exercise-categories` | Public GET / create permission |
| PUT / DELETE | `/app/exercise-categories/{id}` | Update / delete permission |
| GET / POST | `/app/exercises` | Public GET / create permission |
| PUT / DELETE | `/app/exercises/{id}` | Update / delete permission |
| GET / POST | `/app/news` | Public GET / create permission |
| PUT / DELETE | `/app/news/{id}` | Update / delete permission |
| GET / POST | `/app/ads` | Public GET / create permission |
| PUT / DELETE | `/app/ads/{id}` | Update / delete permission |
| GET / POST | `/app/notifications` | View / create permission |
| DELETE | `/app/notifications/{id}` | Delete permission |
| GET | `/app/payment-methods/manage` | View permission |
| GET | `/app/payment-methods` | Public |
| POST | `/app/payment-methods` | Create permission |
| PUT / DELETE | `/app/payment-methods/{id}` | Update / delete permission |

## 16. Integration checklist

- Use `/member/packages`, not `/app/offers`, for live package promotions.
- Use `/member/trainers`, not `/app/trainers`, for operational trainers.
- Treat IDs and barcode values as opaque; do not remove leading zeroes.
- Send the member JWT only to `/member/*`; staff endpoints use a staff JWT/cookie.
- Use the member's branch ID for public payment methods when available.
- Treat unknown notification types and payment providers as generic future-compatible values.
- Render loading, empty, validation, `401`, `403`, and `404` states.
- Do not build file URLs from storage paths; use the API-returned URL.
- Swagger is available at `/api/docs` only outside production.

For the broader member authentication, subscriptions, barcode, classes, InBody, freezes, and
account-deletion contract, see [`FLUTTER_MEMBER_API.md`](./FLUTTER_MEMBER_API.md).
