# ONE80 Fitness Time Latest-Parity Design

**Date:** 2026-09-09

**Authoritative source snapshot:** `/Users/fatmaatefkasem/Desktop/Gyms/Fitnesstimegym`, whose newest relevant files were modified on 2026-09-08. The directory has no Git metadata, so file content and modification times—not a branch name—define the snapshot.

## Goal

Bring the latest operational sales, reception, member-search, and persistent-scanner behavior from the Fitness Time snapshot into ONE80 without importing Fitness Time identity, replacing ONE80 modules, changing the POS route family, or touching production data.

## Root Cause

The first sync inventoried domain-specific CRM, sales-team, trainer, printing, and member-app changes, but it did not audit cross-cutting shell and reception components. Consequently, the source's app-wide scanner provider, header control, USB keyboard-wedge listener, reception scan handoff, and several newer sales-workspace interactions were outside the original inventory even though the September 8 source contained them.

## Product Boundaries

- ONE80 remains the product and data-model authority.
- `/sales` and `/sales/*` remain the ONE80 POS family.
- Personal selling remains `/sales-portal`, with dedicated child routes for leads, renewals, results, and reminders.
- CRM persistence remains exclusively in `club_sales_crm_*`; the legacy `club_leads` table remains untouched.
- Existing ONE80 HR, payroll, Cafe, accounting, inventory, member extensions, receipt behavior, and user changes must be preserved.
- No Fitness Time names, storage keys, routes, colors, logos, or copy may ship.
- Database work, if required by a failing contract, must be additive and must not be applied to production.

## Architecture

### 1. Persistent Scanner Layer

Add a ONE80-owned scanner context around the authenticated app shell. It keeps the camera panel open across route changes and listens for USB/HID keyboard-wedge scans globally. Enter, Tab, and suffix-less bursts are supported. Normal typing inside inputs, textareas, selects, or editable regions is ignored.

The topbar owns a fixed scanner toggle with an accessible pressed state and visible active indicator. The scanner storage key uses the `one80.*` namespace. Event/kiosk routes that own specialized scanners are excluded from the global listener.

Every accepted global scan navigates to `/club/reception?scan=<encoded-code>`. Reception consumes the parameter exactly once, clears it with a replace navigation, searches using the current branch scope, and opens the resolved member. The camera scanner and handheld scanner share this handoff so they cannot double-submit.

### 2. Member Search and Scanner Identity

Numeric search is a code lookup first: normalize Arabic and Persian digits, rank an exact member code above prefix matches, and prevent incidental phone/code substring matches from hiding the intended member. One-character numeric codes are valid scanner/search input; name searches retain the existing minimum length.

ONE80's existing `gate_credentials` relation remains the scanner credential store. Member create/update/list/detail contracts expose `scannerCode` without creating a duplicate table. Credentials remain unique and leading zeroes are preserved.

Search results expose the current or most recent subscription period and last attendance needed by reception. Profile summaries retain ONE80's historical totals while showing the current subscription per renewal lineage.

### 3. Sales Portal Latest Parity

The September 8 Fitness Time sales workspace is merged into `frontend/src/pages/sales-portal`, not copied into the POS directory.

The portal will provide:

- a scanner shortcut that opens the same persistent scanner;
- 15-second refresh for live sales/lead data;
- server-side lead status filtering, debounced name/phone search, pagination, and stable numbering;
- next/previous and RTL-aware swipe navigation across lead pages;
- subscription context, member avatars, member-profile access, and guarded handling of stale lists;
- renewal filters, search, pagination, urgency ordering, one-click phone/WhatsApp actions, and follow-up creation;
- reminder completion and direct contact/profile actions;
- results and recent-member profile access;
- retained ONE80 hardening for loading, error, empty, clipboard, and responsive states.

Source query routes are translated to ONE80 routes. Source assumptions that conflict with ONE80's hardened reminder or renewal components are merged behavior-by-behavior rather than resolved through whole-file replacement.

### 4. Reception-Adjacent September Gaps

Only source behaviors proven missing by comparison and covered by tests are added: persistent-scan consumption, exact numeric search, scanner credential editing, last-visit/current-subscription context, and the source's member-profile affordances. Invitations, transfers, start-date editing, partial quick-service debt, or other adjacent flows are included only when the source contract is absent in ONE80 and its backend dependencies can be integrated without replacing ONE80's payment or subscription rules.

### 5. Data and Error Flow

- Scanner input → normalized opaque string → encoded reception URL → branch-scoped universal search → member selection.
- Sales portal filters → debounced server query → paginated CRM results → detail/follow-up dialog → targeted React Query invalidation.
- Missing camera permission does not disable USB scanning; the panel explains the fallback.
- Empty or malformed scans do nothing. Duplicate URL consumption and simultaneous navigation are guarded.
- External contact links are generated through tested helpers and never constructed from raw local phone strings.

## Testing

Implementation follows RED–GREEN cycles:

1. Pure scanner-model tests for persistence, route exclusions, URL encoding, Arabic digits, and empty scans.
2. Keyboard-wedge tests for Enter, Tab, suffix-less bursts, human typing gaps, editable targets, and disabled routes.
3. Static/integration shell tests proving provider placement and the topbar control.
4. Backend search tests proving exact/prefix code priority, leading zeroes, Arabic/Persian digits, branch scope, and scanner credential uniqueness.
5. Reception tests proving one-time `?scan=` consumption.
6. Sales workspace tests for route preservation, filters, pagination, navigation across pages, renewal ordering, contact links, and member-profile access.
7. Full backend/frontend suites, typechecks, builds, Prisma validation when schema changes, and `git diff --check`.

## Visual Quality

Impeccable's Operate-mode rules govern the shell and portal. The final visual pass covers desktop and 390px mobile layouts, topbar crowding, scanner panel layering over dialogs, keyboard focus, touch targets, dark mode, RTL/LTR, horizontal overflow, and loading/error/empty states. The mechanical detector runs once after all affected UI files are final.

## Delivery

Work is split into reviewable commits:

1. persistent scanner and reception/member-search integrity;
2. latest sales-portal parity;
3. any proven reception-adjacent September gaps;
4. verification ledger and final source-difference audit.

Existing uncommitted Cafe/POS/product-image files and local scripts remain unstaged. No deployment, branch integration, or production database action is part of this design.
