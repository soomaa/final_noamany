# Prompt تنفيذ مستقل — Daily Closing وTarget Report

> انسخ كل ما داخل هذا الملف إلى Codex على الجهاز الآخر. لا يحتاج إلى النظام القديم أو إلى أي SQL قديم.

نفّذ تقريرين فقط في المشروع الجديد: **Daily Closing / التقفيل اليومي** و**Target Report / تقرير التارجت**.

لا تنفّذ أو تعدّل Monthly Analysis. لا تستخدم وقت التشغيل النظام القديم أو ملف SQL أو بيانات قديمة. لا تعمل Historical Migration أو Backfill. هذه تعليمات مكتفية بذاتها ونهائية؛ لا تبحث عن مشروع قديم ولا تطلب تحليله.

## قواعد عامة

- استخدم Prisma Schema وقاعدة بيانات المشروع الجديد فقط.
- طبّق نطاق الفروع والصلاحيات في الـBackend، لا في الواجهة فقط.
- استخدم السجلات المالية المحفوظة فعليًا؛ لا تستنتج قيمًا من أسماء المنتجات أو ترتيب البنود.
- استخدم التواريخ التشغيلية المحددة أدناه فقط. لا تستبدلها بـ `created_at` أو `posted_at` إلا حيث نصت هذه التعليمات.
- حدود التاريخ شاملة: من بداية `fromDate` إلى نهاية `toDate`.
- استبعد السجلات المحذوفة منطقيًا حيث يوجد `is_deleted`.
- الواجهة RTL وتوفّر DataTable فيه Search وCopy وExcel وPrint، وتضمّن الإجماليات في التصدير والطباعة.
- لا تستخدم Category المنتجات لتحديد فئة فاتورة Cafe. المصدر الوحيد هو Snapshot الـHeader: `sales_quick_sales.cafe_category_id`.

## الفروع ومستويات المستخدم

1. **Level 1:** يختار أي فرع أو الكل، ويختار تاريخ البداية والنهاية.
2. **Level 2:** فرعه ثابت. في Target Report مندوبه ثابت بحسب الموظف المرتبط بحسابه. تاريخ Target هو أول وآخر يوم من الشهر الحالي ولا يمكن تغييره. تاريخ Daily Closing هو اليوم فقط ويُفرض من الـBackend.
3. **Level 3:** فرعه ثابت. في Target Report يختار فقط موظفًا من فرعه. تاريخ Target هو أول وآخر يوم من الشهر الحالي ولا يمكن تغييره. تاريخ Daily Closing هو اليوم فقط ويُفرض من الـBackend.
4. إذا كان Branch ID = `3`، فإن النطاق الفعلي في التقريرين هو `[3, 8, 9]`. أي فرع آخر يستخدم ID نفسه. خيار الكل متاح فقط للمستخدم المصرح له.
5. يجب أن يفرض الـBackend هذه القواعد، ويمنع branch أو employee أو date range غير المسموح به حتى لو وصل Request مباشر.

## تعديلات Schema اللازمة

نفّذ التعديلين التاليين فقط، بلا Default وبلا Backfill وبلا تعديل للسجلات التاريخية:

### 1) Salesperson الخاص بالتارجت

أضف إلى `sales_quick_sales`:

~~~prisma
target_employee_id Int?
~~~

- Foreign Key إلى `employees.id` وIndex على الحقل.
- لا تستخدم `employee_id` بديلًا عنه؛ ليس بالضرورة مندوب التارجت.
- يقبل NULL للسجلات القديمة أو المعاملات غير المرتبطة بمندوب.
- حدّث كل مسارات إنشاء/تعديل Quick Sales لتستقبل `targetEmployeeId` عند وجود مندوب، وتتحقق من وجوده وأنه ضمن الفرع المسموح، وتحفظه في Header invoice.
- لا تستنتج المندوب من المستخدم الحالي أو Product أو Customer.

### 2) تصنيف Daily Closing: Normal / Protein

أضف إلى `inv_categories`:

~~~prisma
daily_closing_classification DailyClosingClassification?
~~~

وأضف:

~~~prisma
enum DailyClosingClassification {
  NORMAL
  PROTEIN
}
~~~

- التصنيف على مستوى Category فقط، وليس Item أو Invoice Item.
- NULL يعني أن الفئة لا تدخل تقسيم Normal/Protein.
- لا تستخدم اسم Category أو ID ثابتًا أو ترتيب الفئات.
- لا تستنتج التصنيف من المنتجات.
- استخدم فقط:
  `sales_quick_sales.cafe_category_id -> inv_categories.daily_closing_classification`.
- لا تعيد حساب Category invoice من Items.
- نقل Product لاحقًا إلى Category أخرى لا يغير Category أو تصنيف فاتورة قديمة.

# Daily Closing

أنشئ Endpoint مثل:

~~~http
GET /finance/daily-closing?branchId=&fromDate=&toDate=
~~~

يعيد كل الأقسام التالية منفصلة، مع totals وCash/KNET حيث تنطبق.

## 1) الاشتراكات العادية والخاصة

المصدر: `club_subscriptions` و`club_subscription_types`.

| المنطق | الحقل |
|---|---|
| تاريخ العملية | `registration_date` |
| المدفوع | `paid_amount` |
| النوع | `subscription_type_id` |
| الفرع | branch relation / branch_id |
| الدفع | payment method relation/value المحفوظة في الاشتراك |
| private | discriminator/relation صريحة موجودة في الـSchema |

- Regular: الاشتراكات غير الخاصة فقط.
- Private: الاشتراكات الخاصة فقط.
- Total لكل قسم = مجموع `paid_amount`.
- Cash وKNET يحددان من طريقة الدفع الصريحة.
- لا تستخدم قيمة الاشتراك الكلية بدل المدفوع.
- لا تخلط Regular وPrivate.

## 2) اللوكر

المصدر: `club_locker_subscriptions`.

| المنطق | الحقل |
|---|---|
| تاريخ العملية | `subscription_start_date` |
| المدفوع | `paid_amount` |
| الفرع | branch relation / branch_id |
| الدفع | payment method relation/value |

- Total = مجموع `paid_amount`.
- Cash/KNET من طريقة الدفع.
- لا تستخدم `subscription_value` في Daily Closing.

## 3) مبيعات Cafe: Normal وProtein

المصدر: `sales_quick_sales` و`inv_categories`.

| المنطق | الحقل |
|---|---|
| التاريخ | `sales_quick_sales.sale_date` |
| الفرع | `sales_quick_sales.branch_id` |
| المدفوع | `sales_quick_sales.collected_amount` |
| الدفع | payment method في Header |
| Category Snapshot | `sales_quick_sales.cafe_category_id` |
| Classification | `inv_categories.daily_closing_classification` |

- Normal: فواتير الـSnapshot المصنفة `NORMAL`.
- Protein: فواتير الـSnapshot المصنفة `PROTEIN`.
- Total لكل قسم = مجموع `collected_amount`.
- Cash/KNET حسب Payment Method في Header.
- لا تستخدم `sales_quick_sale_items -> product -> current category`.
- الفواتير ذات Category NULL أو Category بلا Classification لا تدخل Normal ولا Protein حتى يتم تصنيف الفئة صراحة.
- لا تعالج Invoice مختلطة؛ Category الـHeader هي المصدر النهائي للفئة.

## 4) مرتجع المشتريات

المصدر: `prc_purchase_returns`.

| المنطق | الحقل |
|---|---|
| تاريخ العملية | `return_date` |
| المبلغ | `total_amount` |
| الفرع | `branch_id` |
| الاستبعاد | `is_deleted = false` |

- استخدم `return_date` فقط، وليس `created_at` أو `posted_at`.
- مرتجع المشتريات استرداد/تخفيض تكلفة، ويطرح من Outflows في المعادلة أدناه.

## 5) المشتريات

المصدر: `prc_purchase_invoices`.

| المنطق | الحقل |
|---|---|
| تاريخ الفاتورة | `invoice_date` |
| مبلغ الشراء | `invoice_amount` |
| الفرع | `branch_id` |

- Total = مجموع `invoice_amount`.
- لا تستخدم Supplier Payments بدلًا من Purchases.

## 6) دفعات الموردين

المصدر: `prc_supplier_payments`.

| المنطق | الحقل |
|---|---|
| التاريخ | `payment_date` |
| القيمة | `payment_amount` |
| الفرع | `branch_id` |
| الاستبعاد | `is_deleted = false` |

- Total = مجموع `payment_amount`.
- قسم مستقل عن Purchases.

## 7) المصروفات

المصدر: `fin_expenses`.

| المنطق | الحقل |
|---|---|
| التاريخ | `expense_date` |
| القيمة | `total_amount` |
| الفرع | `branch_id` |
| Gender scope | `gender_scope` |

- Total = مجموع `total_amount`.
- Male scope: ضم `gender_scope = MALE` فقط.
- Female scope: ضم `gender_scope = FEMALE` فقط.
- All/mixed scope: لا تضف Gender filter.
- لا تعامل NULL على أنه All، ولا تستخدم بيانات Member أو Invoice بدل Gender Scope.

## 8) مرتجعات الاشتراكات

استخدم فقط كيانًا صريحًا في الـSchema يحتوي Refund Date وRefund Amount وBranch. استخدم تاريخ المرتجع الحقيقي وقيمة المرتجع كـOutflow. لا تخلطه مع Purchase Returns.

## معادلات Daily Closing

احسب الأقسام منفصلة ثم:

~~~ts
totalRevenue =
  regularSubscriptions.total +
  privateSubscriptions.total +
  lockers.total +
  normalSales.total +
  proteinSales.total

totalOutflows =
  purchases.total +
  supplierPayments.total +
  expenses.total +
  subscriptionRefunds.total -
  purchaseReturns.total

netProfit = totalRevenue - totalOutflows

totalCash =
  regularSubscriptions.cash +
  privateSubscriptions.cash +
  lockers.cash +
  normalSales.cash +
  proteinSales.cash

totalKnet =
  regularSubscriptions.knet +
  privateSubscriptions.knet +
  lockers.knet +
  normalSales.knet +
  proteinSales.knet
~~~

لا تضف Purchases أو Expenses أو Supplier Payments إلى Cash/KNET إلا إذا كانت طريقة دفع صريحة محفوظة وكان مطلوبًا عرضها.

## واجهة Daily Closing

أنشئ صفحة مالية بعنوان `التقفيل اليومي`، فيها Branch وFrom Date وTo Date وزر عرض التقرير، وتعرض:

- الاشتراكات العادية: Total / Cash / KNET.
- الاشتراكات الخاصة: Total / Cash / KNET.
- اللوكر: Total / Cash / KNET.
- Normal Sales: Total / Cash / KNET.
- Protein Sales: Total / Cash / KNET.
- Purchase Returns، Purchases، Supplier Payments، Expenses، Subscription Refunds.
- Total Revenue، Total Outflows، Net Profit.
- Print وCopy وExcel.

# Target Report

أنشئ Endpoint مثل:

~~~http
GET /finance/target-report?branchId=&employeeId=&operationType=&fromDate=&toDate=
~~~

القيم:

~~~ts
operationType: 'subscriptions' | 'sales' | 'all'
subscriptions = 1
sales = 2
all = ''
~~~

- subscriptions: اشتراكات التارجت + اللوكر.
- sales: مبيعات المندوب فقط.
- all: اشتراكات التارجت + اللوكر + مبيعات المندوب.
- لا تضف أنواع عملية أخرى.

## 1) اشتراكات التارجت

المصدر: `club_subscriptions` و`club_subscription_types` و`employees`.

| المنطق | الحقل |
|---|---|
| المندوب | `club_subscriptions.employee_id` |
| التاريخ | `registration_date` |
| شرط التارجت | `club_subscription_types.is_part_of_target = true` |
| قبل الخصم | `subscription_value` |
| الخصم | `discount_value` |
| بعد الخصم | `subscription_value - discount_value` |
| المدفوع | `paid_amount` |
| الفرع | branch relation / branch_id |

- لا تدخل إلا الأنواع ذات `is_part_of_target = true`.
- لا تستبعد الاشتراك بسبب paid/unpaid.
- لكل صف: Date، Discount، Before Discount، After Discount، Paid، Operation = `اشتراك`، Type = اسم نوع الاشتراك.

## 2) Locker Target

المصدر: `club_locker_subscriptions` و`club_locker_subscription_types` و`employees`.

| المنطق | الحقل |
|---|---|
| المندوب | `recommended_employee_id` |
| التاريخ | `subscription_start_date` |
| قبل/بعد الخصم | `subscription_value` |
| المدفوع | `paid_amount` |
| الفرع | branch relation / branch_id |

قواعد نهائية:

- لا تطبق `club_locker_subscription_types.is_target_based`.
- Discount = 0.
- Before Discount = `subscription_value`.
- After Discount = `subscription_value`.
- Paid = `paid_amount`.
- Operation = `لوكر`.
- Type = اسم نوع اللوكر.

## 3) Sales Target

المصدر: `sales_quick_sales` و`employees`.

| المنطق | الحقل |
|---|---|
| المندوب | `sales_quick_sales.target_employee_id` |
| التاريخ | `sale_date` |
| قبل الخصم | `subtotal` |
| الخصم | `discount` |
| بعد الخصم | `subtotal - discount` |
| المدفوع | `collected_amount` |
| الفرع | `branch_id` |

- استخدم `target_employee_id` فقط؛ لا تستخدم `employee_id` بديلًا.
- لا تستبعد فاتورة بناءً على paid/unpaid أو customer/member.
- لا تشترط Member أو Customer.
- لا تطبق Normal/Protein على Target Sales.
- Operation = `مبيعات`.
- Type = نوع البيع المحفوظ صراحة في الـHeader، أو `مبيعات كافيه` إذا لم يوجد نوع مستقل.
- لا تستنتج المندوب من User أو Category أو Items.

## إجماليات Target

~~~ts
subscriptionTotal = sum(subscriptionRows.paid)
lockerTotal = sum(lockerRows.paid)
salesTotal = sum(salesRows.paid)

subscriptions => grandTotal = subscriptionTotal + lockerTotal
sales => grandTotal = salesTotal
all => grandTotal = subscriptionTotal + lockerTotal + salesTotal
~~~

لا تستخدم Before Discount أو After Discount كإجمالي التارجت النهائي.

## واجهة Target Report

أنشئ صفحة مالية بعنوان `تقرير التارجت`، بفلاتر Employee وBranch وOperation Type وFrom Date وTo Date.

DataTable RTL بالأعمدة:

- التاريخ
- قيمة الخصم
- القيمة قبل الخصم
- القيمة بعد الخصم
- المدفوع
- نوع العملية
- النوع

اعرض إجمالي الاشتراكات واللوكر والمبيعات والإجمالي النهائي حسب Operation Type. أضف Copy وExcel وPrint.

# Validation والأمان

- DTO validation لكل Query Parameters.
- تحقق من Branch ID وEmployee ID ومن أن الموظف ضمن نطاق الفرع.
- ارفض تاريخ البداية بعد تاريخ النهاية.
- استخدم Decimal-safe arithmetic، لا JavaScript float مباشرة للأموال.
- لا تسرّب بيانات من فروع غير مصرح بها.
- لا تعتمد على Frontend في فرض الصلاحيات.

# Tests المطلوبة

أضف أو حدّث اختبارات تغطي:

1. **Daily Closing**
   - Branch عادي وBranch 3 الذي يشمل 3 و8 و9.
   - فصل Regular وPrivate.
   - Cash/KNET.
   - Locker من `paid_amount`.
   - Category Snapshot للفاتورة، وعدم تغيرها عند تغيير Category المنتج.
   - فصل NORMAL وPROTEIN.
   - Purchases: `invoice_date` و`invoice_amount`.
   - Purchase Returns: `return_date` و`total_amount`.
   - Supplier Payments: `payment_date` و`payment_amount`.
   - Expenses: `gender_scope`.
   - Total Revenue وNet Profit والمعادلات السابقة.
   - استبعاد `is_deleted`.

2. **Target Report**
   - Subscription فقط عند `is_part_of_target = true`.
   - Locker يدخل بدون فلترة `is_target_based`.
   - Sales تعتمد على `target_employee_id` فقط.
   - قيود Level 2 وLevel 3.
   - Operation Type الثلاثة وإجمالياتها.
   - قيم Before/Discount/After/Paid.
   - عدم استبعاد Sales أو Subscriptions بسبب paid/unpaid أو عدم وجود Member.

3. **Schema/API**
   - Prisma relations صحيحة.
   - DTO يرفض IDs والتواريخ غير الصحيحة.
   - لا Backfill أو تعديل بيانات موجودة داخل Migration.

بعد التنفيذ شغّل:

~~~bash
npm run prisma:validate
npm run typecheck
~~~

وشغّل اختبارات الوحدات/التكامل المتعلقة بالتقريرين.

# REMAINING GAP REQUIRING USER DECISION

لا تنفّذ بديلًا تقريبيًا في الحالات التالية:

1. إذا لم يوجد كيان صريح لمرتجعات الاشتراكات يحتوي Refund Date وRefund Amount وBranch، لا تستنتجها من Status أو قيم أخرى. أوقف هذا الجزء فقط واطلب قرار المستخدم.
2. إذا لم يوجد discriminator أو relation صريحة للاشتراك الخاص، لا تستنتجه من الاسم أو السعر أو العضو. أوقف هذا الجزء فقط واطلب قرار المستخدم.
3. إذا لم تكن Payment Method محفوظة بوضوح وقابلة للربط باشتراك أو لوكر أو فاتورة Cafe، لا تخمّن Cash/KNET. اطلب قرار المستخدم عن المصدر الصحيح.

نفّذ ما سبق فعليًا، ثم قدّم: الملفات المعدلة، الـMigrations، الـEndpoints والصفحات، نتائج Prisma validation وTypeScript والاختبارات، وأي بند متبقٍ فقط تحت REMAINING GAP REQUIRING USER DECISION.

