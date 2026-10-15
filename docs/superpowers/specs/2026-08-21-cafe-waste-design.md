# Cafe Waste and Loss Design

## Goal

Add a dedicated Arabic-first cafe page named **الهالك والفاقد** that records raw-material, ready-product, packaging, and prepared-product waste immediately while reusing ONE80 inventory, costing, accounting, branch scoping, and audit trails.

## Approved product decisions

- The page is independent inside the cafe navigation but does not maintain a second stock ledger.
- Saving is immediate and does not require manager approval.
- Prepared products and variants expand to their recipe ingredients before stock is deducted. Manufactured/sub-recipe ingredients recursively expand to base ingredients.
- Waste reasons are global across all branches.
- A reason may be created inline while recording waste and then appears in reason settings.
- If requested waste exceeds stock, the UI offers: reduce to available stock, or continue and allow a negative balance.
- A wrong record is never deleted. It is reversed with a required reason; stock and accounting are restored and both records remain auditable.

## Page experience

Route: `/club/cafe/waste`.

The page contains four tabs:

1. **تسجيل هالك** — prominent search, category tabs (all, raw materials, ready products, prepared products, packaging), responsive item cards, and a right-side registration sheet.
2. **السجل** — date, branch, item, entered quantity/unit, reason, notes, cost, creator, status, components, and reversal action.
3. **التحليلات** — total active waste cost, count, reason ranking, top wasted selected items, component costs, daily trend, and user/branch summaries.
4. **أسباب الهالك** — create, rename, activate, and deactivate global reasons. Historical records retain a reason-name snapshot.

The registration sheet displays source item, branch stock location, available stock, compatible entry units, reason selector, inline reason creation, notes, expanded component preview, cost preview, and before/after balances. Prepared products with variants require a variant choice before preview.

## Data design

Add `cafe_waste_reasons` for the global configurable list. Add `cafe_waste_records` as the user-facing waste event that links one selected catalog item to its approved inventory damage transaction. It stores source kind and IDs, name snapshot, entered quantity/unit, reason ID and name snapshot, notes, cost, creator, branch/warehouse, lifecycle status, and reversal audit/link fields.

The authoritative stock deductions remain in `inv_transactions`, `inv_transaction_items`, and `inv_movements`. Ingredient rows are stored as transaction items in base units. The waste record preserves the selected prepared/ready/raw source so reports do not misleadingly show only ingredients.

Migration is additive only: two new tables, foreign keys, and indexes. Existing inventory, cafe, finance, and sales rows are not rewritten or removed.

## Backend behavior

Expose a dedicated `/cafe-waste` controller guarded by `club.cafe.waste` permissions and normal branch scoping.

- `GET /catalog` searches active cafe products and inventory products and returns normalized cards with stock, unit, type, image, variants, and preview metadata.
- `POST /preview` validates quantity/unit/source and returns merged base-component deductions, costs, current balances, after-balances, and shortage flags without mutation.
- `POST /records` repeats all preview validation server-side, creates an approved damage transaction and waste record, applies stock with the explicit `allowNegative` choice, posts the existing inventory-damage journal and system expense, and commits everything atomically.
- `GET /records` returns branch-scoped paginated history with creator/reverser names and components.
- `POST /records/:id/reverse` atomically claims an active record, creates an approved receipt transaction for the same components, restores stock, reverses the original inventory-damage journal, soft-reverses the display-only system expense, and stamps reversal audit fields.
- Reason CRUD uses global records; deletion is represented by deactivation.
- `GET /analytics` aggregates only active, non-reversed waste records and supports date/branch filters.

Reference generation is server-side and collision-safe. All create/reverse operations are conditional and idempotency-safe against double clicks.

## Units and recipes

Mass units support `g`, `kg`, and `oz`; volume units support `ml`, `L`, and `fl_oz`; piece items support `piece`. Packaged materials may be entered by a configured package or compatible base family. The server converts to inventory base units and rejects incompatible units or non-positive quantities.

Prepared product quantities are pieces. Variant recipes override base recipes. Nested manufactured ingredients are expanded with cycle/depth protection. Duplicate base ingredients are merged before cost, shortage, transaction, and reporting calculations.

## Reporting and accounting

The waste page analytics distinguish the selected item from deducted components. Cafe main reports keep a combined waste total while showing a breakdown for manual waste versus automatic preparation/refund waste, avoiding double counting. Reversed waste is excluded from current totals but remains in history.

Inventory damage accounting remains: debit operating expense, credit inventory. Reversal uses the ledger's existing reversal mechanism and restores stock; the operational expense mirror is marked reversed/soft-deleted so finance summaries match the ledger.

## Permissions and safety

Create the `club.cafe.waste` page resource. `view` opens the page and reads history/analytics/reasons; `create` records and reverses waste and can add inline reasons; `update` manages reason names/status. Users remain constrained to their permitted branches. Every mutation records the authenticated user.

## Error handling

- Missing recipes, incompatible units, missing costs, invalid branches, and inactive/missing sources return Arabic validation errors before mutation.
- A negative result requires `allowNegative: true`; otherwise the server rejects even if the client is bypassed.
- Recipe preview is advisory; create recalculates inside the transaction to prevent stale client data.
- Partial stock, waste, finance, or accounting changes cannot commit.

## Verification

Backend service tests cover unit conversion, recipe/variant expansion, nested ingredient merge, shortage policy, atomic create inputs, reason creation, reversal guards, and analytics exclusion of reversed records. Prisma validation/generation, backend tests/typecheck/build, and frontend typecheck/build must pass. The final UI is manually checked in RTL at desktop and narrow widths.
