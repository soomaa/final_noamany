# POS Payment Mix and Shift Close Design

## Goal

Give cafe cashiers a fast configurable payment flow and a reliable thermal shift-close receipt that reconciles sales by the exact tender used, including internal employee and partner accounts.

## Product decisions

- The existing POS payment-method catalog remains the settings source of truth.
- Each catalog entry keeps a stable code and accounting base (`cash`, `card`, `wallet`, or `transfer`) while showing its custom name in the cashier, reports, and printed receipt.
- Completed sales persist a snapshot of the selected catalog method on every payment line. Renaming or disabling a method never rewrites historical receipts.
- Mixed payment supports two or more enabled methods, not only cash plus card. The UI always shows the remaining amount and prevents completion until it is zero.
- Employee/partner deferred purchases are reported as `CL — حساب موظف/شريك`; they are not counted as collected cash.
- Historical sales without a catalog snapshot fall back to their existing base method, so deployment does not require data rewriting.
- Shift close is based on the actual `shift_session_id`, including cross-midnight sessions. It reports completed invoices, refunds, cancellations, discounts, tax, gross sales, collected total, internal-account total, and payment breakdown.
- The thermal document is monochrome, Arabic-first, legible on 80 mm and safe on 58 mm. Branding comes from POS receipt settings and is never hard-coded to ONE80 or GC Gym.

## Cashier experience

1. The cashier chooses a payment method from large enabled-method buttons.
2. Choosing “تقسيم الدفع” opens allocation rows. Each row selects any enabled method, accepts an amount, and may accept a reference for non-cash methods.
3. “إضافة وسيلة أخرى” adds another allocation. A quick “ضع المتبقي” action fills the current remainder.
4. The sale button stays disabled while the allocations do not equal the payable total.
5. The printed customer receipt shows the exact payment split.

## Settings experience

- The payment tab uses editable method cards with name, stable code, accounting type, mixed-payment eligibility, reference requirement, enabled state, and ordering.
- System defaults cover Cash, Visa/Card, Bank Transfer, InstaPay, and E-Wallet. Staff/partner account remains system-derived so it cannot incorrectly post as collected money.
- Disabling a method removes it from new checkout choices but preserves all historical reporting.

## Shift-close experience

- Every shift card on the shift invoice board has “ملخص وطباعة الوردية”.
- The preview prioritizes reconciliation: invoice counts and status, sales/discount/tax totals, exact tender rows with count and amount, internal accounts, then cash-drawer figures.
- The printer action produces one compact receipt containing branch, shift, cashier, start/end, print time, payment breakdown, general totals, and a signature line.

## Data and API

- `sales_pos_payments` gains nullable snapshot fields for catalog id/code/name. Existing rows remain valid.
- Sale creation accepts a catalog method id on single and mixed payment lines and validates the exact enabled rule.
- `GET /shift-sessions/:id/close-report` returns a stable report DTO used by both screen and print.
- Report aggregation is a pure helper with unit tests for exact custom methods, legacy fallback, mixed tenders, refunds/cancellations, and internal accounts.

## Safety and compatibility

- Migration is additive only; no production rows are deleted or rewritten.
- Totals are computed in integer cents in the new allocation helpers to avoid floating-point remainder errors.
- Server validation is authoritative; the frontend validation is convenience only.
- Permissions reuse shift view/print permissions and POS-admin create/update permissions.

