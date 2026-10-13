# Weekly Employee Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous multi-shift employee assignments with one complete weekly schedule per employee while preserving dated replacement and extra-shift exceptions.

**Architecture:** Add versioned weekly-schedule headers and seven day slots, then make the attendance resolver use the active slot for the punch date when the rollout switch is on. The administrative employee page writes the complete weekly schedule atomically; the existing mobile punch and dated shift-swap contracts remain unchanged.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, TypeScript/Jest, React 18, TanStack Query, Vite.

**Spec:** `docs/superpowers/specs/2026-09-24-weekly-employee-schedule-design.md`

## Global Constraints

- A weekly schedule has exactly seven distinct weekdays: `0` Saturday through `6` Friday.
- A weekday is either a rest day (`branchId` and `shiftId` both null) or has both a valid branch and a valid shift.
- A scheduled weekday has exactly one base shift; a dated replacement supersedes it and a dated extra shift is additional.
- The existing `/attendance/check` request and response contract must not change.
- Attendance records remain immutable; the resolver stores the selected `dwam_id_fk` as it does today.
- Legacy `tbl_hdoor_dawms_emps` remains as historical/recovery data and is never consulted after rollout activation.
- The workspace currently has no Git repository, so record changed files and verification output in the handoff instead of attempting commits.

## Review Focus

- A malformed save that repeats Saturday must fail atomically rather than silently keeping either shift; covered in Task 2.
- A scheduled workday with a missing branch or a missing shift must fail before it reaches the attendance resolver; covered in Task 2.
- A punch on a configured rest day without a dated extra shift must be rejected as off-day, not classified as absent or matched to legacy data; covered in Task 4.
- A replacement and an extra shift on the same date must resolve to replacement-as-base plus extra, never to the legacy assignment; covered in Task 4.
- The rollout switch must be the only compatibility boundary: before activation legacy assignments work, after activation a missing weekly schedule returns a deterministic configuration error; covered in Tasks 3 and 4.

---

## File Structure

- `backend/prisma/schema.prisma` — Prisma models for weekly schedule versions, weekday slots, and the rollout setting.
- `backend/prisma/migrations/20260924110000_employee_weekly_schedules/migration.sql` — production MySQL schema migration and indexes.
- `backend/src/modules/employees/dto/weekly-schedule.dto.ts` — validated request DTOs for seven-day schedules.
- `backend/src/modules/employees/employees.service.ts` — transactional schedule read/write/validation methods.
- `backend/src/modules/employees/employees.controller.ts` — employee weekly-schedule endpoints.
- `backend/src/modules/employees/employees.weekly-schedule.spec.ts` — service-level schedule validation and replacement tests.
- `backend/src/modules/attendance/attendance.service.ts` — active-schedule resolver and dated-exception composition.
- `backend/src/modules/attendance/attendance.controller.ts` — attendance rollout status and activation endpoints.
- `backend/src/modules/attendance/attendance.weekly-schedule.spec.ts` — resolver tests for workdays, rest days, switches, replacements, and extras.
- `frontend/src/types/employees.ts` — weekly schedule API types.
- `frontend/src/pages/employees/attendance.tsx` — weekly schedule editor, multi-day selection, table, and validation state.
- `frontend/test/employee-weekly-schedule.test.cjs` — lightweight source contract test for the weekly editor and endpoints.

### Task 1: Add versioned weekly-schedule persistence

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260924110000_employee_weekly_schedules/migration.sql`
- Test: `backend/src/modules/employees/employees.weekly-schedule.spec.ts`

**Interfaces:**
- Produces Prisma delegates `employee_weekly_schedules`, `employee_weekly_schedule_slots`, and `attendance_weekly_schedule_settings`.
- Produces one unique weekday slot per `(schedule_id, weekday)` and a single settings row with `id = 1`.

- [ ] **Step 1: Write the failing Prisma-model contract test**

Create `employees.weekly-schedule.spec.ts` with a schema contract assertion that reads `backend/prisma/schema.prisma` and requires the three model names and the slot uniqueness declaration:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('declares versioned weekly schedules with one slot per weekday', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  expect(schema).toContain('model employee_weekly_schedules');
  expect(schema).toContain('model employee_weekly_schedule_slots');
  expect(schema).toContain('@@unique([schedule_id, weekday]');
  expect(schema).toContain('model attendance_weekly_schedule_settings');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- employees.weekly-schedule.spec.ts --runInBand` from `backend`.

Expected: FAIL because none of the weekly-schedule Prisma models exists.

- [ ] **Step 3: Add Prisma models and the SQL migration**

Add the following models near the attendance models in `schema.prisma` (use `String` ISO dates to match the legacy attendance date storage):

```prisma
model employee_weekly_schedules {
  id             Int      @id @default(autoincrement())
  employee_id    Int
  effective_from String   @db.VarChar(10)
  effective_to   String?  @db.VarChar(10)
  status         String   @default("draft") @db.VarChar(20)
  created_by     Int?
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt

  slots employee_weekly_schedule_slots[]

  @@index([employee_id, effective_from])
  @@index([employee_id, status])
  @@map("employee_weekly_schedules")
}

model employee_weekly_schedule_slots {
  id          Int @id @default(autoincrement())
  schedule_id Int
  weekday     Int
  branch_id   Int?
  shift_id    Int?

  schedule employee_weekly_schedules @relation(fields: [schedule_id], references: [id], onDelete: Cascade)

  @@unique([schedule_id, weekday], map: "uq_employee_weekly_schedule_day")
  @@index([branch_id, shift_id])
  @@map("employee_weekly_schedule_slots")
}

model attendance_weekly_schedule_settings {
  id      Int     @id
  enabled Boolean @default(false)

  @@map("attendance_weekly_schedule_settings")
}
```

Create a migration that creates these tables with `utf8mb4`, the unique slot index, lookup indexes, foreign key cascade from slots to schedules, and inserts `attendance_weekly_schedule_settings (id, enabled) VALUES (1, 0)`.

- [ ] **Step 4: Generate and validate Prisma**

Run from `backend`:

```powershell
npm run prisma:generate
npm run prisma:validate
```

Expected: both commands exit with code 0 and Prisma exposes the three new delegates.

- [ ] **Step 5: Run the contract test**

Run: `npm test -- employees.weekly-schedule.spec.ts --runInBand` from `backend`.

Expected: PASS.

### Task 2: Implement transactional employee weekly-schedule APIs

**Files:**
- Create: `backend/src/modules/employees/dto/weekly-schedule.dto.ts`
- Modify: `backend/src/modules/employees/employees.service.ts`
- Modify: `backend/src/modules/employees/employees.controller.ts`
- Modify: `backend/src/modules/employees/employees.weekly-schedule.spec.ts`

**Interfaces:**
- Consumes the Prisma delegates from Task 1.
- Produces `EmployeesService.getWeeklySchedule(id, date?)`, `putWeeklySchedule(id, dto, userId?)`, and `validateWeeklySchedule(id, dto)`.
- Produces `GET`, `PUT`, and `POST validate` routes under `/employees/:id/weekly-schedule`.

- [ ] **Step 1: Write failing service tests for complete and invalid schedules**

Add tests with a mocked Prisma client. Include the full valid payload and the duplicate-day and half-rest invalid payloads:

```ts
const validSlots = [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
  weekday === 6 ? { weekday, branchId: null, shiftId: null } : { weekday, branchId: 3, shiftId: 9 },
);

await expect(service.putWeeklySchedule(37, {
  effectiveFrom: '2026-10-01',
  slots: validSlots,
})).resolves.toEqual(expect.objectContaining({ employeeId: 37, slots: validSlots }));

await expect(service.putWeeklySchedule(37, {
  effectiveFrom: '2026-10-01',
  slots: [...validSlots.slice(0, 6), { weekday: 5, branchId: 3, shiftId: 9 }],
})).rejects.toThrow('لا يمكن تكرار يوم في جدول الدوام');

await expect(service.putWeeklySchedule(37, {
  effectiveFrom: '2026-10-01',
  slots: [{ weekday: 0, branchId: 3, shiftId: null }, ...validSlots.slice(1)],
})).rejects.toThrow('يوم الدوام يجب أن يحتوي على فرع ودوام معًا');
```

Add a test that a new effective version closes the prior active schedule at the previous calendar date and inserts seven slots inside one `$transaction`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- employees.weekly-schedule.spec.ts --runInBand` from `backend`.

Expected: FAIL because the DTO and service methods do not exist.

- [ ] **Step 3: Add validated DTOs**

Create `weekly-schedule.dto.ts` with these public shapes:

```ts
export class WeeklyScheduleSlotDto {
  @IsInt() @Min(0) @Max(6)
  weekday!: number;

  @IsOptional() @IsInt() @Min(1)
  branchId?: number | null;

  @IsOptional() @IsInt() @Min(1)
  shiftId?: number | null;
}

export class PutWeeklyScheduleDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsArray() @ArrayMinSize(7) @ArrayMaxSize(7)
  @ValidateNested({ each: true }) @Type(() => WeeklyScheduleSlotDto)
  slots!: WeeklyScheduleSlotDto[];
}
```

Use service validation to enforce distinct weekdays and the all-null-or-all-present branch/shift pairing, because class-validator cannot express those cross-item invariants cleanly.

- [ ] **Step 4: Implement service methods atomically**

Implement a private `assertWeeklySchedulePayload(slots)` that checks exactly `{0,1,2,3,4,5,6}`, rejects a duplicate day with `BadRequestException('لا يمكن تكرار يوم في جدول الدوام')`, rejects a partial rest slot with `BadRequestException('يوم الدوام يجب أن يحتوي على فرع ودوام معًا')`, and batch-loads every non-null branch and shift to reject nonexistent IDs.

Implement `putWeeklySchedule` as one `$transaction`:

```ts
const prior = await tx.employee_weekly_schedules.findFirst({
  where: { employee_id: id, status: 'active', effective_to: null },
  orderBy: { effective_from: 'desc' },
});
if (prior) {
  await tx.employee_weekly_schedules.update({
    where: { id: prior.id },
    data: { effective_to: previousIsoDate(dto.effectiveFrom), status: 'archived' },
  });
}
const schedule = await tx.employee_weekly_schedules.create({
  data: {
    employee_id: id,
    effective_from: dto.effectiveFrom,
    status: 'active',
    slots: { create: normalizedSlots.map(({ weekday, branchId, shiftId }) => ({
      weekday, branch_id: branchId ?? null, shift_id: shiftId ?? null,
    })) },
  },
  include: { slots: { orderBy: { weekday: 'asc' } } },
});
```

Before inserting, reject an `effectiveFrom` on or before an existing active schedule’s start date rather than overwriting history. `getWeeklySchedule` selects the active schedule whose date range contains the requested date and returns all seven slots ordered by weekday. `validateWeeklySchedule` returns `{ valid: true, errors: [] }` only after running the same checks without writing.

- [ ] **Step 5: Add controller endpoints with existing employee update permission**

Place these routes before the generic `:id` route in `employees.controller.ts`:

```ts
@Get(':id/weekly-schedule')
getWeeklySchedule(@Param('id', ParseIntPipe) id: number, @Query('date') date?: string) {
  return this.employees.getWeeklySchedule(id, date);
}

@Put(':id/weekly-schedule')
@RequiresPermission('employees.list:update')
putWeeklySchedule(@Param('id', ParseIntPipe) id: number, @Body() dto: PutWeeklyScheduleDto, @CurrentUser('sub') userId: number) {
  return this.employees.putWeeklySchedule(id, dto, userId);
}

@Post(':id/weekly-schedule/validate')
@RequiresPermission('employees.list:update')
validateWeeklySchedule(@Param('id', ParseIntPipe) id: number, @Body() dto: PutWeeklyScheduleDto) {
  return this.employees.validateWeeklySchedule(id, dto);
}
```

Import the DTO and ensure the existing `:id/dwam` routes remain unchanged for compatibility during configuration.

- [ ] **Step 6: Run backend tests and typecheck**

Run from `backend`:

```powershell
npm test -- employees.weekly-schedule.spec.ts employees.dwam.spec.ts --runInBand
npm run typecheck
```

Expected: all specified tests and typecheck PASS.

### Task 3: Add rollout validation and activation controls

**Files:**
- Modify: `backend/src/modules/attendance/attendance.service.ts`
- Modify: `backend/src/modules/attendance/attendance.controller.ts`
- Modify: `backend/src/modules/attendance/attendance.weekly-schedule.spec.ts`

**Interfaces:**
- Consumes `attendance_weekly_schedule_settings` and weekly schedule headers/slots from Task 1.
- Produces `AttendanceService.getWeeklyScheduleRollout()`, `validateWeeklyScheduleRollout()`, and `activateWeeklyScheduleRollout()`.
- Produces `GET /attendance/weekly-schedule-rollout`, `POST /attendance/weekly-schedule-rollout/validate`, and `POST /attendance/weekly-schedule-rollout/activate`.

- [ ] **Step 1: Write failing rollout tests**

Create tests that mock active employees and weekly schedules. Assert that validation reports an employee with no active schedule and another with only six slots, and that activation refuses to set `enabled` when any issue exists:

```ts
await expect(service.activateWeeklyScheduleRollout()).rejects.toThrow('لا يمكن تفعيل الجدول الأسبوعي');
expect(prisma.attendance_weekly_schedule_settings.upsert).not.toHaveBeenCalled();
```

Add the valid case with one seven-slot active schedule per active employee and assert:

```ts
expect(prisma.attendance_weekly_schedule_settings.upsert).toHaveBeenCalledWith({
  where: { id: 1 }, create: { id: 1, enabled: true }, update: { enabled: true },
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- attendance.weekly-schedule.spec.ts --runInBand` from `backend`.

Expected: FAIL because rollout methods do not exist.

- [ ] **Step 3: Implement validation and activation**

Add `validateWeeklyScheduleRollout()` that loads the active employee population using the same active-status predicate as the employee list service, loads all `status: 'active'` weekly schedules with their slots, and returns:

```ts
{ valid: boolean, employeesWithoutSchedule: number[], incompleteScheduleIds: number[] }
```

Treat any schedule with other than seven distinct weekday values as incomplete. `activateWeeklyScheduleRollout()` calls validation, throws `BadRequestException('لا يمكن تفعيل الجدول الأسبوعي قبل اكتمال جداول جميع الموظفين')` when invalid, then upserts settings row `id: 1` with `enabled: true`. `getWeeklyScheduleRollout()` returns the saved enabled state plus the validation result.

- [ ] **Step 4: Expose permission-protected rollout routes**

Add the following routes to `attendance.controller.ts`, protected by the existing attendance administration permission used by attendance settings:

```ts
@Get('weekly-schedule-rollout')
getWeeklyScheduleRollout() { return this.attendance.getWeeklyScheduleRollout(); }

@Post('weekly-schedule-rollout/validate')
validateWeeklyScheduleRollout() { return this.attendance.validateWeeklyScheduleRollout(); }

@Post('weekly-schedule-rollout/activate')
activateWeeklyScheduleRollout() { return this.attendance.activateWeeklyScheduleRollout(); }
```

- [ ] **Step 5: Run rollout tests and typecheck**

Run from `backend`:

```powershell
npm test -- attendance.weekly-schedule.spec.ts --runInBand
npm run typecheck
```

Expected: PASS.

### Task 4: Resolve weekly slots in attendance without changing the mobile punch contract

**Files:**
- Modify: `backend/src/modules/attendance/attendance.service.ts`
- Modify: `backend/src/modules/attendance/attendance.multi-shift.spec.ts`
- Modify: `backend/src/modules/attendance/attendance.weekly-schedule.spec.ts`

**Interfaces:**
- Consumes the rollout setting and `employee_weekly_schedules`/`employee_weekly_schedule_slots` from Tasks 1–3.
- Produces private `resolveWeeklyBaseShift(employeeId, date, branchId)` used by `performCheck`.
- Preserves `manualCheck`, `syncOfflinePunch`, and `POST /attendance/check` public contracts.

- [ ] **Step 1: Write failing resolver tests**

Add five tests with the exact punch API used by existing multi-shift tests:

```ts
// weekday work slot wins after rollout; tbl_hdoor_dawms_emps is not queried
await service.manualCheck({ empCode: '1007', type: 'in', checkIn: '09:00 AM', channel: 'app' }, 9, 3,
  { actionDate: '2026-10-03', time: '09:00 AM' });
expect(prisma.tbl_hdoor_emps.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ dwam_id_fk: 9, branch_id_fk: 3 }),
}));

// rest-day rejects unless a ttype=2 dated extra exists
await expect(service.manualCheck({ empCode: '1007', type: 'in', checkIn: '09:00 AM', channel: 'app' }, 9, 3,
  { actionDate: '2026-10-09', time: '09:00 AM' })).rejects.toThrow('اليوم المحدد راحة أسبوعية');

// dated ttype=1 replacement becomes base; dated ttype=2 remains an extra candidate
// disabled rollout reads the existing legacy assignment exactly as before
// enabled rollout with no schedule rejects with an explicit configuration error
```

Also retain existing tests proving an open attendance row closes against its own saved `dwam_id_fk`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- attendance.multi-shift.spec.ts attendance.weekly-schedule.spec.ts --runInBand` from `backend`.

Expected: the new weekly cases FAIL while legacy tests still PASS.

- [ ] **Step 3: Implement the weekly base-shift resolver**

Add a helper that reads `attendance_weekly_schedule_settings` row `id: 1`. Return `null` when rollout is disabled. When enabled, query one active schedule whose date range includes `date`, include the slot for `weekdayForEgyptBusinessDate(date)`, and enforce its `branch_id === clockBranchId`.

Use this result in `performCheck` before the current `tbl_hdoor_dawms_emps` lookup:

```ts
const weeklyBase = await this.resolveWeeklyBaseShift(emp.id, today, assignmentBranchScope);
if (weeklyBase.mode === 'enabled' && weeklyBase.slot.shift_id == null && !hasDatedExtra) {
  throw new BadRequestException('اليوم المحدد راحة أسبوعية ولا يوجد شيفت إضافي');
}
const mainShifts = weeklyBase.mode === 'enabled'
  ? (weeklyBase.slot.shift_id ? [weeklyBase.shift] : [])
  : await this.resolveLegacyMainShifts(code, emp.id, assignmentBranchScope);
```

Keep the existing dated-exception construction: a `ttype = 1` replacement replaces `mainShifts`; `ttype = 2` entries append as `source: 'extra'`. When enabled and no active schedule exists, throw `BadRequestException('لا يوجد جدول أسبوعي فعال لهذا الموظف')`; do not fall back to the legacy assignment. Preserve today/yesterday candidate handling for overnight shifts and the open-row logic.

- [ ] **Step 4: Enforce extra-shift non-overlap at creation**

In `createShiftSwap`, when `dto.ttype === 2`, resolve the base schedule/replacement for `sheftDate` and compare the two shift windows using the existing `buildShiftWindow` utilities. Reject intersecting windows with `BadRequestException('الشيفت الإضافي يتداخل مع دوام الموظف في هذا اليوم')`. Do not apply this check to `ttype === 1` replacements.

- [ ] **Step 5: Run targeted attendance tests and full backend checks**

Run from `backend`:

```powershell
npm test -- attendance.multi-shift.spec.ts attendance.weekly-schedule.spec.ts attendance.mobile-punch.spec.ts --runInBand
npm run typecheck
npm run build
```

Expected: all selected tests, typecheck, and Nest build PASS.

### Task 5: Replace the employee attendance page with a weekly schedule editor

**Files:**
- Modify: `frontend/src/types/employees.ts`
- Modify: `frontend/src/pages/employees/attendance.tsx`
- Create: `frontend/test/employee-weekly-schedule.test.cjs`

**Interfaces:**
- Consumes `GET/PUT /employees/:id/weekly-schedule` from Task 2.
- Produces a complete seven-day `PutWeeklyScheduleDto` payload and leaves current date-exception screens untouched.

- [ ] **Step 1: Write a failing frontend source-contract test**

Create `frontend/test/employee-weekly-schedule.test.cjs`:

```js
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('employee attendance page uses the weekly schedule endpoints and seven weekday editor', () => {
  const source = fs.readFileSync('src/pages/employees/attendance.tsx', 'utf8');
  assert.match(source, /weekly-schedule/);
  assert.match(source, /SATURDAY|السبت/);
  assert.match(source, /selectedDays/);
  assert.match(source, /disabled=.*selected/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- employee-weekly-schedule.test.cjs` from `frontend`.

Expected: FAIL because the existing page only calls `/dwam`.

- [ ] **Step 3: Add frontend types and queries**

Replace the old one-shift `DwamData` dependency in this page with:

```ts
export type WeeklyScheduleSlot = {
  weekday: number;
  branchId: number | null;
  shiftId: number | null;
};
export type WeeklyScheduleData = {
  id?: number;
  effectiveFrom?: string;
  slots: WeeklyScheduleSlot[];
};
```

Load `/employees/${id}/weekly-schedule` with `useResource` or `useQuery`, retain the existing branch and shift lookup queries, and invalidate the `weekly-schedule` query after a successful save.

- [ ] **Step 4: Implement the seven-day, multi-select editor**

Represent weekdays as a fixed Arabic array in display order:

```ts
const WEEKDAYS = [
  { value: 0, label: 'السبت' }, { value: 1, label: 'الأحد' },
  { value: 2, label: 'الإثنين' }, { value: 3, label: 'الثلاثاء' },
  { value: 4, label: 'الأربعاء' }, { value: 5, label: 'الخميس' },
  { value: 6, label: 'الجمعة' },
];
```

The add form contains branch, shift, and seven checkboxes. Derive `usedDays` from existing slots and disable a checkbox when its day is already scheduled; allow the selected checkbox itself to be unticked. On Add, replace selected rest-day placeholders with `{ weekday, branchId, shiftId }`. Provide a `راحة` action that writes `{ weekday, branchId: null, shiftId: null }` for each selected day. Render all seven days in a table and offer delete/edit actions that return a day to the available selection set.

Disable Save until all seven weekdays have a slot. Save one complete payload:

```ts
await api.put(`/employees/${id}/weekly-schedule`, {
  effectiveFrom,
  slots: WEEKDAYS.map(({ value }) => slotsByWeekday[value]),
});
```

Do not call `/employees/:id/dwam` from this page after the editor is introduced.

- [ ] **Step 5: Run frontend checks**

Run from `frontend`:

```powershell
npm test -- employee-weekly-schedule.test.cjs
npm run typecheck
npm run build
```

Expected: all commands PASS and the page renders without an unresolved legacy `DwamData` import.

### Task 6: Validate rollout end-to-end and prepare operational activation

**Files:**
- Modify: `docs/HR_MOBILE_ATTENDANCE_REVIEW_2026-08-15.md`
- Modify: `docs/FLUTTER_ATTENDANCE_API.md`
- Test: `backend/src/modules/attendance/attendance.full-sheet.spec.ts`

**Interfaces:**
- Consumes the completed APIs, resolver, and UI from Tasks 1–5.
- Produces an operator checklist that confirms the mobile check endpoint is unchanged and records the activation procedure.

- [ ] **Step 1: Write the failing full-sheet behavior test**

Add a case in `attendance.full-sheet.spec.ts` with one scheduled weekday, one configured rest day, and a dated replacement. Assert that the generated daily sheet reports `present` for a punched scheduled day, no absence on the rest day, and the replacement shift ID on its date.

- [ ] **Step 2: Run it to verify failure before resolver/report integration**

Run: `npm test -- attendance.full-sheet.spec.ts --runInBand` from `backend`.

Expected: FAIL until daily-sheet schedule lookup uses the weekly resolver’s scheduled/rest-day result.

- [ ] **Step 3: Make daily-sheet absence handling use weekly scheduled days**

Where the full-sheet report determines a working day, call the same schedule-resolution helper (or extract a shared read-only `resolveScheduledDay`) instead of treating every non-leave weekday as a possible absence. A rest slot must return an off-day status before the attendance-row lookup.

- [ ] **Step 4: Update operator and mobile API documentation**

In `HR_MOBILE_ATTENDANCE_REVIEW_2026-08-15.md`, add the activation checklist: create all seven slots for every active employee, run `/attendance/weekly-schedule-rollout/validate`, resolve every listed employee, then call `/activate` before the first operating day. In `FLUTTER_ATTENDANCE_API.md`, state that `/attendance/check` has no request or response changes and that the server now selects the weekly slot internally.

- [ ] **Step 5: Run final verification**

Run from `backend`:

```powershell
npm test -- attendance.full-sheet.spec.ts attendance.weekly-schedule.spec.ts attendance.multi-shift.spec.ts employees.weekly-schedule.spec.ts --runInBand
npm run prisma:validate
npm run typecheck
npm run build
```

Run from `frontend`:

```powershell
npm test -- employee-weekly-schedule.test.cjs
npm run typecheck
npm run build
```

Expected: every command exits with code 0. Record the output, the activation date, and the result of the rollout validation before enabling the new resolver in production.

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 implement versioned complete weekly schedules and the no-duplicate-day rule; Task 3 implements safe all-employee activation; Task 4 preserves the dated replacement/extra semantics while changing only the base resolver; Task 5 implements the administrative multi-select editor; Task 6 corrects absence behavior and documents operational activation.
- **Completeness scan:** no unfinished markers, generic error-handling instructions, or cross-task shorthand is present; each task includes tests, commands, public interfaces, and concrete errors.
- **Type consistency:** `weekday`, `branchId`, `shiftId`, `effectiveFrom`, `WeeklyScheduleSlotDto`, `PutWeeklyScheduleDto`, `getWeeklySchedule`, and `putWeeklySchedule` use the same spelling throughout.
- **Review focus coverage:** duplicate weekday and partial slots are tested in Task 2; rest-day rejection and replacement/extra composition in Task 4; rollout switch behavior in Tasks 3–4.
