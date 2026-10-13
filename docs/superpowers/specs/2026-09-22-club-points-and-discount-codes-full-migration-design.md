# Club Points and Discount Codes — Full Migration Design

## Goal

Replace the current combined points/discount screen with the twelve separate legacy administration pages, preserving the legacy table-backed business rules while presenting them in the current responsive application.

## Navigation and routes

The sidebar contains two independent top-level groups, in this exact order.

### النقاط

| Label | Route | Source page |
| --- | --- | --- |
| إعدادات تجميع النقاط | `/club/points/earn-settings` | `points/Point_setting/add_point` |
| إعدادات تحويل النقاط | `/club/points/conversion-settings` | `points/Point_setting/convert_points` |
| سجل نقاط العضو | `/club/points/member-history` | `points/Point_setting/member_point_history` |
| تقرير الأعضاء الحاصلين على نقاط | `/club/points/earned-report` | `points/Point_setting/members_points_report` |
| تقرير الأعضاء أصحاب النقاط الباقية | `/club/points/active-members-report` | `points/Point_setting/active_members_points_report` |

### أكواد الخصم

| Label | Route | Source page |
| --- | --- | --- |
| إضافة كود خصم | `/club/discount-codes/create` | `captains_discounts/Captain_discount/add_cobone` |
| إضافة كود خصم للكابتن | `/club/discount-codes/captain-allocations` | `captains_discounts/Captain_discount/add_cobone_employee` |
| كود خصم لعضو | `/club/discount-codes/member-grants` | `captains_discounts/Captain_discount/codediscount_member` |
| البحث عن كود خصم | `/club/discount-codes/member-search` | `captains_discounts/Captain_discount/check_code_discount` |
| تقرير أكواد الخصم للعضو | `/club/discount-codes/member-report` | member-grant history view |
| أكواد الموظف الخاصة بالكابتن | `/club/discount-codes/captain-codes` | `captains_discounts/Captain_discount/captain_discount_codes` |
| تقرير الأعضاء المستخدمين لأكواد الخصم | `/club/discount-codes/usage-report` | `captains_discounts/Captain_discount/cobon_exhausted_report` |

There must be no combined `points-discounts` administration screen in the sidebar or routing tree after the migration. Each route has its own page title, filter/form, result state and translated Arabic/English navigation copy.

## Page behaviour

1. **Earn settings** lists point rules and edits the legacy fields: operation type, points and expiry days.
2. **Conversion settings** stores exactly one conversion rule: points, Egyptian-pound value and validity days. The configured value is the source of redemption quoting.
3. **Member point history** searches by member code and shows date, member code, transaction type, points, increase/deduction reason, expiry and subscription type.
4. **Earned-points report** filters earned point history by inclusive date range and groups/shows member, code and points.
5. **Remaining-points report** shows every member with a positive valid balance.
6. **Create discount code** creates, edits, lists and deletes a reusable code with name and percentage.
7. **Captain allocation** assigns one or more reusable code capacities to a captain/employee and shows current allocations.
8. **Member grant** searches a member, shows the captain's capacity and used count, grants a selected code, and shows that member's grants.
9. **Member-code search** searches by membership code and displays currently valid usable discount codes.
10. **Member-code report** filters grants by member code and displays assigned/used state, captain, code, percentage and dates.
11. **Captain code report** filters by captain/employee and displays allocated codes, capacity, used count and state.
12. **Usage report** filters consumptions by inclusive date range and optional member code; displays member, phone, subscription type, percentage, coupon value, date and time.

## Business rules

- The persistent sources remain the existing legacy-compatible tables: `tbl_points_setting`, `tbl_convert_points_setting`, `tbl_points_history`, `tbl_points_exhausted_history`, `tbl_discount_codes`, `tbl_discount_cobones_employees`, `tbl_emps_members_dis_codes` and `tbl_cobon_exhausted_history`.
- Valid points equal non-deleted, activated earned rows whose deadline is today or later, minus non-deleted redeemed rows; a negative balance is treated as zero.
- Redemption value equals `(requested points / configured points) * configured EGP value`; the server calculates it, never the browser.
- In a subscription, the employee chooses exactly one benefit: no discount, manual fixed/percentage discount, points redemption, or one granted discount code. Points and a discount code can never be combined.
- A redemption locks the member's relevant history before writing consumption, and cannot exceed the valid balance.
- A member code grant must belong to the selected employee's allocation, have remaining allocation capacity, be unexpired and unused before it can be consumed.
- Consuming a granted code marks that grant used and writes `tbl_cobon_exhausted_history` in the same database transaction as the subscription.
- Reporting endpoints are read-only, validate date ranges and scope employee access to the authenticated employee where applicable.

## UI and language constraints

- Preserve the legacy Arabic field labels, table columns and action order listed above.
- Use the current frontend components, RTL support, loading/error/empty states and responsive tables; do not embed the obsolete legacy HTML/CSS.
- Provide Arabic and English translation keys for every new sidebar group, page heading, form label, table heading and empty/error message.
- Admin-only settings, code creation and captain allocation controls must remain server-enforced; an employee may only operate/view their own allocations and grants.

## Verification

- Backend unit tests cover balance expiry, conversion quote, over-redemption, mutually exclusive benefit selection, allocation capacity, one-time code consumption, expiry, and date-range validation.
- Backend controller/API tests cover each report/filter endpoint and authorization boundary.
- Frontend typecheck and production build pass; route/navigation tests or a scripted route inventory prove all 12 paths render and appear in the two sidebar groups.
- A manual smoke test creates an isolated rule/code/allocation/grant, verifies it is searchable and then consumes it through a subscription without allowing it to be consumed twice.
