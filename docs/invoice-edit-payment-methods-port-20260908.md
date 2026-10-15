# ONE80 invoice editing and payment methods — 2026-09-08

Merged the completed-invoice editor and payment-method displays from the current ONE MILLION café code into ONE80's existing backend and frontend.

- `/sales/drafts`: Edit Invoice uses `gym-sales.sales.drafts:update` and opens the same saved invoice in POS. Invoice ID/number/date/branch/account remain fixed; retained prices, tax, item feedback and historical stock cost are preserved. Confirmation saves the revised invoice and only settles payment/stock/accounting differences. Repeated/stale submissions are rejected. Original shift must remain open; invoices included in statements/settlements cannot be edited.
- `/sales/drafts`: invoice method/amount column and per-shift payment totals, including split payments.
- `/club/cafe/reports`: payment-method amounts, percentages and total under the existing branch and operating-date filters. This is ONE80's existing café-report route.
- Reversals use the latest locked invoice and net movement history. Statement creation locks and re-reads candidate invoices. Existing ONE80 finance revenue rows are updated rather than duplicated.
- Kept ONE80 branding, member lookup/scanner, print bridge and print permissions, account-settlement sections and attribution, current shift safeguards, per-product free-drink allocation, and HR/payroll/final-settlement ledger methods.
- Added narrow read permissions for the editor's products/categories/payment methods/employee options without granting unrelated write or HR access.

Validation: 190 backend suites / 846 tests passed; frontend standard tests (69) and café-port tests (35) passed; backend/frontend production builds passed. Mocked-API browser tests passed the invoice-only view/update workflow, quantity increase/decrease, difference-only payment/refund, stale revision prevention, updated receipt, payment totals and report filters, empty/English states, and desktop/tablet/mobile layouts. Impeccable layout detector reported no findings; screenshots inspected.

No new schema migration is introduced by these two features. The ZIP retains the previous café update's existing migration and normal ONE80 server deployment scripts. No local or production database was modified, and no live deployment was performed.

Original changed files are backed up at `/tmp/one80-invoice-payment-port-backup-20260908`; the source hash inventory records other files for preservation checks. Deploy `one80-invoice-edit-payment-methods-20260908.zip` using the existing `server-deploy.sh` without maintenance flags.
