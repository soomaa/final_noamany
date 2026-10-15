# HR Request Workflow Integrity Design

## Goal

Close P0-02 and the request-side parts of P1-04/P1-07 by making every advertised request type produce one validated, durable, auditable domain effect exactly once.

## State contract

`hr_requests.status=0` is the only approvable state. Approval locks the request row, validates the employee and payload, applies the domain effect, creates one `hr_request_effects` row protected by a unique `request_id`, writes the business audit row, and changes the request to approved in one database transaction. Repeated or concurrent approval never creates a second effect. Rejection uses the same row lock and only accepts a pending request.

## Effect contract

- Leave and permission create approved operational orders with validated dates/times.
- Advance and loan create the approved loan plus installments and accounting evidence atomically.
- Allowance creates a payroll finance component and recomputes employee totals.
- Salary certificate stores an immutable compensation/company snapshot; printing reads the snapshot rather than live salary.
- Resignation creates the termination/archive record and invokes the shared offboarding effect using the approved last working day.
- Transfer validates target branch/department, updates the employee, and appends branch history.
- Promotion resolves an existing job title, optionally applies a positive new salary, and synchronizes role/trainer behavior after commit.
- Data change is limited to an explicit low-risk employee-field allow-list and optionally checks the submitted old value to prevent stale overwrite.

## Numbering and evidence

Approval serializes legacy `MAX+1` numbers behind a stable InnoDB lock until dedicated number-series tables replace them. `hr_request_effects` stores sanitized immutable input/result JSON and provides the idempotency boundary. Business audit stores actor, request, employee, branch, effect type, correlation id, and changed field names in the same transaction.

## Acceptance gates

- All ten request types have positive and invalid-payload tests.
- Missing employee and no-op handlers fail without changing request state.
- Two approvals for one request yield one effect.
- Request state, domain effect, immutable effect row, and audit evidence share a transaction.
- Salary certificate details come from its stored snapshot.
- Backend typecheck, focused/full tests, migration rehearsal, and drift checks pass.
