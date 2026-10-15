# Dual-Cafe Shift Invoice, Settlement Evidence, and Stock Safety Design

## Scope

Apply the same operational behavior to ONE80 and ONE MILLION while preserving each product's branding and existing data. The work covers the shift-invoice board, employee/partner settlements, and POS inventory safety. It does not merge, delete, or rewrite historical invoices.

## Shift invoice board

- Keep the current recent-shift shortcuts, and add a business-date range filter based on `sales_shift_sessions.session_date` so overnight shifts remain assigned to their operating day.
- In date-range mode, return all matching accessible sessions within a bounded range and allow the operator to select any subset.
- Add a read-only consolidated preview/print action. It combines the selected shift reports into one document with included shifts, payment totals, products, invoice details, refunds/cancellations, internal accounts, account settlements, and per-shift drawer figures.
- The consolidated document is derived at read time. It creates no invoice, statement, settlement, stock, or accounting rows and leaves each source invoice unchanged.

## Employee and partner settlement evidence

- Keep the existing account/date filters and statement lifecycle.
- Make every account invoice expandable to show ordered items and quantities.
- Make every issued or settled statement expandable to show its immutable linked invoice list, dates, amounts, and item details.
- Show the same linked-order evidence inside the final settlement dialog before the operator confirms collection.
- No schema change is required; the statement-item relation already preserves the linked invoice ids.

## Inventory safety

- Guest, employee, and partner/CL sales continue to share one stock-posting path.
- Restore the branch inventory-tracking control in ONE MILLION, where the backend setting exists but the UI currently cannot display or change it.
- When tracking is disabled, the POS must show a prominent operational warning so a cashier-only sale cannot silently look like an inventory-posted sale.
- Deployment diagnostics are read-only first: inspect the effective branch setting, recent water invoices, `inventory_posted`, warehouse ids, and matching inventory movements. Historical stock is never auto-repaired; any reconciliation is a separate, explicit stock-count action.

## States and constraints

- Date range validation is server-side and client-side; start cannot exceed end and the range is bounded to prevent unbounded payloads.
- Empty, loading, retry, permissions, long Arabic names, RTL/LTR, and narrow-screen overflow are handled.
- Combined printing is disabled until at least one shift is selected and all selected reports load successfully.
- Existing dirty working-tree changes are preserved; only task-related files are edited.

## Acceptance criteria

1. Selecting September 1-2 lists sessions whose operating date is in that range, including overnight sessions, and a selected subset prints as one detailed consolidated shift document.
2. The combined action performs only GET/read operations and produces no database mutations.
3. An employee or partner statement visibly identifies every included order and its items before and after settlement.
4. A CL sale posts stock exactly like a guest sale whenever tracking is enabled.
5. An operator sees an unmistakable warning when the effective branch setting disables inventory tracking, and ONE MILLION exposes the setting control.

