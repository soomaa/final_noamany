# المصفوفة الرئيسية لنقل متطلبات العميل إلى Noamany

تاريخ التدقيق: 2026-09-09  
الهدف الفعلي: `/Users/fatmaatefkasem/Documents/noamany-engineer26-8`  
مصادر المقارنة: أحدث تحديثات الجيم `Fitnesstimegym`، أحدث كافيه `one80`، النظام القديم الصحيح `application (1)`، والتفريغ الحرفي للتسجيلات 1–14.

## طريقة الحكم والخلاصة

لا تُعد الخاصية مكتملة لمجرد وجود جدول Prisma أو ترجمة أو مفتاح صلاحية؛ يلزم مسار تشغيل مسجل، API وواجهة متصلان، نطاق صلاحيات صحيح، واختبار/لقطة قبول. الحالات الحالية في Noamany:

| مكتمل | جزئي | مفقود | إجمالي صفوف المصفوفة |
|---:|---:|---:|---:|
| 6 | 15 | 19 | 40 |

العد النهائي المتحقق منه هو **40 صفًا: 6 مكتملة + 15 جزئية + 19 مفقودة**. تشمل الصفوف 39 مطلب قبول من التسجيلات، إضافة إلى بند معماري صريح لنقل الماسح الدائم (BAR-04) لأنه يغيّر طريقة تنفيذ ثلاثة تدفقات الباركود ويمنع تكرار listeners.

أعلى المخاطر: تقرير التارجت ذي الأربع تبويبات غير موجود؛ خدمة العملاء غير موجودة؛ «تقييماتي» في تطبيق HR غير موجودة؛ جنس/قسم الفرع ليس حد تفويض شاملًا؛ تصنيف Protein/Bar/مسحوبات الإدارة غير ثابت في معاملات الكافيه؛ والاشتراك الأونلاين مع إثبات الدفع وجدول المراجعة والترحيل غير موجود.

## تصحيح اتجاه النقل والافتراضات

- `/trainer` وباك إند `trainer-portal` موجودان بالفعل في Noamany؛ يُحافظ عليهما ولا يعاد بناؤهما.
- بوابة المبيعات الشخصية الحديثة موجودة في **Fitnesstimegym** على `/sales`، لكنها ليست موجودة في Noamany؛ `/sales` ومساراته الحالية في Noamany يملكها POS الكافيه وتبقى مسجلة. عند النقل تُكيّف البوابة الشخصية إلى `/sales-portal` وتبويباتها، بينما يبقى `/club/cafe/pos` مدخلًا صريحًا لنفس POS من مساحة الكافيه؛ لا يُعاد استخدام `/sales` للبوابة الشخصية.
- الماسح الدائم `PersistentScannerProvider` موجود في **Fitnesstimegym** لا Noamany؛ يُنقل كمكوّن app-wide، وتستهلكه صفحات الاستقبال/الحضور/POS بدل تركيب listeners مستقلة.
- الكافيه والمخزون والمشتريات مسجلة وتعمل جزئيًا في Noamany، ومصدرها قريب من ONE80 الحالي. المطلوب reconciliation انتقائي مع ONE80، لا نسخًا كاملًا ولا نقل branding/data.
- النظام القديم هو مرجع النية والمعادلات وأسماء التقارير، وليس مرجع UX أو أمن؛ مثال مهم: `Barcode.php` كان يسجل حضورًا أثناء جلب البيانات، بينما العميل طلب المعاينة أولًا ثم زر دخول صريح.

## قاعدة أدلة القبول

لكل بند واجهة: `review/client-requirements-2026-09-09/<ID>/desktop.png` بعرض 1440×900 و`mobile.png` بعرض 390×844. لطلبات API يضاف `contract-test.txt` أو `api.json`. يجب أن تعرض الصور بيانات seeded وحالة نجاح وحالات empty/error عند أهميتها؛ لا تقبل شاشة فارغة كدليل.

## 1. المدربون والتارجت

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| TGT-01 | العميل لم يفهم «أجور المدربين» ويريد اسمًا واضحًا؛ التسجيل 1. | **مكتمل**: الصفحة الحالية اسمها «مستحقات المدربين» وتعرض المكتسب/المصروف/المتبقي. | `/club/fitness/trainer-payments` — **مستحقات المدربين** | Noamany الحالي | الإبقاء؛ لا صفحة «أجور» ثانية. | اختبار route/RBAC؛ `desktop.png` للعنوان والملخص والصرف. |
| TGT-02 | اختيار المدرب وشهر محدد ثم حفظ التارجت؛ التسجيل 1، وإعدادات القديم. | **مفقود**: الموجود راتب/نسب عمولة وفترات صرف، لا target period شهري محفوظ للمدرب. | `/club/fitness/trainers/:id?tab=target` — **التارجت والعمولات** | نقل نموذج target-period من Fitnesstimegym ثم تكييفه مع Noamany | داخل ملف المدرب، لا شاشة إعدادات عامة جديدة. | unit لعدم تداخل الفترات + API create/update؛ `desktop.png` مدرب/شهر/قيمة وسجل فترات. |
| TGT-03 | تقرير التارجت يضيف اسم العميل والكود والهاتف لبيانات القديم؛ `application/controllers/Report.php:667-694` و`Report_m.php:1586-1654`. | **مفقود**. | `/club/targets` — **تقرير التارجت** | جديد؛ معادلات القديم + مصادر معاملات Noamany | تقرير cross-domain واحد؛ الإعداد يظل داخل ملف الشخص. | contract يثبت member fields؛ `desktop.png` بفلاتر شخص/شهر وصفوف الاسم والكود والهاتف. |
| TGT-04 | أربع تبويبات: اشتراكات، برايفت، مبيعات، حصص؛ المبيعات Protein/Bar؛ التسجيل 9. | **مفقود**. | نفس `/club/targets` — **تقرير التارجت** | جديد؛ بيانات Noamany + تصنيف الكافيه أدناه | أربع tabs داخل التقرير، لا أربع صفحات. | totals reconciliation لكل tab؛ `desktop.png` الأربع tabs وProtein/Bar، `mobile.png` للتنقل. |

## 2. تقييمات الموظفين وتطبيق HR

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| EVAL-01 | بنود تقييم مستقلة للمدربين والريسبشن ومديري الفروع؛ التسجيل 1؛ القديم يربط البنود بالإدارة في `evaluation_v/add_evaluation.php`. | **جزئي**: `hr/evaluations` يقرأ شجرة معايير legacy، لكن لا CRUD للبنود ولا تبويب دور، ونموذج الواجهة يرسل `criteria: []`. | `/hr/evaluations?tab=criteria` — **بنود تقييم الموظفين** | توسعة Noamany من منطق `application/controllers/evaluation/Evaluation_setting.php` | وحدة واحدة مع role templates وإصدارات؛ لا نسخ صفحات لكل دور. | CRUD/role isolation؛ `desktop.png` للأدوار الثلاثة وبنود مختلفة. |
| EVAL-02 | إدخال تقييم شهري وتقرير للمدرب/الريسبشن/مدير الفرع؛ `Evaluation_emps.php:86-238`. | **جزئي**: list/create/detail/delete موجودة، لكن لا شهر صريح، لا منع تكرار شهر/موظف، ولا report filters مكتملة. | `/hr/evaluations?tab=monthly` — **التقييم الشهري**، و`/hr/evaluations?tab=report` — **تقرير التقييمات** | Noamany + قواعد legacy | تبويبان في الصفحة الحالية، والـrole مجرد filter/template. | unique employee+month+templateVersion، totals؛ `desktop.png` للإدخال و`desktop-report.png` للتقرير. |
| EVAL-03 | الحفظ/الإرسال يظهر تلقائيًا في صفحة تطبيق HR «تقييماتي»، قائمة حسب الشهر وتفاصيل؛ التسجيل 5. | **مفقود**: لا employee-self evaluations endpoints في Mobile. | تطبيق HR `/me/evaluations` — **تقييماتي**؛ API `/mobile/evaluations` و`/mobile/evaluations/:id` | جديد فوق EvaluationsModule؛ اقتباس self-scope من MobileModule الحالي | لا صفحة إدارة جديدة؛ نفس سجل التقييم ينشر للموظف بعد الاعتماد. | self-scope/404 لموظف آخر + notification idempotency؛ `mobile.png` و`api.json`. |
| EVAL-04 | دورة الإذن في HR: إضافة، تفاصيل، قبول/رفض؛ التسجيل 5. | **جزئي قوي**: modern Mobile يدعم list/create/action، الإدارة تدعم approve/reject، وlegacy compatibility فيه detail؛ modern detail endpoint/دليل UI كامل غير مثبت. | تطبيق HR `/me/permissions` — **الأذونات**؛ إدارة `/permissions` — **طلبات الأذونات** | Noamany الحالي | إكمال `GET /mobile/permissions/:id` بدل الاعتماد على legacy detail؛ نفس workflow. | اختبارات انتقال pending/accepted/rejected وself-scope؛ `mobile.png` إضافة/تفاصيل و`desktop.png` قبول/رفض. |

## 3. العضوية والباركود والنطاق

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| MEM-01 | رفع مستندات عند تعديل/حذف العضو؛ التسجيل 2. | **جزئي**: رفع/قراءة/حذف PDF واحد `membership_document_path` موجود؛ لا قائمة مستندات متعددة أو metadata. | `/club/members/:id?tab=documents` — **مستندات العضو** | توسعة Noamany؛ يمكن نقل document collection pattern من موظفي Noamany | تحويل الحقل المفرد إلى collection مع compatibility؛ لا صفحة sidebar. | upload/list/download/delete وMIME/signature/RBAC؛ `desktop.png` لأكثر من مستند. |
| BAR-01 | بعد كتابة كود العضو: صورة، آخر 5/10 اشتراكات، لوكر، أيام الوقف، ثم زر دخول؛ `Barcode.php:22-35` و`Get_DataMember.php:66-278`. | **جزئي**: الاستقبال يعرض الصورة والاشتراكات/التجميد وزر دخول صريح؛ لا locker subscriptions ولا حد آخر 10، ولا ماسح دائم. | `/club/reception` — **الاستقبال وتسجيل الحضور** | نقل PersistentScanner ومعاينة الاستقبال الأحدث من Fitnesstimegym ثم merge مع Noamany | صفحة الاستقبال هي canonical member scan؛ لا صفحة عضو جديدة. | resolve لا يسجل حضورًا؛ limit=10/locker/freeze؛ `desktop.png` قبل الضغط و`mobile.png`. |
| BAR-02 | حضور الاستاف بالباركود؛ التسجيل 2. | **مفقود**. | `/club/members/barcode-management?tab=staff` — **حضور الموظفين بالباركود** | جديد؛ reuse AttendanceModule + الماسح من Fitnesstimegym | tab داخل إدارة الباركود الحالية، لا sibling route في التنقل. | duplicate scan، دخول/خروج، فرع؛ `desktop.png` معاينة موظف ثم نجاح. |
| BAR-03 | حضور الحصص بالباركود؛ التسجيل 2؛ القديم `tasgel_hdoor_class.php`. | **مكتمل**: tab ومسارات class barcode موجودة، backend `checkInByBarcode/current` واختبارات موجودة. | `/club/members/barcode-management?tab=classes` — **حضور الحصص بالباركود** | Noamany الحالي | تثبيت هذا tab وإزالة aliases من التنقل عند الدمج. | إبقاء `club-classes.barcode.spec.ts` + branch/duplicate tests؛ `desktop.png`. |
| BAR-04 | ماسح يعمل من أي مكان، وهو الآن موجود في أحدث FITNESS TIME. | **مفقود في Noamany**. | مكوّن app-wide في shell؛ زر **مسح الكارت** في الشريط العلوي | نقل `PersistentScannerProvider` وTopbar integration من Fitnesstimegym | listener واحد فقط؛ النتائج تُوجّه حسب context إلى الاستقبال/الحضور/POS. | tests للـUSB buffer وcamera persistence وعدم تكرار listener؛ `desktop.png` من صفحة غير الاستقبال و`mobile.png`. |
| IA-01 | حذف المجموعات والفئات والاستبيانات؛ التسجيل 2. | **جزئي**: surveys ما زالت route/nav/API، وmember group models/controllers باقية. | إزالة `/club/members/surveys` وعناصر **استبيانات/مجموعات/فئات الأعضاء** | Noamany cleanup | إخفاء/تعطيل feature flags مع حفظ التاريخ؛ **لا تحذف تصنيفات منتجات الكافيه**. | route unavailable + nav/RBAC snapshots؛ `desktop.png` لقائمة العضوية بعد الإزالة. |
| SCOPE-01 | جنس العضو إلزامي حريمي/رجالي؛ التسجيل 2. | **مكتمل**: `ClubGender` لازم وواجهة التسجيل تطلبه. | `/club/members` — **الأعضاء** | Noamany الحالي | الإبقاء؛ migration queue للسجلات القديمة غير المعروفة فقط. | DTO/DB constraint؛ `desktop.png` validation وخياري حريمي/رجالي. |
| SCOPE-02 | كل التقارير، حتى الكافيه، تحتوي فرعًا وحريمي/رجالي؛ التسجيلان 2 و12. | **جزئي**: تقارير الاشتراكات تطبق الاثنين server-side؛ تقارير الكافيه تطبق الفرع فقط، وباقي التقارير غير موحدة. | نفس صفحات التقارير — فلتر **الفرع / القسم** | Noamany common report contract؛ نقل اتساق فلاتر Fitnesstimegym | component + DTO مشترك، لا report wrapper جديد. | parameterized tests لكل report/export؛ `desktop.png` لاشتراكات وكافيه بنفس الفلتر. |
| SCOPE-03 | موظف فرع حريمي لا يرى إلا الحريمي؛ التسجيل 2. | **جزئي**: BranchScope قوي، لكن الجنس/القسم فلتر لا حد تفويض شامل. | `/users/:id/permissions` — **نطاق الوصول للفرع والقسم** | توسعة Noamany RBAC/BranchScope | `audienceScope` جزء من authorization لا مجرد UI filter؛ admin فقط يرى all. | cross-gender leakage tests لكل list/count/export؛ `desktop.png` إعداد النطاق و`contract-test.txt`. |

## 4. خدمة العملاء والآراء

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| CS-01 | تقرير من/إلى، فرع، جنس، اشتراك جاري/منتهي؛ الاسم والكود والهاتف والاشتراك وتاريخه وإجراء رد/ملاحظة؛ التسجيل 3 و`follow/daily_follow.php`. | **مفقود**. | `/club/customer-service?tab=follow-up` — **متابعة العملاء** | نقل semantics من `application/views/follow/` إلى وحدة Nest/React جديدة | لا تستخدم CRM المبيعات ولا customer sources؛ غرض البيانات مختلف. | date/status/scope/pagination/export؛ `desktop.png` للفلتر والصفوف والإجراء. |
| CS-02 | بنود أسئلة يحددها المستخدم، وكل مكالمة تجيب كل بند وتضيف ملاحظة؛ `addfollowquestion.php` و`load_details_qresults.php`. | **مفقود**. | `/club/customer-service?tab=questions` — **بنود أسئلة المتابعة**؛ drawer **تسجيل مكالمة** | نقل legacy behavior مع data model حديث | question-set version + snapshot داخل نفس الوحدة. | حفظ إجابة لكل سؤال وعدم فقد التاريخ عند تعديل البنود؛ `desktop.png`. |
| CS-03 | تقرير آراء العملاء من/إلى + فرع + جنس + العميل/الهاتف/الرأي؛ التسجيل 10. | **مفقود**. | `/club/customer-service?tab=opinions` — **تقرير آراء العملاء** | نفس وحدة CS الجديدة | query على interactions/answers نفسها؛ لا جدول آراء مكرر. | filters/export/drill-down؛ `desktop.png` و`mobile.png` لعرض الرأي. |

## 5. الكافيه

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| CAFE-01 | العمل ثلاثة أنواع: Protein، Bar، مسحوبات إدارة بلا مبالغ؛ التسجيل 4. | **جزئي**: POS/منتجات/مخزون/جرد وحركة issue موجودة ومسجلة، لكن لا business classification ثابت للأنواع الثلاثة. | `/club/cafe/pos` — **نقطة بيع الكافيه**؛ `/club/cafe/inventory?tab=management-withdrawals` — **مسحوبات الإدارة** | reconcile من ONE80 الحالي إلى Noamany؛ schema extension جديد | أبقِ POS ومساراته الحالية `/sales*`، واجعل `/club/cafe/pos` مدخلًا صريحًا لنفس الـPOS؛ بوابة المبيعات الشخصية منفصلة على `/sales-portal`، والتصنيف enum لا تخمين من الاسم/category. | transaction/accounting/stock لكل نوع؛ `desktop.png` للأنواع الثلاثة و`mobile.png` POS. |
| CAFE-02 | تقارير مستقلة وموسومة Protein/Bar/مسحوبات إدارة، وكلها فرع/جنس؛ التسجيلان 4 و12. | **جزئي**: `/club/cafe/reports` غني وbranch-scoped، لكنه بلا tabs الثلاثة وبلا gender. | `/club/cafe/reports` — **تقارير الكافيه** | توسعة تقرير ONE80/Noamany الحالي | tabs داخل تقرير واحد: ملخص، Protein، Bar، مسحوبات الإدارة. | totals=source lines وfilters/export؛ `desktop.png` لكل tabs/الفرع/القسم. |
| CAFE-03 | Protein وحده يدخل التارجت، وداخل مبيعات التارجت يظهر Protein/Bar؛ التسجيلان 4 و9. | **جزئي وغير آمن**: payroll يملك `proten` commission، لكنه يبني الأساس من المبيعات المنسوبة بلا تصنيف عميل صريح. | `/club/targets?tab=sales` — **تارجت المبيعات** | Noamany payroll + classification الجديد؛ تحقق من legacy formula | immutable attribution عند اعتماد البيع؛ Bar/withdrawal لا يزيدان Protein target. | fixture بثلاث حركات يثبت احتساب Protein فقط؛ `desktop.png` و`contract-test.txt`. |

### خريطة كافيه موحدة بلا تضخم

`/club/cafe` **لوحة الكافيه**، `/club/cafe/pos` **نقطة البيع**، `/club/cafe/invoices` **الفواتير والورديات**، `/club/cafe/catalog` **المنتجات والخامات**، `/club/cafe/inventory` **الجرد والحركات**، `/club/cafe/procurement` **الموردون والمشتريات**، `/club/cafe/reports` **تقارير الكافيه**، `/club/cafe/settings` **الإعدادات**. الصفحات الحالية المتفرقة تصبح tabs أو مداخل صريحة لنفس الوظائف؛ تبقى مسارات POS الحالية `/sales*` محفوظة، ولا تستخدمها بوابة المبيعات الشخصية التي تملك `/sales-portal`.

## 6. الاشتراكات واللوكر وتقارير القديم

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| SUB-01 | تقرير اشتراكات يومي؛ التسجيل 6. | **مكتمل وظيفيًا**: التقرير الحالي يدعم DatePresets والفرع والجنس. | `/club/subscriptions/reports?preset=today` — **تقرير الاشتراكات اليومي** | Noamany الحالي | preset داخل تقرير الاشتراكات؛ لا صفحة يومية أخرى. | timezone/Cairo boundary + totals؛ `desktop.png`. |
| SUB-02 | تقرير اشتراكات خلال فترة؛ التسجيل 6. | **مكتمل**. | `/club/subscriptions/reports` — **تقارير الاشتراكات** | Noamany الحالي | نفس الصفحة مع custom range. | from/to/branch/gender/export؛ `desktop.png`. |
| LOCK-01 | جرد اللوكر: اختيار فرع وإدخال بيانات الجرد؛ التسجيل 6؛ legacy Locker_Inventory. | **مفقود runtime**: يوجد `club_locker_inventory_logs` تاريخي فقط، بلا service/controller/page. | `/club/lockers?tab=inventory` — **جرد اللوكر** | schema التاريخي في Noamany + workflow جديد مستلهم من legacy | tab داخل اللوكر، sessions + lines + draft/approved بدل log مفرد. | branch scope/differences/finalization؛ `desktop.png`. |
| LOCK-02 | تقرير مراجعة الجرد منفصل عن الإدخال وبعرض أفضل؛ التسجيل 6. | **مفقود**. | `/club/lockers?tab=inventory-review` — **مراجعة جرد اللوكر** | نفس وحدة LOCK-01 | tab read-only لا صفحة sidebar. | report totals/print/export؛ `desktop.png` KPIs والفروق والاعتماد. |
| REP-01 | «تقرير التحليل الشهري» بنفس نية القديم؛ `Report.php:608-636` والتسجيل 8. | **مفقود**: لا route/feature مطابق، رغم وجود تقارير عامة. | `/club/subscriptions/reports?tab=monthly-analysis` — **تقرير التحليل الشهري** | معادلات `application/models/Report_m.php` + مصادر Noamany | tab في تقارير الاشتراكات؛ توثيق المعادلات قبل النقل. | golden dataset يقارن القديم/الجديد؛ `desktop.png`. |
| REP-02 | شاشة/تقرير «التقفيل اليومي»؛ `Report.php:637-666` والتسجيل 8. | **جزئي**: يومية الكاشير موجودة وتجمع/تطابق، لكن close state محكوم ونهائي غير مثبت. | `/club/subscriptions/daily-cashier` — **التقفيل اليومي** | توسيع Noamany؛ مراجعة أحدث Fitnesstimegym | open/reviewed/closed + من أغلق ومتى؛ العكس المالي بدل تعديل يوم مغلق. | reconciliation/locking/reopen permission؛ `desktop.png` قبل/بعد الإغلاق. |

## 7. الموقع والمتجر وتطبيق الجيم

| ID | السلوك المطلوب ومصدر النية | حالة Noamany الحالية | المسار الدقيق / الاسم العربي | مالك التنفيذ / المصدر | قرار الدمج ومنع التكرار | الاختبار ودليل الصورة |
|---|---|---|---|---|---|---|
| WEB-01 | كل جزء في الموقع قابل للتغيير من الباك إند؛ التسجيل 7. | **جزئي قوي**: Portal Management يدير company/hero/media/branches/trainers/classes/store وcontent types كثيرة، لكن «كل جزء» لم يُثبت بمصفوفة DOM↔CMS، وبعض النصوص fallback ثابتة. | `/portal/section-settings` — **إعدادات أقسام الموقع** وباقي `/portal/*` | Noamany الحالي | الحفاظ على الإدارة الحالية؛ إضافة coverage manifest لا CMS جديد. | contract لكل section key + publish/cache؛ `desktop.png` لتعديل section ولقطة الموقع بعده. |
| WEB-02 | حذف الشريط الأحمر المتحرك؛ التسجيل 7. | **مفقود/مخالف**: `/portal/ticker` موجود و`main.js` ما زال يرسم ticker إذا وجدت بيانات. | **إزالة الشريط الأحمر المتحرك** وحذف `/portal/ticker` وticker من الموقع — لا اسم صفحة بديلة | Noamany website cleanup | migration يعطل العناصر ويحفظها للأرشيف؛ لا announcement بديل دون طلب. | DOM assertion no ticker + visual regression؛ `desktop.png` أعلى الرئيسية بلا شريط. |
| WEB-03 | تحسين تصميم الموقع؛ التسجيل 7. | **جزئي قوي**: `website-redesign` يحمل redesign متجاوب وهوية واضحة، لكن يلزم QA فعلي وتحقق ربط المحتوى. | الموقع العام `/` — **الرئيسية** | Noamany current redesign؛ Impeccable audit | polish للسطح الحالي، لا مشروع موقع ثانٍ. | Lighthouse/a11y/RTL/responsive/visual diff؛ `desktop.png` و`mobile.png` للصفحة كاملة. |
| WEB-04 | أيقونة السلة أعلى الهيدر، تصغير قسم المتجر، وإصلاح عرض/تباعد المنتجات؛ التسجيلان 7 و14. | **مكتمل في الكود**: cart links/count في headers، drawer وproduct grid/detail responsive موجودة. | `/shop.html` — **المتجر** | Noamany `website-redesign` الحالي | الإبقاء؛ لا متجر React إداري موازٍ. | cart persistence/count/product cards؛ `desktop.png` و`mobile.png` للهيدر والقسم والسلة. |
| APP-01 | تطبيق الجيم يعرض مدربي فرع العضو فقط؛ التسجيل 11. | **مفقود**: `/member/trainers` غير موجود؛ `/app/trainers` إدارة محتوى وليس API عضو branch-scoped. | تطبيق الجيم `/trainers` — **المدربون**؛ API `GET /member/trainers` | نقل implementation المختبر من Fitnesstimegym | الهوية/branch من member JWT، لا `branchId` موثوق من العميل. | عضوان من فرعين لا يتسرب بينهما مدرب؛ `mobile.png` و`contract-test.txt`. |
| APP-02 | API يحسب السعرات والكربوهيدرات والبروتين والدهون من بيانات الجسم؛ التسجيل 13، والمدخلات النهائية تنتظر شاشة هاجر. | **مفقود**: online-coaching nutrition يعيد empty state فقط. | تطبيق الجيم `/nutrition/calculator` — **حاسبة السعرات**؛ `POST /member/nutrition/calculate` | جديد؛ formula/version contract بعد شاشة هاجر | استبدال empty state، لا endpoint مكرر تحت app-management. | validation/unit conversion/golden formulas؛ `mobile.png` و`api.json`. |
| APP-03 | الباقات الثلاث: «اشترك الآن» بدل «اطلب السعر»، تفاصيل ثم تأكيد؛ التسجيل 14. | **جزئي**: membership plans قابلة للإدارة، لكن fallback لا يزال «اطلب السعر» ولا purchase flow للاشتراك. | `/memberships/:id` — **تفاصيل الاشتراك** ثم `/membership-checkout` — **تأكيد الاشتراك** | Noamany portal/package API + workflow جديد | استخدام club subscription type IDs؛ لا تخزين نسخة أسعار منفصلة في CMS. | ثلاث بطاقات/price/detail/id integrity؛ `desktop.png` و`mobile.png`. |
| APP-04 | إدارة طرق الدفع: الطريقة والرقم، وإرسالها للموقع/التطبيق؛ التسجيلان 13 و14. | **مفقود للاشتراك**: طرق POS/تقارير مالية لا تحقق public online payment methods؛ checkout المتجر يسمح COD فقط. | `/portal/payment-methods` — **طرق الدفع الأونلاين**؛ `GET /public/payment-methods` | جديد، مع الاستفادة من payment enums دون إعادة استخدام إعداد POS الداخلي | مورد واحد للموقع وتطبيق الجيم، global/branch وترتيب/نشاط. | masking/scope/order/active-only؛ `desktop.png` إدارة و`mobile.png` عرض الطرق والأرقام. |
| APP-05 | لا تأكيد قبل رفع صورة Instapay/إثبات الدفع؛ التسجيل 13–14. | **مفقود**. | خطوة **إثبات الدفع** داخل `/membership-checkout` | UploadsModule Noamany + model جديد | proof مرتبط بطلب staging، لا club subscription ولا order متجر. | MIME/signature/size/access/required؛ `mobile.png` قبل وبعد الرفع. |
| APP-06 | صفحة backend «اشتراكات الأونلاين» تعرض العميل والخطة والدفع والصورة والتفاصيل؛ التسجيل 14. | **مفقود**. | `/club/subscriptions/online` — **الاشتراكات الأونلاين** | جديد داخل ClubSubscriptionsModule | staging table مستقل بحالات draft/submitted/approved/rejected. | list/detail/filters/RBAC; `desktop.png` قائمة pending ودرج الإثبات. |
| APP-07 | عند التأكيد يترحل الطلب إلى الاشتراكات العادية؛ التسجيل 14. | **مفقود**. | `/club/subscriptions/online` — زر **اعتماد وترحيل الاشتراك** | جديد؛ reuse create subscription/receipt/accounting داخل transaction | idempotent promotion مع `promotedSubscriptionId`؛ الرفض لا ينشئ اشتراكًا. | concurrency/double click/rollback/accounting؛ `desktop-before.png` و`desktop-after.png` و`contract-test.txt`. |

## 8. ضوابط التنفيذ والترتيب

1. انقل أولًا بوابة المبيعات الشخصية والماسح الدائم من Fitnesstimegym، لكن لا تستبدل بوابة المدرب الموجودة. كيّف البوابة الشخصية إلى `/sales-portal` وتبويباتها، وأبقِ مسارات POS السبعة الحالية `/sales*` مسجلة؛ يمكن أن يظل `/club/cafe/pos` مدخلًا صريحًا لنفس POS من مساحة الكافيه.
2. ثبّت تصنيف معاملات الكافيه والنطاق branch+gender قبل بناء تقارير الكافيه أو التارجت؛ وإلا ستُبنى أرقام يصعب تصحيحها.
3. ابنِ customer-service وstaff-evaluations كموارد مستقلة؛ لا تحول Leads أو customer sources أو trainer member ratings إلى بدائل شكلية.
4. نفذ online-subscription staging والإثبات والترحيل كدورة ذرية قبل تغيير CTA إلى «اشترك الآن» في الإنتاج.
5. نقل ONE80 يكون schema/module reconciliation مع migrations قابلة للعكس، بلا بيانات حقيقية أو علامة ONE80، ومع حفظ تعديلات Noamany الحالية.
6. لا يقبل أي بند على أساس route وحده: يلزم API ناجح، صلاحية ونطاق، اختبار، desktop/mobile screenshot حسب الجدول، وREADME قصير يذكر الدور والفرع والقسم والبيانات المستخدمة.
