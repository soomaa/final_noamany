# HR Reference 100/100 — Master Design

**Status:** Approved by the user's standing instruction to choose best practices and proceed without clarification.  
**Evidence baseline:** `HR_REFERENCE_FULL_AUDIT_2026-08-26.md`  
**Target:** Turn the current ONE80 HR implementation into a reusable, secure, financially correct, independently installable HR reference with repeatable proof for every acceptance gate.

## 1. Design principles

1. The current working tree is authoritative. Existing uncommitted changes are preserved and never reset, stashed, or overwritten wholesale.
2. No business data is mutated by development verification. Mutating tests use uniquely named temporary databases, Redis namespaces, upload roots, and external-adapter fakes.
3. Every behavior fix follows red-green-refactor. Configuration and migration changes are preceded by executable guards that demonstrate the current failure.
4. Database changes use versioned migrations. `prisma db push` is not a deployment mechanism.
5. Employee identity is explicit: `employeeId` is the database foreign key and `employeeCode` is the human/business identifier. Neither may be stored in or exposed through the other's field.
6. Authorization is data-aware. Route permission, branch scope, organizational scope, record ownership, and field sensitivity are evaluated separately.
7. Core HR contains no gym-, café-, restaurant-, country-, currency-, timezone-, bank-, or device-specific behavior. Those concerns live behind adapters and policy packs.
8. Approval, payroll, exit, and file workflows are state machines with idempotency keys, atomic transitions, and immutable audit evidence.
9. A 100/100 result is an evidence state, not a subjective statement: every gate in the audit report must have a reproducible command or test artifact.

## 2. Delivery decomposition

The objective contains several independent subsystems. They are delivered in this order so each later package builds on trusted data and identity boundaries.

### Package A — Migration and data integrity

- Canonicalize migration history without deleting business tables.
- Restore genuine database-applied migrations that are missing locally.
- Resolve the one duplicate legacy migration by archiving its metadata only after proving the canonical replacement and schema objects exist.
- Remove unsafe deployment affordances for `db push`.
- Add drift, destructive-diff, fresh-install, and upgrade rehearsal gates.

### Package B — Identity, authorization, sessions, files, and audit

- Replace ambiguous `emp_code` JWT semantics with explicit employee identity claims.
- Introduce a central HR data-scope policy and apply it to employees, requests, reports, files, and all sensitive record lookups.
- Implement refresh-token rotation/revocation and termination-triggered session invalidation.
- Replace public HR uploads with private metadata-backed downloads and content validation.
- Add append-only business audit events with correlation IDs.

### Package C — Requests, leave, permission, mobile, and approval engine

- Replace no-op request approvals with registered domain handlers.
- Make request approval and its domain effect one idempotent transaction.
- Replace hard-coded job-title approval routing with policy-defined steps.
- Compute leave duration server-side, use one accrual engine, revalidate on final approval, and make carry-over idempotent.
- Route web and mobile through the same services.
- Replace `MAX + 1` numbering with locked counters and unique constraints.

### Package D — Payroll, tax, settlement, and finance invariants

- Add a versioned jurisdiction tax policy interface and a generic/no-tax pack plus an Egyptian pack only when rules are explicitly configured and legally reviewed.
- Store taxable base, tax, employee/employer insurance, deductions, loans, and net independently.
- Add final settlement across payroll, leave, loans, custody, and sessions.
- Correct actual-bank reconciliation and expand GL invariant checks.
- Neutralize spreadsheet formulas and add bank export/import acknowledgment adapters.

### Package E — Attendance, recruitment, and domain completeness

- Add attendance-device provider contracts, raw event ledger, cursors, deduplication, queues, and allowed-network policy.
- Complete applicant → interview → offer → accepted → onboarding → employee conversion.
- Complete missing UI/API parity and replace inline mutation bodies with runtime DTO classes.
- Add optional benefits, training, grievance, expense, workforce, and vertical packs without coupling them to core.

### Package F — Reusable reference artifact and UI system

- Create `hr-reference/` with manifest, contracts, adapters, backend/frontend exports, baseline migrations, fixtures, prompts, install/upgrade/security/operations docs, and acceptance scripts.
- Create `PRODUCT.md` and `DESIGN.md`; centralize tokens, currency, timezone, i18n, responsive behavior, accessibility, and permission-denied states.
- Repair mobile and authenticated HR surfaces and verify them in a real browser.

### Package G — Delivery, operations, and proof

- CI gates for typecheck, unit, integration, E2E, browser, dependency, migration drift, destructive diff, and artifact validation.
- Readiness/liveness, structured logs, request IDs, metrics, traces, alerts, and runbooks.
- Encrypted backups, checksums, retention, least-privilege permissions, and automated restore drills.
- Security, accessibility, and load tests at the agreed employee/transaction scale.

## 3. Cross-package interfaces

```ts
export interface EmployeeIdentity {
  userId: number;
  employeeId: number | null;
  employeeCode: number | null;
}

export interface HrDataScope {
  companyIds: number[] | null;
  branchIds: number[] | null;
  departmentIds: number[] | null;
  employeeIds: number[] | null;
  selfEmployeeId: number | null;
}

export interface ApprovalTransition<TPayload> {
  requestId: number;
  idempotencyKey: string;
  actorUserId: number;
  payload: TPayload;
}

export interface TaxPolicy {
  policyId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  calculate(input: TaxInput): TaxResult;
}

export interface AttendanceProvider {
  pull(cursor: string | null): Promise<{ events: RawAttendanceEvent[]; nextCursor: string }>;
}
```

These contracts are versioned public boundaries. Existing legacy fields are adapted at the edge and are not propagated into new domain APIs.

## 4. Data flow and transaction boundaries

- Commands enter through validated DTOs.
- Authentication resolves `EmployeeIdentity` once.
- Authorization resolves `HrDataScope` before any record query.
- Domain services load records inside the allowed scope, not globally followed by an in-memory check.
- A state transition, its domain side effects, counter allocation, and audit event commit in one database transaction.
- External side effects use an outbox row committed with the transaction and are delivered asynchronously with idempotency.
- Reporting queries apply scope and pagination in SQL and never truncate to an arbitrary first 500/1000 rows before calculating totals.

## 5. Error handling

- Validation errors are deterministic 400 responses with field codes.
- Unauthorized access returns 403 without revealing record existence; scoped lookup helpers return the same response for foreign records.
- Optimistic/idempotency conflicts return 409 with a stable code.
- External provider failures leave the business transaction committed only when an outbox retry is valid; otherwise no partial state is written.
- Every 5xx response carries a correlation ID while logs redact credentials, tokens, salary values, bank accounts, and uploaded contents.

## 6. Testing architecture

- Unit tests cover policy engines and pure calculations with hand-derived fixtures.
- Integration tests use real MySQL/InnoDB and real Prisma transactions.
- Contract tests enforce adapters and public HR exports.
- E2E tests cover every workflow and negative role/scope path.
- Browser tests cover desktop, 390px mobile, RTL, keyboard, loading, empty, error, forbidden, and destructive confirmation states.
- Migration tests run fresh and upgrade paths against disposable databases and reject unexpected destructive SQL.
- Restore tests decrypt and restore a generated backup into a new disposable database, then run integrity probes.

## 7. Definition of done

The master objective is complete only when:

- all P0/P1/P2 findings in the audit have a linked fix and proof;
- all report acceptance gates pass from a clean install;
- zero schema drift and zero unapproved destructive migration operations remain;
- all role/scope/owner security matrix tests pass;
- payroll and settlement invariants pass with literal expected values;
- UI and E2E evidence covers authenticated desktop/mobile paths;
- the reference installs into a separate host fixture without ONE80-specific imports;
- a final independent Sol xhigh review reports no material findings, or every finding is fixed and re-reviewed.

