# ONE80 monthly salaries

Finance and HR use the same `hr_mosayer` / `hr_mosayer_details` identities and authoritative payroll engine. The finance UI is named **المرتبات الشهرية**.

New runs store actual calendar boundaries and a planned payout date (default month end). Null boundaries on historical runs retain the old previous-26/current-25 interpretation. Planned payout is not proof of bank payment. Opening a month never counts future dates or today's unfinished shift as absence.

`create → adjustments → submit/recompute → review → approve → post → bank → bank-sync`

Money events are append-only: deduction, increase, bonus, evaluation, target, reversal. Each has its own note, actor snapshot, timestamp and request identity. A correction reverses the referenced event once. Saved legacy overrides are imported once on first edit/recompute. Detail IDs remain stable on recompute. Submitting refreshes attendance and components while retaining events. Edits serialize with approval on the payroll header and reset review; approved runs are locked.

Café monthly debts are explicitly allocated per employee and exact invoice (unique allocation per sale). Deferring releases the allocation; new purchases are never silently included. Selected invoices cannot be edited, refunded, reallocated or collected directly. Posting verifies allocation amounts against both invoice balances and salary snapshots, then marks the invoices/statements paid in the same transaction as payroll accrual. Café deductions credit receivables, not salary expense; they never create cash drawer receipts or another sale. Runs that settled café debt cannot be unposted by the generic payroll reversal path. History-bearing runs cannot be deleted.

Permissions: reads require finance view plus `payroll.runs:view`; monthly changes require finance update plus `payroll.runs:update`, with HR scope enforced. Existing separate create/approve/execute permissions and bank confirmation remain unchanged.

Migration `20260908003000_monthly_payroll_events` adds period/payout fields, event history and invoice allocations. It ensures transactional payroll tables and does not rewrite historical amounts or periods. No reset/reseed is required.
