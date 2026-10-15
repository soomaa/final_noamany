# ONE80 café update — 2026-09-08

The current ONE MILLION café workflow has been merged into ONE80, retaining ONE80 branding, gym/member functionality, native print bridge, existing financial ledger and HR payroll engine.

## Included behavior

- Searchable recipe ingredients in products/raw materials; compact product variants with separate recipe editing.
- Product list uses page scrolling, smaller product cards and a wider sticky order cart.
- A single review-and-pay action opens editable compact order rows with corner removal, quantity controls and payment.
- Payment supports methods, tendered amount, change/remaining amount and receipt comment.
- Optional wider touch keypad works together with physical keyboard, including Arabic/Persian digits and numpad. Outside click dismisses it.
- Independent employee discount and daily free-drink settings, employee identification and eligible categories. Backend revalidates daily usage across shifts, branches and held orders.
- Open branch shifts are visible for handover; active receiving users of any role can be selected with the existing identity/branch checks.
- Historic shift invoices reprint using the POS receipt, retaining employee/free-drink information. Transparent ONE80 logo uses its natural proportions at 22 mm wide, tested on 58/80 mm receipts.
- A separate café dashboard with readable filters and totals; the original HR dashboard remains.
- Café sales, costs, reversals and eligible drawer expenses reconcile into finance registers with stable source identities. Existing ledger entries are retained rather than posted twice.
- Finance salary preparation/approval pages use existing ONE80 HR runs. Tax, insurance, deductions, loans, commissions, period locks and bank confirmation follow the original HR workflow; no second salary database or duplicate payment path was introduced.

## Data and deployment

The new versioned migration adds three employee-allowance columns and one index. It checks for their existence before adding them. No migration was executed against local or live data during development.

The normal existing `server-deploy.sh` workflow backs up the live database, applies migrations, syncs permission definitions, builds the backend and restarts ONE80. It also reconciles existing café/payroll finance projections using stable source keys. Use the script without maintenance/reset flags.

`package-cafe-update.py` packages the built UI and allowlisted backend code/configuration. It excludes environment files, uploaded data, database backups and local dependency directories. The production environment and uploads remain server-owned.

## Verification

- Backend: 181 suites, 776 tests passed.
- Frontend: 60 standard tests and 26 café-port tests passed.
- Backend and frontend production builds passed; Prisma schema validated.
- Browser checks used mocked API responses: desktop/tablet/mobile POS, mixed keyboard/touch entry, editable review, payment submission, settings, historical receipt printing, dashboard and payroll permission/bank-confirmation states.
- Receipt rendering checked at 58 and 80 mm with the existing transparent ONE80 logo.
- Existing source files compared with the pre-port backup; gym/member and HR engine files were preserved.

Browser mocks do not verify the live database, printer hardware, production permissions or production deployment. No live deployment was performed.
