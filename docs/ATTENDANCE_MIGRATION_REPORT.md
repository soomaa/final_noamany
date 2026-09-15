# Attendance Migration Report

## Sources audited

- Requested legacy folder `E:\xampp\htdocs\noamany_hr` was absent; the available read-only source was `E:\xampp\htdocs\no3many_hr`.
- Legacy database dump: `E:\xampp\htdocs\no3many_hr\noamanycenter_hr (1).sql`.
- Fully inspected attendance paths: `Hdoor.php`, `Dwam_settings.php`, `Hdoor_m.php`, `Dwam_model.php`, `models/api/Basma.php`, the active punch pipeline in the complete `Api.php`, attendance views, JavaScript, and `ATTENDANCE_FINGERPRINT_REPORT_AR.md`.
- Authenticated, read-only comparison of the online legacy system was completed with the user-provided administrator account. No data was changed online.
- The online attendance menu contains five reports: absence, lateness, punches, shift replacement/addition and overtime. The settings screen remains under administrative-affairs settings.
- The online report filters, table columns and shift-assignment form fields were captured and matched in the target UI (employee and branch selectors, department/section context, photo links and report-specific columns/actions).

## Implemented in the target

- Daily attendance board, manual punch, GPS mobile punch, branch/radius enforcement.
- Fixed-site and multi-site employee selection.
- All employee shift assignments for the clock branch, not only the first assignment.
- Normal, replacement and additive extra shifts; persisted `sheft_type` values match legacy (`0/1/2`).
- Yesterday/today occurrences and overnight shifts.
- Check-in from 60 minutes before the shift.
- Open-record checkout priority and checkout-only row when the arrival punch was missed.
- Approved-permission check (`suspend` 1/4) before early checkout.
- MySQL named lock per employee (5-second wait), plus local process guard.
- 45-second duplicate punch guard.
- Main attendance row and raw history row in one Prisma transaction.
- Safe `BASMA_DECISION` audit logs without coordinates or image paths.
- Late, early-leave and overtime calculations based on legacy shift thresholds.
- Shift CRUD, replacement/extra-shift CRUD and additional-hours CRUD.
- Attendance channels, calculation rules, devices and device sync status.
- Basma, absence, late, overtime and shift-swap reports with date/employee/branch filters.
- Legacy XLSX device-file import using the original ten-column mapping and replace-by-file-date behavior.
- Native React pages under `إدارة الموارد البشرية`: board, reports, adjustments, import, shifts/settings, devices and rules.
- Attendance permissions remain protected by `attendance:view/create/update/delete`; mobile identity is JWT-bound.

## Mobile API inventory

| Contract | Method/path | Auth | Important input | Target |
|---|---|---|---|---|
| Modern login | `POST /api/mobile/login` | Public, throttled | `username`, `password` | `MobileController.login` |
| Modern image | `POST /api/uploads/app` | Bearer JWT | multipart `file` | `UploadsController.upload` |
| Modern punch | `POST /api/mobile/attendance/punch` | Bearer JWT | `lat`, `long`, optional `photo` | `AttendanceService.mobilePunch` |
| Profile | `GET /api/mobile/profile` | Bearer JWT | none | `MobileService.profile` |
| FCM token | `POST /api/mobile/device-token` | Bearer JWT | `token` | `MobileService.setDeviceToken` |
| Legacy login | `POST /Api/login_app` | Public | `phone`, `user_pass` aliases retained | `LegacyMobileController.login` |
| Legacy punch | `POST /Api/add_hdor_ensraf` | Bearer JWT | `lat`, `long`, `basma_img` | `LegacyMobileController.punch` |
| Legacy punch alias | `POST /Api/attendance_new` | Bearer JWT | same | `LegacyMobileController.punch` |

Flutter handoff files:

- `docs/FLUTTER_ATTENDANCE_API.md`
- `docs/flutter-attendance.postman_collection.json`

## Database changes

Migration `20260811160000_attendance_punch_hardening` adds idempotent query indexes for main shift identity, open rows, recent history, special shifts and employee/branch shift assignments. It was successfully applied to the configured target database on 2026-08-11. No legacy or target data was deleted by this migration.

## Verification

- Prisma schema validation: passed.
- Backend TypeScript check: passed.
- Backend Nest build: passed.
- Frontend TypeScript + Vite production build: passed.
- Attendance/mobile/leave/payroll/RBAC regression group: 8 suites, 29 tests passed, 0 failed.
- Focused attendance tests: GPS binding/geofence, multi-shift selection, main/history transaction path and legacy mobile controller contract passed.
- Full repository Jest run was attempted but exceeded the 10-minute execution limit without reporting a failing suite. It is not claimed as passed for this final change set.

## NEEDS_REVIEW

1. Physical ZKTeco/device network sync needs the real device IP/network and cannot be proven from this workstation alone.
2. Legacy binary `.xls` import needs conversion to `.xlsx`; the target validates and imports `.xlsx` safely because the installed parser does not support the older binary format.
3. A successful live employee punch needs a target-database application account, actual employee/shift assignment and coordinates inside the configured site. Unauthenticated routes were not treated as workflow proof.
