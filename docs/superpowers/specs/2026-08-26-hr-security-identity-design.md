# HR Security, Identity, Sessions, Files, and Audit Design

**Goal:** Close P0-05, P0-06, P0-08, P0-09, P1-07, and P1-08 without weakening existing RBAC or breaking legacy employee references.

## Identity contract

Staff claims expose both `employeeId` (the `employees.id` foreign key) and `employeeCode` (the human/business code). The legacy `emp_code` claim remains temporarily as a deprecated alias of `employeeId` so existing non-HR modules continue to work during migration. Authentication must resolve the employee by primary key once and reject an exited/inactive employee immediately.

## Session contract

Every staff refresh token belongs to a server-side session row and contains `type=staff-refresh`, `sid`, and `familyId`. Only the SHA-256 token digest is stored. Refresh consumes the current row and creates one successor atomically. Replay, logout, password change, suspension, and offboarding revoke the whole family or all user sessions as appropriate. Access-token validation checks the referenced session and reloads current authorization and employee state.

The staff browser uses HttpOnly cookies only. Login and refresh responses return session/user metadata, not bearer tokens. The employee-member app remains a separate auth domain until its equivalent session migration is implemented.

## HR data scope

`HrDataScopeService` converts the current identity plus branch policy into SQL-ready employee filters. Super-admin may be unrestricted. Ordinary employees are self-only. Managers are branch-scoped by default. Sensitive report groups require dedicated permission keys and salary/phone fields are selected only when explicitly allowed. A caller never loads a foreign row first and filters it in memory.

## Private files

HR-sensitive categories (`emp-photo`, `emp-bank`, `signature`, `document`, `message`, `legal`) are written under a private root with cryptographically random names. The server validates magic bytes against the category allow-list, stores metadata and SHA-256, and returns an opaque file id plus authenticated API URL. Download/delete endpoints enforce category permission and employee/branch ownership metadata. The global `/uploads` static mount is removed; public product/event imagery moves through an explicit public-media path rather than sharing HR storage.

## Audit

The existing append-only `business_audit_log` becomes the common HR audit sink. Sensitive values are redacted before persistence. Offboarding, session revocation, private file lifecycle, employee personal/bank changes, report exports, approvals, payroll, and settlements record actor, entity, branch, action, reason, request/correlation id, and changed field names. Audit failure inside a sensitive transaction fails the transaction rather than silently dropping evidence.

## Compatibility and rollout

1. Add schema/migrations and pure policies.
2. Introduce explicit identity claims while retaining the deprecated alias.
3. Enable server-side staff sessions and cookie-only frontend behavior.
4. Make employee exit revoke linked staff/mobile accounts and sessions in the same transaction.
5. Apply centralized scope to employees, requests, reports, and file metadata lookups.
6. Migrate sensitive upload categories; keep a time-bounded authenticated legacy resolver for existing relative paths.

## Acceptance gates

- Tests distinguish employee primary id from employee business code.
- Exited employee login and next-request access both fail.
- A refresh token can be used exactly once; replay revokes its family.
- Logout and offboarding make refresh and access fail server-side.
- Branch manager and employee direct-id/report tests cannot read foreign records or sensitive fields.
- HR files are not reachable through static paths and spoofed MIME/magic bytes fail.
- Every sensitive mutation test asserts an audit row in the same transaction.
- Full backend/frontend regression, fresh migration rehearsal, and zero drift remain green.
