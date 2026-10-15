# Payroll integrity implementation plan

1. Add RED tests for progressive tax boundaries, missing/overlapping policies, line snapshots, reconciliation, run uniqueness, and CSV formula hardening.
2. Add effective-dated tax policy/bracket schema and immutable payroll-line tax snapshot columns.
3. Implement the pure tax calculator and database policy resolver.
4. Integrate tax into payroll computation, totals, slips, reports, and GL liability posting.
5. Make run creation atomic and add the database period uniqueness constraint.
6. Correct reconciliation to use actual posted journal amounts.
7. Harden bank CSV output.
8. Add the final-settlement domain and API with immutable calculation evidence and controlled lifecycle.
9. Apply and rehearse migrations; run targeted tests, backend typecheck, full suite, and update the master audit report.

