# HR Request Workflow Integrity Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-26-hr-request-workflows-design.md`

## Task 1 — Durable request effects

- [ ] Add `hr_request_effects` migration/model with unique request id.
- [ ] Add payload validation and effect-result contracts.
- [ ] Add concurrency/idempotency tests.

## Task 2 — Operational handlers

- [ ] Make leave and permission effects transactional and validated.
- [ ] Make advance/loan creation, schedule, accounting, and request approval atomic.
- [ ] Implement allowance and running-total recomputation.

## Task 3 — Employee lifecycle handlers

- [ ] Implement immutable salary certificate snapshots.
- [ ] Implement resignation/offboarding initiation.
- [ ] Implement validated transfer and promotion.
- [ ] Implement allow-listed data changes with stale-value protection.

## Task 4 — Evidence and UI

- [ ] Write audit inside the approval/rejection transaction.
- [ ] Read/print salary certificate snapshot from the effect row.
- [ ] Replace free-text promotion target with a canonical job-title choice.

## Task 5 — Verification

- [ ] Run focused tests and typecheck.
- [ ] Run full backend/frontend regression.
- [ ] Run migration status/drift/disposable rehearsal.
- [ ] Update the master audit only for verified resolutions.
