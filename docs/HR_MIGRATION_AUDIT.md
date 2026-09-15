# HR migration audit

Audit date: 2026-08-11

## Sources

- Requested legacy path `E:\xampp\htdocs\noamany_hr` was not present.
- Inspected read-only legacy code: `E:\xampp\htdocs\no3many_hr` (CodeIgniter 3.1.13).
- Inspected SQL schema: `E:\xampp\htdocs\no3many_hr\noamanycenter_hr (1).sql`.
- Online reference redirects to `https://hr.noamanycenter.com/auth/login`; no authentication was bypassed.
- Target: NestJS 11 / Prisma 5 backend and React 18 / Vite 6 frontend.

## Feature disposition

| Legacy area | Target disposition |
| --- | --- |
| Administrative decisions | Migrated as a native NestJS module, React page, print page, and RBAC resources |
| Circulars | Existing module reused; attachments, employee read tracking, and mobile views completed |
| Warnings | Existing module reused; workflow notifications and mobile read tracking completed |
| Permissions | Existing approval-chain service reused; legacy notifications and secured mobile adapter completed |
| Daily mobile tasks | Corrected to `hr_dialy_reports`, matching `Api.php::Add_Task/Get_Tasks_List` |
| Leaves | Existing approval-chain service reused; mobile balance ladder, identity resolution, notifications, and compatibility adapter completed |
| Advances | Existing loans/installment/postponement/payroll-deduction implementation reused |
| Payroll | Existing run/approval/payslip implementation reused; active legacy insurance and net-pay formula corrected |
| Attendance | GPS/geofence, shift windows, replacement/extra shifts, overnight checkout, reports, devices, and secured mobile adapter completed |

## Legacy mobile compatibility

The following former root routes are available under the exact `/Api/*` path. `login_app` is public; all employee data and mutations require a JWT and derive employee identity from its claims.

- `login_app`, `getProfile`, `today_notification`, `register_device_token`
- `Agazat_types`, `Get_agaza_List`, `Get_Agaza_data`, `Add_Agaza`, `Add_Agazax`, `Delete_agaza`
- `Ozonat_types`, `Add_Ezn`, `Get_Ezn_List`, `Get_Wared_Ezn_List`
- `Add_Task`, `Get_Tasks_List`, `Delete_task`
- `Get_ta3mem_list`, `Get_ta3mem_data`, `SeenTa3mem`
- `Get_Enzarat_list`, `Get_enzar_data`, `SeenEnzar`
- `add_hdor_ensraf`, `attendance_new`

Legacy parameter aliases and the `{status,message,data}` response envelope are retained. The adapter intentionally does not reproduce unauthenticated legacy mutations.

## Database result

- HR schema audit: 112 legacy-relevant tables, 114 target tables, zero missing tables, zero missing columns.
- Eighteen absent structural tables were added without copying production rows.
- Canonical evaluation/job-request keys and warning read columns were added non-destructively.
- Remaining differences are compatible widenings or enum/time representations handled by the application layer.

## Verification

- Backend production build: passed.
- Frontend production build: passed.
- Prisma validation: passed.
- Complete backend Jest suite: passed at the time of the final audit.
- Live route smoke: `/Api/Get_ta3mem_list` and `/api/mobile/circulars` return 401 without JWT; invalid `/Api/login_app` returns the legacy status-400 envelope.
- Legacy `Api.php`: no syntax errors; PHP 8.3 reports two optional-before-required deprecations at legacy lines 7508 and 7693.

## NEEDS_REVIEW

- Authenticated online UI behavior could not be compared because only the login page was accessible.
- Finance should acceptance-test migrated payroll against approved historical payslips before production posting.
- A clustered backend should replace the in-process attendance punch lock with a database/distributed lock.
- Non-HR utility/messaging/event methods among the 191 public `Api.php` methods remain served by their existing target modules where equivalents exist; no unsafe catch-all legacy endpoint was created.
