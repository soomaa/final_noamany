# Subscription category and branch visibility

## Agreed outcome

Every subscription-facing table and report shows both **branch** and **category**. Category is a property of an individual subscription, with the two values `male` (رجالي) and `female` (حريمي). Subscription packages remain scoped by branch only; category never filters or changes package availability.

## Existing data model

`club_subscriptions` already has `branch_id` and `gender`. The implementation will reuse `gender` as the persisted category value and label it **الفئة** in the UI. It will not add a duplicate column or modify `club_subscription_types`.

For legacy subscriptions with a null category, read APIs will fall back to the linked member's gender. A data migration will backfill that value where it is safely available so filtering, exports, and historical reports remain accurate.

## Behaviour

1. The subscription create and edit flows require a category selection of رجالي or حريمي. For an identified member, it initially follows the member's gender; staff can set the category when the subscription is created for a walk-in customer.
2. Packages continue to be queried and displayed only by branch rules. Category does not hide, disable, or alter packages.
3. All subscriptions list endpoints accept a category filter and return a branch display value plus category. Existing branch filters remain authoritative for user scope.
4. Tables that present subscriptions add visible **الفرع** and **الفئة** columns. Their date/status/refund/outstanding/current/history variants use the same values.
5. Subscription reports and CSV exports include both fields and apply the category filter server-side. Aggregate reports keep their existing totals but use the filter when it is selected.
6. A non-admin employee's audience is the intersection of their assigned branch and their assigned section: `man_women_type = 0` means رجالي and `man_women_type = 1` means حريمي. This restriction is enforced by every subscription API query, independently of filters sent by the browser. System administrators remain unrestricted unless they select a filter.

## Scope

- Standard, special, time-based, private, active, expired, expiring, outstanding, refund, receipt, and member subscription-history views that render `club_subscriptions`.
- Subscription reports and exports sourced from `club_subscriptions`.
- The backend DTOs, mappings, and report/list queries needed by these screens.

Locker reservations are not changed by this work unless their table is explicitly a subscription table backed by `club_subscriptions`; they use a separate locker-subscription model.

## Validation and testing

- Add focused backend tests for category filtering and legacy gender fallback.
- Verify creation/update persists the selected category without changing package selection by branch.
- Add frontend tests where the existing test setup covers subscription table columns/filters; otherwise verify the shipped build and the affected API views manually.
- Run backend typecheck and relevant tests, plus the frontend typecheck/build.
