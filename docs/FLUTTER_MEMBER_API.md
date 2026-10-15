# ONE80 Gym — Member Mobile App API

**Version:** 1.2
**Base URL:** `https://one80.alatheertech.com/api`  
**Staging / Dev Swagger:** `https://<host>/api/docs` (non-production only)

This document is the complete integration guide for the Flutter member mobile application.

For the web App Management endpoints, admin payloads, permissions, canonical offers/trainers,
notifications, payment methods, and upload rules, see [`APP_MANAGEMENT_API.md`](./APP_MANAGEMENT_API.md).

---

## Quick start

1. **Login:** `POST /auth/login` with phone as `username` and default password `000000` (first login).
2. **Store token:** Save `accessToken` from the response.
3. **Authenticated calls:** Send header `Authorization: Bearer <accessToken>`.
4. **Public content:** No token needed for `/app/*` read endpoints and `GET /packages`.

---

## Authentication

### Default credentials (all members)

| Field | Value |
|-------|--------|
| **Username / Login ID** | Member phone number (e.g. `01012345678`) |
| **Default password** | `000000` |

When a member is created in the web admin with “Create app account” enabled, an `api_users` record is created automatically with phone as login and password `000000`.

Members should change their password after first login via `POST /auth/change-password`.

---

### POST `/auth/login`

Login for **gym members** (phone + password). Staff HR users with the same username still use staff login when a staff account exists.

**Request**
```json
{
  "username": "01012345678",
  "password": "000000"
}
```

**Response `200`**
```json
{
  "message": "تم تسجيل الدخول بنجاح",
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "accountType": "member",
  "mustChangePassword": true,
  "user": {
    "sub": 12,
    "memberId": 45,
    "branchId": 1,
    "phone": "01012345678",
    "name": "أحمد محمد",
    "type": "member"
  }
}
```

> ### ⚠️ `mustChangePassword` — enforce a first-login password change
> The login response includes a boolean **`mustChangePassword`**.
> - `true`  → the member is still on the shared default password `000000`. **The app must block all other screens and force `POST /auth/change-password` before continuing.**
> - `false` → the member has set their own password; proceed normally.
>
> It is present on both `POST /auth/login` and `POST /member/auth/login`, and is always `false` for staff accounts.
> After a successful change, log in again (or just flip your local flag) — the next login returns `mustChangePassword: false`.

**Alternate login URL:** `POST /member/auth/login`
```json
{
  "phone": "01012345678",
  "password": "000000"
}
```

**Errors:** `401` — invalid phone/password.

---

### POST `/auth/change-password`

Requires member JWT.

**Headers:** `Authorization: Bearer <accessToken>`

**Request**
```json
{
  "currentPassword": "000000",
  "newPassword": "MyNewPass123"
}
```

**Response `200`**
```json
{
  "message": "تم تغيير كلمة المرور بنجاح"
}
```

**New-password rules** (server-enforced — surface these in the UI):
- Minimum **6 characters** (digits allowed). → `400 "كلمة المرور يجب ألا تقل عن 6 خانات"`
- Cannot be the default `000000` (so `mustChangePassword` reliably clears). → `400 "كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الافتراضية"`

**Alternate URL:** `POST /member/auth/change-password`

---

### POST `/member/auth/refresh`

**Request**
```json
{
  "refreshToken": "<refreshToken>"
}
```

**Response:** New `accessToken` + `user` object.

---

## 1. Application content & offers (public — no auth)

All under `/app/`. Responses use **camelCase** JSON.

### GET `/app/about` — About the app (عن التطبيق)
Returns app name, description, contact info, **termsOfService**, **privacyPolicy**.

### GET `/app/offers` — Legacy compatibility offers
Query: `?isActive=true&page=1&pageSize=20`

> ONE80 live package promotions are returned by `GET /member/packages`. Do not build the member
> offers screen from this legacy table.

### GET `/app/trainers` — Legacy compatibility trainers

> ONE80 operational trainers, availability, and ratings are returned by `GET /member/trainers`.

### GET `/app/exercise-categories` — Workout categories (تصنيفات التمارين)

### GET `/app/exercises` — Exercises (إدارة التمارين)
Query: `?categoryId=1`

### GET `/app/news` — News (إدارة الأخبار)

### GET `/app/ads` — Advertisements (إدارة الإعلانات)

**Image URLs:** Use the URL returned by the API. Public media is served from
`/api/uploads/public/{fileId}`; do not construct a filesystem `/uploads/...` URL.

---

## 2. Invitations / Referrals (الدعوات)

### POST `/invitations` — Member sends invite (mobile)

**Auth:** Member JWT required.

**Request**
```json
{
  "recipientName": "سارة أحمد",
  "recipientPhone": "01098765432",
  "recipientEmail": "optional@email.com"
}
```

**Response `201`**
```json
{
  "id": 1,
  "invitationCode": "INV000001",
  "recipientName": "سارة أحمد",
  "recipientPhone": "01098765432",
  "recipientEmail": null,
  "status": "pending",
  "sentDate": "2026-07-08T08:00:00.000Z",
  "branchId": 1,
  "branchName": "فرع المعادي"
}
```

**Alternate URL:** `POST /member/invitations`

---

### GET `/member/invitations` — Member tracks their invites

**Auth:** Member JWT.

Returns array of invitations sent by the logged-in member, sorted newest first.

**Status values:** `pending` | `accepted` | `rejected` | `attended`

---

### GET `/invitations` — Admin list (web dashboard)

**Auth:** Staff JWT + permission `app-management.invitations:view`

**Alternate URL:** `GET /app/invitations`

Query: `?status=pending&page=1&pageSize=20&branchId=1&search=`

---

### PUT `/invitations/{id}/status` — Admin approve/reject

**Auth:** Staff JWT + permission `app-management.invitations:update`

**Request**
```json
{
  "status": "accepted",
  "rejectionReason": "Optional reason when rejected"
}
```

**Alternate URLs:**
- `PUT /app/invitations/{id}/status`
- `PUT /app/invitations/{id}` with body `{ "status": "accepted" }`

---

## 3. Subscriptions & packages (الباقات والأسعار)

### GET `/packages` — All active plans (pricing screen)

**Auth:** None (public).

Query: `?branchId=1` (optional — filters plans for a branch)

**Response `200`** — array:
```json
[
  {
    "id": 3,
    "name": "اشتراك 3 شهور",
    "price": 3500,
    "days": 90,
    "durationLabel": "90 يوم",
    "isSpecialOffer": false,
    "isForStudents": false,
    "invitationsCount": 2,
    "inbodyCount": 1,
    "includesSpa": false,
    "spaCount": null,
    "sessionsCount": null,
    "freezeDays": 7,
    "walletPoints": 100,
    "offerValidity": null
  }
]
```

Only plans with `showInApp=true` and `isActive=true` are returned.

**Alternate URL (member-scoped by branch):** `GET /member/packages` — uses logged-in member's branch.

---

### GET `/member/subscriptions` — My subscriptions (اشتراكاتي)

**Auth:** Member JWT.

**Response `200`**
```json
{
  "activePlan": {
    "id": 10,
    "subscriptionNumber": "SUB000010",
    "subscriptionType": "اشتراك 3 شهور",
    "subscriptionTypeId": 3,
    "startDate": "2026-01-01",
    "endDate": "2026-04-01",
    "value": 3500,
    "paidAmount": 3500,
    "remainingAmount": 0,
    "status": "active"
  },
  "history": [
    {
      "id": 10,
      "subscriptionNumber": "SUB000010",
      "subscriptionType": "اشتراك 3 شهور",
      "startDate": "2026-01-01",
      "endDate": "2026-04-01",
      "value": 3500,
      "paidAmount": 3500,
      "remainingAmount": 0,
      "status": "active",
      "isActive": true,
      "registrationDate": "2026-01-01"
    }
  ]
}
```

`activePlan` is `null` if no current subscription.

Both `activePlan` and each `history` entry include `notes: string | null`: the
member-visible note stored on that specific subscription, including existing
notes. Display it as plain multiline text under “ملاحظات الاشتراك” / “Subscription
notes” in the subscription details; hide the section when empty. This is distinct
from the package description or package-level `appNotes`. Results are scoped to
the authenticated member; no member ID should be supplied by the app.

---

## 4. Member profile (إدارة الأعضاء)

### GET `/member/profile`

**Auth:** Member JWT.

**Response `200`**
```json
{
  "fullName": "أحمد محمد",
  "phone": "01012345678",
  "profilePictureUrl": "/uploads/club-member/abc.jpg",
  "profilePhotoLocked": true,
  "branchName": "فرع المعادي",
  "memberCode": "A012254",
  "memberId": 45,
  "barcode": "7381942",
  "gateQrCode": "7381942",
  "gateQrFormat": "WIEGAND26_DECIMAL",
  "termsAndConditions": "نص الشروط والأحكام...",
  "privacyPolicy": "نص سياسة الخصوصية...",
  "isActive": true
}
```

**Gate QR:** Render `gateQrCode` (or the compatibility alias `barcode`) on the
check-in screen. It is an opaque 7-digit C3 credential and is intentionally
different from `memberCode`.

**Profile photo:** Prefix `profilePictureUrl` with host if relative. `profilePhotoLocked` is authoritative and remains true even if staff clear the picture. Existing real photos are locked; legacy placeholders are treated as no photo.

### POST `/member/profile/photo`

**Auth:** Member JWT. Multipart field `m_image`, validated image up to 5 MiB.

The member may upload a first photo only. Returns `memberId`, `profilePicture`, `profilePictureUrl`, and `profilePhotoLocked: true`. The photo and permanent lock are committed together with the linked app-account image and audit record. Concurrent submissions allow exactly one winner. Repeated uploads return HTTP `409` with code `MEMBER_PHOTO_LOCKED`; the member must contact reception.

Flutter checks a fresh profile before enabling upload, prompts members without photos on home entry, and shows a read-only view once locked. It can use the successful upload response immediately without requiring a second network request. After an uncertain failure it reloads the profile before enabling a retry.

Staff replace or clear a photo through **Edit member**, using the existing `club.members:update` permission and branch scope. This never unlocks member self-service. The open reception member panel refreshes every five seconds; images use unique upload URLs so replacement does not reuse a stale cache entry. Both `member-profile` and image-only `club-member` uploads use opaque public image delivery; other private upload categories remain unchanged.

**Deployment order:** apply `20261003120000_member_photo_once` before starting the updated backend, then deploy the staff frontend and Flutter build. Run Prisma client generation when building the backend. Older installed apps are still blocked by the API after the first upload. Do not deploy only Flutter: the server/database lock is required.

**Local validation:** `node backend/scripts/test-member-photo-lock.mjs` creates and removes an isolated local MySQL database (127.0.0.1/root); it never reads the application's database URL. It checks migration backfill, competing uploads, staff replacement/removal, and transactional rollback.

For device-only photo/QR checks without login or production API access, run `flutter run -d <device> -t tool/photo_security_preview.dart` from `one80 flutter/`. This is a separate QA entry point, not the production app entry point. Native screenshot blocking still requires device validation, particularly the existing iOS secure-text-field workaround.

---

## 5. InBody metrics (إدارة الـ InBody)

### GET `/member/inbody-history`

**Auth:** Member JWT.

Returns measurements sorted by date (newest first).

**Response `200`** — array:
```json
[
  {
    "id": 5,
    "measurementDate": "2026-06-15",
    "weight": 78.5,
    "heightCm": 175,
    "bodyFat": 18.2,
    "muscleMass": 32.1,
    "bmi": 25.6,
    "notes": "تحسن ملحوظ",
    "reportUrl": "/uploads/inbody/report-5.pdf",
    "createdAt": "2026-06-15T10:00:00.000Z"
  }
]
```

`reportUrl` may be a PDF or image path — open in WebView or PDF viewer.

---

### POST `/admin/inbody` — Admin/trainer uploads record

**Auth:** Staff JWT + permission `club.fitness:create`

**Request**
```json
{
  "memberId": 45,
  "measurementDate": "2026-07-08",
  "weight": 77.0,
  "heightCm": 175,
  "bodyFat": 17.5,
  "muscleMass": 33.0,
  "bmi": 25.1,
  "notes": "Optional notes",
  "reportUrl": "/uploads/inbody/member-45-july.pdf"
}
```

**Two-step upload (staff/trainer side, done in the web dashboard):**
1. `POST /uploads/inbody` — multipart field **`file`**, an image (`jpg/png/webp`) or `application/pdf`, max 15 MB. Returns `{ "path": "club/inbody/inbody-….pdf", "url": "/uploads/…" }`.
2. `POST /admin/inbody` (or `PUT` on `/club-inbody-measurements/{id}`) with `reportUrl` set to the returned `path`.

The web InBody screen now has a **"Upload report"** button that does both steps. Members then see the report through `GET /member/inbody-history` (the `reportUrl` there is returned as a full, ready-to-open URL).

**Alternate staff URL:** `POST /club-inbody-measurements`

---

## 6. Freeze / suspension history (سجل الوقف)

### GET `/member/freezes`

**Auth:** Member JWT.

Returns every freeze attached to any of the logged-in member's subscriptions, newest first.

**Response `200`** — array:
```json
[
  {
    "id": 18,
    "subscriptionId": 103,
    "subscriptionNumber": "SUB000103",
    "subscriptionType": "اشتراك 3 شهور",
    "freezeStartDate": "2026-07-01",
    "freezeEndDate": "2026-07-08",
    "plannedDays": 7,
    "actualDays": 7,
    "originalEndDate": "2026-09-15",
    "reason": "سفر",
    "isActive": false,
    "createdAt": "2026-07-01T09:15:00.000Z"
  }
]
```

`isActive: true` means the subscription is still frozen. `actualDays` and `freezeEndDate` can be `null` until it is unfrozen.

---

## 7. Points log (سجل النقاط)

### GET `/member/points`

**Auth:** Member JWT.

**Response `200`:**
```json
{
  "balance": 250,
  "totalEarned": 250,
  "totalRedeemed": 0,
  "history": [
    {
      "id": 103,
      "type": "earn",
      "points": 100,
      "balanceAfter": 250,
      "reason": "اشتراك 3 شهور",
      "subscriptionId": 103,
      "subscriptionNumber": "SUB000103",
      "date": "2026-07-01",
      "createdAt": "2026-07-01T09:00:00.000Z"
    }
  ]
}
```

Current v1 points are the `walletPoints` earned from the member's subscription packages. Redemption is not enabled yet, so `totalRedeemed` is currently `0`.

---

## 8. Member notifications (الإشعارات)

### GET `/member/notifications`

**Auth:** Member JWT.

Optional query:

- `unread=true` — unread notifications only.
- `limit=50` — number returned; minimum 1, maximum 100, default 50.

**Response `200`:**
```json
{
  "unreadCount": 2,
  "notifications": [
    {
      "id": 91,
      "title": "تذكير بالكلاس",
      "body": "كلاس اليوجا اليوم الساعة 7:00",
      "type": "class",
      "data": { "classId": 44 },
      "imageUrl": null,
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-07-14T10:30:00.000Z"
    }
  ]
}
```

Notification `type` is currently one of `general`, `subscription`, `freeze`, `offer`, `class`, or `points`. Treat unknown future values as `general`. `data` is an optional deep-link payload and can be `null`.

### GET `/member/notifications/unread-count`

**Auth:** Member JWT.

Lightweight endpoint for the app badge.

```json
{ "unreadCount": 2 }
```

### POST `/member/notifications/{id}/read`

**Auth:** Member JWT. No request body.

```json
{ "id": 91, "isRead": true }
```

Returns `404` if the notification does not belong to the logged-in member.

### POST `/member/notifications/read-all`

**Auth:** Member JWT. No request body.

```json
{ "updated": 2 }
```

---

## 9. Classes — men, women and kids (الكلاسات)

### GET `/member/classes`

**Auth:** Member JWT.

Returns upcoming active classes in the member's own branch, grouped into audience sections.

Optional query: `?audience=men|women|kids|mixed`. Omit it (or use `all`) to get every section.

| API value | Arabic label |
|---|---|
| `men` | رجال |
| `women` | سيدات |
| `kids` | أطفال |
| `mixed` | مختلط |

**Response `200`:**
```json
{
  "total": 1,
  "audiences": [
    {
      "audience": "women",
      "label": "سيدات",
      "count": 1,
      "classes": [
        {
          "id": 44,
          "className": "Yoga",
          "description": "كلاس يوجا للمبتدئات",
          "audience": "women",
          "audienceLabel": "سيدات",
          "classDate": "2026-07-15",
          "startTime": "19:00:00",
          "endTime": "20:00:00",
          "trainerName": "نهى أحمد",
          "hallName": "القاعة 1",
          "maxCapacity": 20,
          "enrolledCount": 12,
          "availableSpots": 8,
          "isFull": false,
          "price": 0,
          "status": "scheduled",
          "isEnrolled": false
        }
      ]
    }
  ]
}
```

Invalid audience values return `400`. Empty audience sections are still returned when no filter is supplied, which lets Flutter render stable tabs.

---

## 10. Privacy policy (سياسة الخصوصية)

### GET `/member/privacy-policy`

**Auth:** None (public, so it can be shown before login/consent).

```json
{
  "privacyPolicy": "نص سياسة الخصوصية...",
  "updatedAt": "2026-07-14T08:00:00.000Z"
}
```

Related public endpoint: `GET /member/terms` returns `termsAndConditions` and `updatedAt`. The same content is also included in `GET /app/about`.

---

## 11. Delete mobile account (حذف الحساب)

### DELETE `/member/account`

**Auth:** Member JWT.

The member must confirm their current password. Flutter should show a destructive confirmation dialog first.

**Request:**
```json
{
  "password": "CurrentPassword123"
}
```

**Response `200`:**
```json
{
  "message": "تم حذف حساب التطبيق بنجاح",
  "accountDeleted": true,
  "membershipDeleted": false
}
```

After success, immediately delete both tokens and all cached member data from the device and navigate to login. Existing access and refresh tokens become invalid immediately.

This removes/anonymizes the optional mobile-app account, deletes app notifications, and detaches invitation ownership. It does **not** cancel or delete the member's contractual gym membership, attendance, subscription, or accounting records; those remain with the club (`membershipDeleted: false`). Wrong password returns `400`.

---

## Error format

```json
{
  "statusCode": 401,
  "message": "رقم الجوال أو كلمة المرور غير صحيحة"
}
```

Common codes: `400` validation, `401` unauthorized, `403` forbidden, `404` not found, `409` conflict.

---

## Endpoint summary table

| Feature | Method | Path | Auth |
|---------|--------|------|------|
| Login | POST | `/auth/login` | Public |
| Login (alt) | POST | `/member/auth/login` | Public |
| Change password | POST | `/auth/change-password` | Member JWT |
| About app | GET | `/app/about` | Public |
| Offers | GET | `/app/offers` | Public |
| Trainers | GET | `/app/trainers` | Public |
| Exercise categories | GET | `/app/exercise-categories` | Public |
| Exercises | GET | `/app/exercises` | Public |
| News | GET | `/app/news` | Public |
| Ads | GET | `/app/ads` | Public |
| Send invitation | POST | `/invitations` | Member JWT |
| My invitations | GET | `/member/invitations` | Member JWT |
| Admin invitations | GET | `/invitations` | Staff JWT |
| Update invitation status | PUT | `/invitations/{id}/status` | Staff JWT |
| Packages / pricing | GET | `/packages` | Public |
| My subscriptions | GET | `/member/subscriptions` | Member JWT |
| Profile | GET | `/member/profile` | Member JWT |
| InBody history | GET | `/member/inbody-history` | Member JWT |
| Freeze history | GET | `/member/freezes` | Member JWT |
| Points log | GET | `/member/points` | Member JWT |
| Notifications | GET | `/member/notifications` | Member JWT |
| Unread count | GET | `/member/notifications/unread-count` | Member JWT |
| Mark notification read | POST | `/member/notifications/{id}/read` | Member JWT |
| Mark all notifications read | POST | `/member/notifications/read-all` | Member JWT |
| Upcoming classes | GET | `/member/classes` | Member JWT |
| Privacy policy | GET | `/member/privacy-policy` | Public |
| Terms & conditions | GET | `/member/terms` | Public |
| Delete mobile account | DELETE | `/member/account` | Member JWT + password |
| Upload InBody report file (admin) | POST | `/uploads/inbody` | Staff JWT |
| Upload InBody record (admin) | POST | `/admin/inbody` | Staff JWT |

---

## Flutter integration checklist

- [ ] Store `accessToken` securely (flutter_secure_storage)
- [ ] Attach `Authorization: Bearer` on all `/member/*` and `/invitations` POST calls
- [ ] Use phone as `username` in login
- [ ] Read `mustChangePassword` from the login response; if `true`, force `POST /auth/change-password` before any other screen
- [ ] Enforce new-password rules (≥6 chars, not `000000`) and show the `400` message on failure
- [ ] Render `gateQrCode` (or `barcode`) on the profile/check-in screen
- [ ] Prefix relative upload paths with base host + `/uploads/`
- [ ] Handle `accountType: "member"` in login response
- [ ] Poll `GET /member/invitations` for invite status updates
- [ ] Use `GET /member/notifications/unread-count` for the badge and mark notifications read when opened
- [ ] Render class tabs using the API values `men`, `women`, `kids`, `mixed`
- [ ] Make privacy policy available before login
- [ ] On successful account deletion, clear tokens and all local/cache data immediately

---

## Account provisioning — status

An app login only works when a member has an **app account** (`api_users` row) linked to their membership.

✅ **All current members are already provisioned.** The production database ships with **11,198 members**, every one linked to an app account with password **`000000`**. So you can log in and test with **any** real member (phone + `000000`).

- **New members** added later through the web dashboard are provisioned automatically — phone = username, password = `000000` — and can log in immediately.
- A login `401 "لا يوجد عضوية مرتبطة بهذا الحساب"` would only appear for a member with no linked app account (shouldn't happen with current data). If you ever see it, it's a **provisioning** state on the server, **not** a bug in your app.

> **For the Flutter dev:** ask the gym for any member's phone number and log in with `000000`. First login returns `mustChangePassword: true` → force the change-password screen.

---

## Notes for backend team

- Member tokens include `"type": "member"` — they cannot access staff/admin routes.
- Staff tokens cannot access member-only routes guarded by `MemberJwtAuthGuard`.
- Run DB migration: `npx prisma migrate deploy`
- Reset all existing member passwords to `000000`:  
  `npx ts-node -r tsconfig-paths/register prisma/scripts/reset-member-passwords.ts`
- Provision app accounts for existing members (see “Account provisioning” above).

---

*Document generated for ONE80 Gym mobile integration — July 2026*
