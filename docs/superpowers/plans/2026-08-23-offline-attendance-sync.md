# Offline Attendance Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist offline mobile attendance punches using their capture time, safely replay retries, and preserve the chronological in/out sequence when Flutter syncs queued punches.

**Architecture:** Add a dedicated idempotency/audit table keyed by `(user_id, offline_id)`, an offline-sync DTO and mobile endpoint, and a small pure clock utility. The attendance service will reuse the existing geofence and shift pipeline but inject the captured local date/time into it; Flutter sends every queued punch separately in ascending `capturedAtUtc` order.

**Tech Stack:** NestJS 11, TypeScript, Prisma 5, MySQL, Jest.

**Spec:** `docs/superpowers/specs/2026-08-23-offline-attendance-design.md`

## Global Constraints

- Only `POST /api/mobile/attendance/offline-sync` accepts an offline capture time; direct punch behavior remains unchanged.
- The maximum delay is exactly 24 hours, and a capture time cannot be future-dated.
- A single logical punch keeps the same UUID `offlineId` on every retry.
- Flutter must submit queued punches by ascending `capturedAtUtc`; an offline check-in is sent before its offline checkout.
- Every successful offline punch is marked `requiresReview: true` and stores both capture and receipt timestamps.
- No destructive database reset or migration command may be run.

---

### Task 1: Add and prove the offline clock validator

**Files:**
- Create: `backend/src/modules/attendance/offline-attendance.util.ts`
- Test: `backend/src/modules/attendance/offline-attendance.util.spec.ts`

**Interfaces:**
- Produces `resolveOfflinePunchClock(capturedAtUtc: string, timezone: string, now?: Date)` returning `{ capturedAt: Date; actionDate: string; time: string; receivedAt: Date }`.
- Throws `BadRequestException` for invalid timestamps/time zones, future timestamps, and records older than 24 hours.

- [ ] **Step 1: Write the failing test**

```ts
it('uses the captured Cairo day and time for a punch within 24 hours', () => {
  const value = resolveOfflinePunchClock(
    '2026-08-23T20:15:00.000Z', 'Africa/Cairo', new Date('2026-08-23T21:00:00.000Z'),
  );
  expect(value).toMatchObject({ actionDate: '2026-08-23', time: '11:15 PM' });
});

it('rejects an offline capture older than 24 hours', () => {
  expect(() => resolveOfflinePunchClock(
    '2026-08-22T19:59:59.000Z', 'Africa/Cairo', new Date('2026-08-23T20:00:00.000Z'),
  )).toThrow('24');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- attendance/offline-attendance.util.spec.ts --runInBand` from `backend`.

Expected: FAIL because the utility does not exist.

- [ ] **Step 3: Write minimal implementation**

Validate ISO date, validate IANA timezone through `Intl.DateTimeFormat`, enforce `0 <= now - capturedAt <= 86_400_000`, and use `formatToParts` in the submitted timezone to derive `YYYY-MM-DD` plus the 12-hour time string used by attendance rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- attendance/offline-attendance.util.spec.ts --runInBand` from `backend`.

Expected: PASS.

### Task 2: Add persistent offline idempotency storage

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260823000000_mobile_offline_attendance_sync/migration.sql`

**Interfaces:**
- Produces Prisma model `mobile_offline_attendance_sync` with unique compound key `(user_id, offline_id)`.
- Stores the request hash, capture timestamp/timezone, server receipt timestamp, attendance ID, result JSON, and sync state.

- [ ] **Step 1: Add a compile-level failing use of the future Prisma delegate in the service test**

```ts
const prisma = { mobile_offline_attendance_sync: { findUnique: jest.fn() } };
expect(prisma.mobile_offline_attendance_sync.findUnique).toBeDefined();
```

- [ ] **Step 2: Run the attendance test to verify it fails against generated Prisma types**

Run: `npm run typecheck` from `backend`.

Expected: FAIL until the schema is changed and Prisma Client is regenerated.

- [ ] **Step 3: Add schema and non-destructive migration**

Create the table with nullable completion fields for an in-progress sync, a `payload_hash` SHA-256 field, a `state` field, and `@@unique([user_id, offline_id])`. Do not modify existing attendance tables.

- [ ] **Step 4: Regenerate and validate Prisma**

Run: `npm run prisma:generate && npm run prisma:validate` from `backend`.

Expected: both commands exit 0.

### Task 3: Add a TDD-proven service flow for one offline punch

**Files:**
- Modify: `backend/src/modules/attendance/attendance.service.ts`
- Modify: `backend/src/modules/attendance/attendance.mobile-punch.spec.ts`

**Interfaces:**
- Produces `syncOfflinePunch(user, dto)`.
- Reuses `mobilePunch` geofence checks and `manualCheck` shift rules using the captured date/time.
- Returns the direct punch result plus `offlineId`, `capturedAtDevice`, `receivedAtServer`, `requiresReview`, and `replayed`.

- [ ] **Step 1: Write failing service tests**

```ts
it('syncs an offline check-in at its captured time and marks it for review', async () => {
  // Mock an available offlineId and spy on manualCheck.
  // Assert checkIn/checkOut use the capture time, actionDate uses the capture date,
  // and the persisted result has requiresReview true.
});

it('replays the stored result for the same user and offlineId without punching again', async () => {
  // Existing completed sync has the same payload hash.
  // Assert manualCheck is not called and replayed is true.
});

it('rejects reuse of offlineId with a different payload', async () => {
  // Existing sync has a different hash; expect ConflictException.
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- attendance/attendance.mobile-punch.spec.ts --runInBand` from `backend`.

Expected: FAIL because `syncOfflinePunch` does not exist.

- [ ] **Step 3: Implement the minimal service behavior**

Reserve the `(userId, offlineId)` row before invoking the attendance pipeline. On success update it with the complete response; on a normal rejection delete the reservation. If an existing complete row has the same hash, return its stored result with `replayed:true`; if the hash differs, throw `ConflictException`. Pass the derived capture date and time into `manualCheck` without changing direct-punch behavior.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- attendance/attendance.mobile-punch.spec.ts --runInBand` from `backend`.

Expected: PASS.

### Task 4: Expose the new mobile endpoint and document ordered queue behavior

**Files:**
- Modify: `backend/src/modules/mobile/dto/mobile.dto.ts`
- Modify: `backend/src/modules/mobile/mobile.controller.ts`
- Modify: `docs/FLUTTER_NEW_API_ENDPOINTS.md`

**Interfaces:**
- Produces `MobileOfflineAttendanceSyncDto` and `POST /api/mobile/attendance/offline-sync`.
- Controller calls `AttendanceService.syncOfflinePunch` for the authenticated user.

- [ ] **Step 1: Write failing controller/DTO coverage**

```ts
it('routes offline sync payloads to AttendanceService for the JWT user', async () => {
  await controller.offlineAttendanceSync(dto, user);
  expect(attendance.syncOfflinePunch).toHaveBeenCalledWith(user, dto);
});
```

- [ ] **Step 2: Run test to verify RED**

Run the focused mobile controller test or the matching Jest test file from `backend`.

Expected: FAIL because the route method and DTO do not exist.

- [ ] **Step 3: Implement DTO, route, and documentation**

Require UUID v4 `offlineId`, ISO `capturedAtUtc`, IANA `timezone`, `lat`, and `long`; keep `photo` optional. Document that Flutter sorts pending records by `capturedAtUtc` and submits each one separately, so a valid offline check-in and checkout both sync in their original order when connectivity returns before 24 hours.

- [ ] **Step 4: Verify controller and API inventory**

Run: `npm test -- attendance/attendance.mobile-punch.spec.ts --runInBand && npm run typecheck && npm run build` from `backend`.

Expected: all commands exit 0.

### Task 5: Verify the complete behavior

**Files:**
- Test: `backend/src/modules/attendance/offline-attendance.util.spec.ts`
- Test: `backend/src/modules/attendance/attendance.mobile-punch.spec.ts`

- [ ] **Step 1: Run the focused offline attendance suite**

Run: `npm test -- attendance/offline-attendance.util.spec.ts attendance/attendance.mobile-punch.spec.ts --runInBand` from `backend`.

Expected: PASS with no failures.

- [ ] **Step 2: Run static and production build checks**

Run: `npm run prisma:validate && npm run typecheck && npm run build` from `backend`.

Expected: all commands exit 0.

- [ ] **Step 3: Review spec coverage**

Confirm the endpoint accepts one queued item, bounds it to 24 hours, uses captured time, persists receipt time and idempotency identity, returns replay-safe results, and documents chronological upload of check-in then checkout.
