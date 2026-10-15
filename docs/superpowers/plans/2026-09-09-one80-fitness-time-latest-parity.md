# ONE80 Fitness Time Latest-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the latest September 8 Fitness Time scanner, member-search, reception, and personal-sales workspace behavior into ONE80 and produce a verified release ZIP.

**Architecture:** A ONE80-namespaced persistent-scanner provider wraps the authenticated shell and hands scans to branch-scoped reception search. Member search and scanner credentials are hardened at the backend boundary. The latest sales workflow is merged into the existing `/sales-portal` module while `/sales` remains POS.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, NestJS, Prisma/MySQL, Node test runner, Jest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-09-one80-fitness-time-latest-parity-design.md`

## Global Constraints

- Preserve ONE80 branding, Arabic-first RTL behavior, and `one80.*` browser-storage keys.
- `/sales` and `/sales/*` remain POS; personal sales remains `/sales-portal`.
- CRM writes remain in `club_sales_crm_*`; do not alter legacy `club_leads`.
- Do not stage the pre-existing Cafe/POS/product-image changes or local release scripts.
- Do not deploy, reset, reseed, or connect to production.
- Use additive migrations only if a failing test proves schema work is necessary.

---

### Task 1: Persistent scanner foundation

**Files:**
- Create: `frontend/src/lib/persistent-scanner-model.ts`
- Create: `frontend/src/lib/persistent-scanner-model.spec.ts`
- Create: `frontend/src/components/club/use-hardware-scanner.ts`
- Create: `frontend/src/components/club/hardware-scanner-wedge.spec.ts`
- Create: `frontend/src/components/club/persistent-scanner.tsx`
- Modify: `frontend/src/components/club/camera-barcode-scanner.tsx`
- Modify: `frontend/src/components/layout/app-shell.tsx`
- Modify: `frontend/src/components/layout/topbar.tsx`

**Interfaces:**
- Produces: `buildReceptionScanUrl(rawCode): string | null`, `readPersistentScannerOpen(value): boolean`, `pathOwnsItsOwnScanner(pathname): boolean`.
- Produces: `useHardwareScanner(onScan, options)` and `PersistentScannerProvider`/`usePersistentScanner`.
- Consumes: existing camera scanner and `/club/reception` route.

- [ ] **Step 1: Write scanner-model tests**

```ts
assert.equal(buildReceptionScanUrl(' 0246999 '), '/club/reception?scan=0246999');
assert.equal(buildReceptionScanUrl('   '), null);
assert.equal(pathOwnsItsOwnScanner('/club/events/checkin'), true);
assert.equal(readPersistentScannerOpen('1'), true);
```

- [ ] **Step 2: Run the focused tests and confirm missing-module RED**

Run: `npx tsx --test src/lib/persistent-scanner-model.spec.ts`

- [ ] **Step 3: Implement the pure model with ONE80 storage namespace**

```ts
export const PERSISTENT_SCANNER_STORAGE_KEY = 'one80.reception.scanner.open';
export function buildReceptionScanUrl(rawCode: string) {
  const code = rawCode.trim();
  return code ? `/club/reception?scan=${encodeURIComponent(code)}` : null;
}
```

- [ ] **Step 4: Write keyboard-wedge tests for Enter, Tab, idle flush, human gaps, editable targets, and disabled state**

Run: `npx tsx --test src/components/club/hardware-scanner-wedge.spec.ts`

- [ ] **Step 5: Implement the tested keyboard burst parser and React hook**

The parser accepts printable characters inside `maxGapMs`, emits on Enter/Tab or `flushMs`, strips controls, and never intercepts editable targets.

- [ ] **Step 6: Add provider and header toggle**

Wrap `TouchKeypadProvider` content with `PersistentScannerProvider`; add a `ScanBarcode` topbar button using `aria-pressed`, `size-11`, and `usePersistentScanner()`.

- [ ] **Step 7: Verify focused tests and frontend typecheck**

Run: `npx tsx --test src/lib/persistent-scanner-model.spec.ts src/components/club/hardware-scanner-wedge.spec.ts`, then `npm run typecheck`.

- [ ] **Step 8: Commit the scanner foundation**

```bash
git commit -m "feat: add one80 persistent member scanner"
```

### Task 2: Member scanner identity and numeric search

**Files:**
- Modify: `backend/src/modules/gym-ops/club-search.service.ts`
- Create: `backend/src/modules/gym-ops/club-search.numeric-priority.spec.ts`
- Modify: `backend/src/modules/club-members/club-members.service.ts`
- Modify: `backend/src/modules/club-members/dto/upsert-club-member.dto.ts`
- Create: `backend/src/modules/club-members/club-members.scanner-identity.spec.ts`
- Modify: `frontend/src/types/club.ts`
- Modify: `frontend/src/pages/club/member-form.tsx`

**Interfaces:**
- Produces: branch-scoped exact/prefix numeric ranking and `scannerCode` create/update/detail mapping backed by `gate_credentials`.
- Consumes: existing ONE80 member schema and branch-scope service.

- [ ] **Step 1: Add RED tests for Arabic/Persian digit normalization and exact/prefix priority**

```ts
expect(normalize('٥٠٧٤')).toBe('5074');
expect(rank(['5074', '50740', '15074'], '5074')).toEqual(['5074', '50740']);
```

- [ ] **Step 2: Run Jest and confirm current substring/length behavior fails**

Run: `npx jest src/modules/gym-ops/club-search.numeric-priority.spec.ts --runInBand`

- [ ] **Step 3: Implement normalized exact/prefix code retrieval without weakening branch scope**

Fetch exact/prefix code matches separately, merge by member id with broad matches, and sort exact → shortest prefix → other ranked hits.

- [ ] **Step 4: Add RED scanner-credential service tests**

Assert leading zero preservation, uniqueness, clearing, and mapping on create/update/detail.

- [ ] **Step 5: Implement scanner credentials through existing `gate_credentials`**

No migration is expected because ONE80 already owns the table/relation.

- [ ] **Step 6: Add the scanner-code field to the existing member editor**

Use the current ONE80 form vocabulary and explain that leading zeroes are retained.

- [ ] **Step 7: Verify focused backend/frontend tests and typechecks**

- [ ] **Step 8: Commit member search integrity**

```bash
git commit -m "fix: prioritize one80 member scanner codes"
```

### Task 3: Reception scan handoff

**Files:**
- Create: `frontend/src/lib/reception-scan.ts`
- Create: `frontend/src/lib/reception-scan.spec.ts`
- Modify: `frontend/src/pages/club/reception.tsx`

**Interfaces:**
- Produces: `consumeReceptionScan(searchParams, consumed): { code, next, consumed }`.
- Consumes: `buildReceptionScanUrl`, branch-aware reception `runSearch`, and the shared persistent-scanner context.

- [ ] **Step 1: Add RED tests for one-time consumption**

```ts
assert.deepEqual(consumeReceptionScan(new URLSearchParams('scan=0246999&tablet=1'), ''), {
  code: '0246999', next: 'tablet=1', consumed: '0246999'
});
```

- [ ] **Step 2: Run the test and confirm the missing helper fails**

- [ ] **Step 3: Implement pure consumption and integrate reception**

Reception closes an old card, sets the query, removes only `scan`, replaces browser history, and calls the latest branch-scoped `runSearch(code)` once.

- [ ] **Step 4: Replace reception's local camera state with the shared scanner context**

The reception scan button controls the same panel as the topbar.

- [ ] **Step 5: Verify tests and typecheck**

- [ ] **Step 6: Commit reception integration**

```bash
git commit -m "feat: route persistent scans through reception"
```

### Task 4: Latest sales-portal parity

**Files:**
- Modify: `frontend/src/pages/sales-portal/index.tsx`
- Modify: `frontend/src/pages/sales-portal/sales-renewals.tsx`
- Modify: `frontend/src/pages/sales-portal/sales-reminders.tsx`
- Modify: `frontend/src/pages/sales-portal/sales-workspace-model.ts`
- Modify: `frontend/src/pages/sales-portal/client-navigation.ts`
- Modify: `frontend/src/pages/sales-portal/client-navigation.test.ts`
- Modify: `frontend/src/pages/sales-portal/sales-workspace-model.test.ts`
- Create: `frontend/src/pages/sales-portal/latest-parity.spec.ts`
- Create: `frontend/src/lib/contact-links.ts`
- Create: `frontend/src/lib/contact-links.spec.ts`

**Interfaces:**
- Produces: paginated/filterable personal lead feed, cross-page navigation, renewal contact actions, shared scanner access, and member-profile actions.
- Consumes: `/club-leads/mine`, `/club-leads/reminders`, `/club-members/sales-renewals`, `/club-members/sales-portal`, and existing member profile components.

- [ ] **Step 1: Add RED tests for Egyptian dial/WhatsApp links and unsafe input**

```ts
assert.equal(toDialLink('010 1234 5678'), 'tel:+201012345678');
assert.match(toWhatsAppLink('01012345678', 'تجديد')!, /^https:\/\/wa\.me\/201012345678\?/);
assert.equal(toDialLink('abc'), null);
```

- [ ] **Step 2: Add RED workspace tests for server query, stable offsets, cross-page navigation, and `/sales-portal` routes**

- [ ] **Step 3: Implement contact-link helpers and merge the source's lead pagination/search/status behavior**

Keep ONE80's route map and hardened empty/error states. Do not move code into `pages/sales`.

- [ ] **Step 4: Merge scanner, avatar, subscription, and member-profile affordances**

- [ ] **Step 5: Merge renewal phone/WhatsApp actions, filtering, urgency, pagination, and cross-page follow-up navigation**

- [ ] **Step 6: Preserve and extend reminder completion/copy/profile behavior**

- [ ] **Step 7: Verify all sales-portal tests and frontend typecheck**

- [ ] **Step 8: Commit sales portal parity**

```bash
git commit -m "feat: complete latest one80 sales portal parity"
```

### Task 5: Source-difference audit, visual QA, and release ZIP

**Files:**
- Modify: `docs/cross-gym-sync/ONE80-SYNC-STATUS.md`
- Create: release archive outside the repository working tree.

**Interfaces:**
- Produces: a reproducible, verified ZIP containing committed ONE80 source while excluding dependencies, build caches, runtime uploads, secrets, backups, and the user's uncommitted local files.

- [ ] **Step 1: Re-audit September 7–8 source files against ONE80**

Classify every unmatched item as integrated, existing ONE80 equivalent, intentionally excluded with reason, or still missing. Resolve every still-missing in-scope scanner/sales/reception item through another RED–GREEN cycle.

- [ ] **Step 2: Run full verification**

Run backend and frontend full tests, typechecks, builds, Prisma validate/generate if schema changed, migration destructive scan, branding scan, and `git diff --check`.

- [ ] **Step 3: Run one bounded visual pass**

Inspect topbar/scanner, reception scan result, sales leads, renewals, reminders, and member dialog at desktop and 390px. Fix material findings in one batch and confirm once.

- [ ] **Step 4: Run the Impeccable detector exactly once after UI files are final**

```bash
node /Users/fatmaatefkasem/.agents/skills/impeccable/scripts/detect.mjs --json <changed-ui-targets>
```

- [ ] **Step 5: Update and commit the verification ledger**

Record source snapshot, RED/GREEN evidence, exclusions, test totals, build results, scanner QA, and commit hashes.

- [ ] **Step 6: Build the release ZIP from committed files**

Use `git archive` at the final commit so uncommitted user files cannot enter the package. Add only required ignored module source through its now-versioned exception. Name the archive `one80-latest-fitness-time-sync-20260909.zip` and validate with `unzip -t` plus a content/secret exclusion audit.

- [ ] **Step 7: Report the absolute ZIP path, SHA-256, size, verification evidence, and preserved dirty files**
