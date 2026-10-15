# Safe Stock Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ONE80 physical stock counts reconcile shortages and surpluses without overwriting inventory movements recorded after the count.

**Architecture:** Keep the count-time system quantity as a snapshot and store the physical variance. On approval, post that variance as an atomic inbound or outbound inventory movement against the latest balance instead of setting an absolute balance. The UI will collect a variance reason and present clear shortage, surplus, matched, and approval states.

**Tech Stack:** NestJS, Prisma, Jest, React, TypeScript, Tailwind CSS.

**Spec:** Client comment recorded in the active Codex thread on 2026-08-22.

## Global Constraints

- Preserve all existing server data and avoid destructive schema operations.
- Preserve unrelated uncommitted work in both backend and frontend repositories.
- Require an explanation for every non-zero physical count variance.
- Only users with the existing stock-taking approval permission may apply a reconciliation.

---

### Task 1: Safe backend reconciliation

**Files:**
- Create: `backend/src/modules/inventory/stock-taking.service.spec.ts`
- Modify: `backend/src/modules/inventory/stock-taking.service.ts`
- Modify: `backend/src/modules/inventory/dto/inventory.dto.ts`

**Interfaces:**
- Consumes: `InventoryStockService.applyMovement(ApplyMovementDto, tx)`.
- Produces: `UpsertCountItemDto.varianceReason?: string` and approval movements that use the stored variance as a delta.

- [x] **Step 1: Write a failing Jest test proving approval applies a shortage variance to the current balance as an outbound delta, not as an absolute set.**
- [x] **Step 2: Run `npm test -- stock-taking.service.spec.ts --runInBand` in `backend` and verify the argument assertion fails against the current absolute-set behavior.**
- [x] **Step 3: Change approval to skip zero differences and apply positive variances inbound and negative variances outbound using the absolute variance quantity.**
- [x] **Step 4: Run the focused Jest test and verify it passes.**
- [x] **Step 5: Add failing tests for negative physical counts, duplicate products in one session, and a missing reason on a non-zero variance.**
- [x] **Step 6: Add the DTO field and minimal service validation/persistence required to pass the validation tests.**
- [x] **Step 7: Run the focused Jest test and backend typecheck.**

### Task 2: Clear stock-taking review UI

**Files:**
- Modify: `frontend/src/pages/inventory/opening-stock-tab.tsx`

**Interfaces:**
- Consumes: `ProductListItem.currentStock`, `ProductListItem.costPrice`, and count-session `varianceReason`.
- Produces: count item POST payload with `varianceReason`, visual variance status, count summary, and explicit approval warning.

- [x] **Step 1: Extend the local count types and form state with the variance reason.**
- [x] **Step 2: Add current-system quantity, live difference preview, and the reason input to the count form.**
- [x] **Step 3: Add summary cards and accessible shortage/surplus/matched labels to the review table.**
- [x] **Step 4: Add an approval warning that explains the difference will be applied while later inventory movements remain intact.**
- [x] **Step 5: Run frontend typecheck and build.**

### Task 3: Final verification

**Files:**
- Verify only; no additional production files expected.

**Interfaces:**
- Consumes: completed backend and frontend work.
- Produces: reproducible verification evidence.

- [x] **Step 1: Run the focused backend stock-taking and inventory-stock tests.**
- [x] **Step 2: Run backend typecheck and build.**
- [x] **Step 3: Run frontend typecheck and build.**
- [x] **Step 4: Review the final target-file diffs for unrelated or destructive changes.**
