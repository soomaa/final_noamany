# Subscription Renewal Port Design

## Purpose

Bring the approved PHAROS subscription-renewal lifecycle to FITNESS TIME and One80 without replacing either edition's current codebase, branding, deployment model, database, or edition-specific capabilities.

## Approved Product Behavior

- Renewal always continues the same package; the employee cannot select another plan from the renewal flow.
- The new period uses the package's current branch price and current session-price matrix at the time of renewal.
- The employee never enters renewal start or end dates.
- A renewal bought before expiry is collected immediately and queued after the last existing period.
- If the current session quota is exhausted early, the direct queued renewal starts that day. Its complete paid duration is preserved, and later queued periods shift by the same number of days.
- Every renewal is a new subscription row linked to its predecessor. Existing subscription, attendance, receipt, discount, refund, transfer, and accounting history remains unchanged.
- The current period's outstanding balance stays separate from the new period's payment.
- Frozen subscriptions cannot be renewed until they are unfrozen.
- Regular packages, special classes, and private packages use the same server-authoritative renewal flow when their current edition supports those package types.

## Porting Decision

Each target edition remains the source of truth for its own files. The work is a selective functional port, not a directory copy from PHAROS.

Rejected approaches:

1. Replacing each target with the PHAROS tree would delete target-only migrations, security helpers, payroll and HR hardening, portable-mode boundaries, FITNESS TIME sales and printing flows, brand adapters, and deployment gates.
2. Shipping only the PHAROS ZIP to all installations would overwrite visible identity and could make migration histories diverge from each live database.

Selected approach:

1. Add the renewal-chain schema and additive migration to each target's existing Prisma history.
2. Port the focused lifecycle and renewal services, adapting dependencies to the target's current helpers and module graph.
3. Integrate quota promotion into every session-consumption path that exists in that edition.
4. Add the renewal dialog and page integration to the target's current subscription screen while keeping its existing components, routes, translations, and design tokens.
5. Run each edition's complete verification and packaging workflow independently.

## Data Model and Migration

Add a nullable, unique `renewed_from_subscription_id` self-reference on `club_subscriptions`, with `ON DELETE SET NULL` and `ON UPDATE NO ACTION`. Existing rows remain valid and unlinked; no legacy chain is inferred.

The migration is additive only:

- one nullable integer column;
- one unique index that guarantees a predecessor has at most one direct successor;
- one self-referencing foreign key.

No table, column, customer row, receipt, attendance record, or existing migration is removed or rewritten. Each target keeps all of its target-only migrations.

## Backend Integration

### Renewal lifecycle service

A focused lifecycle service owns bounded chain traversal, tail discovery, cross-member and cross-branch integrity checks, early-quota promotion, descendant date shifting, and synchronization of the member's active-period snapshot.

The service must be idempotent and transaction-aware. Promotion runs in the same transaction as the final session consumption where the target flow permits it. A chain cycle, cross-member link, cross-branch link, frozen successor, or chain longer than 100 nodes stops with an actionable conflict instead of attempting repair.

### Renewal quote and commit service

The server calculates the same package's current price, repeated session count, current validity, automatic dates, discount, net amount, payment split, and queue mode. The client cannot submit a target package or date override.

Commit runs under the edition's existing MySQL locking convention, recalculates the quote inside the transaction, rejects a stale quote, appends after the real chain tail, creates the receipt and split payment rows, posts the existing renewal journal entry, and writes the existing audit and automation events. Any receipt, journal, or persistence failure rolls back the entire renewal.

### Existing service integration

- The existing renewal controller delegates to the focused renewal service.
- A side-effect-free `POST /club-subscriptions/:id/renew/quote` endpoint provides the authoritative preview.
- The same-package duplicate guard returns structured `SUBSCRIPTION_RENEWAL_REQUIRED` context with the existing subscription ID.
- Reception attendance, explicit session use, and administrative session correction promote a queued successor after the predecessor reaches its quota.
- Existing target-specific authorization, branch scope, sales attribution, receipt printing, central printing, payroll, HR, and member-mobile behavior remains intact.

## Frontend Integration

The current subscription page gets one dedicated responsive renewal dialog. The dialog shows the package name, current price, repeated session count, calculated dates, schedule reason, discount, payment split, new remaining amount, and old debt warning. Package, session count, start date, and end date are read-only.

The existing row action becomes “تجديد / تمديد”. A structured same-package duplicate response opens the renewal dialog rather than leaving the employee with a generic error.

The dialog uses each edition's existing UI primitives, payment and discount components, translations, typography, colors, focus behavior, and responsive rules. FITNESS TIME keeps its black/yellow/red identity. One80 keeps its adapters, brand assets, locale dictionaries, and portable boundaries. No PHAROS name, logo, color token, deployment URL, or API default is copied into either edition.

## Edition Preservation Rules

### FITNESS TIME

- Preserve `PRODUCT.md`, `DESIGN.md`, `.impeccable`, `frontend/public`, `frontend/index.html`, package identity, FITNESS TIME deployment scripts, secure release gates, current SQL ownership, and all FITNESS TIME-only migrations and modules.
- Do not delete sales CRM, club service debts, payroll approval, thermal printing, member checkout, credential hardening, or edition-scope code.

### One80

- Preserve `frontend/src/adapters`, `frontend/src/ports`, portable frontend/backend code, portable Prisma schema and migrations, private upload handling, HR hardening, payroll and settlement modules, One80 assets, package identity, and server scripts.
- Do not delete any existing migration or target-only source file.

## Verification

For each edition independently:

1. Capture a baseline full test, typecheck, Prisma validation, and production build before code changes.
2. Add focused tests for current-price quoting, no editable package or dates, chained advance renewals, old-debt separation, frozen rejection, duplicate routing, early quota promotion, descendant shifting, and idempotency.
3. Run focused tests during implementation, then the full backend and frontend suites.
4. Run Prisma validation and generate, TypeScript checks, and production builds.
5. Run the Impeccable detector once on the changed UI and perform one desktop and one small-screen renewal-dialog review using the target's actual theme.
6. Create one code-only deployment archive per target using its own release workflow.
7. Verify each archive's compression, required migration and source/build artifacts, and absence of `.env`, database dumps, uploads, backups, Git metadata, and imported member spreadsheets.
8. Produce a SHA-256 checksum and the target-specific safe deployment command.

## Release Deliverables

- `FITNESS-TIME-subscription-renewal-20260830.zip`
- `one80-subscription-renewal-20260830.zip`
- A checksum for each archive.
- A deployment command for each edition that takes a pre-deploy database backup, applies additive migrations, rebuilds, restarts the correct process, and checks application health without importing or replacing live data.

## Out of Scope

- Replacing either target with the complete PHAROS directory.
- Copying PHAROS branding, environment files, data, uploads, domain settings, ports, or process names.
- Removing or reconciling unrelated target-only features and migrations.
- Applying renewal money to an old debt.
- Changing plan during renewal.
- Allowing manual renewal dates.
- Deploying to either live server before its target archive passes verification.

## Acceptance Criteria

- Both targets expose the same approved renewal behavior while retaining their own brand and edition features.
- No target-only source or migration is deleted.
- Existing data remains untouched by local preparation and code-only packaging.
- Each target passes its complete test and production-build workflow.
- Each deployment archive contains the additive renewal migration and excludes secrets and operational data.
