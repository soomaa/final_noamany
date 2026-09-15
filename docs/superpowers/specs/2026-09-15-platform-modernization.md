# Platform Modernization Specification

## Approved scope

1. Reception and branch-manager evaluations are independent workspaces with their own items, entry screen, and reports. Reports filter by employee name, arbitrary date range, and branch.
2. Payment methods become one active/inactive reference catalog used by every payment flow.
3. Branch and gender scope is mandatory in database-facing services, APIs, UI selectors, and reports.
4. The online membership flow supports calorie calculation, subscribe-now, receipt upload, admin review, and atomic promotion into the primary membership tables.
5. Targets use four tabs; cafe reports separate Protein, Bar, and management withdrawals; locker inventory is reviewed and auditable.
6. Website/store/barcode changes preserve the removed legacy ticker, improve the store/cart, and show member photo, recent subscriptions, locker subscriptions, and explicit check-in without retired member categories.
7. Detailed user permissions are presented as pages grouped and ordered by department. A job role supplies the baseline; per-user allow/deny exceptions override it. Actions include view, create, update, delete, approve, reject, export, and print where applicable. Effective view permission controls the sidebar, search, routes, and employee dashboard.
8. Tanta and Tanta sub-branch remain distinct operational branches for package prices and subscription selection, but belong to one canonical branch family for member code sequence, access, duplicate detection, member-list display, and aggregate reports. The family is configured in data, never hard-coded by numeric IDs.
9. Member creation removes manual marketing/follow-up assignment. Registrar/audit identity remains automatic; historical marketing data is preserved.
10. Package pricing is branch-specific. A package has an explicit linked-to-sessions yes/no flag; when yes, session count is required. It also has an explicit class-percentage yes/no flag; when yes, a percentage from 0 through 100 is required. The percentage allocates that share of the net subscription value to classes and is snapshotted on subscription creation.

## Architecture rulings

- Physical branch identity is retained for operational pricing and subscriptions.
- `canonical_branch_id` identifies the branch family. A root branch points to itself; a sub-branch points to its canonical root.
- Backend services are the authority for family membership, available packages, and prices. Client-submitted prices are never trusted.
- Existing modern RBAC tables are the single authorization source. Legacy page permissions may be read only during compatibility migration and must not drive new navigation.
- Database work is forward-only and additive. No production migration is executed until it passes against a cloned database and a verified backup exists.
- New production behavior follows red-green-refactor tests.

## Delivery order

The first parallel wave contains two isolated tracks:

- Track A: branch family, member onboarding, branch prices, session/class fields, and subscription branch selection.
- Track B: detailed RBAC management and department-grouped employee dashboard.

Later waves cover database reconciliation, mandatory branch/gender scoping, payment methods, evaluations, online subscriptions/app, targets/cafe/lockers, website/store/barcode, and final regression/release.
