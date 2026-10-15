# التقرير الكامل لتقييم نظام إدارة الموارد البشرية كـ HR Reference

**المشروع:** ONE80 — Gym / HR / Sales / Finance  
**تاريخ الفحص:** 26 أغسطس 2026  
**نوع الفحص:** مراجعة ساكنة للكود والبنية، اختبارات موجودة، فحص قراءة فقط لقاعدة البيانات، مراجعة UI أولية، ومراجعة جاهزية النسخ والنشر  
**الهدف:** تحديد هل النظام الحالي يصلح كمرجع افتراضي يمكن نقله إلى أنظمة الجيمات والكافيهات والمطاعم بنفس الصفحات والـUI والـcomponents والعمليات

> هذا التقرير بدأ كتقييم baseline ثم تحول إلى سجل إصلاح تاريخي. **مصدر الحقيقة النهائي الحالي هو** [`hr-reference/HR_REFERENCE_AUDIT_REPORT.md`](hr-reference/HR_REFERENCE_AUDIT_REPORT.md) و`ACCEPTANCE_EVIDENCE.json`. الأرقام والحالات الأقدم أدناه محفوظة لتتبع رحلة الإصلاح ولا يجوز استخدامها بدل الأدلة الحالية.

## تحديث الاعتماد النهائي — 26 أغسطس 2026

- الحالة: **معتمد كحزمة HR مرجعية محمولة — 97/100**؛ مراجعة Sol xhigh النهائية: `ACCEPT` بلا findings مادية.
- snapshot محكومة: **576 ملفًا** (384 backend و192 frontend)، checksums ناجحة وصفر coupling داخل Core.
- schema محمولة: **122 Prisma model** تغطي 290 ملف runtime؛ baseline مستقلة نجحت على MySQL disposable وأنشأت 123 جدولًا.
- اختبارات الحزمة: **71 backend suites / 255 tests** و7 frontend tests.
- التطبيق الكامل: **138 backend suites / 552 tests** و12 frontend tests؛ typecheck/build/audit ناجحة في الجانبين.
- clean standalone gate: npm ci وPrisma generate وtypecheck/build نجحت دون الاعتماد على node_modules المضيف.
- قاعدة المضيف المحلية بها **4 migrations غير مطبقة**؛ لم تُطبق حفاظًا على بيانات المستخدم، ولذلك تظل بوابة نشر للمضيف وليست دليل فشل للحزمة المحمولة.
- تفاصيل الإصلاحات والقيود وبوابات كل مضيف موثقة في التقرير المرجعي الحالي المشار إليه أعلاه.

---

## 1. القرار التنفيذي

النظام الحالي **لا يصلح الآن كـ production-ready HR reference يتم نسخه وتشغيله مباشرة**. يصلح كنقطة بداية قوية من ناحية اتساع الصفحات والـUI ووجود أجزاء كثيرة من الـbackend، لكنه يحتاج إعادة تثبيت لحدود الصلاحيات، منطق الأعمال، الرواتب، سلامة الـmigrations، والاختبارات قبل اعتماده كمرجع رسمي.

### التقييم الحالي

| نوع التقييم | النتيجة التقديرية | المعنى |
|---|---:|---|
| مرجع للصفحات والـUI وتوزيع الوظائف | **70/100** | يوجد نطاق واجهات واسع ومكونات قابلة لإعادة الاستخدام، مع فجوات موبايل وتناسق واختبارات UI |
| مرجع للكود والـAPI كنقطة بداية | **55/100** | توجد بنية Modules وDTOs وRBAC وأجزاء مالية جيدة، لكن توجد أخطاء منطق وتكاملات ناقصة |
| وحدة قابلة للنسخ والنشر في منتج آخر | **35/100** | الربط قوي مع ONE80 والجداول القديمة، والـschema/migrations غير متطابقين، ولا توجد طبقة adapters واضحة |
| الجاهزية الإجمالية كـ HR Reference رسمي | **42/100** | **غير معتمد حاليًا**؛ يحتاج إغلاق جميع P0 وP1 وإثبات E2E معزول |

هذه النسب **تقدير هندسي للجاهزية وليست نسبة test coverage**. انخفاض التقييم لا يعني أن عدد الصفحات قليل؛ السبب الأساسي هو أن صحة الرواتب والصلاحيات والعزل بين الفروع والهجرة الآمنة أهم من عدد الشاشات عند إنشاء مرجع يعاد استخدامه.

### الخلاصة المختصرة

- **ينفع نبدأ منه:** نعم.
- **ينفع ننسخه كما هو إلى أي سيستم:** لا.
- **ينفع يصبح المرجع الرسمي:** نعم، بعد تنفيذ خطة الإصلاح والتغليف والاختبارات الواردة في هذا التقرير.
- **أخطر مانع جديد:** قاعدة البيانات و`schema.prisma` وتاريخ الـmigrations غير متطابقين؛ محاكاة المطابقة اقترحت حذف 25 جدولًا و36 index.
- **أكبر نقص وظيفي:** ضريبة الدخل في الرواتب والتسوية النهائية للموظف غير منفذتين بصورة صحيحة.
- **أكبر خطر أمني:** تقارير وروابط HR لا تطبق عزل الفرع/الموظف بصورة كاملة، والملفات المرفوعة متاحة من مسار static عام.

---

## 2. نطاق ما تم فحصه

شمل الفحص المناطق التالية:

- الـfrontend routes والقائمة الجانبية وصفحات HR والمكونات المشتركة.
- Backend controllers/services/DTOs المرتبطة بالموظفين والحضور والإجازات والأذونات والطلبات والرواتب والسلف والمكافآت والجزاءات والتوظيف وإنهاء الخدمة والتقارير والموبايل.
- الصلاحيات العامة RBAC، حارس عزل الفروع، وربط المستخدم بالموظف.
- دورة الرواتب وربطها بالقيود المحاسبية والمصروفات والدفع البنكي والتسوية.
- منطق الإجازات والموافقات والترحيل السنوي والـcron jobs.
- رفع الملفات والوصول إليها وحذفها.
- جودة المدخلات، DTO validation، أرقام المستندات، الذرية والتزامن.
- الاعتماديات البرمجية والثغرات المعروفة.
- اختبارات backend وtypecheck وتغطية الاختبارات.
- وجود اختبارات frontend وE2E.
- سلامة Prisma schema، تاريخ migrations، وفحص schema drift قراءة فقط.
- CI/CD، health checks، logging، observability، النسخ الاحتياطي والاسترجاع.
- التكامل مع أجهزة الحضور والبنك والإشعارات.
- مراجعة UI أولية لسطح الدخول والموبايل، ومراجعة ساكنة لواجهات HR الداخلية.
- فحوص سلامة بيانات حالية بدون تغيير البيانات.

### حجم النظام الذي ظهر أثناء الجرد

| العنصر | العدد التقريبي |
|---|---:|
| عناصر HR في القائمة | 41 |
| تعريفات routes للـHR | 68 |
| ملفات صفحات HR | 47 |
| حجم صفحات HR | أكثر من 13 ألف سطر تقريبًا |
| Endpoints مباشرة ضمن نطاق HR | نحو 275 |
| Endpoints عند إضافة الخدمات المساندة | قرابة 291 |
| Prisma migrations محلية | 74 |

### حالة بيانات قاعدة التطوير الحالية

| العنصر | العدد |
|---|---:|
| Users | 2 |
| Employees | 3 |
| Active employees | 2 |
| Branches | 1 |
| Payroll runs | 0 |
| Journal entries | 45 |
| Leave requests | 0 |
| Attendance rows | 0 |

هذه البيانات **غير كافية لإثبات دورة HR كاملة**، لذلك لم يتم استخدامها لتنفيذ سيناريوهات mutating E2E حتى لا تتغير البيانات الحالية.

---

## 3. ما تم اجتيازه بنجاح

### الاختبارات والبناء المنطقي

- Backend tests: **72/72 suites ناجحة**.
- Backend tests: **314/314 tests ناجحة**.
- Backend TypeScript typecheck: ناجح.
- Frontend TypeScript typecheck: ناجح.
- `prisma validate`: ناجح؛ صياغة `schema.prisma` سليمة نحويًا.
- تقرير التغطية متاح في `backend/coverage/lcov-report/index.html`.

### نقاط إيجابية في البنية

- يوجد Global JWT guard وRBAC guard وحارس عام للفروع.
- يوجد `ValidationPipe` عام، وتستفيد منه الـDTO classes الصحيحة.
- يوجد `helmet` وcompression وthrottling لتسجيل الدخول.
- Cookies في production مضبوطة كـHttpOnly وSecure وSameSite=Lax.
- حفظ تفاصيل مسير الرواتب وإجمالياته داخل transaction في الجزء الذي تمت مراجعته.
- عمليات post/bank تحتوي على conditional claim ومعاملات تقلل التكرار في بعض المسارات.
- قيود الرواتب المحاسبية تتضمن مصروف الرواتب والتأمينات والسلف ورواتب مستحقة ثم قيد دفع بنكي.
- Leave cron يستخدم timezone القاهرة وقفل MySQL لمنع التشغيل المتزامن.
- فحص 91 جدولًا ذا صلة بالـHR/finance أظهر أنها InnoDB، وهذا مناسب للمعاملات.
- فحوص البيانات الحالية لم تظهر orphan rows أو أرقام موظفين مكررة أو مسيرات مكررة في البيانات القليلة الموجودة حاليًا.
- ملفات `.env` التشغيلية غير متتبعة في Git بحسب الفحص السابق.

هذه النقاط جيدة، لكنها لا تلغي المشاكل الحرجة التالية؛ نجاح unit tests الحالية لا يغطي معظم تدفقات HR الفعلية.

---

## 4. موانع الاعتماد — P0

يجب إغلاق كل البنود التالية قبل السماح بنسخ الوحدة إلى منتج آخر أو وصفها بأنها مكتملة.

### P0-01 — انقسام تاريخ migrations ووجود schema drift قد يؤدي لحذف بيانات

**الدليل:**

- `npx prisma migrate status` وجد 74 migration، لكنه أظهر أن التاريخ المحلي وتاريخ قاعدة البيانات مختلفان.
- يوجد migrationان محليان غير مطبقين على القاعدة الحالية:
  - `20260729090000_c3_gate_access`
  - `20260805210000_subscription_plan_conversion`
- توجد أربعة migration names في قاعدة البيانات غير موجودة محليًا:
  - `20260707145000_hr_employment_type`
  - `20260709100000_hot_path_indexes`
  - `20260809213000_fix_monthly_twelve_session_validity`
  - `20260810120000_reception_gender_filter_indexes`
- فحص `prisma migrate diff` قراءة فقط أظهر فرقًا فعليًا. تحويل القاعدة الحالية إلى `schema.prisma` سيقترح تقريبًا:
  - حذف 25 جدولًا.
  - 24 جملة `ALTER TABLE`.
  - حذف 36 index.
  - حذف 5 foreign keys.
  - إنشاء 4 جداول وإضافة 10 foreign keys.
- بعض الـindexes المقترح حذفها تخص مسارات HR الساخنة مثل الحضور والأذونات.
- يوجد script يدوي باسم `backend/prisma/scripts/heal-production-migrations.sh` يصلح حالات معروفة مباشرة في schema وmetadata، لكنه ONE80-specific وليس بديلًا عن تاريخ migrations نظيف قابل للتكرار.
- `package.json` ما زال يعرض `prisma:push` و`db:reseed` الذي يستخدم `--force-reset --accept-data-loss`، بينما ملفات النشر الصحيحة تستخدم `prisma migrate deploy`.

**الأثر:** نسخة جديدة أو نشر غير منضبط قد يفقد جداول أو indexes أو يتوقف في منتصف الهجرة. هذا وحده يمنع اعتبار المشروع reference قابلًا للنسخ.

**الإصلاح المطلوب:**

1. تجميد أي `db push` على قواعد مشتركة أو production.
2. اختيار مصدر الحقيقة: schema معتمد + migrations متسلسلة وموجودة في Git.
3. استعادة migrations المفقودة محليًا أو استبدالها بمسار baseline موثق.
4. إنشاء migration baseline خاص بالـHR reference لا يعتمد على تاريخ ONE80 الكامل.
5. اختبار مسارين آليًا: fresh install من قاعدة فارغة، وupgrade من نسخة سابقة واقعية.
6. إضافة destructive-diff gate في CI يرفض `DROP TABLE`/`DROP COLUMN` إلا بموافقة صريحة وخطة backup/restore.

**معيار القبول:** `migrate status` متطابق، و`migrate diff` لا يعرض drift، واختبار fresh + upgrade ناجحان على قواعد مؤقتة.

### P0-02 — ستة أنواع طلبات تتم الموافقة عليها بدون تنفيذ أثر حقيقي

**المكان:** `backend/src/modules/requests/requests.service.ts`

الواجهة تسمح بعشرة أنواع طلبات، لكن `routeToDomain` ينفذ فعليًا الإجازة والإذن والسلفة والقرض فقط. الأنواع التالية تصل إلى `break` بلا أثر مجال أعمال:

- بدل.
- شهادة راتب.
- استقالة.
- نقل.
- ترقية.
- تعديل بيانات.

المشكلة أكبر لأن حالة الطلب قد تتحول إلى approved حتى لو لم يوجد الموظف أو كان المبلغ غير صالح، كما أن تنفيذ الأثر وتحديث حالة الطلب ليسا transaction واحدة ولا توجد idempotency صريحة.

**الإصلاح المطلوب:** state machine موحدة لكل نوع، handler ملزم يعيد نتيجة قابلة للتحقق، transaction واحدة بين الطلب وأثره، ورفض الموافقة عند عدم تنفيذ الأثر. شهادة الراتب يجب أن تحفظ snapshot غير قابل للتغيير للراتب والجهة المصدرة والتاريخ.

### P0-03 — ضريبة الدخل في الرواتب غير منفذة والتقرير الحالي يسمي خصومات الغياب «ضرائب»

**الأماكن:**

- `backend/src/modules/payroll/payroll-engine.service.ts`
- `backend/src/modules/reports/reports.service.ts`
- نموذج `hr_mosayer_details` في `backend/prisma/schema.prisma`

محرك الراتب لا يحسب income tax، ولا يوجد حقل واضح لها في تفاصيل المسير. تقرير `payroll-taxes` يستخدم خصم الغياب والإجازة بدون راتب كأنه ضريبة.

**الأثر:** صافي الراتب والتقارير والقيود القانونية/المالية قد تكون غير صحيحة. لا يمكن اعتماد Payroll Reference بلا tax engine.

**الإصلاح المطلوب:** Tax Adapter حسب الدولة والسنة الضريبية، جداول brackets/versioning، taxable earnings/deductions، rounding policy، overrides مسجلة، حقول مستقلة في المسير، قيود GL، وتقارير إقرار ضريبي. يجب عدم افتراض قانون مصر أو أي دولة قبل تثبيت الـjurisdiction ومراجعة مختص قانوني/محاسبي.

### P0-04 — Payroll reconciliation لا يقارن الدفع البنكي الفعلي

**المكان:** `backend/src/modules/payroll/payroll.service.ts`

الكود يجلب `bankPayment` ثم يحسب `netVsBank` باستخدام `expectedBank` بدل المبلغ البنكي الفعلي. نتيجة `balanced` قد تظهر صحيحة رغم اختلاف الدفع الحقيقي.

**الإصلاح المطلوب:** مقارنة مستقلة بين net payroll وsalary payable وactual bank journal/statement، مع tolerance موحد، واختبارات لحالات نقص/زيادة/تكرار الدفع.

### P0-05 — تقارير وروابط HR قد تكشف بيانات وفروعًا خارج النطاق

**الأماكن:**

- `backend/src/modules/reports/reports.controller.ts`
- `backend/src/modules/reports/reports.service.ts`
- `backend/src/common/guards/branch-scope.guard.ts`
- `backend/src/modules/employees/*`
- `backend/src/modules/requests/*`

كل التقارير الديناميكية تستخدم permission عامة واحدة `reports.hub:view`. خدمة التقارير لا تستقبل المستخدم الحالي ولا تطبق BranchScopeService، وتقرير `employees-data` يعرض الهاتف والراتب الأساسي لكل الموظفين النشطين. حارس الفروع العام يرفض فقط branch صريحًا خارج النطاق ولا يضيف filter افتراضيًا إلى queries التي لم ترسل branch.

القوائم والتفاصيل في employees/requests لا تطبق دائمًا فرع المستخدم أو self scope. دور الموظف يملك صلاحيات عرض/إنشاء طلبات، ما قد يسمح له بفتح طلبات غيره إذا لم يطبق owner filter داخل الخدمة.

**الإصلاح المطلوب:** data-scope مركزي يجمع company/branch/department/team/self، صلاحيات منفصلة للتقارير الحساسة، field masking للراتب والهاتف، واختبارات مصفوفية لكل role × branch × endpoint × record owner.

### P0-06 — إنهاء خدمة الموظف لا يغلق حسابه أو جلساته

**الأماكن:**

- `backend/src/modules/termination/employee-exit.util.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/termination/archive.service.ts`

إنهاء الخدمة يحدد `leave_emp` وتاريخ/سبب الانتهاء فقط. لا يعطل `users.approved` أو `api_users.status`، ولا يلغي refresh tokens أو sessions أو roles. تسجيل الدخول يتحقق من `user.approved` لكنه لا يتحقق من حالة الموظف.

**الإصلاح المطلوب:** offboarding transaction/workflow تغلق كل الحسابات والقنوات وتلغي الجلسات والتوكنات وتمنع إعادة الدخول فورًا، مع سجل audit وإمكانية emergency revoke.

### P0-07 — لا توجد تسوية نهائية كاملة عند مغادرة الموظف

الأرشفة الحالية تنشئ record وتعلّم الموظف كمغادر فقط. لا توجد عملية موحدة لحساب:

- آخر راتب حتى يوم المغادرة.
- رصيد الإجازة المستحق أو المنتهي حسب السياسة والقانون.
- مكافأة نهاية الخدمة أو severance.
- قروض وسلف وأقساط متبقية.
- عهد ومعدات.
- ضرائب وتأمينات نهائية.
- قيد محاسبي ووثيقة settlement وموافقة نهائية.

هذا مسار أساسي لأي HR/Payroll reference.

### P0-08 — خلط Employee ID مع Employee Code يكسر الموبايل ومسارات المدير

**الأماكن:**

- `backend/src/common/interfaces/jwt-user.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/mobile/mobile.service.ts`
- `backend/src/modules/leaves/leaves.service.ts`
- `backend/src/modules/permissions/permissions.service.ts`

الحقل `JwtUser.emp_code` يحمل فعليًا `employees.id` لأن `users.emp_code` مربوط بالـID الداخلي، بينما خدمات أخرى تتعامل معه كـbusiness `employees.emp_code`. البيانات الحالية تؤكد الاختلاف: موظف `id=2` و`emp_code=1002` يقابله مستخدم `emp_code=2`.

**الأثر:** طلبات الموبايل وتوجيه موافقة المدير قد تبحث عن موظف أو مستخدم خاطئ أو لا تجد شيئًا.

**الإصلاح المطلوب:** فصل صريح للأسماء والأنواع: `employeeId` و`employeeCode`، وتخزين FK حقيقي، ومنع أي join بالاسم الملتبس. migration للبيانات واختبارات identity contract مطلوبة.

### P0-09 — ملفات الموظفين والمستندات الحساسة متاحة كـstatic URLs

**الأماكن:**

- `backend/src/modules/uploads/uploads.service.ts`
- `backend/src/main.ts`

التحقق يعتمد على MIME والامتداد القادمين من العميل، والكتابة متزامنة، ثم يتم تقديم `/uploads` كمسار static بلا download authorization. صور الموظفين ومستندات البنك والملفات القانونية والرسائل قد تصبح قابلة للوصول لمن يعرف الرابط.

**الإصلاح المطلوب:** تخزين خاص، signed URLs قصيرة العمر أو authenticated download endpoint، فحص magic bytes، antivirus scanning، limits حسب النوع، أسماء غير قابلة للتخمين، retention، وحذف فعلي مع audit. الكتابة يجب أن تكون streaming/asynchronous.

---

## 5. مشاكل عالية الأولوية — P1

### P1-01 — منطق الإجازات يسمح بأرصدة وأيام غير صحيحة

**المكان:** `backend/src/modules/leaves/leaves.service.ts`

- `numDays` القادم من العميل اختياري لكنه يُستخدم مباشرة ولا يطابق دائمًا فرق التواريخ.
- فحص الرصيد يستخدم كامل الاستحقاق السنوي، بينما شاشة الأرصدة تستخدم accrual شهريًا؛ النتيجتان غير متسقتين.
- السنة والشهر يسجلان من تاريخ التنفيذ الحالي بدل تاريخ بداية الإجازة.
- فحص overlap ينظر للطلبات approved فقط؛ يمكن إنشاء عدة طلبات pending متداخلة ثم اعتمادها.
- الاعتماد النهائي لا يعيد فحص الرصيد والتداخل.
- بيانات الإدارة في السجل قد تكتب `0` أو قيمة فارغة بدل بيانات الموظف.
- تعديل الطلب وإضافة history ليسا transaction واحدة.
- توجيه المدير متأثر بمشكلة employee ID/code.

### P1-02 — حالة الإجازة `1` تعامل أحيانًا كـapproved وأحيانًا pending

**المكان:** `backend/src/common/utils/suspend-status.util.ts`

`SUSPEND_APPROVED=[1,4]` بينما status mapper يعتبر `1` pending/first approval. لذلك قد يخصم الرصيد أو يؤثر في الراتب قبل الاعتماد النهائي.

### P1-03 — Mobile leave ينشئ طلبًا ناقصًا خارج workflow الويب

مسار الموبايل يكتب insert مبسطًا ويتجاوز التحقق الكامل من الرصيد والتداخل والتوجيه ورقم الطلب والـhistory. الطلب قد يصبح stuck أو غير قابل للمراجعة الصحيحة.

### P1-04 — أرقام المستندات مبنية على `MAX + 1` بدون حماية كافية

ظهر هذا النمط في requests، leaves، permissions، rewards، tasks، clearance groups، job requests، وloan postponement. معظم هذه الأرقام لا تملك unique constraint مركبًا مناسبًا.

**الخطر:** طلبان متزامنان قد يحصلان على نفس الرقم. بعض العمليات header/details منفصلة، وقد تنتج تفاصيل يتيمة أو مجموعات مختلطة.

**الإصلاح:** database sequence/counter table داخل transaction مع row lock، أو UUID داخلي + unique human number، وإعادة المحاولة عند conflict.

### P1-05 — إنشاء Payroll Run ليس ذريًا بالكامل

- يتم فحص الشهر/السنة ثم إنشاء header، ولا يوجد unique index واضح على `(month, year)`.
- تشغيلان متزامنان قد ينشئان مسيرين لنفس الفترة.
- فشل compute بعد إنشاء header يترك draft يمنع إعادة المحاولة النظيفة.

الأجزاء اللاحقة في persist/post أفضل من هذه المرحلة، لكنها لا تعالج هذا السباق.

### P1-06 — ترحيل رصيد الإجازات غير idempotent وغير ذري

تحديث العقود يتم واحدًا واحدًا بلا transaction أو run marker. إعادة التشغيل اليدوي أو cron في ظروف معينة يمكن أن تعيد الحساب أو تغيّر النتيجة. الحساب يعتمد على تاريخ اليوم بدل نهاية سنة هدف ثابتة، ولا تظهر policy واضحة للحد الأقصى أو الانتهاء.

### P1-07 — HR audit trail شبه غائب

يوجد `BusinessAuditService` في مناطق النادي والمبيعات وRBAC audit لتغييرات الأدوار، لكن المسح المستهدف لنحو 275 endpoint خاص بالـHR لم يجد دمجًا منهجيًا مع BusinessAudit. تغييرات الرواتب والحسابات البنكية والموافقات والإنهاء تحتاج before/after، actor، reason، request ID، والفرع.

### P1-08 — إدارة الجلسات والتوكنات وكلمات المرور ضعيفة

- الـfrontend يحفظ access token في `localStorage` رغم وجود cookies.
- login يعيد access وrefresh tokens في JSON.
- refresh token لا يظهر أنه rotated/revoked ومخزن server-side لكل session.
- logout يمسح cookies فقط ولا يلغي token server-side.
- الحد الأدنى لكلمة المرور 5 أحرف.
- بعض مسارات تجهيز حساب الموظف يمكن أن تستخدم الهاتف كـfallback في ظروف معينة.

### P1-09 — 24 عملية mutation تستخدم bodies غير ممثلة بـDTO classes

وجود `ValidationPipe` لا يكفي عندما يستخدم controller نوعًا inline مثل `{...}` أو `Record<string, unknown>`. لا يحدث runtime validation/whitelisting لهذه الأنواع كما يحدث مع DTO class.

### P1-10 — اختلافات timezone في عمليات حساسة

ظهر ما لا يقل عن 20 استخدامًا حساسًا لـ`toISOString().slice(0,10)` أو `getMonth/getFullYear` بدل utility القاهرة. قرب منتصف الليل قد يسجل اليوم أو فترة الرواتب خطأ. بعض cron jobs يحدد Cairo، لكن ليس كل العمليات والـfinance recurring cron.

### P1-11 — CSV الخاص بالبنك قابل لـFormula Injection

الهروب الحالي يطبق CSV quoting فقط ولا يعطل القيم التي تبدأ بـ`=`, `+`, `-`, `@`. فتح الملف في Excel قد يشغل formula غير مقصودة من اسم أو رقم مخزن في البيانات.

### P1-12 — Device “sync” ليس مزامنة حضور فعلية وله خطر شبكة داخلية

**المكان:** `backend/src/modules/attendance/attendance.service.ts`

المسار الحالي يفتح TCP على IP محفوظ وport 4370 ويعتبر النجاح مزامنة، لكنه لا يسحب punches ولا يحل duplicate events ولا يثبت device cursor. كما يسمح بعنوان IP اختياري بلا CIDR allowlist، ما يجعله قناة محتملة لفحص خدمات داخل الشبكة لمن يملك صلاحية الأجهزة.

**الإصلاح:** provider adapter حقيقي لـZKTeco/غيره، queue، cursor، deduplication، device authentication، allowed network ranges، وraw event ledger.

### P1-13 — تقارير HR غير scalable وتنفذ pagination في الذاكرة

عدة تقارير تسحب كل الموظفين أو أول 500/1000 record ثم تعمل filter/slice داخل Node.js. هذا ينتج إجماليات ناقصة بعد 1000 record واستهلاك ذاكرة أعلى، ويجعل search/pagination غير دقيقين.

### P1-14 — تغطية الاختبارات غير كافية لإثبات صحة HR

التغطية الإجمالية للـbackend:

| المقياس | التغطية |
|---|---:|
| Statements | 16.23% |
| Branches | 9.31% |
| Functions | 10.87% |
| Lines | 17.05% |

معظم attendance/leaves/requests/loans/rewards/penalties/termination/job requests عند 0% تقريبًا. أمثلة الوحدات الأعلى نسبيًا: partners قرابة 43.5%، payroll قرابة 23.7%، employees قرابة 16.9%، salary scale قرابة 19.8%.

الـfrontend لديه ملف test واحد فقط، ولا يوجد test script ولا Playwright/Cypress config.

### P1-15 — ثغرات dependency معروفة

نتيجة `npm audit --omit=dev` وقت الفحص:

- Backend: 3 high، 0 critical.
- Frontend: 3 high و2 moderate.
- السلاسل المتأثرة تضمنت `@nestjs/swagger/js-yaml` و`brace-expansion` في backend، و`brace-expansion` و`nanoid` و`postcss` و`react-router/react-router-dom` في frontend.
- توجد إصدارات إصلاح متاحة، لكن يلزم upgrade واختبارات regression بدل التحديث الأعمى.

### P1-16 — النسخ الاحتياطي غير كافٍ كدليل تعافٍ

- يوجد backup script داخل `one80-deploy` ونسخة desktop، ويستخدم `set -euo pipefail` و`mysqldump --single-transaction --quick --routines --triggers` وgzip؛ هذه نقاط جيدة.
- لا يستخدم `--events`.
- لم يظهر تشفير أو checksum أو retention policy أو ضبط permissions أو restore verification.
- لا يوجد restore/recovery test artifact في المشروع النشط.
- آخر الملفات الظاهرة في مجلد `backups` مؤرخة 14 و16 يوليو 2026، بينما تاريخ الفحص 26 أغسطس 2026.
- ملف SQL حجمه 584,656 bytes وملف ZIP حجمه 2,369,582 bytes، وكلاهما بصلاحية `-rw-r--r--`، أي قابلان للقراءة محليًا لمستخدمين آخرين حسب بيئة التشغيل.
- لا يوجد backup script في `backend/scripts` النشط؛ النسخة موجودة في deployment/desktop artifacts، ما يزيد احتمال اختلاف النسخ.

**الإصلاح:** encrypted backups، least-privilege storage، checksum، retention، offsite copy، RPO/RTO معلنان، restore drill دوري على قاعدة معزولة، وتوثيق نتيجة الاسترجاع.

### P1-17 — لا توجد CI quality gates للمشروع النشط

لم تظهر workflows في `.github` أو GitLab/Jenkins config خاص بالمشروع النشط. بالتالي لا يوجد دليل آلي يمنع الدمج عند فشل tests/typecheck/audit/migration diff/E2E.

### P1-18 — Health/observability سطحية

- `/health` يعيد `status: ok` ووقت الخادم فقط؛ لا يفحص MySQL أو Redis أو queue أو التخزين.
- يوجد exception filter يسجل stack للـ500 وبعض Prisma metadata، لكنه لا يضيف correlation/request ID.
- لم يظهر Sentry/OpenTelemetry/Prometheus أو metrics وalerts وdashboards.
- لا يوجد readiness/liveness منفصلان أو audit alert للعمليات الحساسة.

---

## 6. مشاكل متوسطة وتحسينات — P2

### P2-01 — UI الموبايل يحتاج إصلاح قبل اعتباره design reference

مراجعة صفحة الدخول على desktop كانت جيدة إجمالًا، لكن على عرض 390px ظهر قص/فراغ غير جيد في hero مع vertical overflow. الواجهات الداخلية authenticated لم تُختبر بالمتصفح بعد. المراجعة المرئية الأولية كانت تقريبًا 13/20، مع تحذير gradient واحد غير جوهري.

### P2-02 — العملة مرتبطة بقوة بـEGP

ظهر 69 occurrence مباشرًا تقريبًا لـ`EGP` أو `ج.م` أو `جنيه` في frontend، رغم وجود إعدادات عملة. هذا يمنع النقل السلس لدولة أو نشاط آخر.

### P2-03 — لا يوجد Design/Product contract للمرجع

لا يوجد `PRODUCT.md` أو `DESIGN.md` يعرّف:

- النطاق الأساسي والاختياري.
- tokens والألوان والمسافات والخطوط.
- responsive rules.
- RTL/LTR وi18n.
- accessibility states.
- empty/loading/error/permission-denied states.
- قواعد تسمية الصفحات والـroutes والـpermissions.

### P2-04 — N+1 ونقاط أداء ثابتة

ظهر enrichment بـ`Promise.all(rows.map(async ...))` في job requests وغيرها، وسحب مجموعات كبيرة ثم تركيب النتائج في التطبيق. يلزم query plans وindexes وbatch joins/load tests قبل استهداف آلاف الموظفين.

### P2-05 — تعدد نسخ المشروع يرفع خطر اختلاف المصدر

يوجد `backend` و`frontend` نشطان، وبجوارهما `one80 desktop` و`one80-deploy` و`releases` ونسخ build assets. بعض scripts موجودة في نسخة وليست الأخرى. يجب تحديد source of truth واحد وتوليد artifacts منه فقط.

---

## 7. مصفوفة تغطية وظائف HR

الحالة التالية تعني وجود أجزاء من الوظيفة، لا اجتياز E2E.

| المجال | Backend/API | UI | ربط مالي | E2E مثبت | الحالة |
|---|---|---|---|---|---|
| الهيكل التنظيمي والفروع والأقسام والوظائف | موجود | موجود | غير مطلوب غالبًا | لا | جزئي بسبب scope/portability |
| بيانات الموظف والعقد والملفات والبنك | موجود | موجود | جزئي | لا | يحتاج privacy/files/audit |
| الحضور والانصراف والقواعد | موجود | موجود | يدخل الرواتب جزئيًا | لا | device sync غير حقيقي |
| الجداول والورديات | أجزاء موجودة | موجودة | جزئي | لا | يحتاج roster/coverage engine أقوى |
| الإجازات | موجود | موجود | يؤثر في الراتب | لا | أخطاء رصيد/status/overlap |
| الأذونات | موجود | موجود | يؤثر في الراتب | لا | routing وscope غير مضمونين |
| الطلبات الموحدة | موجود | موجود | بعض الأنواع | لا | 6 أنواع no-op |
| السلف والقروض والأقساط | موجود | موجود جزئيًا | موجود جزئيًا | لا | إعدادات/تأجيل/كشف ناقص |
| المكافآت والبدلات والجزاءات | موجود | موجود | يدخل الراتب جزئيًا | لا | transactions/audit/uniqueness |
| الرواتب | موجود | موجود | GL موجود جزئيًا | لا | tax/reconciliation/final settlement |
| الأداء والتقييم | موجود | موجود | غير مباشر | لا | يحتاج competency/goals calibration |
| التوظيف وطلبات الوظائف | Backend واسع | UI جزئي | لا | لا | pipeline وconversion ناقصان |
| المهام والتعاميم والتقارير اليومية | موجود | موجود | لا | لا | audit/numbering |
| العهد وإخلاء الطرف | موجود جزئيًا | موجود | جزئي | لا | لا توجد settlement موحدة |
| إنهاء الخدمة والأرشيف | موجود جزئيًا | موجود | ناقص | لا | لا يعطل الحساب ولا يسوي الحقوق |
| تقارير HR | 22 report keys تقريبًا | موجود | تقارير payroll | لا | privacy/performance/correctness |
| Employee mobile/self-service | أجزاء موجودة | API/mobile | لا | لا | identity وleave workflow مكسوران |
| Audit/Compliance | RBAC وبعض المجالات | شاشة admin | لا | لا | HR business audit شبه غائب |

---

## 8. العمليات الموجودة في Backend وغير مكتملة في UI

أهم فجوات parity المكتشفة:

- Recruitment applicant detail/interview/offer/qualifications/courses/skills أوسع في backend من الواجهة الحالية.
- لا يظهر flow موحد لتحويل offer accepted إلى employee onboarding.
- Attendance shift swaps وextra hours وبعض reports لا تملك تغطية UI مكتملة.
- Loan settings للضوابط والحسابات ليست مكتملة في الواجهة.
- بعض العمليات مثل leave cancel وloan postpone/statement وmission expenses وexpiring documents تحتاج إكمال أو توحيد في UI.
- بعض dropdown triggers التي بدت كأزرار بلا فعل اتضح أنها صحيحة؛ لم يظهر زر inert مؤكد في المسح الساكن.

---

## 9. أهم الوظائف التي يجب إضافتها ليصبح المرجع كاملًا

### أولًا: وظائف Core لا غنى عنها

1. **Tax engine قابل للتبديل حسب الدولة والسنة** مع versioned rules.
2. **Final settlement engine** مربوط بالرواتب والإجازات والقروض والعهد والـGL.
3. **Onboarding/Offboarding workflows** بقوائم مهام ومسؤوليات ومواعيد وتعطيل حسابات.
4. **Recruitment-to-employee conversion** بدون إعادة إدخال البيانات، مع offer acceptance وdocuments checklist.
5. **Employee self-service كامل**: طلبات، أرصدة، payslips، وثائق، بيانات شخصية، approvals inbox.
6. **Shift/Roster planning** مناسب للجيم والكافيه والمطعم، مع coverage، overtime، rest rules، تبديل الورديات، وتكلفة العمالة لكل فرع.
7. **Attendance provider adapters** للأجهزة والتطبيق/QR مع raw events وdeduplication.
8. **Unified approval engine** بدل hardcoded job-title codes، يدعم role/manager/department/amount/branch rules وdelegation/escalation/SLA.
9. **HR business audit** غير قابل للتلاعب لكل تعديل مالي أو شخصي أو approval.
10. **Document lifecycle**: أنواع ومستندات إلزامية، انتهاء، تنبيه، private access، retention، e-signature adapter.

### ثانيًا: وظائف تجعل المرجع ناضجًا

- Benefits/enrollment والتأمين الطبي.
- Training/LMS والمهارات والشهادات وتواريخ الانتهاء.
- Competency framework وcareer path وsuccession planning.
- Grievance/case management والتحقيقات بسرية وصلاحيات دقيقة.
- Expense claims/reimbursements للموظفين.
- Headcount/budget/workforce planning.
- Compensation bands ومراجعات الرواتب والمساواة الداخلية.
- Pulse surveys وengagement، كحزمة اختيارية.
- Service charge/tips allocation كـadapter اختياري للمطاعم والكافيهات.
- Multi-entity/multi-country packs بدل hardcoded currency/timezone/tax terminology.

---

## 10. شكل الـHR Reference الصحيح

نسخ مجلدات ONE80 كما هي سيحمل معها dependencies غير واضحة وجداول legacy وافتراضات الجيم. المرجع الأفضل يكون package/blueprint له عقود وحدود واضحة:

```text
hr-reference/
├── README.md
├── PROMPT.md
├── manifest.yaml
├── PRODUCT.md
├── DESIGN.md
├── compatibility/
│   ├── required-capabilities.md
│   └── supported-versions.json
├── contracts/
│   ├── auth.ts
│   ├── employee-identity.ts
│   ├── branch-scope.ts
│   ├── finance.ts
│   ├── files.ts
│   ├── notifications.ts
│   └── attendance-provider.ts
├── backend/
│   ├── modules/
│   ├── adapters/
│   ├── policies/
│   └── public-api.ts
├── frontend/
│   ├── pages/
│   ├── components/
│   ├── routes/
│   ├── permissions/
│   └── design-tokens/
├── database/
│   ├── baseline/
│   ├── migrations/
│   ├── reference-data/
│   └── rollback-notes/
├── country-packs/
│   ├── generic/
│   └── eg/                 # بعد مراجعة قانونية فقط
├── vertical-packs/
│   ├── gym/
│   ├── cafe/
│   └── restaurant/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── browser/
│   └── fixtures/
└── docs/
    ├── install.md
    ├── upgrade.md
    ├── security.md
    ├── operations.md
    └── acceptance-checklist.md
```

### محتوى `manifest.yaml`

يجب أن يعلن بوضوح:

- إصدار المرجع ونسخ Node/Nest/React/Prisma المدعومة.
- الـmodules الأساسية والاختيارية.
- routes والpermissions والdatabase objects التي يملكها المرجع.
- الإعدادات المطلوبة: currency، timezone، country pack، week start، leave/payroll policies.
- adapters المطلوبة من السيستم المضيف.
- migrations المطلوبة وترتيبها.
- seed/reference catalogs الاختيارية.
- checksums للملفات أو release artifact.

### مواصفات `PROMPT.md`

الـprompt لا ينبغي أن يقول «انسخ الملفات فقط». يجب أن يطلب من المنفذ:

1. اكتشاف stack وإصداراته وحالة Git أولًا.
2. قراءة `manifest.yaml` و`PRODUCT.md` و`DESIGN.md` والعقود كاملة.
3. إنشاء compatibility report قبل أي تعديل.
4. اختيار adapters وربطها صراحة، وعدم اختراع joins أو IDs.
5. تنفيذ migration dry-run على قاعدة مؤقتة وفحص destructive diff.
6. تركيب routes/nav/permissions بصورة idempotent.
7. الحفاظ على UI tokens والـRTL/responsive/accessibility.
8. تشغيل unit/integration/E2E/browser/security/migration tests.
9. رفض إعلان النجاح إن كانت أي acceptance gate حمراء.
10. إخراج installation report يذكر الملفات والتغييرات والاختبارات والـrollback.

---

## 11. معايير الوصول إلى 100/100

عبارة 100/100 هنا لا تعني استحالة وجود bug مستقبلي؛ تعني أن كل بوابات الاعتماد المحددة اجتازت دليلًا قابلًا للتكرار.

### بوابة الوظائف

- كل workflow أساسي له happy path ورفض وإلغاء وإعادة محاولة وحالة تزامن.
- كل زر/صفحة مرتبطان بـAPI فعلي، وكل API business operation مطلوب له UI أو معلن أنه headless/optional.
- لا يوجد request type يتحول إلى approved بدون domain effect موثق.

### بوابة الرواتب والماليات

- المعادلة لكل موظف قابلة للتتبع: gross، taxable، tax، insurance، deductions، loans، net.
- `sum(employee net) = payroll total net`.
- `salary expense + employer costs` تطابق قيود GL المطلوبة.
- `salaries payable` يطابق صافي الرواتب.
- actual bank payment يطابق payable بعد التسوية والتقريب.
- post/unpost/repost لا يكرر قيودًا أو مصروفات.
- final settlement مثبت ببيانات fixture.
- تقارير الضرائب والتأمين مستقلة ولا تعيد تسمية خصومات أخرى.

### بوابة الأمن والخصوصية

- اختبارات role × scope × owner لكل endpoint حساس.
- موظف لا يرى إلا بياناته؛ مدير يرى نطاقه؛ branch manager لا يرى رواتب فروع أخرى؛ super admin فقط يرى الجميع حسب السياسة.
- ملفات HR خاصة ولا يمكن الوصول لها بعنوان static مباشر.
- session revoke يعمل فور الإنهاء وتغيير الدور وكلمة المرور.
- لا يوجد token طويل العمر في localStorage.
- audit مكتمل للرواتب والبنك والبيانات الشخصية والموافقات.

### بوابة البيانات والـmigrations

- migration history موحد.
- zero schema drift.
- fresh install وupgrade وrollback/forward-fix موثقون.
- uniqueness وforeign keys وindexes للـhot paths.
- لا توجد business numbers مبنية على `MAX+1` بلا حماية.
- backup مشفر واختبار restore ناجح ومؤرخ.

### بوابة الجودة

- zero P0 وP1 مفتوحة.
- backend critical-domain branch coverage مرتفعة بدرجة متفق عليها؛ الهدف العملي المبدئي 80% للـbusiness services الحرجة بدل مطاردة رقم إجمالي مضلل.
- frontend component/integration tests للـforms والpermission states.
- Playwright E2E لكل رحلة أساسية على desktop وmobile.
- accessibility audit بلا مخالفات خطرة.
- load tests لحجم موظفين متفق عليه، مثل 5k/25k حسب السوق المستهدف.
- dependency audit بلا high/critical غير مقبولة أو بلا waiver مؤرخ.

### بوابة التشغيل

- CI يطبق typecheck/tests/audit/migration diff/E2E.
- readiness يفحص DB/Redis/queue/storage، وliveness منفصل.
- structured logs وrequest IDs وmetrics وalerts.
- runbooks للرواتب الفاشلة، migration failure، bank mismatch، device outage، وrestore.

---

## 12. تصميم بيئة E2E الآمنة المطلوبة

لا يجب تشغيل الاختبارات المتغيرة على قاعدة `one80_hr` الحالية. البيئة المقترحة:

```text
MySQL temporary database: one80_hr_e2e_<unique_run_id>
Redis namespace:          one80_hr_e2e:<unique_run_id>
Upload root:              temporary isolated directory
Clock:                    fixed Cairo date/time per test
External adapters:        fake bank + fake attendance + fake notifications
Cleanup:                  drop exact generated DB and temp directory only
```

### Fixtures الأساسية

- شركتان/فرعان على الأقل.
- أدوار: super admin، HR admin، branch manager، direct manager، payroll officer، employee.
- موظفون active/terminated/probation/part-time مع employeeId مختلف عن employeeCode.
- سياسات إجازات وأرصدة وحدود وتداخلات.
- حضور وغياب وتأخير وovertime ووردية ليلية.
- قرض وسلفة ومكافأة وجزاء وبدل.
- tax/insurance fixtures بحسابات متوقعة يدويًا.
- حسابات GL وبنك وفروق دفع.

### الرحلات ذات الأولوية

1. Employee create → user provision → login → self-service.
2. Leave create → routing → final approval → balance/payroll effect → cancel.
3. Permission/attendance → payroll calculation.
4. Loan create → installments → payroll deduction → postpone/settle.
5. Payroll create → compute → review → approve → post → bank → reconcile → unpost.
6. Resignation → approvals → final settlement → clearance → disable sessions → archive.
7. Applicant → interview → offer → accepted → onboarding → employee/user.
8. Cross-branch negative tests ومحاولات direct ID access.
9. Private file upload/download/delete/expiry.
10. Fresh migration + upgrade migration + backup restore drill.

---

## 13. خطة الإصلاح المقترحة

### المرحلة 0 — حماية البيانات والنشر

- وقف `db push` خارج قواعد محلية مؤقتة.
- توحيد schema/migrations وإغلاق drift.
- backup مشفر + restore drill قبل migrations.
- CI gate يمنع destructive migration غير المصرح.

### المرحلة 1 — حدود الأمن والهوية

- إصلاح employeeId/employeeCode.
- data scope مركزي لكل HR endpoint.
- private file service.
- session store/rotation/revocation وتعطيل فوري عند الخروج.
- HR audit trail.

### المرحلة 2 — صحة الـworkflows

- approval engine موحد.
- تنفيذ الأنواع الستة الناقصة.
- إصلاح الإجازات والحالات والتداخل والترحيل.
- إزالة `MAX+1` غير المحمي وإضافة idempotency/transactions.
- توحيد mobile والويب على نفس domain services.

### المرحلة 3 — Payroll/Finance correctness

- tax engine/country pack.
- final settlement.
- actual bank reconciliation.
- قواعد GL كاملة واختبارات invariants.
- CSV neutralization وbank integration adapter.

### المرحلة 4 — تحويله إلى Reference حقيقي

- فصل adapters عن ONE80 والجيم/الكافيه.
- استخراج design tokens/routes/permissions/contracts.
- إزالة hardcoded currency/timezone/job-title codes.
- baseline migrations مستقلة وreference fixtures.
- إنشاء `manifest.yaml` و`PROMPT.md` وdocs.

### المرحلة 5 — إثبات الجودة

- TDD للوحدات الحرجة.
- Integration tests على MySQL حقيقي معزول.
- Browser E2E للـdesktop/mobile وRTL/LTR.
- accessibility/performance/security tests.
- clean-install exercise داخل مشروع مضيف تجريبي مختلف عن ONE80.

---

## 14. ما لم يتم اختباره فعليًا ولماذا

هذه نقاط معلنة وليست نجاحات ضمنية:

- لم يتم تشغيل E2E متغير على قاعدة البيانات الحالية؛ لا توجد قاعدة اختبار معزولة مصرح بها بعد.
- لم يتم إنشاء payroll run حقيقي لأن القاعدة الحالية لا تحتوي fixture آمنًا ودورة الرواتب يمكن أن تكتب قيودًا ومصروفات.
- لم تُختبر الشاشات الداخلية authenticated بالمتصفح لعدم توفر جلسة اختبار معزولة وحسابات role matrix في هذه الجولة.
- لم يتم توصيل جهاز بصمة حقيقي؛ الكود الحالي يثبت TCP reachability فقط.
- لم يتم إرسال ملف لبنك أو التحقق من ACK/return file؛ الموجود export CSV فقط.
- لم يتم تنفيذ load/stress test.
- لم يتم تنفيذ penetration test ديناميكي.
- لم يتم اختبار restore فعلي من النسخة الاحتياطية.
- لم يتم إثبات disaster recovery أو RPO/RTO.
- لم يتم اعتماد توافق قانوني لأي دولة؛ Cairo/EGP وبعض مصطلحات GOSI مختلطة، ولا تكفي كدليل امتثال.
- لم يتم تشغيل clean `npm ci` وbuild من clone جديد؛ الاختبارات وtypecheck شُغلت على workspace الحالي ذي التغييرات الموجودة مسبقًا.
- لم يتم تطبيق أي migration أو seed أو cleanup، حفاظًا على البيانات الحالية.

---

## 15. أدلة وأوامر الفحص

### نتائج مختصرة

| الفحص | النتيجة |
|---|---|
| `npm test -- --runInBand` للـbackend | 72 suites / 314 tests ناجحة |
| Backend typecheck | ناجح |
| Frontend typecheck | ناجح |
| Backend coverage | 16.23% statements / 9.31% branches |
| `npx prisma validate` | ناجح |
| `npx prisma migrate status` | history مختلف بين local وDB |
| `prisma migrate diff --exit-code` | drift موجود |
| Schema diff summary | 25 drop tables، 36 drop indexes، 24 alter statements |
| Frontend test files | 1 |
| Playwright/Cypress config | غير موجود |
| Active CI workflows | غير موجودة |
| Backend dependency audit | 3 high |
| Frontend dependency audit | 3 high + 2 moderate |
| Current integrity anomalies المستهدفة | 0 في البيانات القليلة الحالية |

### ملفات الأدلة الأساسية

- `backend/src/modules/requests/requests.service.ts`
- `backend/src/modules/payroll/payroll.service.ts`
- `backend/src/modules/payroll/payroll-engine.service.ts`
- `backend/src/modules/accounting/module-ledger.service.ts`
- `backend/src/modules/reports/reports.controller.ts`
- `backend/src/modules/reports/reports.service.ts`
- `backend/src/common/guards/branch-scope.guard.ts`
- `backend/src/modules/employees/employees.service.ts`
- `backend/src/modules/leaves/leaves.service.ts`
- `backend/src/modules/permissions/permissions.service.ts`
- `backend/src/common/utils/suspend-status.util.ts`
- `backend/src/modules/mobile/mobile.service.ts`
- `backend/src/modules/termination/employee-exit.util.ts`
- `backend/src/modules/termination/archive.service.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/uploads/uploads.service.ts`
- `backend/src/modules/attendance/attendance.service.ts`
- `backend/src/main.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/`
- `backend/prisma/scripts/heal-production-migrations.sh`
- `frontend/src/lib/api.ts`
- `backend/package.json`
- `frontend/package.json`
- `one80-deploy/scripts/backup-db.sh`

---

## 16. التوصية النهائية

اعتمدي النظام الحالي كـ**مصدر تحليل وتصميم أولي** وليس كـgolden reference قابل للنسخ الآن. أفضل قرار هو:

1. تثبيت نسخة source of truth واحدة.
2. إغلاق P0-01 أولًا لحماية البيانات والنشر.
3. إصلاح الأمن والهوية والملفات قبل توسيع الوظائف.
4. إصلاح الإجازات والطلبات والرواتب والتسوية النهائية.
5. بناء E2E معزول وإثبات كل invariants المالية والصلاحيات.
6. بعد النجاح، استخراج الوحدة إلى `hr-reference/` بعقود وadapters وmanifest وprompt بدل copy-paste عشوائي.

بعد هذه المراحل يمكن أن يصبح المنتج مرجعًا قويًا ومتكرر الاستخدام للجيم والكافيه والمطعم، مع حزم vertical اختيارية ودون ربط الـHR نفسه بنشاط واحد.

**الحكم الحالي:** `NOT APPROVED AS PRODUCTION HR REFERENCE`  
**الحكم الممكن بعد إغلاق البوابات:** `APPROVABLE`  
**أول خطوة تنفيذية موصى بها:** توحيد schema/migration history وبناء قاعدة E2E معزولة قبل أي تعديل business logic.

---

## 17. سجل الإصلاحات المثبتة بعد الفحص

### 17.1 إغلاق P0-01 — سلامة schema وmigration history

تم إغلاق مانع الاعتماد الخاص بانقسام تاريخ الـmigrations والانحراف البنيوي بتاريخ 26 أغسطس 2026، بالأدلة الآتية:

- استعادة ملفات الـmigrations الثلاثة المطبقة في قاعدة البيانات بنفس البصمات المثبتة.
- أرشفة صف alias القديم `20260707145000_hr_employment_type` داخل `one80_migration_history_archive` قبل حذفه من سجل Prisma، مع ربط العملية بالنسخة الاحتياطية المثبتة.
- تطبيق 78/78 migrations بنجاح؛ `prisma migrate status` يعرض `Database schema is up to date!`.
- نتيجة `npm run prisma:drift:check`: صفر statements وصفر عمليات حذف destructive.
- منع `prisma db push` افتراضيًا، وقصره على قواعد loopback صريحة تنتهي بـ`_dev` أو `_e2e` مع acknowledgment حرفي.
- نجاح fresh migration rehearsal على قاعدة MySQL مؤقتة، بما يشمل محاكاة alias القديم، الإصلاح، deploy، zero drift، والحذف الآمن للقاعدة.
- إنشاء نسخة احتياطية بصلاحيات `600` وبصمة SHA-256:
  `7bbe47ca8e46b88ad69c991f29dc37419c85010b572763bfd59f319616983039`.
- نجاح restore drill فعلي إلى قاعدة مؤقتة: 355 جدولًا مع تطابق أعداد الصفوف في الجداول الحرجة، ثم حذف قاعدة الاختبار.
- نجاح 76/76 backend test suites و345/345 tests، ونجاح TypeScript typecheck وPrisma validate/generate بعد الإصلاح.

**حالة P0-01 الحالية:** `RESOLVED — VERIFIED`.

لا يغيّر هذا الإغلاق وحده حكم اعتماد الوحدة النهائي؛ ما زالت موانع الأمن والهوية والطلبات والإجازات والرواتب والتسوية والـreference packaging والـE2E/CI الواردة أدناه قيد التنفيذ.

### 17.2 إغلاق P0-02 وP0-08 وأجزاء الإجازات والموبايل

- أصبحت الأنواع العشرة المعلنة للطلبات تملك handlers إلزامية، وأي نوع غير معروف يفشل مغلقًا.
- تنفيذ الأثر، evidence، audit، وحالة الطلب أصبحت في transaction واحدة مع row lock ومنع replay/stale approval.
- شهادة الراتب تحفظ snapshot ثابتًا؛ النقل والترقية وتعديل البيانات مقيدة بمدخلات canonical وallowlist.
- فُصل `employeeId` عن `employeeCode` في عقد الهوية، ووُحّد إنشاء إجازة الموبايل مع نفس خدمة الويب.
- الإجازات العامة لم تعد تتجاوز الرصيد/التداخل: نفس canonical availability policy تطبق عليها، وتُحفظ `num_days/month/year` المشتقة من التواريخ.
- الموافقات المرحلية لا تستخدم final-approved status قبل المرحلة النهائية، والترحيل السنوي idempotent وله run marker.

**الحالة:** `P0-02 RESOLVED — VERIFIED`، و`P0-08 RESOLVED — VERIFIED`.

### 17.3 إغلاق P0-03 وP0-04 وP1-05 وP1-11 — سلامة Payroll

- أضيف محرك ضريبة دخل progressive بسياسات versioned وeffective-dated، بلا أي نسب قانونية hard-coded.
- يغلق المحرك الحساب عند غياب سياسة منشورة تغطي كامل الفترة، أو وجود تداخل، أو غياب مرجع رسمي.
- يحفظ كل line وheader نسخة policy والمدخلات والنتيجة وbreakdown تاريخية immutable.
- أضيفت حقول `taxable_earnings` و`income_tax` وإجمالي الضريبة، وأصبح تقرير `payroll-taxes` يقرأ الضريبة الحقيقية بدل الغياب والإجازة بلا راتب.
- قيد الاستحقاق يرحل الضريبة إلى `payroll_income_tax_payable`، مع اختبار invariant لاتزان القيد.
- إنشاء header + details + tax snapshot أصبح transaction واحدة، مع unique `(year, month)` وperiod mutex يمنع سباقه مع التسوية النهائية.
- reconciliation يقارن صافي المسير بـsalary payable وبقيد البنك الفعلي؛ لا يستنتج المال من workflow status.
- CSV البنكي يطبق RFC 4180 ويحيّد بدايات `= + - @ tab CR` ضد spreadsheet formula injection.
- أضيفت واجهة كاملة لإنشاء ونشر ومراجعة سياسات الضريبة، وخضعت لـImpeccable detector.

**الحالة:** `P0-03/P0-04/P1-05/P1-11 RESOLVED — VERIFIED`.

### 17.4 إغلاق P0-07 — التسوية النهائية

- أضيفت سياسات مستقلة versioned/effective-dated لمكافأة الخدمة، قاعدة الراتب، مقابل الإجازة، الخضوع للضريبة، واسترداد السلف، مع source reference إلزامي ومنع التداخل.
- تحسب التسوية: راتب الفترة الأخيرة prorata، مدة الخدمة بشرائح متصلة، رصيد الإجازة المستحق، مكافأة نهاية الخدمة، كامل أقساط السلف القائمة حسب السياسة، الضريبة المجمعة، والإضافات/الاستقطاعات الصريحة.
- يحفظ سجل التسوية snapshot كاملًا، وله lifecycle: `draft → approved → posted → paid` مع conditional claims وbusiness audit.
- الاعتماد يتعارض صراحة مع وجود الموظف في مسير نفس الفترة، وperiod row lock يمنع race بين العمليتين.
- الترحيل ينشئ قيد استحقاق متوازن، يغلق أقساط السلف المستردة، والدفع ينشئ قيد البنك.
- أضيفت صفحة تشغيل للتسويات وصفحة إعداد سياسة التسوية، مع permission gates وRTL/responsive states.

**الحالة:** `P0-07 RESOLVED — VERIFIED CODE/MIGRATION`; اعتماد نسب قانونية فعلية يظل deployment prerequisite لمختص قانوني/محاسبي، ولا توجد نسب افتراضية مضللة.

### 17.5 أدلة التحقق الحالية

| الفحص | النتيجة الحالية |
|---|---|
| Backend full suite | **105/105 suites، 445/445 tests ناجحة** |
| Backend typecheck | ناجح |
| Frontend typecheck | ناجح |
| Impeccable detector لواجهات payroll الجديدة | `[]` |
| Prisma migrations | **87 migration، database up to date** |
| Schema drift | `hasDrift:false`, صفر statements وصفر destructive operations |
| Fresh migration rehearsal | `status:passed`, fresh/history repair/drift كلها ناجحة والقاعدة المؤقتة حُذفت |
| جداول المعاملات الحرجة | InnoDB (تم التحقق من requests/leaves/payroll/loans/employees/accounting) |

### 17.6 الحالة الحالية للبرنامج كمرجع

حزمة migrations والهوية/الجلسات والملفات الخاصة والطلبات والإجازات والـpayroll والتسوية شهدت إصلاحات مادية مثبتة، لكن **الحكم النهائي لم يتحول بعد إلى APPROVED**. ما زالت حزم المراجعة التالية مطلوبة قبل التقييم النهائي: بقية data-scope/audit mutation coverage، attendance/recruitment/DTO edge cases، reference packaging وprompt، CI/dependencies/performance، browser E2E وaccessibility، ثم مراجعة مستقلة بنموذج Sol xhigh وإغلاق كل ملاحظاتها.
