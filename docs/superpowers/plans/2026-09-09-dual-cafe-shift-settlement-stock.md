# Dual-Cafe Shift Invoice, Settlement Evidence, and Stock Safety Plan

**Goal:** Add date-selected consolidated shift printing, settlement order evidence, and visible inventory-posting safety to ONE80 and ONE MILLION without modifying historical business data.

**Projects:**

- `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80`
- `/Users/fatmaatefkasem/Desktop/caffe copy`

## Task 1: Date-aware shift board contract

- Add failing service tests for operating-date filtering, range validation, and a bounded date window.
- Extend the shift-board query contract with `dateFrom` and `dateTo` while keeping the recent 2/3/5 shortcuts.
- Run the focused backend tests in both projects.

## Task 2: Consolidated shift report and print

- Add failing pure-function tests using two literal shift reports and verify summed payments, products, invoices, settlements, and preserved per-shift drawer details.
- Implement the report combiner and the combined print layout.
- Extend the shift report dialog and board UI with selection, loading/error states, and the consolidated action.
- Run focused frontend tests in both projects.

## Task 3: Settlement order evidence

- Add failing backend tests proving listed statements include linked sale items.
- Extend the statement mapping contract without a migration.
- Add failing frontend behavior/model tests for readable invoice/item summaries.
- Add expandable invoice and statement rows plus the pre-settlement evidence panel.
- Run focused backend and frontend tests in both projects.

## Task 4: Inventory tracking safety

- Add a failing frontend test for the missing ONE MILLION inventory-tracking control and warning model.
- Restore the existing branch setting control in ONE MILLION and add the disabled-tracking warning to both POS screens.
- Add/extend tests proving customer, employee, and partner sales all use the same stock movement when tracking is enabled.
- Prepare and run a read-only production diagnostic; do not alter stock quantities or historical invoices.

## Task 5: Verification and packaging

- Run focused tests, full typechecks, production builds, and the Impeccable detector for changed UI targets in both projects.
- Review diffs for brand leakage and unrelated-file overlap.
- Package separate deployment archives and provide exact SSH commands with rollback/verification instructions.
