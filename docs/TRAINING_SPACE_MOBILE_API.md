# مساحة التدريب — Mobile API (Flutter)

> Ported from Gymora's `training-journey` module (`backend/src/modules/training-journey`).
> Same conventions as `docs/FLUTTER_NEW_API_ENDPOINTS.md`: base URL `https://YOUR_HOST/api`, JSON bodies,
> errors are `{ "statusCode": 400, "message": "…" }`, dates are `YYYY-MM-DD`, no `data/status` wrapper.

| App | Login | Prefix | Scope |
| --- | --- | --- | --- |
| Member app | `POST /api/member/auth/login` (member JWT) | `/api/member/training` | the signed-in member only |
| Trainer (staff) app | `POST /api/mobile/login` (staff JWT, `user.is_trainer = true`) | `/api/mobile/trainer/training` | the trainer's own clients only |

`/api/mobile/trainer/training/*` is the same controller as the web trainer portal
(`/api/trainer-portal/training/*`), so both paths behave identically. A trainer's clients are members with an
active training-space plan assigned to them, or with a current private-training subscription
(`club_subscriptions.private_trainer_id`). A member whose active plan belongs to another coach returns `403
العضو غير مسند إليك`. Every request is checked against an active `club_trainers` row linked to the employee
(`403 حسابك غير مرتبط بمدرب نشط` otherwise).

---

## 1. Member app — `/api/member/training`

Header: `Authorization: Bearer <member accessToken>`.

### `GET /api/member/training` — my program, history, measurements & goal

```json
{
  "member": { "id": 15, "name": "أحمد علي", "branch_id": 3, "gender": "male" },
  "assignment": {
    "id": 42, "member_id": 15, "trainer_id": 7, "plan_id": 9, "plan_revision": 3,
    "start_date": "2026-11-20", "is_active": true, "created_by": 21, "created_at": "2026-11-20T09:12:00.000Z",
    "snapshot": {
      "name": "تضخيم ٨ أسابيع", "goal": "زيادة الكتلة العضلية", "weeks": 8,
      "days": [
        {
          "id": "day-1", "name": "1", "exerciseType": "Push", "date": null, "reportLocale": "ar",
          "warmup": { "equipment": "مشاية", "equipmentIds": [4], "equipmentItems": [{ "id": 4, "name": "مشاية", "imageUrl": "/uploads/club/equipment/eq-1.png", "photoUrl": "/uploads/club/equipment/eq-1.png", "branchId": 3, "category": "cardio" }], "seconds": 300, "note": "" },
          "exercises": [
            {
              "key": "club:12", "rowId": "row-1", "name": "Bench press", "reportName": "",
              "kind": "strength", "primary": ["chest"], "secondary": ["triceps", "shoulders"],
              "phase": "workout", "loadMode": "kg", "load": 40,
              "sets": 4, "reps": 10, "seconds": 0, "rest": 90, "note": "تحكم في النزول",
              "instructions": "…", "videoUrl": null,
              "equipmentIds": [11], "equipment": [{ "id": 11, "name": "بنش مستوي", "imageUrl": null, "photoUrl": null, "branchId": 3, "category": "free_weights" }]
            }
          ]
        }
      ]
    }
  },
  "trainer": { "id": 7, "name": "كابتن محمد" },
  "sessions": [
    {
      "id": "sess_8f3a2c1d", "member_id": 15, "assignment_id": 42, "day_id": "day-1", "date": "2026-11-24",
      "status": "completed", "revision": 2, "note": "", "author": "member:88",
      "entries": [{ "key": "club:12", "rowId": "row-1", "name": "Bench press", "kind": "strength", "primary": ["chest"], "secondary": [], "coachNote": "تحكم في النزول", "note": "", "skipped": false, "sets": [{ "weight": 40, "reps": 10, "seconds": 0, "done": true }] }],
      "created_at": "…", "updated_at": "…"
    }
  ],
  "recordings": [
    { "id": "c0d…", "dayId": "day-1", "assignmentId": 42, "kind": "audio", "mime": "audio/mp4", "bytes": 182733, "durationSeconds": 41, "note": "شرح اليوم", "expiresAt": "2026-12-08T10:00:00.000Z", "createdAt": "…", "expired": false, "url": "/api/public/training-recordings/<token>" }
  ],
  "photos": [{ "id": "6b1…", "date": "2026-11-01", "angle": "front", "shared_with_coach": true }],
  "metrics": [{ "id": 3, "member_id": 15, "date": "2026-11-10", "test_key": "pushups_60s", "label": "ضغط ٦٠ ثانية", "unit": "reps", "side": "both", "value": 32, "protocol": "60 ثانية", "author": "staff:21" }],
  "events": [{ "id": 5, "member_id": 15, "kind": "plan_assigned", "note": "تضخيم ٨ أسابيع · الإصدار 3", "author": "staff:21", "created_at": "…" }],
  "muscleSets": { "chest": 12, "triceps": 4 },
  "body": {
    "checkins": [{ "id": "body_3e9…", "member_id": 15, "date": "2026-11-20", "measurements": { "weight": 82.5, "waist": 90 }, "note": "", "author": "staff:21", "created_at": "…" }],
    "baseline": { "id": "body_1aa…", "date": "2026-10-01", "measurements": { "height": 178, "weight": 86 }, "note": "", "author": "staff:21" },
    "target": { "member_id": 15, "revision": 2, "measurements": { "weight": 78, "waist": 84 }, "target_date": "2027-02-01", "note": "", "author": "staff:21", "updated_at": "…" }
  },
  "historyLimit": 200,
  "nextSessionCursor": null
}
```

- `assignment` is `null` when no program is assigned. The member never receives `handover_note` or `coach_handover` events.
- `photoUrl` / `recordings[].url` are relative to the API origin (prefix with `https://YOUR_HOST`). `url` is `null` once a recording expired or was deleted.
- `metrics[].value` is a number. Measurement keys: `height, weight, chest, waist, hips, arm, thigh, calf` (cm / kg).

### `GET /api/member/training/sessions?cursor=<sessionId>` — older history

Use `nextSessionCursor` from the previous response. `200`: `{ "sessions": [ … ], "nextCursor": "sess_…" | null }` (50 per page).

### `GET /api/member/training/catalog`

`{ "equipment": [TrainingEquipment], "muscles": [{ "id": "chest", "ar": "الصدر", "en": "Chest" }, …], "exercises": [Exercise] }`.

### `PUT /api/member/training/sessions` — log what I did (create or update)

The member logs actual results for a day of the assigned plan; the exercise list and set count of the plan cannot change.

```json
{
  "id": "sess_8f3a2c1d",          // client-generated, /^[a-zA-Z0-9_-]{8,80}$/
  "revision": 0,                  // 0 = new session; then send the revision returned by the server
  "assignmentId": 42,
  "dayId": "day-1",
  "date": "2026-11-24",
  "status": "in_progress",        // or "completed" (needs at least one done set)
  "note": "",
  "entries": [
    { "key": "club:12", "rowId": "row-1", "skipped": false, "note": "", "sets": [
      { "weight": 40, "reps": 10, "seconds": 0, "done": true },
      { "weight": 40, "reps": 8, "seconds": 0, "done": false }
    ] }
  ]
}
```

`200`: the saved session row (with the new `revision`). `409` when the session changed on another device — reload and retry.

### `POST /api/member/training/body/checkins` — add measurements

```json
{ "id": "body_7c2d91aa", "date": "2026-11-24", "measurements": { "weight": 81.9, "waist": 89 }, "note": "" }
```

`200`: the check-in row. Re-sending the same `id` with the same values is idempotent; future dates are rejected.

### `PUT /api/member/training/body/target` — set my goal

```json
{ "revision": 2, "measurements": { "weight": 78, "waist": 84 }, "targetDate": "2027-02-01", "note": "" }
```

Send the current `body.target.revision` (`0` when there is no target yet). Height is not a target. `409` if it changed meanwhile.

### `POST /api/member/training/metrics` — performance test

```json
{ "testKey": "pushups_60s", "label": "ضغط ٦٠ ثانية", "unit": "reps", "protocol": "60 ثانية", "side": "both", "value": 32, "date": "2026-11-24" }
```

### Progress photos (private to the member until shared)

| Method | Path | Body |
| --- | --- | --- |
| `POST` | `/api/member/training/photos` | multipart: `image` (JPEG/PNG/WebP ≤ 3 MB), `angle` = `front`\|`side`\|`back`, `date` |
| `GET` | `/api/member/training/photos/:id/content` | → image bytes |
| `PUT` | `/api/member/training/photos/:id/consent` | `{ "shared": true }` — lets the coach see it |
| `DELETE` | `/api/member/training/photos/:id` | — |

### `GET /api/member/training/recordings`

Coach voice/video notes for the current program (same items as `recordings` above).
`GET /api/public/training-recordings/:token` streams the file without auth until it expires (used by the printed QR code).

---

## 2. Trainer app — `/api/mobile/trainer/training`

Header: `Authorization: Bearer <staff accessToken>` of a user whose employee is an active trainer.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/members?search=` | my clients `[{ "id": 15, "name": "أحمد علي", "memberCode": "M-0015", "branchId": 3 }]` |
| `GET` | `/members/:memberId` | full journey (same shape as the member `GET /api/member/training`, plus `handover_note` and shared photos only) |
| `GET` | `/members/:memberId/sessions?cursor=` | older sessions `{ sessions, nextCursor }` |
| `GET` | `/catalog` | muscles, exercises (`editable` marks the trainer's own custom exercises), equipment of the trainer's branch |
| `POST` / `PUT` | `/exercises` | create a custom exercise / edit own custom exercise |
| `GET` | `/plans` | own drafts + published branch programs |
| `POST` / `PUT` | `/plans` | create / update own draft program (trainers cannot publish; `PUT` needs `id` + `revision`) |
| `GET` | `/trainers?memberId=` | trainers in the member's branch (for handover) |
| `POST` | `/members/:memberId/assign` | assign a program `{ "planId": 9, "startDate": "2026-11-25" }` (always assigned to the calling trainer) |
| `POST` | `/members/:memberId/handover` | hand the client to another coach `{ "trainerId": 8, "note": "…" }` |
| `POST` | `/members/:memberId/sessions` | record a new session (same body as the member `PUT`, `revision` forced to 0) |
| `PUT` | `/members/:memberId/sessions` | edit a recorded session (`revision ≥ 1`) |
| `POST` | `/members/:memberId/metrics` | add a performance test |
| `POST` | `/members/:memberId/body/checkins` | add measurements |
| `PUT` | `/members/:memberId/body/target` | set the client goal |
| `GET` | `/members/:memberId/photos/:id/content` | a photo the member shared |
| `GET` | `/members/:memberId/recordings` | recordings |
| `POST` | `/members/:memberId/recordings` | multipart: `file`, `kind` = `audio`\|`video`, `dayId`, `durationSeconds?`, `retentionDays` = 7\|14\|30, `note?` (audio ≤ 10 MB / 10 min, video ≤ 20 MB / 60 s) |
| `DELETE` | `/members/:memberId/recordings/:id` | delete a recording |

### Plan body (`POST` / `PUT /plans`)

```json
{
  "id": 9, "revision": 3,
  "name": "تضخيم ٨ أسابيع", "goal": "زيادة الكتلة العضلية", "weeks": 8, "branchId": 3, "status": "draft",
  "days": [
    {
      "id": "day-1", "name": "1", "exerciseType": "Push", "reportLocale": "ar", "date": null,
      "warmup": { "equipment": "مشاية", "equipmentIds": [4], "seconds": 300, "note": "" },
      "exercises": [
        { "key": "club:12", "rowId": "row-1", "phase": "workout", "loadMode": "kg", "load": 40,
          "sets": 4, "reps": 10, "seconds": 0, "rest": 90, "note": "تحكم في النزول", "reportName": "", "equipmentIds": [11] }
      ]
    }
  ]
}
```

`phase` = `warmup`\|`workout`\|`skill`\|`cooldown`; `loadMode` = `kg`\|`percent1rm`; 1–14 days, 1–40 exercises per day.
`200`: the plan row `{ id, name, goal, weeks, revision, status, branch_id, days, created_by, created_at, updated_at }`.
`409 البرنامج اتغير؛ أعد تحميله قبل الحفظ` when `revision` is stale.

### Assign response

`200`: the new assignment row (`snapshot` copies the plan at that revision, so later plan edits do not change a running program).

---

## 3. Web admin (for reference)

`/api/club-training/*` — same operations for staff with the `club.fitness.training_space` permission
(`view` reads, `create`/`update`/`delete` writes; publishing a program is limited to admins/branch managers),
plus the equipment library: `POST /equipment/photo` (multipart `file`), `POST /equipment`, `PUT /equipment/:id`.
