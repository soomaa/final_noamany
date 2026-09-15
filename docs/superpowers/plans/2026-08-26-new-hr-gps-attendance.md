# New HR GPS Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make employee GPS punches use only the new employee-to-shift assignments and the employee fingerprint-location setting, never the legacy employee-schedule table.

**Architecture:** `AttendanceService.mobilePunch` resolves the actual geofenced branch from `employees.emp_sign`: a fixed numeric location is one branch; `all` is the nearest permitted branch; an unset value is administration and uses administration (`all`) shift assignments. The punch flow passes the actual punch branch and the schedule branch scope separately to `performCheck`, which builds candidates solely from `tbl_hdoor_dawms_emps` and `tbl_hdodr_setting`.

**Tech Stack:** NestJS, TypeScript, Prisma, Jest.

**Spec:** `C:\Users\qqqqq\.codex\attachments\e01653a6-893e-4096-9d85-80cc59dc1309\pasted-text.txt`

## Global Constraints

- Do not read `hr_emp_dwam` in the mobile GPS punch path.
- Read employee shift assignments only from `tbl_hdoor_dawms_emps` and shift windows only from `tbl_hdodr_setting`.
- Resolve a fixed fingerprint location from `employees.emp_sign`; an unset setting means administration and only `all` schedule assignments are eligible.
- Preserve the existing transaction lock, debounce, geographic radius enforcement, history writes, replacement shifts, extra shifts, and late/early calculations.
- When no new shift is eligible, return a clear attendance error and never write a checkout-only record.

---

### Task 1: Prove new-shift selection rejects a legacy-only schedule

**Files:**
- Modify: `backend/src/modules/attendance/attendance.mobile-punch.spec.ts`
- Modify: `backend/src/modules/attendance/attendance.service.ts:709-840`

**Interfaces:**
- Consumes: `AttendanceService.manualCheck(body, userId, branchIdOverride, capturedClock, scheduleBranchScope)`.
- Produces: a rejected `BadRequestException` with `لا يوجد دوام مسجل` when `tbl_hdoor_dawms_emps` has no eligible assignment.

- [ ] **Step 1: Write the failing test**

```ts
await expect(service.manualCheck(
  { empCode: '8', type: 'in', channel: 'app' },
  11,
  4,
  { actionDate: '2026-08-26', time: '01:30 PM' },
  4,
)).rejects.toThrow('لا يوجد دوام مسجل');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/attendance/attendance.mobile-punch.spec.ts --runInBand --testNamePattern="legacy-only schedule"`

Expected: FAIL because the current code falls back to `hr_emp_dwam`.

- [ ] **Step 3: Write minimal implementation**

```ts
const assignments = await db.tbl_hdoor_dawms_emps.findMany({
  where: { OR: [{ emp_code_fk: code }, { emp_id_fk: emp.id }] },
});
const assignedIds = assignments
  .filter((row) => assignmentMatchesScheduleScope(row.branch_id_fk, scheduleBranchScope))
  .map((row) => row.dwam_id_fk)
  .filter((id): id is number => Boolean(id));
const mainShifts = assignedIds.length
  ? await db.tbl_hdodr_setting.findMany({ where: { id: { in: assignedIds } } })
  : [];
if (!mainShifts.length) throw new BadRequestException('لا يوجد دوام مسجل لهذا الموظف في موقع البصمة');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/attendance/attendance.mobile-punch.spec.ts --runInBand --testNamePattern="legacy-only schedule"`

Expected: PASS.

### Task 2: Resolve schedule scope from the new fingerprint-location setting

**Files:**
- Modify: `backend/src/modules/attendance/attendance.mobile-punch.spec.ts`
- Modify: `backend/src/modules/attendance/attendance.service.ts:426-545`

**Interfaces:**
- Consumes: `employees.emp_sign`, branch geofences, and the authenticated employee.
- Produces: actual branch id for the stored punch and schedule scope of the fixed fingerprint branch, nearest branch for `all`, or administration scope for an unset location.

- [ ] **Step 1: Write the failing test**

```ts
await service.mobilePunch({ sub: 11, emp_code: 8 } as never, {
  lat: '30.0444', long: '31.2357',
}, { actionDate: '2026-08-26', time: '01:30 PM' });

expect(manualCheck).toHaveBeenCalledWith(
  expect.anything(), 11, 4, expect.anything(), 0,
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/attendance/attendance.mobile-punch.spec.ts --runInBand --testNamePattern="unset fingerprint location uses administration"`

Expected: FAIL because the current code uses `employees.branch_id_fk` as the fallback location.

- [ ] **Step 3: Write minimal implementation**

```ts
const fingerprintLocation = String(emp.emp_sign ?? '').trim().toLowerCase();
const isAdministration = !fingerprintLocation;
const isMultiLocation = fingerprintLocation === 'all';
const scheduleBranchScope = isAdministration ? 0 : branchId;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/attendance/attendance.mobile-punch.spec.ts --runInBand --testNamePattern="unset fingerprint location uses administration"`

Expected: PASS.

### Task 3: Verify supported GPS punch behavior

**Files:**
- Test: `backend/src/modules/attendance/attendance.mobile-punch.spec.ts`
- Test: `backend/src/modules/mobile/mobile.controller.employee-self.spec.ts`

**Interfaces:**
- Consumes: mobile attendance endpoint and employee-owned reports.
- Produces: regression evidence that new-only schedule selection leaves no legacy fallback and reports remain employee-only.

- [ ] **Step 1: Run mobile punch test file**

Run: `npx jest src/modules/attendance/attendance.mobile-punch.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 2: Run employee report test file**

Run: `npx jest src/modules/mobile/mobile.controller.employee-self.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 3: Run TypeScript verification**

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript diagnostics.
