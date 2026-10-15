# Payroll integrity design

Date: 2026-08-26

## Goal

Make payroll deterministic, auditable, transaction-safe, and portable without embedding an unverified jurisdiction's tax law in application code.

## Decisions

1. Income tax is calculated by a versioned, effective-dated progressive policy stored in the database. Payroll lines retain the exact policy version and calculation breakdown so later policy edits cannot rewrite history.
2. No statutory rates are silently assumed. A payroll period must resolve exactly one published policy; absence or overlap is a blocking configuration error. This is safer for a reusable HR reference deployed across different jurisdictions.
3. The taxable base is explicitly derived from gross taxable earnings, employee insurance relief, annual allowance, bracket rates, and credits. All amounts are rounded deterministically to currency precision.
4. A run is unique by `(year, month)`. Header creation and line persistence are one transaction, with a row lock/unique constraint protecting concurrent creation.
5. Payroll accrual posts income tax to a dedicated payable liability, not back to salary expense. The line equation is checked before posting.
6. Reconciliation compares payroll net to both the payroll payable journal and the actual posted bank journal. Workflow status is never substituted for money.
7. Bank CSV cells are protected against spreadsheet formula injection while retaining RFC 4180 quoting.
8. Final settlement is a separate immutable record: worked-period pay, unused-leave compensation, end-of-service benefit, recoveries, tax, net, calculation snapshot, approval/posting state. Ordinary payroll must not pretend pro-rata pay alone is a full settlement.

## Compatibility

- Existing payroll runs remain readable; new nullable snapshot columns are additive.
- Existing data is not assigned invented tax amounts.
- A published policy is required only for a new compute/create action.
- Historical lines are never recomputed implicitly after approval.

## Verification

- Pure tax-engine boundary and rounding tests.
- Concurrency/transaction contract tests for run creation.
- GL balance and tax-liability tests.
- Reconciliation tests prove that missing/partial bank journals fail.
- CSV injection tests.
- Migration apply, drift check, fresh-database rehearsal, typecheck, targeted and full suites.

