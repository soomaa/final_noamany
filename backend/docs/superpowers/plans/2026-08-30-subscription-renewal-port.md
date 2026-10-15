# One80 Subscription Renewal Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add same-package, current-price, automatically scheduled subscription renewal to One80 while preserving its HR hardening, portable edition, private uploads, brand adapters, migration history, and live data.

**Architecture:** Extend One80's current subscription model with the additive renewal-chain relation, port the focused PHAROS lifecycle and quote/commit services into the existing NestJS module, and replace only the old inline renewal dialog in the current One80 subscription page. Use One80's existing data-free release and safe migration deploy path for packaging.

**Tech Stack:** NestJS, Prisma/MySQL, Jest, React 18, TypeScript, TanStack Query, Tailwind/Radix UI, One80 PM2 release scripts.

**Spec:** `docs/superpowers/specs/2026-08-30-subscription-renewal-port-design.md`

## Global Constraints

- Target root is `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80`.
- One80's current dirty working trees are authoritative; preserve every pre-existing modification and untracked file.
- Preserve frontend adapters/ports, portable code, portable Prisma artifacts, private uploads, HR/payroll/settlement modules, One80 assets, package identity, domain, port 9041, PM2 name, and every migration.
- Never copy `.env`, PHAROS branding/deployment settings, database dumps, uploads, imported spreadsheets, or delete a target-only path.
- Renewal is same-package only, at the current branch price; plan and dates are server-owned.
- Existing debt and new renewal payment remain separate.
- Do not commit any tracked file whose pre-existing user changes would be swept into the feature commit; keep the feature branch and working tree intact instead.

---

### Task 1: Isolate the work and record a green One80 baseline

**Files:**
- Inspect: `backend/package.json`
- Inspect: `frontend/package.json`
- Preserve: current backend/frontend Git status.

**Interfaces:**
- Produces: feature branch `feature/subscription-renewal-lifecycle` in both repos.
- Produces: baseline test/build evidence before code edits.

- [ ] **Step 1: Capture the exact dirty state**

```bash
git -C backend status --porcelain -uall
git -C frontend status --porcelain -uall
git -C backend switch -c feature/subscription-renewal-lifecycle
git -C frontend switch -c feature/subscription-renewal-lifecycle
```

Expected: branches are created without resetting, cleaning, staging, or modifying existing work.

- [ ] **Step 2: Run the backend baseline**

```bash
cd backend
npx prisma validate
npm test -- --runInBand
npm run typecheck
npm run build
```

Expected: every command exits 0. Diagnose any untouched baseline failure before feature edits.

- [ ] **Step 3: Run the frontend baseline**

```bash
cd ../frontend
npm run typecheck
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 4: Assert protected One80 boundaries exist**

```bash
test -d src/adapters/one80
test -d src/ports
test -d src/portable
test -f vite.portable.config.ts
test -f ../backend/prisma/portable-schema.prisma
test -d ../backend/prisma/portable-migrations
test -d ../backend/src/portable
```

Expected: every protected path exists before and after the port.

---

### Task 2: Add the renewal chain without disturbing One80 schema extensions

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260830123000_subscription_renewal_chain/migration.sql`
- Create: `backend/src/modules/club-subscriptions/club-subscription-lifecycle.service.ts`
- Create: `backend/src/modules/club-subscriptions/club-subscription-lifecycle.service.spec.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.module.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.ts`
- Modify: `frontend/src/types/club.ts`

**Interfaces:**
- Produces: nullable unique predecessor relation and successor lookup.
- Produces: `findTail`, `promoteAfterQuotaExhaustion`, and `syncActivatedMember`.
- Produces API fields: `renewedFromSubscriptionId` and `renewalSuccessorId`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
const result = await service.promoteAfterQuotaExhaustion(10, '2026-08-29', tx);
expect(result).toEqual({
  activatedSubscriptionId: 11,
  shiftedSubscriptionIds: [11, 12],
  shiftDays: 3,
});
```

Also require cycle, cross-member, cross-branch, frozen-successor, and idempotency behavior.

- [ ] **Step 2: Verify the new test fails**

```bash
cd backend
npm test -- --runInBand src/modules/club-subscriptions/club-subscription-lifecycle.service.spec.ts
```

Expected: FAIL before the service exists.

- [ ] **Step 3: Add only the self-reference fields and additive migration**

```prisma
renewed_from_subscription_id Int?                @unique
renewed_from                 club_subscriptions? @relation("club_subscription_renewal_chain", fields: [renewed_from_subscription_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
renewal_successor            club_subscriptions? @relation("club_subscription_renewal_chain")
```

```sql
ALTER TABLE `club_subscriptions` ADD COLUMN `renewed_from_subscription_id` INT NULL;
CREATE UNIQUE INDEX `club_subscriptions_renewed_from_subscription_id_key`
  ON `club_subscriptions` (`renewed_from_subscription_id`);
ALTER TABLE `club_subscriptions`
  ADD CONSTRAINT `club_subscriptions_renewed_from_subscription_id_fkey`
  FOREIGN KEY (`renewed_from_subscription_id`) REFERENCES `club_subscriptions` (`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;
```

Do not run a formatter across the full One80 schema and do not modify portable schema/migrations.

- [ ] **Step 4: Port, register, and map lifecycle data**

Use the canonical PHAROS lifecycle service as behavioral reference. Register/export it in One80's current module and add chain fields to existing mapping/list/detail logic without dropping target fields.

- [ ] **Step 5: Generate and verify**

```bash
npx prisma generate
npx prisma validate
npm test -- --runInBand src/modules/club-subscriptions/club-subscription-lifecycle.service.spec.ts
npm run typecheck
```

Expected: all commands exit 0.

---

### Task 3: Port server-authoritative renewal quote and commit

**Files:**
- Create: `backend/src/modules/club-subscriptions/club-subscription-renewal.service.ts`
- Create: `backend/src/modules/club-subscriptions/club-subscription-renewal.service.spec.ts`
- Modify: `backend/src/modules/club-subscriptions/dto/club-subscription-payment.dto.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.controller.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.module.ts`

**Interfaces:**
- Produces quote endpoint and renewal commit returning `{ subscription, quote }`.
- Uses One80 branch prices, session matrices, discounts, receipts, split payments, audit, accounting, automation, and branch scope.

- [ ] **Step 1: Write failing quote/commit tests**

```ts
expect(await service.quote(41, {}, user)).toMatchObject({
  sourceSubscriptionId: 41,
  subscriptionTypeId: 7,
  grossValue: 600,
  sessionsCount: 12,
  scheduleMode: 'after_current',
});
```

Cover current branch price, current matrix, regular/special/private packages, frozen rejection, old debt separation, queue tail, stale quote, split payment, and rollback.

- [ ] **Step 2: Verify the focused test fails**

```bash
npm test -- --runInBand src/modules/club-subscriptions/club-subscription-renewal.service.spec.ts
```

Expected: FAIL before the service exists.

- [ ] **Step 3: Replace `renewalDays` with quote/payment DTOs**

The DTO accepts only `discountEnabled`, `discountCodeId`, `discountValue`, `paidAmount`, `paymentMethod`, `payments`, and optional `quoteVersion`. It contains no target plan or date property.

- [ ] **Step 4: Port the service while retaining One80 fields**

Use the PHAROS service as behavioral reference. Merge One80-specific row fields where present, use One80's current lock/payment utilities, recalculate under the transaction lock, link the real tail, and preserve predecessor finances.

```ts
renewed_from_subscription_id: quote.tailSubscriptionId,
subscription_start_date: quote.startDate,
subscription_end_date: quote.endDate,
subscription_value: quote.grossValue,
remaining_amount: quote.remainingAmount,
```

- [ ] **Step 5: Delegate controller routes**

Keep existing permission decorators. Add `POST :id/renew/quote` and route `PATCH :id/renew` to `ClubSubscriptionRenewalService.renew(id, body, user)`.

- [ ] **Step 6: Run focused/history tests and typecheck**

```bash
npm test -- --runInBand src/modules/club-subscriptions/club-subscription-renewal.service.spec.ts src/modules/club-subscriptions/club-subscriptions.renew.spec.ts
npm run typecheck
```

Expected: PASS.

---

### Task 4: Activate queued renewals after quota exhaustion and route duplicates

**Files:**
- Modify: `backend/src/modules/club-members/club-attendance.service.ts`
- Create: `backend/src/modules/club-members/club-attendance.renewal-promotion.spec.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.ts`
- Create: `backend/src/modules/club-subscriptions/club-subscriptions.sessions-renewal.spec.ts`
- Create: `backend/src/modules/club-subscriptions/club-subscriptions.duplicate-renewal.spec.ts`

**Interfaces:**
- Consumes lifecycle promotion inside session transactions.
- Produces structured renewal-required conflict context.

- [ ] **Step 1: Write failing focused tests**

Require promotion on the final attendance/session increment, no promotion before quota, atomic rollback, member sync after commit, and structured duplicate context.

- [ ] **Step 2: Verify failures**

```bash
npm test -- --runInBand src/modules/club-members/club-attendance.renewal-promotion.spec.ts src/modules/club-subscriptions/club-subscriptions.sessions-renewal.spec.ts src/modules/club-subscriptions/club-subscriptions.duplicate-renewal.spec.ts
```

- [ ] **Step 3: Integrate all target session paths**

After guarded raw increments, reload session totals and call:

```ts
await this.lifecycle.promoteAfterQuotaExhaustion(subscriptionId, today, tx);
```

Wrap explicit session use and administrative session correction in transactions. Synchronize the activated member and audit after commit.

- [ ] **Step 4: Return structured duplicate context**

```ts
throw new ConflictException({
  statusCode: 409,
  code: 'SUBSCRIPTION_RENEWAL_REQUIRED',
  message: 'العضو لديه نفس الباقة بالفعل — استخدم تجديد / تمديد',
  existingSubscriptionId: liveDuplicate.id,
  canRenew: true,
});
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npm test -- --runInBand src/modules/club-members/club-attendance.renewal-promotion.spec.ts src/modules/club-subscriptions/club-subscriptions.sessions-renewal.spec.ts src/modules/club-subscriptions/club-subscriptions.duplicate-renewal.spec.ts
npm run typecheck
```

Expected: PASS.

---

### Task 5: Replace One80's inline renewal UI

**Files:**
- Create: `frontend/src/lib/subscription-renewal.ts`
- Create: `frontend/src/lib/subscription-renewal.test.ts`
- Create: `frontend/src/lib/subscription-renewal-conflict.test.ts`
- Create: `frontend/src/components/club/subscription-renewal-dialog.tsx`
- Modify: `frontend/src/pages/club/subscriptions.tsx`
- Modify: `frontend/src/locales/club.ar.json`
- Modify: `frontend/src/locales/club.en.json`
- Modify: `frontend/src/types/club.ts`

**Interfaces:**
- Produces typed quote helper, structured-conflict reader, and focused renewal dialog.
- Preserves One80's adapters, ports, locale registries, printing, permissions, and portable boundaries.

- [ ] **Step 1: Load Impeccable context once**

```bash
node /Users/fatmaatefkasem/.agents/skills/impeccable/scripts/context.mjs --target frontend/src/pages/club/subscriptions.tsx
```

Read the routed refinement playbook and `reference/craft-floor.md` before UI edits.

- [ ] **Step 2: Write failing pure helper tests**

```ts
assert.deepEqual(renewalEditableFields, ['discount', 'payment']);
assert.equal(renewalPrimaryAction({ scheduleMode: 'after_current' }), 'تأكيد التجديد المجدول');
assert.deepEqual(readRenewalConflict(error), { subscriptionId: 41 });
```

- [ ] **Step 3: Verify helper failures**

```bash
cd frontend
node --experimental-strip-types --test src/lib/subscription-renewal.test.ts src/lib/subscription-renewal-conflict.test.ts
```

Expected: FAIL before helper creation.

- [ ] **Step 4: Port the dialog with One80 primitives**

Render same plan, repeated sessions, current price, calculated dates, and schedule reason as read-only. Render only discount and split payment as editable. Add stale-quote and unavailable states, keyboard support, responsive stacking, sticky actions, explicit permission action, and Arabic/English copy.

- [ ] **Step 5: Integrate without disturbing adapters or portable mode**

Remove only the old renewal state/dialog from the page, preserve all One80 printing and query behavior, add “تجديد / تمديد”, and open the dialog for structured duplicate conflicts. Invalidate subscriptions, receipts, private subscriptions, members, entitlements, and daily cashier after success.

- [ ] **Step 6: Run helper tests and frontend checks**

```bash
node --experimental-strip-types --test src/lib/subscription-renewal.test.ts src/lib/subscription-renewal-conflict.test.ts
npm run typecheck
npm run build
```

Expected: helper tests pass and both commands exit 0.

---

### Task 6: Run complete One80 verification and bounded visual QA

**Files:**
- Review: all feature files.
- Preserve: all dirty/user-owned and edition-specific files.

**Interfaces:**
- Produces: complete test/build and UI evidence.

- [ ] **Step 1: Run complete backend verification**

```bash
cd backend
npx prisma validate
npm test -- --runInBand
npm run typecheck
npm run build
```

Expected: zero failures.

- [ ] **Step 2: Run complete frontend verification**

```bash
cd ../frontend
npm run typecheck
node --experimental-strip-types --test src/lib/subscription-renewal.test.ts src/lib/subscription-renewal-conflict.test.ts
npm run build
```

Expected: zero failures.

- [ ] **Step 3: Run one Impeccable detector pass and one browser review**

Detect once over the dialog/page, fix material findings in one batch, then inspect the real dialog at 1280×720 and 390×844 with mocked APIs. Confirm One80 identity, RTL/LTR, read-only commercial fields, errors, scroll, focus, and sticky actions once.

- [ ] **Step 4: Verify protected boundaries and original dirty state**

```bash
test -d frontend/src/adapters/one80
test -d frontend/src/ports
test -d frontend/src/portable
test -f frontend/vite.portable.config.ts
test -f backend/prisma/portable-schema.prisma
test -d backend/prisma/portable-migrations
test -d backend/src/portable
git -C backend diff --check
git -C frontend diff --check
```

Expected: protected paths remain and diff checks are clean.

---

### Task 7: Package and gate the One80 release

**Files:**
- Use: `make-release.sh`
- Use: `server-deploy.sh`
- Create artifact: `one80-subscription-renewal-20260830.zip`

**Interfaces:**
- Produces a data-free release with the renewal migration and One80's full current application state.
- Uses the existing server deploy path that backs up the database, runs `prisma migrate deploy`, rebuilds, restarts PM2 `one80` on port 9041, and health-checks the API.

- [ ] **Step 1: Build the data-free archive**

```bash
bash make-release.sh
mv one80-deploy.zip one80-subscription-renewal-20260830.zip
```

- [ ] **Step 2: Verify archive integrity and required files**

```bash
unzip -t one80-subscription-renewal-20260830.zip
zipinfo -1 one80-subscription-renewal-20260830.zip | rg 'prisma/migrations/20260830123000_subscription_renewal_chain/migration.sql|src/modules/club-subscriptions/club-subscription-renewal.service.ts|public/index.html|server-deploy.sh'
```

Expected: compression test succeeds and every required path is present.

- [ ] **Step 3: Verify forbidden payload absence**

```bash
if zipinfo -1 one80-subscription-renewal-20260830.zip | rg '(^|/)\.env($|/)|(^|/)db-import\.sql$|^backups/|^uploads/|^private-uploads/|(^|/)\.git(/|$)|^data/.*\.xlsx$'; then exit 23; else echo clean; fi
```

Expected: `clean`.

- [ ] **Step 4: Generate checksum**

```bash
shasum -a 256 one80-subscription-renewal-20260830.zip
```

- [ ] **Step 5: Record the deployment command**

```bash
cd /home/alatheertech/one80.alatheertech.com && unzip -o one80-subscription-renewal-20260830.zip && bash server-deploy.sh
```

Expected server behavior: pre-deploy backup, additive migrations, RBAC sync, build, PM2 restart, and health check complete without `--force-data` or any import.
