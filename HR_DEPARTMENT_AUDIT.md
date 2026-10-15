# Human Resources Department — Audit Report

**Product:** ONE80 Gym & Fitness Hub  
**Date:** 23 August 2026 (remediation 24 August 2026 — see §13)  
**Scope:** `frontend/` + `backend/` (live app). Release snapshots under `releases/`, `caffe/`, and `one80 desktop/` were not treated as the source of truth.  
**Method:** Code inspection of routes, navigation, RBAC, Prisma-backed services, payroll engine, and finance/accounting posting. Existing payroll/employee/cairo-date unit tests were reviewed. Live browser click-through was **not** possible in this pass (no running authenticated session / browser tools).

---

## 1. Executive summary of HR health

HR is a **large, mostly wired department** — employee master data, attendance, leaves (request/approve), penalties, many “affairs” screens (warnings, circulars, custody, tasks, evaluations, etc.), and a real payroll engine that posts into the general ledger.

It is **not healthy enough to trust for monthly payroll without fixes**. Two systemic problems dominate:

1. **Leaving the gym does not take a person off payroll.** “طي قيد” (termination archive) writes a history row and never marks the employee as left. The next salary run still includes them.
2. **The employee finance tab does not drive the salary engine.** Housing/transport/meal allowances and custom deductions saved on the employee profile are stored under catalog IDs, while payroll still looks up legacy codes `100–106` and ignores type-2 deductions and percent/day methods. Staff can be underpaid (missed allowances) or overpaid (ignored deductions).

Around that, several HR screens show Create / Approve buttons that do nothing, while the backend already implements those APIs. Loans and rewards are the most dangerous of those, because payroll only consumes **approved** loans and **approved, salary-borne** bonuses.

Finance/accounting itself is structurally sound (GL is the source of truth; payroll *does* post). The joint risk is that **wrong HR numbers become permanent journal entries**, and non-admin accountants often **cannot see** those HR-posted costs in finance dashboards.

**Verdict (after remediation — see §13):** The original Critical/High payroll defects are implemented and re-verified in code. Core HR CRUD was already complete. A real monthly run is safe enough after the production caveats in §13 (re-save existing finance tabs once; grant `org.edarat` / `admin.insurance` on existing HR roles).

---

## 2. How this was audited

### Stack (where HR and Finance live)

| Layer | Location |
|-------|----------|
| Backend | NestJS + Prisma — `backend/` (`one80-hr-backend`) |
| Frontend | React + Vite + TanStack Query — `frontend/` (`one80-hr-frontend`) |
| HR UI | `frontend/src/pages/{hr,employees,attendance,payroll,leaves,loans,penalties,rewards,termination,org,missions,permissions,requests}` + nav section `hr` in `frontend/src/lib/nav.ts` |
| HR APIs | `backend/src/modules/{employees,attendance,payroll,salary-scale,hr-warnings,leaves,loans,penalties,rewards,termination,evaluations,custody,job-requests,circulars,tasks,initiatives,activities,daily-reports,legal-files,action-screen,gym-rates,weekly-leaves,org,insurance-settings,missions,permissions,documents}` |
| Finance / Accounting UI | `frontend/src/pages/{finance,accounting}` |
| Finance / Accounting APIs | `backend/src/modules/{finance,accounting}` plus payroll posting in `payroll.service.ts` → `ModuleLedgerService` |

### Surfaces covered

| Area | Routes / modules |
|------|------------------|
| Employees | `/employees`, `/employees/new`, `/employees/:id`, `/employees/:id/edit`, `/employees/weekly-leaves`, `/documents`, `/hr/partners` |
| Attendance | `/attendance`, `/attendance/devices`, `/attendance/settings`, `/attendance/rules` |
| Payroll | `/payroll/runs`, `/payroll/runs/:id`, `/payroll/runs/:id/slip/:empId`, `/payroll/setup`, `/payroll/salary-scale`, `/settings/pay-components` |
| Leaves & time | `/leaves`, `/leaves/new`, `/leaves/types`, `/leaves/balances`, `/permissions`, `/requests`, `/missions` |
| HR finance items | `/loans`, `/loans/settings`, `/penalties`, `/penalties/bylaw`, `/rewards` |
| Affairs | `/hr/{circulars,warnings,evaluations,custody,job-requests,messages,tasks,daily-reports,initiatives,activities,legal-files,action-screen,gym-rates}`, `/sites/visits` |
| Termination | `/termination/clearance`, `/termination/archive` |
| Org / settings | `/org/branches`, `/org/job-titles`, `/org/departments` (redirect), insurance API only |
| Reports | `/reports`, `/reports/:key` (attendance / payroll report keys) |
| Finance (for integration) | `/finance/*`, `/accounting/*`, payroll GL posting, `fin_expenses` mirror |

### What was *not* treated as a finding

Input `placeholder=` attributes, i18n copy nits, and style preferences. Only defects with file-path evidence are listed.

---

## 3. Findings — Critical

### C1. Termination archive does not deactivate the employee — they stay on payroll

| | |
|---|---|
| **What's wrong** | Creating a “طي قيد” record writes `hr_tayi_qyed` only. It never sets `employees.leave_emp` or changes `employee_type`. Payroll and the employee list exclude only `leave_emp = 1`. |
| **Where** | Route `/termination/archive`. `backend/src/modules/termination/archive.service.ts` (`create`, lines 61–83). Payroll filter in `backend/src/modules/payroll/payroll-engine.service.ts` (lines 86–91). Employee list in `backend/src/modules/employees/employees.service.ts` (line 43). |
| **Impact** | HR can archive a leaver and still pay them on the next run. They also remain in active lists and dropdowns. Clearance (`/termination/clearance`) is a third disconnected table and also does not flip `leave_emp`. The only path that actually removes someone from payroll is employee “delete”, which soft-sets `leave_emp = 1`. |
| **Evidence** | Archive `create` ends at `hr_tayi_qyed.create(...)` and returns `{ id }`. No `employees.update`. Engine: `employee_type: EmployeeType.ACTIVE` + `leave_emp` null/0. |
| **Suggested fix** | On archive create (and optionally clearance completion), set `leave_emp = 1` (and/or a terminated `employee_type`) in the same transaction. Add a final-settlement / pro-rata run for the last period. Unify the three exit paths (list delete, archive, clearance) into one workflow. |

### C2. Employee finance profile does not feed the payroll engine

| | |
|---|---|
| **What's wrong** | The employee finance UI saves allowances/deductions with `badl_code = catalog defined_id` (auto-increment 1, 2, 3…). The engine looks up **legacy codes 100–106** and uses the raw `value` only. Type-2 (deduction) rows and `method_to_count` (fixed / percent / days) are never applied. The same code mismatch breaks **loan ceiling** math, which also groups by codes 100–106. |
| **Where** | Employee profile finance tab (`frontend/src/components/common/finance-rows.tsx`; save in `backend/src/modules/employees/employees.service.ts` `putFinance`, lines 904–910). Engine: `backend/src/modules/payroll/payroll-engine.service.ts` `BADL` (lines 9–18), `getBadlValue` (lines 317–328), `computeOne` (lines 144–152). Seed catalog: `backend/prisma/seed/05-reference-catalogs.ts` (lines 92–108). Loan ceiling: `backend/src/modules/loans/loans.service.ts` (lines 108–121) and `loan-ceiling.util.ts`. |
| **Impact** | Housing, transport, meal, and other allowances configured in HR **do not appear on the slip**. Recurring deductions on the same tab **do not reduce net pay**. Loan eligibility can be computed against an empty sum. Only `employees.basic_salary` is reliably used. |
| **Evidence** | Save comment: *“the catalog id is the code here.”* Engine: `where: { badl_code: badlCode, emp_code: empCode }` with `BADL.HOUSING = 101`, etc. Seed titles (`بدل سكن`, `بدل نقل`, …) have no `defined_id` 100–106. `getBadlValue` returns `row.value` and never reads `method_to_count` or `badl_type`. |
| **Suggested fix** | Map catalog titles / `defined_id` → legacy `badl_code` on save, **or** change the engine to resolve by `badl_discount_id_fk` + title. Apply `badl_type = 2` as deductions. Honor `method_to_count` (percent of basic, per-day × period days). Use the same mapping in loan ceiling. Add engine tests for a housing allowance and a percent deduction. |

---

## 4. Findings — High

### H1. Gym commissions often miss the employee’s login (`users.emp_code` convention)

| | |
|---|---|
| **What's wrong** | `getIncentives` looks up `users` with `emp_code: employeeCode` where `employeeCode` is the **business** `employees.emp_code`. The rest of the app stores **`employees.id`** in `users.emp_code`. |
| **Where** | `backend/src/modules/payroll/payroll-engine.service.ts` (lines 735–746). Convention: `backend/src/common/types/jwt-user.ts` (line 10); user provision in `employees.service.ts` (`where: { emp_code: created.id }`, line 331). |
| **Impact** | Commissions from subscriptions / sales / classes attributed via `created_by` under-count unless the document already has `employee_id` set. `tot_entdab` on the slip is too low. |
| **Suggested fix** | Query `users` with `emp_code: employeeId` (the PK already passed into `getIncentives`). |

### H2. Posting a run stamps *all* penalties and bonuses in the period, not just people on the slip

| | |
|---|---|
| **What's wrong** | `stampConsumedPenalties` / `stampConsumedBonuses` update every approved, unconsumed row whose date-25 falls in the window. There is no `emp_code IN (run lines)` filter. Loan settlement, by contrast, iterates employees on the run. |
| **Where** | `backend/src/modules/payroll/payroll-engine.service.ts` (lines 410–447). Called from `payroll.service.ts` post action (lines 465–471). |
| **Impact** | A penalty or bonus for someone **not on this run** (no `emp_code`, terminated after compute, missing from details) is marked consumed and will never appear on a future slip — money never deducted or paid, but the item is gone. |
| **Suggested fix** | Restrict the `UPDATE` to `emp_code` values present in `hr_mosayer_details` for this `mosayer_rkm`. |

### H3. Loans cannot be approved or rejected in the UI

| | |
|---|---|
| **What's wrong** | Backend has `PATCH /loans/:id/approve` and `/reject`. The loans page is create + delete only. Payroll deducts installments of **approved** loans only. |
| **Where** | Route `/loans`. UI: `frontend/src/pages/loans/index.tsx` (actions column, lines 110–118 — delete only). API: `backend/src/modules/loans/loans.controller.ts` (lines 61–70). |
| **Impact** | New loan requests stay pending. Installments never enter `khasm_solaf`. Staff keep the cash and the salary is not reduced. |
| **Suggested fix** | Add approve/reject (and installment pay) actions gated on `finance.loans:approve` / `:reject` / `:update`, matching penalties/leaves. |

### H4. Rewards page: Create button is inert; approve/reject missing

| | |
|---|---|
| **What's wrong** | “مكافأة جديدة” has no `onClick`. No approve/reject. Backend already implements create / approve / reject. Payroll sums only approved bonuses with `mokafa_option = 'rateb'`. |
| **Where** | Route `/rewards`. `frontend/src/pages/rewards/index.tsx` (lines 102–106). `backend/src/modules/rewards/rewards.controller.ts`. Engine `getMokafaaByDate`. |
| **Impact** | HR cannot record or approve bonuses from the app. `totMokafaa` stays 0 unless data is inserted out-of-band. |
| **Suggested fix** | Wire a create dialog and row approve/reject, same pattern as penalties. |

### H5. `show_in_mosayer` is saved on the employee and ignored by payroll

| | |
|---|---|
| **What's wrong** | The flag exists on `employees` and is mapped in the employee form. `computeAll` never checks it. Combined with `assertAllActiveEmployeesHaveSalary`, one incomplete hire (basic salary ≤ 0) **blocks the entire company run**, even if they were meant to be excluded. |
| **Where** | Field map: `backend/src/modules/employees/employees.fieldmap.ts`. Engine `computeAll` (lines 86–91). Guard: `payroll.service.ts` (lines 641–661). |
| **Impact** | Employees marked “do not include in payroll” still get a line. A new hire without salary can stop the month for everyone. |
| **Suggested fix** | Exclude `show_in_mosayer` false/0 from `computeAll` and from the “must have basic salary” assertion. |

### H6. Attendance “today” is UTC, not Cairo

| | |
|---|---|
| **What's wrong** | `todayIso()` uses `Date.toISOString()` (UTC). Attendance board and attendance reports default to that when no date is passed. The project already has `cairoDateString()` (`Africa/Cairo`) used elsewhere. |
| **Where** | `backend/src/common/utils/legacy-date.util.ts` (lines 33–35). `backend/src/modules/attendance/attendance.service.ts` (line 128). Reports: `backend/src/modules/reports/reports.service.ts` (e.g. `attendance-daily`, line 180). Cairo helper: `backend/src/common/utils/cairo-date.ts` (lines 7–8). Routes `/attendance`, `/reports/attendance-*`. |
| **Impact** | Between midnight and ~02:00–03:00 Cairo time, the board and daily/absence reports show **yesterday (UTC)**. Late/absence used in payroll can be a day off. |
| **Suggested fix** | Default HR attendance/report dates to `cairoDateString()`. Keep `todayIso()` only if a caller truly wants UTC. |

### H7. “Generate bank transfer file” posts GL and does not download a file

| | |
|---|---|
| **What's wrong** | The stepper label is “توليد ملف التحويل البنكي”. The `bank` action only posts `postPayrollPayment` and sets flags. `generateBankFile()` builds CSV but is **not** exposed on the controller. |
| **Where** | `frontend/src/components/common/payroll-stepper.tsx` (line 66). `frontend/src/pages/payroll/run-detail.tsx` (POST `/payroll/runs/:id/bank`). `payroll.service.ts` `bank` (lines 476–514) vs `generateBankFile` (lines 529–557). `payroll.controller.ts` has no bank-file route. |
| **Impact** | Operators think they produced a bank file; they only got a GL settlement. Treasury cannot pay from the promised CSV. Separately, `generateBankFile` currently sets bank flags **without** posting payment — dangerous if someone later wires it as-is. |
| **Suggested fix** | One transactional action: post payment + return CSV download. Do not set `file_downloded` without the GL post. |

---

## 5. Findings — Medium

### M1. Missions: Create is inert; approve/reject missing

Route `/missions`. `frontend/src/pages/missions/index.tsx` (lines 102–106 — button has no handler). Backend `missions.controller.ts` already has `POST`, `PATCH :id/approve`, `PATCH :id/reject`. Workflow is list/delete only.

### M2. Leave types: Create and Edit buttons have no handlers

Route `/leaves/types`. `frontend/src/pages/leaves/types.tsx` (lines 80–82, 106–108). Backend `POST /leaves/types` and `PATCH /leaves/types/:id` exist. Configuration is view/delete only.

### M3. Job requests / recruitment is read-only

Route `/hr/job-requests`. `frontend/src/pages/hr/job-requests.tsx` lists requests and applications with no mutations. Backend `job-requests.controller.ts` supports create/update, applications, interviews, and offers (from line 59). Recruitment cannot be operated from the UI.

### M4. Clearance (إخلاء طرف) is read-only

Route `/termination/clearance`. `frontend/src/pages/termination/clearance.tsx` is list + detail sheet. Backend has POST/PATCH. Combined with C1, there is no complete exit workflow in the UI.

### M5. Org departments tree exists but is unreachable

`OrgDepartmentsPage` is implemented and lazy-loaded. Router **redirects** `/org/departments` → `/org/job-titles` (`frontend/src/app/router.tsx` line 281). Settings nav lists branches and job titles only (`nav.ts` lines 404–405). Legacy menu still maps `edara` / `department` → `/org/departments` (`frontend/src/lib/routes.ts` line 99), so those links land on job titles. Department / code-range management cannot be done in the UI.

### M6. Insurance / GOSI rates: API exists, no page

`GET/PUT /settings/insurance` (`insurance-settings.controller.ts`). No route in `router.tsx`, no nav item. Payroll reads `hr_insurance_settings` and falls back to flat `tamin_hesa_*` on the employee when the table is empty. Rates cannot be maintained without API/DB access.

### M7. Payroll run detail does not refresh lines after compute

`frontend/src/pages/payroll/run-detail.tsx` (lines 76–78) calls `refetchRun()` only. `refetchLines` exists but is unused after step actions. After “احتساب”, the table can stay empty until a manual refresh.

### M8. Payroll runs status filter never matches real statuses

UI options: `pending` / `approved` / `paid` (`frontend/src/pages/payroll/runs.tsx` lines 169–172). Backend `mapRunStatus` returns `draft` / `computed` / `reviewing` / `approved` / `posted` / `banked` / `completed` (`payroll-status.util.ts` lines 53–67). `listRuns` filters with `mapRunStatus(r) === q.status` (`payroll.service.ts` lines 171–172). Choosing “قيد الانتظار” or “مدفوع” returns an empty list even when runs exist.

### M9. HR report viewer hides real columns and has no date picker

`frontend/src/pages/reports/detail.tsx` hardcodes columns `name` + `value` (lines 31–35) and only a search box. Backend `attendance-daily` also returns `checkOut` and `lateMin` (`reports.service.ts` lines 194–200) and defaults the date to `todayIso()`. Users cannot pick a period in the UI; late/checkout data is invisible.

### M10. `/payroll/setup` “مكون جديد” does nothing

`frontend/src/pages/payroll/setup.tsx` line 78 — button has no handler. Working CRUD is `/settings/pay-components`. Two payroll-setup surfaces; one is a dead end.

### M11. Leave balances have no year-end carry-over action

Route `/leaves/balances` is list-only. Backend `POST /leaves/carry-over` (`leaves.balances:configure`) is unused. HR cannot roll balances from the UI.

### M12. Attendance overtime and early leave do not hit payroll

Checkout writes overtime / `mobaker_min` on `tbl_hdoor_emps` (`attendance.service.ts`). Engine overtime comes only from `tbl_emps_hours_edafi` and `tbl_emps_shef_edafi` (`payroll-engine.service.ts` lines 167–171). `mobaker_min` is never referenced. Device/app overtime and early leave must be re-entered in extra-hours tables or they are unpaid / unpenalized.

### M13. Unpaid-leave days can be over-counted

`getKeyabByDate` (`payroll-engine.service.ts` lines 627–649) adds full `num_days` for any approved leave overlapping the window. It does not clip to `[fromDate, toDate]` or exclude weekly offs (unlike `getActualAbsence`). A leave that spans month boundaries can deduct more unpaid days than exist in the period.

### M14. Pay components and salary scale are cosmetic for calculation

`/settings/pay-components` and `/payroll/salary-scale` persist `all_defined_setting` / `hr_salary_doors`. The engine never reads them. Changing a grade or a component catalog does not change `basic_salary` or the run. (See also C2.)

### M15. Soft-deleted employees disappear with no restore list

`remove` sets `leave_emp = 1` (`employees.service.ts` line 829). The list **always** filters `leave_emp` null/0 (line 43). The delete confirm copy says the action cannot be undone (`employees/list.tsx` line 69), which is misleading. There is a locale key `employees-resigned` (“المستقيلون”) but no page that lists `leave_emp = 1`. HR cannot review or restore leavers except via archive (a different table — C1).

### M16. Payroll post dates the expense on “today”, not the 26→25 period

Period is 26th previous month → 25th current (`payroll-status.util.ts` lines 27–42). Accrual and `fin_expenses` use `todayAr()` at post/bank time (`payroll.service.ts` around lines 430, 446, 507). A January run posted on 28 Jan lands in **February** P&L. Also: loan settlement at post re-queries live unpaid quests rather than the IDs implied by persisted `khasm_solaf` — if loans change between compute and post, GL credit and slip deduction can diverge.

---

## 6. Findings — Low

| ID | Issue | Evidence | Suggested fix |
|----|--------|----------|---------------|
| L1 | Rewards `handleDelete` does not re-check `canDelete` (button is gated). | `frontend/src/pages/rewards/index.tsx` lines 40–47 | Guard the handler like loans. |
| L2 | Job-requests list maps `num_for_job` into `employeeName`; column “العدد المطلوب” reads that field. Works, but fragile. | `job-requests.service.ts` / `job-requests.tsx` lines 61–63 | Rename API field to `headcount` / `numForJob`. |
| L3 | `EmployeeType` documents only `ACTIVE: 1`; UI uses `2 = suspended`. | `backend/src/common/constants/hr-codes.ts` lines 8–11; `employees/list.tsx` lines 30–34 | Document suspended / unspecified. |
| L4 | HR warnings (`/hr/warnings`) never create `hr_gezaat` penalties. A warning is documentary only. | `hr-warnings` module vs `penalties.service.ts` | Either link on confirm, or label the screen as non-payroll. |
| L5 | `generateBankFile` is dead code that would mark a run banked without GL payment if exposed as-is. | `payroll.service.ts` lines 550–554 | Merge into `bank` or delete. |

---

## 7. HR ↔ Finance integration

Intended flow (this **does** exist in code):

```
Employees + attendance + leaves + approved loans/penalties/rewards
        → PayrollEngine.computeAll (period 26→25)
        → hr_mosayer / hr_mosayer_details
        → post  → GL payroll_accrual (Dr salary_expense, Cr payable / GOSI / advances)
                → fin_expenses mirror (category «رواتب»)
                → stamp penalties/bonuses, settle loan quests
        → bank  → GL payroll_payment (Dr payable, Cr bank)
        → Accounting P&L / income statement
```

### What works

- Balanced payroll accrual and bank settlement (`ModuleLedgerService.postPayrollAccrual` / `postPayrollPayment`; covered by `accounting-reversal.spec.ts`).
- `recordSystemExpense` mirrors payroll into `fin_expenses` **without** a second GL post (`system-expense.util.ts`).
- Approved penalties (`hr_gezaat`) and salary-borne bonuses (`hr_mokafat_details`, `option='rateb'`) are designed to enter the slip and be stamped on post.
- Branch-split posting via `employees.branch_id_fk`.
- Empty gym: run create throws if there are no active employees.

### Integration defects (material)

| Issue | Severity | Why it matters |
|-------|----------|----------------|
| C1 + C2 + H1–H5 | Critical / High | Finance will book **whatever HR computed**. Wrong leavers, missing allowances, ignored deductions, and missed commissions become official GL. |
| Non-admin finance users are scoped to rows **they** created | High | `resolveFinanceCreatorScope` (`finance-user-scope.ts` lines 9–34) locks non-super-admins to `user.sub`. Finance dashboard / P&L / analysis use `scopedAccountingRange` (`finance-reports.service.ts` lines 68–87). Payroll is posted by the HR user, so an accountant **does not see salary expense** on `/finance/dashboard` or `/finance/profit-loss`. `/accounting/income-statement` does **not** apply that filter — the two departments disagree. |
| H7 bank file | High | Payment ops cannot execute the bank step as labeled. |
| M16 period date + no unpost | Medium / High | Labor cost in the wrong month; a bad post cannot be reversed through payroll (no `unpost`; `removeRun` blocks posted runs). Correction is a manual journal. |
| Trainer commissions vs payroll incentives | Medium (conditional) | Same person can be an employee (payroll `getIncentives`) and a `club_trainers` payee (`postTrainerEarningPayment`). Overlapping sales in one period can double-count labor in GL. |
| HR asset custody | Low | `emp_custody` has no GL link (reasonable for laptops/keys). POS shift custody **is** on the ledger. |

**Suggested integration fixes (priority):** exclude `source_module IN ('payroll','club',…)` from finance creator scope; accrue on period-end date; add payroll `unpost` that reverses GL + `fin_expenses` + loan/penalty/bonus stamps; mutually exclude trainer payment vs payroll incentive for the same receipt.

---

## 8. Financial Accounting — shorter health note

Finance and accounting **screens are complete and routed**: dashboard, expenses, revenues, expense/revenue reports, analysis, P&L, journal, chart of accounts, general ledger, account statement, trial balance, income statement, balance sheet, cash flow, settings. Legacy `/reports/finance/*` redirects to the new routes.

**What looks healthy**

- GL is the documented source of truth for P&L (not a naive sum of `fin_revenues`).
- Many operational modules post through `ModuleLedgerService` (subscriptions, sales, cafe waste, inventory damage, trainer payments).
- Idempotent posting keys reduce duplicate journals.
- Payroll *does* reach both GL and the expenses mirror when a run is posted.

**Material Finance issues (for “both departments must work”)**

1. **Creator scoping on GL reports** (above) — accountants can close a month missing payroll.
2. **No payroll reversal** — posted salary is permanent in-app.
3. **Operational expense list vs GL reports** measure different things (`fin_expenses.category` vs account codes); approved manual expenses all hit `operating_expense`.
4. **Journal UI** cannot filter `sourceModule=payroll` even though the API supports it — hard to audit HR postings.
5. **Bank CSV** missing (H7).

Finance is in better shape than HR payroll integrity. The blocking problems are **visibility of HR costs** and **irreversibility**, not missing accounting pages.

---

## 9. What looks healthy / working well

These were reviewed and did **not** show the dead-button / missing-API pattern:

- **Employees** list, create, edit, profile, status toggle (active ↔ suspended), weekly leaves (including dry-run), documents, finance tab **persistence** (the bug is consumption, not save).
- **Attendance** board, devices, settings, rules — wired; date default is the issue (H6), not a missing screen.
- **Leaves** request list with approve/reject; leave form.
- **Penalties** + bylaw — create/approve path exists (unlike rewards/loans).
- **HR affairs with real CRUD:** warnings, evaluations, circulars, tasks (accept/reject), partners, custody (incl. transfer), initiatives, daily reports, activities, legal files, messages, action screen, gym rates.
- **Routing / RBAC:** `AppShell` + `RouteGuard`; HR routes catalogued; nav section `hr` matches most live pages.
- **Payroll engine substance:** attendance late split, absence vs offs/holidays/approved leave, GOSI rate table with fallback, loan quest helper, empty-gym guard, suspended staff excluded (`employee_type = 1`).
- **Pay-components CRUD** at `/settings/pay-components` (unused by engine — M14).
- **API path alignment** for the pages above (`/hr/*`, `/payroll/*`, `/termination/*`, `/leaves/*`).

---

## 10. What could not be verified

- Live UI in a browser (login, empty-state screenshots, RTL layout, mobile). No authenticated dev session was available in this pass.
- Real production/demo data: empty gym, a gym with only terminated staff, ZKTeco devices, actual bank files, GOSI rate tables already filled.
- Role matrix with real users (HR officer vs accountant vs admin) clicking the same screens. Permissions were read from `rbac.catalog.ts` and `@RequiresPermission` / `usePermission`, not exercised.
- Whether existing *legacy* `hr_finance_employes` rows already use codes 100–106 (migrated data would still compute; **new** saves from the current UI would not — C2).
- Trainer vs payroll double-count on a live overlapping receipt (logic risk only).
- Frontend automated tests: almost none for HR pages.
- Hardware attendance clocks and Hijri-only `action_date` rows on old punches.

---

## 11. Suggested fix order

1. **C1** — Archive/clearance must set `leave_emp` (stop paying leavers).
2. **C2** — Map finance catalog → engine codes; apply deductions and `method_to_count`.
3. **H3 + H4** — Approve loans and create/approve rewards in the UI.
4. **H1 + H2 + H5** — Commission lookup, stamp scope, honor `show_in_mosayer`.
5. **H6** — Cairo “today” for attendance and HR reports.
6. **H7 + finance scope** — Bank CSV + let accountants see payroll GL.
7. Medium UI completions (missions, leave types, job requests, departments, insurance, report columns, status filters).

---

## 12. Finding counts

| Severity | Count | IDs |
|----------|------:|-----|
| Critical | 2 | C1, C2 |
| High | 7 | H1–H7 |
| Medium | 16 | M1–M16 |
| Low | 5 | L1–L5 |
| **HR total** | **30** | |
| Finance-only extras (section 8) | 3 | creator-scope overlap counted under integration; plus expense-vs-GL, journal filter |

No application code was changed during this audit. This file is the deliverable.

---

## 13. Remediation status (24 August 2026 — skeptical re-verification)

A second pass re-read every claimed fix in live `backend/` + `frontend/` (not release snapshots). Previous “Fixed” labels for C1–C2 and H1–H7 were **real code**, not comments. Remaining gaps found and closed in this pass: H3 installment-pay UI, H5 form toggle, M14 apply matching + year steps, trainer/payroll receipt mutual exclusion, unpost loan-quest stamp, payroll run status badges, Cairo dates on loan/reward create, HR starter RBAC for departments/insurance.

| ID | Status | Notes / files |
|----|--------|----------------|
| **C1** | **Fixed** | Archive + clearance + list delete all set `leave_emp = 1` in the same transaction (`employee-exit.util.ts`, `archive.service.ts`, `clearance.service.ts`, `employees.service.ts` `remove`). Archive **update** also refreshes last working day. Restore clears `end_service_date_m`. Leavers stay on the current period for pro-rata then drop (`buildPayrollEmployeeWhere`). |
| **C2** | **Fixed** | Single resolver `salary-component.util.ts`: catalog title / `defined_id` / stored code → engine 100–106. `putFinance` writes engine `badl_code`. Engine applies `badl_type = 2` and `method_to_count`. Same mapping in loan ceiling. Tests: housing title + percent deduction. |
| **H1** | **Fixed** | `getIncentives` looks up `users.emp_code` with **employee PK**. |
| **H2** | **Fixed** | `stampConsumedPenalties` / `stampConsumedBonuses` restrict `emp_code IN` run `hr_mosayer_details`. |
| **H3** | **Fixed** | `/loans` approve/reject + schedule sheet + `PATCH /loans/installments/:questId/pay` (`finance.loans:update`). |
| **H4** | **Fixed** | `/rewards` create dialog + approve/reject. Create resolves employee by id or business code; approve stamps `mokafa_option='rateb'`. |
| **H5** | **Fixed** | Engine + salary assertion exclude `show_in_mosayer = no` (null still included). Employee finance tab now has the include/exclude checkbox. |
| **H6** | **Fixed** | Attendance board/reports and payroll `todayAr()` use `cairoDateString()`. Loan/reward create defaults are Cairo/local, not UTC. `todayIso()` remains UTC. |
| **H7** | **Fixed** | `bank` action posts payment + returns CSV in one transaction. `GET /payroll/runs/:id/bank-file` re-downloads only. Flags never set without GL post. |
| **M1** | **Fixed** | Missions create + approve/reject. |
| **M2** | **Fixed** | Leave types create + edit. |
| **M3** | **Fixed** | Job-requests create/edit + application create. List exposes `numForJob`. |
| **M4** | **Fixed** | Clearance POST/PATCH with `completed: true` exits the employee. |
| **M5** | **Fixed** | `/org/departments` is a real page; nav + RBAC `org.edarat`. New HR job-title roles get the key. |
| **M6** | **Fixed** | `/settings/insurance` page + nav; new HR job-title roles get `admin.insurance`. |
| **M7** | **Fixed** | Run detail `refetchLines` (and reconciliation) after step actions. |
| **M8** | **Fixed** | Runs status filter **and** row badges use draft/computed/reviewing/approved/posted/banked/completed. |
| **M9** | **Fixed** | Report viewer builds columns from row keys + date picker. |
| **M10** | **Fixed** | Setup «مكون جديد» links to `/settings/pay-components`. |
| **M11** | **Fixed** | Leave balances «ترحيل الأرصدة» → `POST /leaves/carry-over`. |
| **M12** | **Fixed** | Engine adds attendance `num_min` OT (skipping days already in extra-hours table) and `mobaker_min` early-leave deduction. |
| **M13** | **Fixed** | `getKeyabByDate` clips to period ∩ leave and excludes weekly offs. |
| **M14** | **Fixed (within model)** | Pay components drive the engine (via C2). Scale «تطبيق» fills **empty** `basic_salary` only, matching rank / qualification / `degree_id`, using year-step `x_N` when present. No live every-run overwrite of confirmed salaries — that would be unsafe with this schema. |
| **M15** | **Fixed** | Employees filter `status=resigned`; restore `POST /employees/:id/restore`. Delete copy no longer claims hard-delete. |
| **M16** | **Fixed** | Accrual/`fin_expenses` date = period end (25th). Payment date remains bank day. Unpost reverses GL + expenses + stamps. Loan quests settled by payroll are marked `paid_sarf_person=payroll:{rkm}` so unpost does **not** reopen cash repayments. |
| **L1** | **Fixed** | Rewards `handleDelete` guards `canDelete`. |
| **L2** | **Fixed** | Job-requests API adds `numForJob`; UI column uses it. |
| **L3** | **Fixed** | `EmployeeType` documents `SUSPENDED: 2` and `UNSPECIFIED: 0`. |
| **L4** | **Fixed** | Warnings page labeled documentary (no `hr_gezaat`). |
| **L5** | **Fixed** | Dead `generateBankFile` flag-write removed; download-only + bank action merged. |
| Finance creator scope | **Fixed** | Dashboard / P&L `profitLossActivity` uses `creatorOrSystemModuleFilter` so `source_module = payroll` is visible when creator-scoped. Journal UI can filter `sourceModule=payroll`. |
| Trainer vs payroll incentive overlap | **Fixed** | Active `club_trainers` employees skip `club_receipts` in `getIncentives` (those receipts already feed trainer earnings). Locker + POS sales commissions stay on payroll. |

### Tests run (this verification pass)
- `payroll-engine` / `salary-component` / `payroll.service` / `salary-scale` / `cairo-date` / `accounting-reversal` / `rbac.catalog` / `job-title-defaults` / `employees.provision` — **50 passed**
- `employees.fieldmap` / `employees.role-security` / `critical-mutation` / `cairo-date` — **24 passed**
- Backend `tsc --noEmit` — pass
- Frontend `tsc -b` — pass

### Not browser-verified
No authenticated live session. Loans schedule sheet, rewards, missions, clearance, payroll stepper, insurance, and departments were code-reviewed, not click-tested in a browser.

### Remaining production caveats (only real ones)
- Existing `hr_finance_employes` rows saved under catalog ids resolve by **title** on compute; re-save the employee finance tab once to persist engine codes 100–106.
- Loan quests settled by a payroll **post from before this stamp** (`paid_sarf_person=payroll:{rkm}`) will not be reopened by unpost. New posts are safe; cash repayments are no longer reopened.
- `org.edarat` / `admin.insurance` are granted automatically only on **newly created** HR job-title roles. Existing non-admin roles still need those keys assigned.
- Salary-scale apply never overwrites a non-empty `basic_salary` (intentional).
- Live GOSI tables, ZKTeco devices, and a full role-matrix click-through were not exercised against production data.

### Verdict
The original Critical/High set is no longer a “do not run payroll” blocker. After the caveats above (especially re-saving finance tabs once, and granting departments/insurance on existing HR roles), a real monthly run is safe enough to execute and reverse via unpost if needed.
