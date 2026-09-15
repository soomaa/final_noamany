# Club Legacy Barcode Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the eight legacy club barcode, attendance, receipt, refund, and membership-document workflows for newly created data in the new system.

**Architecture:** Extend the existing NestJS club modules and Prisma schema rather than introducing a separate service. Store SPA visits independently, preserve class and membership attendance in their current sources, and expose a unified read-only reporting API. Add focused React pages and actions that reuse the existing API client, barcode label printer, upload utility, RBAC branch scope, and table/export conventions.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, Jest, React, TypeScript, TanStack Query/Table, existing upload API and shadcn-style UI components.

**Spec:** `docs/superpowers/specs/2026-08-26-club-legacy-barcode-compatibility-design.md`

## Global Constraints

- Implement for newly recorded data only; do not migrate legacy records.
- SPA and class visits are barcode operations against an active subscription, not bookings.
- SPA check-in allows one visit per member per day and consumes one SPA session.
- Membership document accepts PDF only, maximum 5MB, one current file per member.
- Apply existing user branch scope and audit conventions to every endpoint.
- Refund "delete" must be a financial cancellation/reversal, not an untracked hard delete.
- Do not add unrelated redesigns or booking workflows.
- This workspace is not a Git repository; replace plan commit steps with a recorded passing-test checkpoint.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/prisma/schema.prisma` and migration | Persist SPA entitlement/session counters, SPA attendance, and membership-document metadata. |
| `backend/src/modules/club-members/*attendance*` | Barcode-time report and unified attendance report. |
| `backend/src/modules/club-fitness/club-classes.*` | Barcode code-to-member class check-in. |
| `backend/src/modules/club-fitness/club-spa-attendance.*` | SPA entitlement check and attendance write/read. |
| `backend/src/modules/club-members/club-members.*` | Membership-document upload/read/delete and printable member payload. |
| `backend/src/modules/club-subscriptions/*` | SPA entitlement on subscription type/subscription, receipt filters, safe refund cancellation. |
| `frontend/src/pages/club/barcode-operations.tsx` | Four legacy-compatible barcode tabs. |
| `frontend/src/pages/club/members.tsx` and member components | Membership-document actions and printable membership bundle. |
| `frontend/src/pages/club/subscriptions.tsx` | Receipt filters/export/print and refund cancellation action. |
| `frontend/src/pages/reports/*` or existing report page | Unified attendance filters/results/export. |
| `frontend/src/pages/club/route-pages.tsx` and navigation config | Routes and permitted navigation links. |

### Task 1: Schema and shared DTO contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_club_legacy_barcode_compatibility/migration.sql`
- Modify: `backend/src/modules/club-members/dto/list-club-attendance.dto.ts`
- Create: `backend/src/modules/club-fitness/dto/barcode-spa-check-in.dto.ts`
- Create: `backend/src/modules/club-fitness/dto/barcode-class-check-in.dto.ts`
- Test: `backend/src/modules/club-fitness/club-spa-attendance.service.spec.ts`

**Interfaces:**
- Produces `club_spa_attendance` with `member_id`, `member_code`, `branch_id`, `subscription_id`, `attendance_date`, `check_in_time`, `created_by`, and a unique member/date constraint.
- Produces `spa_sessions_total` and `spa_sessions_used` on subscription snapshots, and `spa_sessions` on subscription types.
- Produces report query fields `memberCode`, `gender`, `timeFrom`, `timeTo`, and `attendanceType`.

- [ ] **Step 1: Write failing schema/service tests**

```ts
it('rejects a second SPA scan for the same member on the same local date', async () => {
  prisma.club_spa_attendance.findFirst.mockResolvedValue({ id: 18 });
  await expect(service.checkInByBarcode({ memberCode: '1001' }, user))
    .rejects.toThrow('تم تسجيل حضور السبا بالفعل اليوم');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- club-spa-attendance.service.spec.ts --runInBand` from `backend`.

Expected: FAIL because the service and Prisma model do not exist.

- [ ] **Step 3: Add the migration, Prisma models, and DTO validation**

Add `club_spa_attendance`, document metadata fields, entitlement counters, date/member and reporting indexes. Validate barcode strings, date ranges, HH:mm times, and attendance type values `all|membership|class|spa|inbody`.

- [ ] **Step 4: Generate Prisma client and rerun the test**

Run: `npm run prisma:generate && npm test -- club-spa-attendance.service.spec.ts --runInBand` from `backend`.

Expected: PASS for DTO/model compilation and duplicate lookup behavior.

- [ ] **Step 5: Record checkpoint**

Record migration name and passing command in the implementation handoff; no commit is possible in this workspace.

### Task 2: SPA barcode attendance

**Files:**
- Create: `backend/src/modules/club-fitness/club-spa-attendance.service.ts`
- Create: `backend/src/modules/club-fitness/club-spa-attendance.controller.ts`
- Modify: `backend/src/modules/club-fitness/club-fitness.module.ts`
- Test: `backend/src/modules/club-fitness/club-spa-attendance.service.spec.ts`

**Interfaces:**
- Consumes `BarcodeSpaCheckInDto { memberCode: string }` and authenticated user branch scope.
- Produces `checkInByBarcode(dto, user): { member; subscription; remainingSpaSessions; attendance }`.

- [ ] **Step 1: Write failing service tests for the accepted and rejected scans**

```ts
it('records a visit and increments spa_sessions_used for an eligible active subscription', async () => {
  // mock the matching active subscription with spa_sessions_total: 4 and used: 1
  const result = await service.checkInByBarcode({ memberCode: '1001' }, user);
  expect(tx.club_spa_attendance.create).toHaveBeenCalled();
  expect(tx.club_subscriptions.update).toHaveBeenCalledWith(expect.objectContaining({
    data: { spa_sessions_used: 2 },
  }));
  expect(result.remainingSpaSessions).toBe(2);
});
```

- [ ] **Step 2: Run the SPA service tests and verify failure**

Run: `npm test -- club-spa-attendance.service.spec.ts --runInBand` from `backend`.

Expected: FAIL before the service methods are implemented.

- [ ] **Step 3: Implement transaction-safe SPA check-in**

Resolve member by barcode/member code, enforce branch scope and active subscription status, choose an eligible SPA subscription, reject no entitlement/exhausted/duplicate-day cases, create attendance, increment the consumed counter in one transaction, and return Arabic operation messages.

- [ ] **Step 4: Add controller and module registration**

Expose `POST /club-spa-attendance/barcode-check-in` and `GET /club-spa-attendance` with the shared report filters and guards used by club modules.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- club-spa-attendance.service.spec.ts --runInBand` from `backend`.

Expected: PASS for success, unknown member, no active entitlement, exhausted sessions, same-day duplicate, and foreign-branch cases.

### Task 3: Class barcode attendance and SPA entitlement configuration

**Files:**
- Modify: `backend/src/modules/club-fitness/club-classes.service.ts`
- Modify: `backend/src/modules/club-fitness/club-classes.controller.ts`
- Modify: `backend/src/modules/club-subscriptions/dto/upsert-club-subscription.dto.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscription-types.service.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.ts`
- Test: `backend/src/modules/club-fitness/club-classes.service.spec.ts`
- Test: `backend/src/modules/club-subscriptions/club-subscriptions.service.spec.ts`

**Interfaces:**
- Consumes `BarcodeClassCheckInDto { memberCode: string; classId: string }`.
- Produces `checkInByBarcode(classId, memberCode, user)` using the existing class attendance write path.
- Persists SPA allowance from subscription type into subscription snapshot at create/renew/transfer paths.

- [ ] **Step 1: Write failing tests for class-code lookup and SPA allowance snapshot**

```ts
it('uses a scanned member code to call the existing class reception check-in with the resolved member id', async () => {
  await service.checkInByBarcode(21, '1001', user);
  expect(existingCheckIn).toHaveBeenCalledWith(21, 9, user);
});

it('copies spaSessions from the selected type into a new subscription', async () => {
  await subscriptions.create({ subscriptionTypeId: '4', memberId: '9' }, user);
  expect(prisma.club_subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ spa_sessions_total: 6, spa_sessions_used: 0 }),
  }));
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- club-classes.service.spec.ts club-subscriptions.service.spec.ts --runInBand` from `backend`.

Expected: FAIL because code lookup and SPA snapshot fields are absent.

- [ ] **Step 3: Implement class scan adapter and subscription SPA allowance propagation**

Resolve the barcode with the same member lookup policy used by member attendance; call the existing class check-in method so class rules and session consumption remain single-sourced. Add SPA allowance fields to type create/update and snapshot them whenever a subscription is created or renewed according to the existing subscription-copy rules.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- club-classes.service.spec.ts club-subscriptions.service.spec.ts --runInBand` from `backend`.

Expected: PASS for allowed/denied class scans and entitlement snapshot propagation.

### Task 4: Barcode-time and unified attendance reporting API

**Files:**
- Modify: `backend/src/modules/club-members/club-attendance.service.ts`
- Modify: `backend/src/modules/club-members/club-attendance.controller.ts`
- Test: `backend/src/modules/club-members/club-attendance.service.spec.ts`

**Interfaces:**
- Produces `barcodeTimes(query, user)` filtered by branch, gender, member code, local date range, inclusive time range, pagination.
- Produces `unifiedReport(query, user)` with normalized rows `{ type, memberCode, memberName, gender, branch, date, time, recordedBy }`.

- [ ] **Step 1: Write failing tests for exact filters and source merging**

```ts
it('limits barcode times to the inclusive time range after applying branch and gender scope', async () => {
  const result = await service.barcodeTimes({ startDate: '2026-08-01', endDate: '2026-08-01', timeFrom: '09:00', timeTo: '11:00', branch: '2', gender: 'male' }, user);
  expect(result.items).toEqual([expect.objectContaining({ checkInTime: '10:15' })]);
});

it('returns only SPA rows when attendanceType is spa', async () => {
  const result = await service.unifiedReport({ attendanceType: 'spa', startDate: '2026-08-01', endDate: '2026-08-02' }, user);
  expect(result.items.every((row) => row.type === 'spa')).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- club-attendance.service.spec.ts --runInBand` from `backend`.

Expected: FAIL because report methods and filters do not exist.

- [ ] **Step 3: Implement normalized reporting queries**

Query each selected source with branch scope before merging, apply member/gender/date/time filters, normalize field names, sort newest first, and paginate after the merge. Derive InBody report time from measurement creation time and use the existing class attendance timestamp.

- [ ] **Step 4: Add guarded endpoints**

Add `GET barcode-times` and `GET unified-report` to `club-attendance.controller.ts` without changing existing attendance list semantics.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- club-attendance.service.spec.ts --runInBand` from `backend`.

Expected: PASS for all type filters, combined `all` result, time-boundary rows, invalid range rejection, and branch scope.

### Task 5: Membership document and printable bundle

**Files:**
- Modify: `backend/src/modules/club-members/club-members.controller.ts`
- Modify: `backend/src/modules/club-members/club-members.service.ts`
- Modify: `backend/src/modules/club-members/club-members.module.ts`
- Test: `backend/src/modules/club-members/club-members.membership-document.spec.ts`
- Modify: `frontend/src/pages/club/members.tsx`
- Create: `frontend/src/components/club/membership-bundle-print.tsx`

**Interfaces:**
- Produces upload/read/delete membership document endpoints for a member.
- Produces `MembershipBundlePrint({ member, documentUrl? })`, a browser-printable A4 component.

- [ ] **Step 1: Write failing backend tests for PDF restriction and replacement**

```ts
it('replaces the member PDF metadata after accepting a PDF under 5MB', async () => {
  const result = await service.setMembershipDocument(9, { path: 'membership/9.pdf', originalName: 'form.pdf', size: 1024, mimeType: 'application/pdf' }, user);
  expect(result.documentPath).toBe('membership/9.pdf');
});

it('rejects a non-PDF membership document', async () => {
  await expect(service.setMembershipDocument(9, { path: 'x.png', originalName: 'x.png', size: 10, mimeType: 'image/png' }, user)).rejects.toThrow('PDF');
});
```

- [ ] **Step 2: Run the document test to verify failure**

Run: `npm test -- club-members.membership-document.spec.ts --runInBand` from `backend`.

Expected: FAIL because the document API does not exist.

- [ ] **Step 3: Implement guarded document operations and print payload**

Reuse the existing upload handling, enforce PDF/5MB server-side, store metadata in the member record, return the current file metadata, clear it on delete, and provide member details required by the print component.

- [ ] **Step 4: Add member-page actions**

Add Arabic actions for upload, open, replace, delete, and print. Use the existing upload field utility, show loading/error/success states, and open print in an isolated browser print window like the barcode printer.

- [ ] **Step 5: Run focused backend tests and frontend typecheck**

Run: `npm test -- club-members.membership-document.spec.ts --runInBand` from `backend`; then `npm run build` from `frontend`.

Expected: PASS and a successful frontend production build.

### Task 6: Barcode operations and range printing UI

**Files:**
- Create: `frontend/src/pages/club/barcode-operations.tsx`
- Modify: `frontend/src/pages/club/barcode-management.tsx`
- Modify: `frontend/src/pages/club/route-pages.tsx`
- Modify: existing club navigation/resource configuration discovered during implementation
- Test: `frontend/src/pages/club/barcode-operations.test.tsx` if the project test setup supports React tests; otherwise use build plus browser smoke checks.

**Interfaces:**
- Consumes the barcode class/SPA endpoints and attendance report endpoints from Tasks 2–4.
- Reuses `printBarcodeLabels(labels)` from `frontend/src/components/club/barcode-label.tsx`.

- [ ] **Step 1: Add a failing UI-level assertion or a minimal route rendering check**

```tsx
expect(screen.getByRole('tab', { name: 'حضور السبا' })).toBeVisible();
expect(screen.getByLabelText('كود العضو')).toHaveFocus();
```

- [ ] **Step 2: Run the UI test or baseline build**

Run: `npm run build` from `frontend`.

Expected: the new route/component is absent before implementation, or the baseline build is recorded before adding it.

- [ ] **Step 3: Implement the four-tab operations page**

Keep the scanner input focused after every request. Implement class scan, SPA scan, barcode-time filters/table/CSV/print, and `fromCode`/`toCode` range query with existing barcode-label preview and print. Add the page to navigation and RBAC resource setup using the established route convention.

- [ ] **Step 4: Run build and browser smoke tests**

Run: `npm run build` from `frontend`.

Then open the new route using an authorized account, scan/enter a test code in each attendance tab, run each report filter, and print a two-code range preview.

- [ ] **Step 5: Record checkpoint**

Record the production build output and smoke-test outcomes; no commit is possible in this workspace.

### Task 7: Receipt filters/export and safe refund cancellation

**Files:**
- Modify: `backend/src/modules/club-subscriptions/dto/club-receipts.dto.ts`
- Modify: `backend/src/modules/club-subscriptions/club-receipts-crud.service.ts`
- Modify: `backend/src/modules/club-subscriptions/club-receipts.controller.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscription-refunds.service.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscription-refunds.controller.ts`
- Test: `backend/src/modules/club-subscriptions/club-receipts-crud.service.spec.ts`
- Test: `backend/src/modules/club-subscriptions/club-subscription-refunds.service.spec.ts`
- Modify: `frontend/src/pages/club/subscriptions.tsx`

**Interfaces:**
- Extends receipt list query with `memberId`, `memberCode`, `branchId`, `startDate`, `endDate`.
- Produces `cancelRefund(id, user)` and `DELETE /club-subscription-refunds/:id`.

- [ ] **Step 1: Write failing tests for receipt filters and refund cancellation**

```ts
it('includes member, branch, and inclusive receipt date range in the receipt query', async () => {
  await service.list({ memberCode: '1001', branchId: '2', startDate: '2026-08-01', endDate: '2026-08-31' }, user);
  expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ receipt_date: { gte: '2026-08-01', lte: '2026-08-31' } }),
  }));
});

it('cancels a completed refund and reverses its ledger effect exactly once', async () => {
  await service.cancel(14, user);
  expect(accounting.reverseRefundEntry).toHaveBeenCalledWith(expect.anything(), 14, user);
  expect(tx.club_subscription_refunds.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'cancelled' } }));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- club-receipts-crud.service.spec.ts club-subscription-refunds.service.spec.ts --runInBand` from `backend`.

Expected: FAIL because filters/cancel method are absent.

- [ ] **Step 3: Implement backend filtering and cancellation transaction**

Validate date order; resolve member code under branch scope; filter receipt query by direct receipt branch or subscription/member branch according to current receipt behavior. For a refund, reject missing/already-cancelled records; reverse the accounting entry and update status in one transaction, without hard deletion.

- [ ] **Step 4: Implement receipt and refund UI actions**

Add member search, branch and period inputs to the receipt list. Export exactly the filtered rows to CSV and provide browser print. Replace any hard-delete affordance with Arabic confirmation text that describes cancellation and reversal, then refresh balances/list on success.

- [ ] **Step 5: Run focused and build verification**

Run: `npm test -- club-receipts-crud.service.spec.ts club-subscription-refunds.service.spec.ts --runInBand` from `backend`; then `npm run build` from `frontend`.

Expected: PASS and successful frontend build.

### Task 8: Full verification and audit update

**Files:**
- Modify: `audit/decision-guide.md`
- Modify: `audit/functional-differences-and-plan.md`
- Modify: `audit/missing-from-new.md`

**Interfaces:**
- Consumes all APIs and UI routes produced by Tasks 1–7.
- Produces an accurate audit declaring the eight items implemented for new records only.

- [ ] **Step 1: Run backend targeted suite**

Run: `npm test -- club-spa-attendance.service.spec.ts club-classes.service.spec.ts club-attendance.service.spec.ts club-members.membership-document.spec.ts club-receipts-crud.service.spec.ts club-subscription-refunds.service.spec.ts --runInBand` from `backend`.

Expected: PASS.

- [ ] **Step 2: Run static checks and production builds**

Run: `npm run typecheck && npm run build` from `backend`; then `npm run build` from `frontend`.

Expected: all commands exit successfully.

- [ ] **Step 3: Perform browser acceptance checks with new test records**

Verify one successful and one rejected path each for class scan, SPA scan, document upload restriction, range print, receipt filters, report type/time filters, and refund cancellation. Confirm no test result relies on migrated legacy data.

- [ ] **Step 4: Update the audit files**

Mark the eight requested items as implemented, state the exact UI routes, and retain the "new data only" limitation. Do not claim any unverified browser path as complete.

- [ ] **Step 5: Record final verification checkpoint**

Include command outputs, build status, browser acceptance evidence, and the remaining non-goals in the final handoff; no commit is possible in this workspace.
