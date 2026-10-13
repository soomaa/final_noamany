# Cross-Branch Club Access Design

## Goal

Let a member whose home branch is `فرع الجلاء- شبين الكوم` or `فرع البر الشرقي- شبين الكوم` be found, sold a subscription, and checked in at either branch without changing the member's home branch or silently changing the operator's selected branch.

## Terminology and invariants

- **Home branch** is `club_members.branch_id`; it is part of the member's identity and never changes during lookup, sale, or check-in.
- **Transaction branch** is `club_subscriptions.branch_id`; it is the branch selected in the new-subscription form and owns the receipt/revenue.
- **Attendance branch** is the branch at which a barcode is scanned and must be stored on the attendance record.
- A **branch group** is a symmetric set of branches that may share member lookup and active-membership access. The initial group is the two Shebin El Kom branches.
- A lookup must never mutate the selected transaction/operating branch.

## Data model

Add configurable `club_branch_groups` and `club_branch_group_members` tables. A branch may be a member of one active club-access group. The initial migration creates the `شبين الكوم` group and adds the two named branches only when both exist.

No duplicated member, subscription, or attendance row is created for cross-branch access. Group membership is the authorization relationship.

## Required behavior

### Subscription member search

When the form selects either Shebin El Kom branch, lookup searches only both branches in that group. Search results show each member's home branch. Selecting a member never changes the form's branch; saving uses the selected branch as the transaction branch.

Membership plans remain subject to their existing branch availability rules. A member may subscribe at a sibling branch only when both branches share the active group.

### Barcode attendance

At a sibling branch, a barcode resolves the member by identity and permits check-in only when the member has an active eligible subscription from the same group. The attendance row records the scanning branch. A scan outside the group remains rejected.

### Permissions and reporting

The staff member needs only the existing permission for the operating branch; group lookup does not grant access to unrelated branch data. Member counts use home branch, revenue uses transaction branch, and attendance uses scanning branch. No report expands a direct branch filter unless it is explicitly a group summary.

## User experience

The member result displays a home-branch badge. After selection, the subscription dialog displays: `عضو تابع لـ <home branch> — سيتم إصدار الاشتراك من <selected branch>`. The attendance desk similarly displays the home branch and selected gate branch.

## Compatibility and acceptance

- Existing legacy Tanta grouping remains behaviorally unchanged.
- A non-group branch cannot find or check in a member from another non-group branch.
- Exact-code search never changes the selected branch.
- Seed data creates the Shebin El Kom group for the four local demo branches.
- Tests cover permitted sibling lookup/subscription/check-in and rejected unrelated-branch access.
