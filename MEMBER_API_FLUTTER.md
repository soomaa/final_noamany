# ONE80 — Member Mobile API (Flutter)

**Base URL:** `https://one80.alatheertech.com/api`  
All bodies are JSON. Arabic user-facing text arrives in `message`. Amounts are numbers (not strings).  
Verified against the backend source on **2026-07-25**.

> Extra endpoints (freezes, notifications, classes, points) live in `MEMBER_API_FLUTTER_ADDENDUM.md`.

---

## ⚠️ About the "خطأ من السيرفر / انتهت صلاحية الجلسة" that was reported

It was **not** a bug in the member auth. Two deploy-time causes, both now resolved:
1. The server was running an **older build**.
2. The JWT signing secret changed during a deploy, so tokens issued *before* it became invalid → the API correctly returns `401 انتهت الجلسة`.

The secret is now **fixed and stable** across deploys, so this won't recur.  
**App rule:** on any `401`, try `refresh` once; if that also fails, clear tokens and return to the login screen.

---

## Auth

### `POST /member/auth/login`  · public · rate-limited 10/min
```jsonc
// request
{ "phone": "01xxxxxxxxx", "password": "000000" }
```
```jsonc
// 200
{
  "accessToken": "<JWT>",
  "refreshToken": "<JWT>",
  "user": { "sub": 12, "memberId": 34, "branchId": 1, "phone": "01xxxxxxxxx", "name": "…", "type": "member" },
  "message": "تم تسجيل الدخول بنجاح",
  "mustChangePassword": true
}
```
- Default password for a new account = **`000000`** (6 zeros). If `mustChangePassword === true`, force the change-password screen before anything else.
- For compatibility with older app releases, the phone number can also be sent as `username`: `{ "username": "01xxxxxxxxx", "password": "000000" }`. It is still the member's phone number, not a staff/system username.
- Wrong credentials → `401 { "message": "رقم الجوال أو كلمة المرور غير صحيحة" }`.
- Account exists but no linked club membership → `401 { "message": "لا يوجد عضوية مرتبطة بهذا الحساب" }`.
- Inactive app user → same wrong-credentials `401`.
- Too many attempts → `429`.
- Login does **not** return `barcode` / `memberCode`. Fetch those from `GET /member/profile`.

### Send the token on every protected request
```
Authorization: Bearer <accessToken>
```
(The web build also accepts an `one80_member_access` cookie — for Flutter use the **Bearer header**.)  
Access token TTL **2h**, refresh token TTL **7d** (defaults; overridable via env).

### `POST /member/auth/refresh`  · public
```jsonc
{ "refreshToken": "<JWT>" }            // → { "accessToken": "<JWT>", "user": { …MemberUser } }
```
Fail → `401 { "message": "انتهت الجلسة" }` → send user to login.

### `POST /member/auth/change-password`  · Bearer required
```jsonc
{ "currentPassword": "000000", "newPassword": "123456" }   // → { "message": "تم تغيير كلمة المرور بنجاح" }
```
Rules: `newPassword` **≥ 6 chars**, must differ from `000000`, and must not equal the current password.  
Violations → `400` with the Arabic reason (e.g. `كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل`).

### `DELETE /member/account`  · Bearer required

Permanently removes the member's mobile-app login. The password is required so
possession of an unlocked phone or a stolen access token alone cannot delete the account.

```jsonc
// request
{ "password": "123456" }
```
```jsonc
// 200
{
  "message": "تم حذف حساب التطبيق بنجاح",
  "accountDeleted": true,
  "membershipDeleted": false
}
```

- Wrong password → `400 { "message": "كلمة المرور غير صحيحة" }`.
- Missing/invalid/expired token → `401`.
- On `200`, immediately delete both tokens from secure storage and return to the login screen.
- All old access and refresh tokens stop working immediately after deletion.
- The app login is deleted; the gym membership and financial/attendance records are retained.

---

## Member data — all require `Authorization: Bearer <accessToken>`

Every endpoint below is scoped to **the logged-in member only** (`memberId` from the JWT). The app never passes another member’s id.

### `GET /member/profile`
```jsonc
{
  "fullName": "…", "phone": "01…",
  "profilePictureUrl": "https://one80.alatheertech.com/uploads/…" ,  // or null
  "branchName": "الفرع الرئيسي",                                       // or null
  "memberCode": "A000123", "memberId": 34,
  "barcode": "7381942", "gateQrCode": "7381942",
  "gateQrFormat": "WIEGAND26_DECIMAL",
  "termsAndConditions": "…", "privacyPolicy": "…",
  "isActive": true
}
```
- Render `gateQrCode` (or the compatibility alias `barcode`) in the gym QR screen.
  It is an opaque 7-digit C3 credential; never replace it with `memberCode`.
- Always returned for a valid member token. **Not gated** by subscription status.
- Inactive / deleted / unlinked accounts → `401 انتهت الجلسة` (token rejected before this runs).

### `GET /member/packages`  → array
```jsonc
[{
  "id": 5, "name": "شهري", "price": 500, "days": 30, "durationLabel": "30 يوم",
  "isSpecialOffer": false, "isForStudents": false,
  "invitationsCount": 2, "inbodyCount": 1, "includesSpa": false, "spaCount": 0,
  "sessionsCount": null, "freezeDays": 7, "walletPoints": 0, "offerValidity": null
}]
```
Only plans with `is_active` + `show_in_app`, filtered to the member’s branch (`apply_to_all_branches` / branch link / primary branch).

### `GET /member/subscriptions`
Returns **only this member’s** subscriptions (`WHERE member_id = JWT.memberId`).

```jsonc
{
  "activePlan": {                       // null if none currently active
    "id": 9, "subscriptionNumber": "A000123", "subscriptionType": "شهري", "subscriptionTypeId": 5,
    "startDate": "2026-07-01", "endDate": "2026-07-31",
    "value": 500, "paidAmount": 500, "remainingAmount": 0, "status": "active"
  },
  "history": [{
    "id": 9, "subscriptionNumber": "A000123", "subscriptionType": "شهري", "subscriptionTypeId": 5,
    "startDate": "2026-07-01", "endDate": "2026-07-31",
    "value": 500, "paidAmount": 500, "remainingAmount": 0,
    "status": "active", "isActive": true, "registrationDate": "2026-07-01"
  }]
}
```

**How `activePlan` / `status` are computed** (same rules as gym check-in entitlement):
- Frozen subscription → `status: "frozen"` (never `activePlan`).
- Otherwise date-based: before start → `upcoming`, after end → `expired`, else `active`.
- Session packages (حصص): also expire when remaining sessions hit `0`.
- `activePlan` = newest history row with `status === "active"` (list ordered by `id` desc).
- `isActive` in `history[]` ≡ `status === "active"`.

> **Subscription number = the member’s own code.** Member `A000123`’s first subscription is `A000123`; later ones are `A000123-2`, `A000123-3` … Display `subscriptionNumber` as-is.

### `GET /member/inbody-history`  → array (newest first)
```jsonc
[{
  "id": 3, "measurementDate": "2026-07-05",
  "weight": 80.5, "heightCm": 178, "bodyFat": 18.2, "muscleMass": 36.1, "bmi": 25.4,  // any may be null
  "notes": "…", "reportUrl": "https://one80.alatheertech.com/uploads/…", "createdAt": "…"
}]
```

### `POST /member/invitations`  → the created invitation
```jsonc
// request
{ "recipientName": "…", "recipientPhone": "01…", "recipientEmail": "x@y.com" }   // email optional
```
```jsonc
// 201
{
  "id": 1, "invitationCode": "INV000001",
  "recipientName": "…", "recipientPhone": "01…", "recipientEmail": null,
  "sentDate": "…", "status": "pending",
  "acceptedDate": null, "rejectedDate": null, "rejectionReason": null,
  "attendanceDate": null, "branchId": 1, "branchName": "…", "createdAt": "…"
}
```

### `GET /member/invitations`  → array of the objects above (this member’s invites, newest first)

---

## Public (no token)

### `GET /packages?branchId=<id>`
Same array shape as `GET /member/packages`. `branchId` optional — omit to list all active in-app plans.

### `GET /member/privacy-policy`
```jsonc
{ "privacyPolicy": "…", "updatedAt": "…" }
```

### `GET /member/terms`
```jsonc
{ "termsAndConditions": "…", "updatedAt": "…" }
```

---

## Field / status reference
- **Member JWT claims:** `sub` (api_user id), `memberId`, `branchId`, `phone`, `name`, `type: "member"`. Any token missing `type === "member"` or `memberId`, or after account deletion / inactive member, is rejected with `401 انتهت الجلسة` — expected, not a bug to chase.
- **Subscription `status`:** `active` · `upcoming` · `expired` · `frozen`. `isActive` ≡ `status === "active"`.
- **Invitation `status`:** `pending` · `accepted` · `rejected` (also carries `attendanceDate` when the guest attends).
- **Attendance rule (server-side):** a member with no active subscription cannot check in — surface `activePlan == null` in the UI to explain why entry would be denied. Barcode still shows from profile regardless.
- **Dates** are `YYYY-MM-DD` strings; timestamps (`createdAt`, `sentDate`, …) are ISO datetimes.
- **Gate QR for Flutter:** call `GET /member/profile` after login and render
  `gateQrCode` (or `barcode`) as QR/Code128. Do not render `memberCode` as the
  physical gate credential.
