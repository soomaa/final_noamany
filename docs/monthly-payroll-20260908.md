# ONE80 — المرتبات الشهرية (2026-09-08)

Implemented in `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80`.

- New calendar-month runs retain actual month boundaries and planned payout date. Existing NULL periods preserve the historical 26–25 window.
- Finance preparation is named المرتبات الشهرية. Employee sheet supports independent money deductions, increases, bonuses, evaluation and target awards, per-action notes, actor/time history and explicit reversals. History scrolls independently and touch/keyboard controls work on tablet/mobile.
- Saved month/employee IDs persist. Recomputing and submitting for review retains manual events, imports old private overrides once, refreshes attendance, and excludes future/unfinished days from absence. Edits after submission require fresh review. Approval locks editing.
- Café monthly balances are explicitly selected or deferred. Selected invoices are reserved uniquely across months. Their editing/refund/statement collection is blocked until released. Atomic payroll posting checks the salary snapshot and invoice balance before marking paid; credits receivables without reducing salary expense or creating cash/duplicate sales. Generic unposting of payroll that settled café debt is blocked to avoid reopening an already collected debt incorrectly.
- Existing finance and HR permissions/scopes remain authoritative; monthly edits additionally require the existing payroll.runs:update permission.
- Migration is additive; historical payroll amounts and periods are not rewritten. No live database or server deployment was performed.

Verification: backend 193 suites / 866 tests passed; frontend 69 tests and café regression 35 tests passed; backend/frontend production builds passed; Prisma schema validated/generated. Mocked-browser checks passed at 390, 1024 and 1440 px, including history scroll, form submission, café choice and approved read-only mode. No horizontal overflow or browser errors. Screenshots reviewed; Impeccable detector reported no findings for changed finance UI. Touch targets, focus, labels, RTL and token-based colors reviewed. Existing build chunk-size warning remains.

The migration and backend accounting behavior were checked by schema validation and automated service/ledger tests, not against a live production database. Planned payout dates do not automatically send bank payments; existing confirmation workflow is retained.

Deployment archive includes built frontend, backend source, migrations, and ONE80 deploy scripts. Excludes .env, uploads, backups, node_modules and database dumps.
