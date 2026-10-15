# ONE80 — Member Mobile API (Flutter) · Addendum #1

**Base URL:** `https://one80.alatheertech.com/api`
The **four** new endpoints requested by the Flutter dev. All bodies are JSON, Arabic text in
`title`/`body`/`label`, amounts are numbers. Auth = same member Bearer token as the main spec
(`Authorization: Bearer <accessToken>`).

> Shapes below are **verified against the local build on 2026-07-09** (real request/response).
> They ship on the next deploy. The points log (سجل النقاط) is a **simple v1** derived from
> subscriptions — see section 4 for the caveat.

---

## 1) سجل الوقف — Freeze / suspension log

### `GET /member/freezes` · Bearer required → array (newest first)
All freeze records across this member's subscriptions.

```jsonc
[
  {
    "id": 2,
    "subscriptionId": 8,
    "subscriptionNumber": "A000123",     // = member code convention; may repeat per subscription
    "subscriptionType": "شهري",           // or null
    "freezeStartDate": "2026-07-05",      // YYYY-MM-DD
    "freezeEndDate": "2026-07-12",        // planned end; null while still frozen with no plan
    "plannedDays": 7,
    "actualDays": null,                    // set when the freeze is lifted
    "originalEndDate": "2026-12-31",       // subscription end before the freeze
    "reason": "سفر",                        // or null
    "isActive": true,                      // true = currently frozen
    "createdAt": "2026-07-09T11:23:57.031Z"
  }
]
```
Empty array `[]` if the member never froze a subscription.

---

## 2) الاشعارات — Notifications

Per-member feed with real read/unread state. Newest first.

### `GET /member/notifications` · Bearer required
Query params (both optional): `?unread=true` (unread only) · `?limit=50` (max 100, default 50).

```jsonc
{
  "unreadCount": 2,
  "notifications": [
    {
      "id": 2,
      "title": "عرض جديد",
      "body": "خصم على الاشتراك",
      "type": "general",              // general | subscription | freeze | offer | class | points …
      "data": null,                   // parsed JSON payload (deep-link/ids) or null
      "imageUrl": null,               // absolute URL or null
      "isRead": false,
      "readAt": null,                 // ISO datetime once read
      "createdAt": "2026-07-09T11:23:57.036Z"
    }
  ]
}
```

### `GET /member/notifications/unread-count` → `{ "unreadCount": 2 }`
Cheap call for the app badge.

### `POST /member/notifications/:id/read` → `{ "id": 1, "isRead": true }`
Marks one notification read. `404` if the id isn't this member's.

### `POST /member/notifications/read-all` → `{ "updated": 3 }`
Marks all this member's unread notifications read (`updated` = how many changed).

> **How notifications get created:** staff push them from the admin web
> (`POST /api/app/notifications`, permission `app-management.notifications:*`) either to one member
> (`memberId`) or broadcast to a whole branch. The feed above is what the member reads back.

---

## 3) الكلاسات — Classes (رجال / سيدات / أطفال)

Upcoming classes in the **member's own branch**, grouped by audience. Each class carries live
capacity and whether *this* member is enrolled.

### `GET /member/classes` · Bearer required
Optional filter: `?audience=men` (or `women` / `kids` / `mixed`). Omit → all four buckets.

```jsonc
{
  "total": 2,
  "audiences": [
    {
      "audience": "men",             // men | women | kids | mixed
      "label": "رجال",                // ready-to-display Arabic label
      "count": 1,
      "classes": [
        {
          "id": 1,
          "className": "كلاس رجال",
          "description": "…",          // or null
          "audience": "men",
          "audienceLabel": "رجال",
          "classDate": "2026-12-30",   // YYYY-MM-DD
          "startTime": "18:00",
          "endTime": "19:00",
          "trainerName": "أحمد",        // or null
          "hallName": "قاعة 1",         // or null
          "maxCapacity": 10,
          "enrolledCount": 0,
          "availableSpots": 10,
          "isFull": false,
          "price": 0,
          "status": "scheduled",       // scheduled | ongoing
          "isEnrolled": false          // is THIS member enrolled?
        }
      ]
    },
    { "audience": "women", "label": "سيدات", "count": 0, "classes": [] },
    { "audience": "kids",  "label": "أطفال", "count": 1, "classes": [ /* … */ ] },
    { "audience": "mixed", "label": "مختلط", "count": 0, "classes": [] }
  ]
}
```
- Buckets always come back in this order: **men → women → kids → mixed**. With `?audience=`, only
  that one bucket is returned (same shape).
- Scope: `class_date >= today`, active, not deleted, status ∈ {scheduled, ongoing}, member's branch.
- `audienceLabel` / `label` are pre-translated so the app can render tabs directly.

---

## 4) سجل النقاط — Points log

### `GET /member/points` · Bearer required
Simple v1: points are **derived from subscriptions** — each subscription earns the wallet points
configured on its package (the "نقاط المحفظة" field). No spending yet, so `balance == totalEarned`.

```jsonc
{
  "balance": 200,
  "totalEarned": 200,
  "totalRedeemed": 0,                 // always 0 in v1 (no redemption)
  "history": [                        // newest first
    {
      "id": 10,
      "type": "earn",                 // only "earn" in v1
      "points": 100,
      "balanceAfter": 200,            // running balance at this entry
      "reason": "باقة تجريبية",         // the subscription/package name
      "subscriptionId": 10,
      "subscriptionNumber": "A000123-2",
      "date": "2026-07-01",           // subscription registration date
      "createdAt": "2026-07-09T12:29:16.148Z"
    }
  ]
}
```
- Only subscriptions whose package has **wallet points > 0** produce an entry; a member with none
  gets `{ balance: 0, totalEarned: 0, totalRedeemed: 0, history: [] }`.
- ⚠️ **v1 caveat:** points reflect the package's *current* `wallet_points`, not the value at
  purchase, and there is no redemption. This is intentionally swappable for a real earn/redeem
  ledger later — the response shape (`balance` / `totalEarned` / `totalRedeemed` / `history[]`)
  is designed to stay stable when that lands.

---

## 5) سياسة الخصوصية / الشروط — Privacy policy & terms · **public (no token)**

Both are **public** so the app can show them on the pre-login consent/signup screen.

### `GET /member/privacy-policy` → `{ "privacyPolicy": "…", "updatedAt": "…" }`
### `GET /member/terms` → `{ "termsAndConditions": "…", "updatedAt": "…" }`

- Text is HTML/plain string managed by staff under app-management ("about"). Empty string `""`
  if not set yet.
- Same content is also on the authenticated `GET /member/profile` (`privacyPolicy` +
  `termsAndConditions`) and the public `GET /app/about` — these two just give the app a focused,
  token-free call.

---

## Notes / field reference
- **Auth:** sections 1–4 need the Bearer access token (2h), refresh on `401`. Section 5 is public.
- **Points source:** the package "نقاط المحفظة" (`wallet_points`) set by admin on each plan.
- **Dates** are `YYYY-MM-DD`; timestamps (`createdAt`, `readAt`) are ISO datetimes.
- **`audience` enum:** `men` · `women` · `kids` · `mixed`. New classes default to `mixed` until an
  admin sets the audience on the class.
