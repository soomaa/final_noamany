# Member Subscription Utilization Design

## Goal

Make the existing member-attendance screen answer two questions without adding a duplicate page: who attended and how each member is using the current or historical subscription.

## Approved behavior

- Keep `/club/members/attendance` as the canonical screen; `/reports/club/attendance` continues redirecting there.
- Add an `استخدام الاشتراكات` view beside the existing attendance log views.
- Default utilization to active subscriptions. Allow `all`, `active`, `frozen`, `upcoming`, and `expired` filters.
- Treat `remainingDays` as calendar days from today to the subscription end date; visits never reduce calendar days.
- For session packages show total, used, and remaining sessions separately.
- Show member, code, branch, subscription, start/end dates, total days, remaining days, visit days, visit entries, and last attendance.
- Clicking the member opens the existing `MemberProfileSheet`, where exact attendance dates and check-in/out times already live.
- A user with `club.members.attendance:view` may load the read-only profile summary. This does not grant member-list access or create/update/delete actions.
- Preserve branch isolation: admins may select all/one branch; other users are locked to their login branch.

## Data and implementation boundaries

- Add a read-only `/club-attendance/subscription-utilization` endpoint; it performs no database writes and needs no migration.
- Reuse `buildMemberProfileSummary` for all day/session/attendance calculations so the aggregate report and member drawer cannot disagree.
- Paginate server-side after applying the computed status filter.
- Do not add a sidebar link, route, page, database column, seed, or migration.

## UX states

- Loading, error/retry, empty, pagination, search, branch scope, and status filtering use existing components.
- Attendance date/status filters remain visible only for attendance-log views; utilization gets subscription-status filtering instead.
- The member name is an explicit accessible button labeled to open the profile.

