# مراجعة الموارد البشرية وAPI تطبيق الموظفين والحضور والانصراف

**التاريخ:** 15 أغسطس 2026  
**البيئة:** النسخة الحالية المبنية محلياً على `localhost:4100`  
**سياسة الاختبار:** قراءة واختبارات تحقق فقط؛ لم يتم إنشاء أو حذف حركات حضور أو بيانات HR.

## الخلاصة

- الجزء الإداري من HR يعمل جيداً في البناء والقراءة والاختبارات الآلية.
- API تطبيق الموظفين يعمل للحسابات المنشأة من شاشة الموظف بالربط الحديث، لكن حسابات الـseed القديمة تستخدم ربطاً مختلفاً ويجب ترحيلها أو إيقافها.
- خوارزمية البصمة نفسها قوية نسبياً: JWT + GPS + وردية + منع تكرار + transaction + سجل تاريخي.
- البصمة من التطبيق لا تعمل حالياً حتى للحساب الصحيح؛ التنفيذ يستخدم `emp_sign + tbl_sites` بدلاً من فرع الموظف و`branch_settings` الذي يحتوي إعدادات GPS للفروع السبعة.
- تقارير الحضور وقوائم الموظفين لا تطبق فرع المستخدم افتراضياً، ولذلك مدير الفرع يستطيع رؤية بيانات فروع أخرى.
- مزامنة جهاز البصمة الحالية تختبر فتح TCP port 4370 فقط؛ لا تسحب حركات البصمة من الجهاز.

## نتائج الاختبارات

### إعادة الاختبار على سارة عبدالعزيز الخالدي

سجل الموظفة مضبوط على `employees.id=36` و`emp_code=1036` و`branch_id_fk=1`، وفرعها هو Noamany CLUB - فرع A1. يوجد لها حساب حديث صحيح باسم المستخدم `0585479440` يخزن `users.emp_code=36` و`users.branch_id_fk=1`.

بهذا الحساب نجح تسجيل الدخول الحديث والقديم، ونجحت profile والإجازات والأذونات والمهام والتعاميم والإنذارات والطلبات والملفات والأنشطة والرسائل والسلف بـHTTP 200.

يوجد أيضاً حساب seed قديم `emp1036` يخزن `users.emp_code=1036` وفرعه 2. هذا حساب مكرر وغير صحيح لنفس الموظفة ويمكنه تسجيل الدخول، ويجب إيقافه بعد مراجعة أي بيانات مرتبطة به.

اختبار البصمة على إحداثيات فرعها المسجلة في `branch_settings` (`24.72, 46.84`) أعاد 400: "لا يوجد فرع مسجل مرتبط بهذا الموظف"، ولم تُسجل حركة. السبب أن AttendanceService لم يقرأ `employees.branch_id_fk=1` ولا `branch_settings.id=1`، بل حاول قراءة `employees.emp_sign` وهو null.

### الاختبارات الآلية

- 15 test suites ناجحة.
- 56 اختباراً ناجحاً.
- شملت attendance، mobile، employees، leaves، permissions، loans وpayroll.
- الاختبارات تغطي GPS geofence، ربط البصمة بهوية JWT، رفض الموقع الخارجي، تعدد الورديات، تقرير الحضور الكامل، ملكية مهام الموظف، التعاميم والإنذارات، الإجازات، السلف والرواتب.

### HR API الإداري

- تم اختبار 48 مسار GET متعلقاً بالموظفين والحضور والإجازات والأذونات والرواتب والسلف والجزاءات والمكافآت والمأموريات والتعاميم والمهام.
- نجح 45 مباشرة.
- ثلاثة أعادت 400 لأن مدخلات إلزامية لم تُرسل، ثم نجحت بـ200 عند إرسالها:
  - `/api/payroll/preview?fromDate=...&toDate=...`
  - `/api/leaves/available?empId=...&leaveTypeId=...`
  - `/api/permissions/available?empId=...`

### Mobile API بحساب موظف حقيقي

حساب الاختبار: `emp1005`، الفرع 1.

| المسار | النتيجة |
|---|---|
| `POST /api/mobile/login` | 200 وتوكن صحيح |
| `GET /api/mobile/profile` | 200 لكن بيانات الموظف التفصيلية فارغة |
| `GET /api/mobile/permissions` | 200 |
| `GET /api/mobile/messages/inbox` | 200 |
| `GET /api/mobile/messages/sent` | 200 |
| `GET /api/mobile/leaves` | 404 الموظف غير موجود |
| `GET /api/mobile/tasks` | 404 |
| `GET /api/mobile/circulars` | 404 |
| `GET /api/mobile/warnings` | 404 |
| `GET /api/mobile/requests` | 404 |
| `GET /api/mobile/legal-files` | 404 |
| `GET /api/mobile/activities` | 404 |
| `GET /api/mobile/employees` | 404 |
| `GET /api/mobile/loans/meta` | 404 |
| `GET /api/mobile/loans` | 404 |
| `POST /api/mobile/attendance/punch` | 404 الموظف غير موجود، ولم تُكتب حركة |

### Legacy API

- `POST /Api/login_app` بالـusername: ينجح ويعيد التوكن.
- نفس المسار بكود الموظف `1005`: يعيد logical status 400 "رقم الجوال غير موجود".
- `/Api/getProfile`: status 200 لكن `emp_id` و`emp_code` والإدارة والقسم فارغة.
- `/Api/Basma_Today`: logical status 400 "الموظف غير موجود".
- `/Api/attendance`: logical status 400 "الموظف غير موجود".

## سبب تعطل حسابات الـseed القديمة

حسابات الـseed القديمة تخزن:

```text
users.emp_code = employees.emp_code
```

مثال حساب `emp1005`:

```text
users.emp_code       = 1005
employees.id         = 5
employees.emp_code   = 1005
```

لكن Auth وMobile وAttendance وLoans وبعض الخدمات تبحث هكذا:

```text
employees.id = users.emp_code
```

أي أنها تبحث عن `employees.id = 1005` ولا تجد موظفاً.

الحسابات الجديدة المنشأة من شاشة الموظف تخزن `users.emp_code=employees.id` وتعمل، كما أثبت اختبار سارة. المشكلة هي وجود الحسابات القديمة بالتوازي واحتمال تكرار حسابين للموظف نفسه.

### الحل

الحل الأفضل إضافة `users.employee_id` كـForeign Key صريح على `employees.id` ثم ترحيل البيانات. كحل مرحلي فقط، ينشأ Resolver واحد يستخدم:

1. `employees.id` عند وجود `employee_id` الصريح.
2. fallback على `employees.emp_code` للبيانات القديمة.
3. يمنع استخدام منطق مختلف داخل كل Service.

يجب تعديل Auth وMobileService وLegacyMobileCompatService وAttendanceService وLoansService وWorkspaceService لاستخدام نفس الـResolver.

## طريقة عمل API الحضور والانصراف

### 1. تسجيل الدخول

```http
POST /api/mobile/login
Content-Type: application/json

{
  "username": "emp1005",
  "password": "..."
}
```

الاستجابة تحتوي `accessToken`. كل الطلبات التالية ترسل:

```http
Authorization: Bearer <accessToken>
```

### 2. رفع الصورة، إن كانت مطلوبة

```http
POST /api/uploads/app
Content-Type: multipart/form-data
file=<image>
```

ثم يرسل التطبيق `path` الناتج في `photo`. الصورة اختيارية حالياً على مستوى Attendance DTO.

### 3. إرسال البصمة

```http
POST /api/mobile/attendance/punch
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "lat": "24.713600",
  "long": "46.675300",
  "photo": "mobile_app/example.jpg"
}
```

لا يرسل التطبيق `empCode` أو `type` أو وقت البصمة. الخادم يستخرج الموظف من JWT، ويأخذ الوقت من ساعة الخادم، ويحدد تلقائياً إن كانت الحركة حضوراً أو انصرافاً.

### 4. خطوات المعالجة داخل الخادم

1. التحقق من صحة JWT.
2. استخراج الموظف المرتبط بالحساب.
3. التحقق من أن `lat/long` أرقام داخل المدى الصحيح.
4. التنفيذ الحالي يحدد الموقع من `emp_sign + tbl_sites`؛ المطلوب تصحيحه ليستخدم `employees.branch_id_fk + branch_settings`.
5. حساب المسافة بالمتر والتحقق من `tbl_sites.radius`.
6. التأكد أن قناة `app` مفعلة في `attendance_channels`.
7. جلب وردية الموظف من تكليفات الورديات أو `hr_emp_dwam`.
8. اختيار الوردية الرئيسية أو البديلة أو الإضافية الأقرب للوقت الحالي.
9. اكتشاف `in` أو `out` تلقائياً.
10. منع الطلبات المتزامنة لنفس الموظف باستخدام in-process lock وMySQL named lock.
11. منع تكرار البصمة خلال 45 ثانية ومنع تكرار حضور/انصراف نفس الوردية.
12. عند الانصراف المبكر، التحقق من وجود إذن معتمد يغطي الوقت.
13. حساب التأخير والانصراف المبكر والإضافي طبقاً للقواعد.
14. الكتابة في `tbl_hdoor_emps` وإنشاء حركة تاريخية في `tbl_hdoor_emps_history` داخل transaction واحدة.

### 5. استجابة الحضور

```json
{
  "id": 123,
  "type": "in",
  "lateMin": 0,
  "branchId": 1,
  "branchName": "اسم الموقع",
  "distanceMeters": 20
}
```

### 6. استجابة الانصراف

```json
{
  "id": 123,
  "type": "out",
  "mobakerMin": 0,
  "overtimeMin": 15,
  "branchId": 1,
  "branchName": "اسم الموقع",
  "distanceMeters": 20
}
```

### Legacy aliases

التطبيق القديم يستطيع استخدام أحد المسارات التالية مع نفس Bearer token:

```text
/Api/add_hdor_ensraf
/Api/add_hdor_ensraf_asly
/Api/attendance_new
/Api/attendance
```

ويرسل `lat` و`long` و`basma_img`. الـLegacy API يعيد HTTP 200 غالباً، ولذلك يجب فحص `body.status == 200` أيضاً.

## مشكلات إعداد GPS والفروع

يوجد جدول `branch_settings` وفيه الفروع السبعة وإحداثيات `lat_map/long_map` ونصف القطر `distance`، وهو الجدول الذي يتوافق مع اختيار فرع الموظف من `tbl_branches`.

لكن `mobilePunch()` لا يستخدم هذا الجدول. هو يقرأ `employees.emp_sign` ثم يبحث عن نفس الرقم في `tbl_sites`. كل الموظفين الحاليين لديهم `emp_sign=null`، ولذلك تتوقف البصمة برسالة عدم وجود فرع مسجل حتى لو كان `branch_id_fk` صحيحاً.

كما يستخدم الكود `tbl_sites.id` كأنه `branchId` عند تسجيل الحركة. جدول `tbl_sites` الحالي يحتوي مواقع مهام وزيارات مثل البنك والتأمينات، وليس إعدادات فروع النادي.

### التصميم المقترح للفروع السبعة

1. قراءة `branchId = employee.branch_id_fk`.
2. التأكد أن الفرع موجود في `tbl_branches`.
3. قراءة geofence من `branch_settings.id = branchId`.
4. تحويل `lat_map/long_map` إلى أرقام والتحقق من `distance`.
5. تسجيل `tbl_hdoor_emps.branch_id_fk = employee.branch_id_fk`.
6. الاحتفاظ بـ`tbl_sites` للمهام والزيارات فقط، وعدم استخدامه كبديل عن الفرع في بصمة الدوام.
7. إذا كان الموظف يستطيع البصمة من أكثر من فرع، يضاف جدول `employee_allowed_branches` بدلاً من القيمة النصية `emp_sign='all'`.
8. إضافة اختبار تكامل يستخدم موظفاً حقيقياً مثل سارة ويثبت أن فرع الموظف هو نفس فرع الـgeofence والحركة.

## ثغرة عزل الفروع داخل HR والحضور

بحساب مدير الفرع 2:

| الاختبار | بدون فلتر | فلتر الفرع 2 |
|---|---:|---:|
| الموظفون | 36 | 7 |
| Full attendance لشهر | 1080 | 210 |
| تقرير البصمة | 643 | 131 |
| تقرير التأخير | 36 | 7 |
| تقرير الغياب | 36 | 7 |
| تقرير الإضافي | 10 | 1 |
| تقرير تبديل الورديات | 7 | 3 |

الفلتر الصريح لفرع آخر يعيد 403، لكن عدم إرسال فلتر يعرض جميع الفروع. كما تمكن مدير الفرع من فتح موظف من فرع آخر بالـID، ورأى الأجهزة التسعة وكل تبديلات الورديات والساعات الإضافية.

### الحل

- تمرير `@CurrentUser()` إلى كل تقارير Attendance وإلى Employees list/detail.
- تطبيق `BranchScopeService.resolveListFilter()` حتى عند غياب `branchId`.
- التحقق من الفرع قبل فتح employee/detail أو أي تعديل بالـID.
- تطبيق BranchScope على devices وshift-swaps وextra-hours.
- إبقاء تعريفات الورديات العامة global إذا كان هذا قرار العمل، لكن تكليف الموظفين والحركات والتقارير يجب أن يكون scoped.

## أجهزة البصمة

يوجد 9 أجهزة مسجلة. دالة `syncDevice()` الحالية:

- تحاول فتح اتصال TCP على IP الجهاز والمنفذ 4370.
- تغير الحالة إلى online/offline وتحدث `last_sync` عند نجاح الاتصال.
- **لا تقرأ المستخدمين أو سجلات الحضور من الجهاز، ولا تكتبها في جداول الحضور.**

الإدخال الفعلي المتاح حالياً من الأجهزة هو رفع ملف XLSX عبر:

```text
POST /api/attendance/imports/device-file
multipart field: hdoor_file
```

إذا كان المطلوب مزامنة حقيقية مع أجهزة ZKTeco أو غيرها، يلزم connector/SDK يجلب logs ويحولها إلى `performCheck` أو import pipeline مع idempotency، وربط كل جهاز بفرعه.

## ملاحظات أمان إضافية

- GPS المرسل من الهاتف يمكن تزويره تقنياً؛ للمستوى الأعلى من الأمان يضاف device attestation، كشف mock location، دقة الموقع `accuracy`، timestamp وnonce.
- الصورة اختيارية حالياً؛ إن كانت سياسة العمل تفرض selfie فيجب جعلها required والتحقق من أن path صادر من Upload API للمستخدم نفسه.
- مدير الفرع لديه view لتقارير الحضور لكنه لا يملك `attendance:update`؛ محاولة البصمة اليدوية أعادت 403. هذا سلوك صحيح إذا كان التسجيل اليدوي محصوراً في HR/Admin.
- وقت البصمة الفعلي من الخادم في Mobile API، وهو سلوك صحيح.
- دعم ورديات الليل وتعدد الورديات موجود، مع امتداد معالجة الانصراف حتى 8 ساعات بعد نافذة الانصراف.

## ترتيب الإصلاح

1. الاحتفاظ بالربط الحديث User → Employee وإيقاف/ترحيل الحسابات القديمة المكررة.
2. تعديل البصمة لتستخدم Employee branch → `branch_settings` مباشرة.
3. إصلاح BranchScope في Employees وAttendance reports/details/devices/adjustments.
4. إنشاء حساب موظف اختباري حقيقي وتشغيل دورة: login → profile → in → Basma_Today → out.
5. اختبار early checkout بإذن وبدون إذن، duplicate punch، night shift وmulti-shift.
6. تحديد هل الأجهزة تحتاج مجرد health check ورفع ملف، أم مزامنة حقيقية؛ ثم تنفيذ connector عند الحاجة.
7. إعادة اختبار كل Modern وLegacy mobile endpoints بحساب موظف ومدير فرع ومدير نظام.
