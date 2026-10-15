# HR Reference Final Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining documentation, UI-audit, verification, and independent-review gap so the portable HR reference is ready for repeatable integration.

**Architecture:** Treat `backend/` and `frontend/` as the source of truth, regenerate the exact allowlisted snapshot, and prove portability through boundary, Prisma, package, host, migration, runtime, UI, and operational gates. Keep all ONE80 coupling inside declared optional adapters and make the final report distinguish package evidence from target-host prerequisites.

**Tech Stack:** NestJS 11, Prisma 5, MySQL 8, React 18, React Router 7, Vite 6, Jest/Vitest, shell/Node verification scripts.

**Spec:** `hr-reference/ACCEPTANCE_CHECKLIST.md`

## Global Constraints

- Preserve all existing user changes and production data; no reset, reseed, `db push`, or destructive production command.
- Portable Core must have zero ONE80/club/cafe/inventory/gym-sales coupling.
- All ONE80 adapters must be declared exactly in `DOMAIN_BOUNDARY.json`.
- Payroll/legal policies stay versioned, effective-dated, deterministic, immutable, and fail-closed.
- Evidence must be fresh and scoped accurately; no completion claim from stale output.

---

### Task 1: Reconcile package metadata and reports

**Files:**
- Modify: `hr-reference/MANIFEST.json`
- Modify: `hr-reference/ACCEPTANCE_CHECKLIST.md`
- Modify: `hr-reference/DATA_MODEL_CONTRACT.md`
- Modify: `hr-reference/INTEGRATION_CONTRACT.md`
- Modify: `hr-reference/PROMPT.md`
- Modify: `hr-reference/README.md`
- Replace: `hr-reference/HR_REFERENCE_AUDIT_REPORT.md`
- Create: `hr-reference/ACCEPTANCE_EVIDENCE.json`

**Interfaces:**
- Consumes: `source/SNAPSHOT_AUDIT.json`, `PRISMA_MODEL_INVENTORY.json`, verifier outputs.
- Produces: machine-readable and human-readable final acceptance evidence.

- [ ] Read generated inventories and derive all counts from authoritative files.
- [ ] Remove stale historical claims and update integration/default contracts.
- [ ] Record each gate as passed, target-host-required, or not evidenced; never mark missing evidence as passed.
- [ ] Validate JSON and scan all top-level reference docs for stale counts/status.

### Task 2: Run package, host, migration, runtime, UI, and operations gates

**Files:**
- Test: `hr-reference/scripts/verify-reference.test.sh`
- Test: `hr-reference/scripts/verify-reference.sh`
- Test: `hr-reference/scripts/verify-portable-core.sh`
- Test: `hr-reference/scripts/verify-portable-tests.sh`

**Interfaces:**
- Consumes: exact snapshot, lockfiles, generated portable schema, local disposable database.
- Produces: fresh exit codes and counts for the acceptance evidence.

- [ ] Run the four reference/package verifiers and capture exact counts.
- [ ] Run backend audit, Prisma validation/status/drift/rehearsal, typecheck, full tests, build, and safe runtime health checks.
- [ ] Run frontend audit, tests, typecheck, production build, and navigation/security regressions.
- [ ] Run Impeccable detector once on changed frontend targets and document verified material findings.
- [ ] Run the safe backup/restore drill only against a disposable database and capture row-count/hash evidence.

### Task 3: Independent Sol Extra High review and closure

**Files:**
- Review: `hr-reference/**`
- Review: portable Core and declared ONE80 adapters in `backend/src` and `frontend/src`.

**Interfaces:**
- Consumes: final package, evidence, requirements, and fresh verification outputs.
- Produces: independent finding list and clean re-review verdict.

- [ ] Ask the existing Sol Extra High reviewer for an evidence-based requirement-by-requirement review.
- [ ] Reproduce every material finding locally and write a failing regression where code behavior changes.
- [ ] Apply the smallest correct fix without weakening gates or portability boundaries.
- [ ] Re-run affected gates, regenerate snapshot/checksums, and request re-review until no Critical/Important finding remains.
- [ ] Run the full final verification set once more and publish the complete Arabic audit report.
