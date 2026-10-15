# Cafe Member Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cafe POS member-code scanner that securely reads gym membership data, fills customer name and mobile automatically, and keeps manual customer entry compact and available.

**Architecture:** Reuse the existing `CameraBarcodeScanner` UI from club reception. Add an exact, branch-scoped member lookup under the quick-sales API so cafe cashiers need only POS permission and receive the minimum required member fields. The POS keeps a compact three-field customer row and falls back to the existing phone/customer lookup and manual entry.

**Tech Stack:** NestJS, Prisma, Jest, React, TypeScript, TanStack Query, Tailwind CSS, ZXing.

**Spec:** Approved chat design on 2026-08-29.

## Global Constraints

- Do not add a database migration or change stored production data.
- Keep all existing POS, draft invoice, phone lookup, and checkout behavior working.
- Member lookup must be exact by member code or card/barcode and scoped to the selected cafe branch.
- Cafe cashiers must not require club reception/member-management permissions.
- If no member matches, preserve manual name and mobile entry and show a recoverable message.
- All controls must remain usable in Arabic RTL and on mobile.

---

### Task 1: Secure cafe member lookup

**Files:**
- Modify: `backend/src/modules/sales/quick-sales.customers.spec.ts`
- Modify: `backend/src/modules/sales/quick-sales.service.ts`
- Modify: `backend/src/modules/sales/quick-sales.controller.ts`

**Interfaces:**
- Produces: `QuickSalesService.customerMemberLookup(branchId: number, code: string, user: JwtUser)` returning `{ found, member }`, where `member` is `{ id, memberCode, name, phone, cardNumber, isActive } | null`.
- Produces: `GET /quick-sales/customers/member-lookup?branchId=<id>&code=<code>` protected by `gym-sales.sales.new_receipt:view`.

- [ ] **Step 1: Write failing service tests** for exact member-code match, exact card match, not-found behavior, deleted-member exclusion, and branch scope enforcement.
- [ ] **Step 2: Run the focused Jest test** with `npm test -- --runInBand src/modules/sales/quick-sales.customers.spec.ts` and confirm the new tests fail because the method is absent.
- [ ] **Step 3: Implement the minimal lookup** using `club_members.findFirst`, exact `member_code`/`card_number` matching, `is_deleted: false`, and `assertBranchAccess`.
- [ ] **Step 4: Expose the controller route** with only POS receipt view permission and return only the minimum cafe customer fields.
- [ ] **Step 5: Re-run the focused Jest test** and confirm it passes.

### Task 2: Compact POS customer/member controls

**Files:**
- Modify: `frontend/src/pages/sales/new-receipt.tsx`
- Reuse: `frontend/src/components/club/camera-barcode-scanner.tsx`

**Interfaces:**
- Consumes: `GET /quick-sales/customers/member-lookup` from Task 1.
- Produces: scanner utility button, member-code lookup field, compact phone/name fields, and member lookup status.

- [ ] **Step 1: Add member lookup state and handler** that trims the code, calls the new endpoint, fills code/name/phone on success, closes the scanner, and preserves manual input on failure.
- [ ] **Step 2: Add the scanner button** beside the calculator with a clear accessible Arabic label and the existing camera scanner component.
- [ ] **Step 3: Replace the large customer section** with one compact responsive row ordered by task priority: member code, phone, name.
- [ ] **Step 4: Preserve phone lookup behavior** while preventing asynchronous cafe-phone lookup from overwriting a newer scanned member result.
- [ ] **Step 5: Run frontend typecheck/build** and fix any TypeScript or bundling errors.

### Task 3: Verification and visual hardening

**Files:**
- Verify: `frontend/src/pages/sales/new-receipt.tsx`
- Verify: `backend/src/modules/sales/quick-sales.customers.spec.ts`

**Interfaces:**
- Consumes: completed API and UI behavior from Tasks 1 and 2.
- Produces: verified desktop/mobile RTL behavior and deployable source changes.

- [ ] **Step 1: Run the backend focused test and backend typecheck.**
- [ ] **Step 2: Run frontend tests, typecheck, and production build.**
- [ ] **Step 3: Run the Impeccable detector** on the changed POS page and resolve material layout/accessibility findings.
- [ ] **Step 4: Inspect `/sales/new` locally** at desktop and mobile widths, including success, not-found, loading, long-name, and manual-entry states.
- [ ] **Step 5: Review the final diff** to confirm no unrelated files were modified by this feature.

