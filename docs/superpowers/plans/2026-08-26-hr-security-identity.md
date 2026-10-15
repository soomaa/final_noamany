# HR Security and Identity Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-26-hr-security-identity-design.md`

## Task 1 — Explicit employee identity

- [ ] Add failing tests proving `employeeId !== employeeCode` is preserved in claims.
- [ ] Extend `JwtUser` with explicit fields and a deprecated legacy alias.
- [ ] Reject exited/inactive linked employees during login and live claim reload.
- [ ] Update HR/mobile usages to consume the correct explicit field.
- [ ] Run focused and full typecheck/tests.

## Task 2 — Rotating staff sessions

- [ ] Add a migration and Prisma model for hashed staff refresh sessions.
- [ ] Add pure expiry/hash/session-state tests.
- [ ] Implement login session creation, one-time refresh rotation, replay-family revocation, logout, password-change revocation, and live access-session validation.
- [ ] Remove staff tokens from auth JSON and browser storage; use credentials/cookies only, including POS user switch.
- [ ] Add controller/service integration tests and migration rehearsal.

## Task 3 — Offboarding account revocation

- [ ] Add failing transaction tests for staff user, mobile API user, and all staff sessions.
- [ ] Extend the employee-exit effect to disable linked accounts and revoke sessions atomically.
- [ ] Make restoration explicit and never silently reactivate credentials.
- [ ] Add emergency revoke service/endpoint with permission and audit.

## Task 4 — Central HR data scope and reports

- [ ] Add matrix tests for super-admin, HR admin, branch manager, direct manager, employee self, foreign branch, and unlinked account.
- [ ] Implement `HrDataScopeService` and SQL-ready employee/branch filters.
- [ ] Apply scope to employee/request detail and list paths.
- [ ] Pass current user to report handlers, split sensitive report permissions, and mask/omit sensitive fields without permission.
- [ ] Move report filtering/pagination into SQL where the schema permits and remove arbitrary truncation.

## Task 5 — Private HR files

- [ ] Add magic-byte/category and opaque-id policy tests.
- [ ] Add private-file metadata migration/model and storage abstraction.
- [ ] Implement asynchronous write, checksum, authenticated download/delete, ownership/scope checks, and audit.
- [ ] Remove the broad `/uploads` static mount and provide explicit public-media handling for non-sensitive categories.
- [ ] Add upload/download/spoof/cross-scope/legacy-resolution tests.

## Task 6 — HR audit foundation

- [ ] Add redaction and correlation-id tests.
- [ ] Extend audit input/schema for correlation id and sensitivity-safe snapshots.
- [ ] Add transaction-client support so sensitive state and evidence commit together.
- [ ] Integrate employee/offboarding/session/file/report paths in this package.
- [ ] Add remaining approvals/payroll audit integrations in their domain packages.

## Task 7 — Package B verification

- [ ] Run focused security suites and role/scope matrix.
- [ ] Run backend and frontend typecheck/tests.
- [ ] Run Prisma validate/status/drift and full disposable rehearsal.
- [ ] Update the master audit with only verified resolutions and remaining risks.
