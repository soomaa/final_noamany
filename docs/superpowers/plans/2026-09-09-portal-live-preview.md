# Portal Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, responsive, draft-only live preview for every visual website and store editor in Noamany administration.

**Architecture:** The admin hosts the real public page in an iframe and sends versioned draft snapshots through a nonce- and origin-validated `postMessage` channel. Public page modules merge the draft into their already loaded in-memory data and reuse their production renderers; local browser storage provides private drafts, while existing POST/PUT endpoints remain the only publish path.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, plain JavaScript website modules, Playwright, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-portal-live-preview-design.md`

## Global Constraints

- Preserve Noamany identity and existing production renderers.
- Never use `postMessage('*')` and never accept an unvalidated source, origin, nonce, version, or stale sequence.
- Preview actions must not submit forms, mutate carts, open checkout, or publish content.
- Draft storage is browser-local and contains field values only.
- No database migration or public preview endpoint.
- Desktop split view and 390px tabbed mobile view must both pass without document overflow.

---

### Task 1: Preview protocol and model contracts

**Files:**
- Create: `frontend/src/lib/portal-preview-model.ts`
- Create: `website-redesign/src/portal-preview.js`
- Test: `frontend/src/lib/portal-preview-model.test.ts`
- Test: `website-redesign/tests/portal-live-preview.test.mjs`

**Interfaces:**
- Produces `getPortalPreviewTarget(configType, entityId)` and `normalizePortalPreviewDraft(...)` for the admin.
- Produces `installPortalPreviewReceiver(onSnapshot)` for public page modules.

- [ ] Write failing tests for route mapping, product normalization, explicit-origin sending, nonce/source/origin/version/sequence validation, and transactional-link blocking.
- [ ] Run the focused tests and confirm they fail because the modules do not exist.
- [ ] Implement the typed admin model and dependency-free website receiver.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Public homepage and store adapters

**Files:**
- Modify: `website-redesign/src/main.js`
- Modify: `website-redesign/src/shop.js`
- Modify: `website-redesign/src/product.js`
- Modify: `website-redesign/src/main.css`
- Modify: `website-redesign/src/shop.css`
- Test: `website-redesign/tests/portal-live-preview.test.mjs`

**Interfaces:**
- Consumes `installPortalPreviewReceiver(onSnapshot)`.
- Produces deterministic in-memory merge/render behavior for home, shop, and saved product surfaces.

- [ ] Extend failing tests to assert each supported entity family reuses its page renderer and preview mode shows the private-preview badge.
- [ ] Run the test and verify the adapter assertions fail.
- [ ] Refactor each page into `render...State` functions, retain its loaded baseline, merge the latest draft snapshot, and re-render safely.
- [ ] Disable form/cart/checkout/external actions only in `cmsPreview=1` mode while preserving scroll and anchors.
- [ ] Run website tests and production build.

### Task 3: Admin preview workspace and local drafts

**Files:**
- Create: `frontend/src/components/portal/portal-live-preview.tsx`
- Create: `frontend/src/components/portal/portal-live-preview.css`
- Modify: `frontend/src/pages/portal-management/index.tsx`
- Test: `frontend/src/components/portal/portal-live-preview.test.ts`
- Test: `frontend/tests/portal-admin-render.test.mjs`

**Interfaces:**
- Consumes the preview target/normalizer model.
- Produces `<PortalLivePreview configType entityId draft />`, local-draft helpers, desktop/mobile viewport controls, retry and fullscreen states.

- [ ] Write failing tests for the split workspace, mobile edit/preview tabs, handshake queue, explicit target origin, local draft save/restore/discard, and publish-only API behavior.
- [ ] Run focused tests and verify failure.
- [ ] Build the toolbar and iframe with a 42/58 desktop split and mobile tab switcher.
- [ ] Integrate visual `SettingsPage` and `RecordsPage` editors; keep operational configs on the existing dialog.
- [ ] Rename the server mutation action to “نشر التعديلات”, add “حفظ كمسودة” and “إلغاء المسودة”, and clear drafts only after successful publish.
- [ ] Run focused and full frontend tests, typecheck, and build.

### Task 4: Browser acceptance and visual finish

**Files:**
- Create: `scripts/capture-portal-live-preview.mjs`
- Create: `review/client-requirements-2026-09-09/WEB-PREVIEW/desktop.png`
- Create: `review/client-requirements-2026-09-09/WEB-PREVIEW/mobile.png`
- Create: `review/client-requirements-2026-09-09/WEB-PREVIEW/contract-test.txt`
- Modify: `review/client-requirements-2026-09-09/FINAL-STATUS.md`

**Interfaces:**
- Consumes the real local admin and public Vite surfaces.
- Produces non-destructive evidence that typing updates the iframe and no publish request occurs.

- [ ] Add a deterministic Playwright journey for section text and product name/price/image preview, desktop/mobile switching, local draft reload, discard, and publish-button separation.
- [ ] Run it against intercepted APIs and assert zero unplanned writes and zero horizontal overflow.
- [ ] Capture and inspect both PNG files; reject blank, clipped, wrong-route, or stale screenshots.
- [ ] Run the Impeccable detector once on changed UI targets and fix material findings.
- [ ] Run frontend tests, website tests, backend unified build, and migration preflight.
- [ ] Update the status and contract with exact results and fixture/live boundaries.

### Task 5: Independent review

**Files:**
- Create: `.superpowers/sdd/2026-09-09-noamany-master-upgrade/portal-live-preview-review.md`

**Interfaces:**
- Consumes implementation, tests, screenshots, and the approved design spec.
- Produces a Critical/Important review verdict.

- [ ] Dispatch a fresh reviewer with no implementation responsibility.
- [ ] Fix any Critical or Important findings in one bounded batch.
- [ ] Re-run affected tests/build and recapture affected evidence once.
- [ ] Record the final verdict and remaining live-data boundaries.
