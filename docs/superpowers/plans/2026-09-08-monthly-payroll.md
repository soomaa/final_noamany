# Monthly payroll implementation plan

Target: ONE80, existing canonical HR payroll and finance workspace. Preserve previous café/invoice work and branding. No live data changes/deployment.

1. Persist calendar boundaries and planned payout date on new runs; old runs retain historical 26–25 period. Actual month lengths, calendar-aware engine and post settlement windows.
2. Append per-employee monetary events with actor, timestamp, note, request identity and reversal reference. Recompute using saved events; retain employee line IDs; serialize editing/review/approval against the same header lock.
3. Explicit café debt allocation: reserve exact outstanding employee orders, allow defer before approval, reject duplicate collection/edit while reserved. Settle only in atomic payroll posting; credit employee receivables instead of reducing salary expense. Never fabricate cash movement.
4. Employee sheet: earnings/deductions, adjustment form, café decision and independently scrollable history. Editable until approval with permissions enforced on server. Egyptian monthly payroll labels; payout date visible.
5. Regression tests for periods, additive events, reversal/idempotency, closed states, café reservation/settlement, ledger balance; builds, UI audit, package and deploy command.
