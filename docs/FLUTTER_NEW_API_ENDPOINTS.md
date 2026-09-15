# Flutter API — الواجهة الجديدة فقط

> مصدر هذا المستند هو الـ Backend الحالي. النطاق محصور في `/api/mobile/*` و`/api/uploads/*` فقط.

## 1. إعداد العميل في Flutter

```dart
const apiBaseUrl = 'https://YOUR_HOST/api';

final headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
};
```

- `POST /api/mobile/login` هو المسار الوحيد العام. كل المسارات الأخرى تتطلب `Authorization: Bearer <accessToken>`.
- الطلبات العادية JSON. رفع الملفات فقط `multipart/form-data`، واسم حقل الملف يجب أن يكون `file`.
- كل الأخطاء في الواجهة الحديثة تعيد HTTP status حقيقيًا بهذه الصيغة:

```json
{ "statusCode": 400, "message": "رسالة الخطأ" }
```

`message` قد تكون `String` أو `String[]` في أخطاء validation. لا يوجد غلاف `data/status/message` في الاستجابات الناجحة.

### قواعد الأنواع

| النوع | قاعدة Flutter |
| --- | --- |
| التواريخ | تُرسل كسلسلة `YYYY-MM-DD` ما لم يذكر غير ذلك. |
| الوقت | `HH:mm` أو صيغة `h:mm AM/PM` عند الإذن. |
| المعرفات | بعض الحقول الرقمية قد تصل كـ `String`؛ لا تحولها إلى `int` بلا فحص. |
| Pagination | `page` يبدأ من 1. في أغلب قوائم الموبايل الاسم `perPage`؛ الحد الفعلي الأقصى 100. قائمة الأذونات تستخدم `pageSize`. |
| الملفات | استخدم دائمًا `path` من endpoint الرفع في body التالي، وليس `url`. |

## 2. المصادقة والحساب والإشعارات

### `POST /api/mobile/login`

عام، JSON:

```json
{ "username": "employee.user", "password": "secret" }
```

نجاح `200`:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "sub": 12, "level": 2, "emp_code": 45, "branch": 3,
    "branch_name": "الفرع", "man_women_type": 0, "name": "اسم الموظف",
    "image": null, "job_title": "المسمى", "is_trainer": false, "trainer_id": null
  },
  "message": "تم تسجيل الدخول بنجاح",
  "accountType": "staff",
  "mustChangePassword": false
}
```

الحساب يجب أن يكون معتمدًا ومربوطًا بسجل موظف، وإلا يعيد `401`.

### `GET /api/mobile/profile`

يعيد `200`:

```json
{
  "user_id": "12", "emp_id": "45", "emp_code": "1001", "card_num": "...",
  "employee": "اسم الموظف", "edara_name": "الإدارة", "qsm_name": "القسم",
  "mosma_wazefy_name": "المسمى الوظيفي", "phone_number": "05...",
  "personal_photo": "image.jpg", "emp_img": "/uploads/...",
  "users_signatures": "signature.png", "emp_signature": "/uploads/...",
  "barcode_path": "", "qrcode_path": "", "email": "user@example.com",
  "send_msg": "no", "add_agaza": "yes", "add_ezn": "yes",
  "add_mobadra": "yes", "add_edary": "yes", "add_nashat": "yes",
  "show_netaq": "yes", "show_alert_screen": "yes", "with_ads": "yes",
  "show_main_ehsay": "no", "show_zeyara": "no", "add_zeyara": "yes"
}
```

### `POST /api/mobile/device-token`

JSON: `{ "token": "FCM_DEVICE_TOKEN" }`  
نجاح: `{ "ok": true }`.

### `GET /api/mobile/notifications`

يعيد آخر 50 إشعارًا، دون pagination:

```json
[
  {
    "id": 10, "fromUser": 4, "date": "2026-08-23", "time": "10:30",
    "seen": false, "seenDate": null, "code": 101,
    "notifyId": 1, "targetId": 245
  }
]
```

### `PATCH /api/mobile/notifications/:id/read`

بدون body. نجاح: `{ "id": 10, "seen": true }`.  
يعيد `404` إذا لم يوجد الإشعار و`403` إذا لم يكن للمستخدم الحالي.

## 3. الإجازات

### `GET /api/mobile/leaves`

يعيد آخر 50 طلب إجازة للمستخدم:

```json
{
  "data": [
    {
      "id": 17, "requestNo": 5001, "leaveTypeId": 2,
      "fromDate": "2026-08-25", "toDate": "2026-08-26", "days": 2,
      "reason": "سبب الطلب", "suspend": 0,
      "status": "send_to_direct_manager", "createdAt": "2026-08-23"
    }
  ]
}
```

لا يقبل `page` أو `perPage` ولا يعيد `total`.

### `GET /api/mobile/leaves/types`

يعيد قائمة مرقمة، مع `pageSize=100` في الخادم:

```json
{
  "data": [
    {
      "id": 2, "title": "نوع الإجازة", "category": 2,
      "maxDays": 30, "active": true, "hasSubstitute": false
    }
  ],
  "total": 5, "page": 1, "pageSize": 100
}
```

الحقول الداعمة لنوع الإجازة قد تتضمن أيضًا إعدادات الرصيد والنوع؛ لا تعتمد على ترتيب العناصر.

### `POST /api/mobile/leaves`

JSON:

```json
{
  "leaveTypeId": 2,
  "startDate": "2026-08-25",
  "endDate": "2026-08-26",
  "reason": "سبب اختياري"
}
```

نجاح:

```json
{ "id": 17, "agaza_rkm": 5001 }
```

ينشئ الطلب للمستخدم الموجود في JWT ويحوّله للمدير المباشر. لا يرسل العميل employee ID. هذا الـ DTO لا يحتوي دعمًا لرفع أو إرسال تقرير طبي.

## 4. الأذونات

### `GET /api/mobile/permissions`

Query اختياري: `page`, `pageSize`, `status`. القائمة دائمًا هي طلبات المستخدم الصادرة.

```json
{
  "data": [
    {
      "id": 20, "requestNo": 8001, "type": 1, "date": "2026-08-23",
      "fromTime": "09:00", "toTime": "10:00", "minutes": 60,
      "reason": "سبب الإذن", "currentTo": "المدير المباشر",
      "actionsSends": "send_to_direct_manager", "status": "pending", "canAction": false
    }
  ],
  "total": 1, "page": 1, "pageSize": 20
}
```

### `GET /api/mobile/permissions/available?date=YYYY-MM-DD`

`date` اختياري؛ إن غاب يستخدم تاريخ اليوم. نجاح:

```json
{
  "month": 8, "year": 2026,
  "usedMinutes": 60, "remainingMinutes": 60,
  "usedCount": 1, "remainingCount": 29,
  "maxMinutes": 120, "maxCount": 30
}
```

### `POST /api/mobile/permissions`

JSON:

```json
{
  "no3Ezn": 1,
  "eznDate": "2026-08-23",
  "fromHour": "09:00",
  "toHour": "10:00",
  "reason": "مراجعة",
  "fatraFk": 1
}
```

- `no3Ezn`: `1` شخصي، `2` للعمل.
- `fatraFk` اختياري: `1` صباحي، `2` مسائي.

نجاح:

```json
{ "id": 20, "eznRkm": 8001, "minutes": 60 }
```

## 5. مسار الاعتماد للإجازات والأذونات والسلف

ينشئ الموظف الطلب، ثم يوجهه الخادم تلقائيًا إلى **المدير المباشر**. عند كل موافقة ينتقل للمرحلة التالية بهذا الترتيب:

```text
الموظف
  → المدير المباشر
  → مدير الفرع / مستلم المرحلة الثانية
  → مسؤول الموارد البشرية
  → المدير العام
  → إغلاق الطلب وظهور النتيجة للموظف
```

وينطبق هذا التسلسل على الإجازات والأذونات والسلف. لا يرسل Flutter اسم المدير أو معرّفه؛ الخادم يحدد المستلم التالي من إعدادات الموظف والمسميات الوظيفية.

| المرحلة التي وافقت | حالة الإجازة أو الإذن `suspend` | حالة السلفة `suspend` |
| --- | ---: | ---: |
| المدير المباشر | `1` | `1` |
| مدير الفرع / المرحلة الثانية | `4` | `1` |
| مسؤول الموارد البشرية | `4` | `1` |
| المدير العام | `4` وإغلاق الطلب | `4` |

عند الرفض لا ينتقل الطلب إلى المرحلة التالية. `suspend` يصبح `2` إذا كان الرفض من المدير المباشر، و`5` إذا كان من أي مرحلة لاحقة. التنفيذ الحالي يعيد توجيه الطلب إلى **صاحبه** لإبلاغه بالرفض؛ لا يبقيه عند الرافض.

ملاحظة للـ Flutter: لا يوجد حاليًا endpoint موبايل لإجراء اعتماد الإجازة أو الإذن (`accept/reject`)؛ المتاح في واجهة الموبايل الحديثة هو إنشاء الطلب وعرض طلبات الموظف. السلف فقط لها إجراء اعتماد حديث: `PATCH /api/mobile/loans/:id/action`.

## 6. المهام والحضور والانصراف والزيارات

### المهام اليومية

| العملية | الطلب | response الناجح |
| --- | --- | --- |
| `GET /api/mobile/tasks?page=1&perPage=20&status=done` | كل query اختياري | `{data:[TaskRow],total,page,perPage}`؛ `TaskRow` هو سجل التقرير اليومي ويشمل على الأقل `id`, `title`, `notes`, `status`, `send_date_ar`, `send_time`, `for_month`, `for_year`. |
| `POST /api/mobile/tasks` | `{title,notes,status:"inprogress"|"done"}` | `{id}` |
| `DELETE /api/mobile/tasks/:id` | — | `{id}` |

### `POST /api/mobile/attendance/punch`

JSON:

```json
{ "lat": "24.7136", "long": "46.6753", "photo": "mobile_app/app-....jpg" }
```

`photo` اختياري ويجب أن يكون `path` من `POST /api/uploads/app`. يتحقق الخادم من الإحداثيات ومن النطاق الجغرافي للفرع، ويحدد بنفسه إن كانت العملية حضورًا أو انصرافًا.

#### ما الذي يحدث داخل الخادم بالترتيب؟

1. يتحقق من JWT ومن أن الحساب مربوط بموظف.
2. يتحقق أن `lat` و`long` أرقام صحيحة ضمن الحدود الجغرافية العالمية.
3. يحدد فرع البصمة من إعداد الموظف، ثم يتحقق من وجود إعدادات الفرع والإحداثيات ونصف القطر.
4. يحسب المسافة بين موقع الهاتف والفرع؛ إذا كانت أكبر من نصف القطر يعيد `400` ولا يسجل شيئًا.
5. يتحقق أن قناة تسجيل التطبيق مفعّلة وأن للموظف دوامًا/شفتًا صالحًا في الوقت الحالي.
6. يبحث عن بصمة حضور مفتوحة لليوم أو لشفت يمتد من أمس؛ إن وجدت يسجل **انصرافًا**، وإلا يسجل **حضورًا** حسب نافذة الشفت.
7. يمنع طلبين متزامنين لنفس الموظف، ويمنع التكرار خلال 45 ثانية، ويمنع حضورًا ثانيًا أو انصرافًا ثانيًا لنفس السجل.
8. يحسب التأخير للحضور، أو الانصراف المبكر والساعات الإضافية للانصراف، ثم يحفظ الموقع والصورة في سجل البصمة وسجل التاريخ.

الاستجابة تختلف باختلاف نوع العملية الذي حدده الخادم:

```json
// حضور
{
  "id": 700,
  "type": "in",
  "lateMin": 5,
  "branchId": 3,
  "branchName": "اسم الفرع",
  "distanceMeters": 72
}
```

```json
// انصراف
{
  "id": 700,
  "type": "out",
  "mobakerMin": 0,
  "overtimeMin": 30,
  "branchId": 3,
  "branchName": "اسم الفرع",
  "distanceMeters": 72
}
```

`id` هو معرّف سجل الحضور. أخطاء الإحداثيات أو الخروج من النطاق أو عدم وجود دوام أو محاولة بصمة مكررة تعيد `400` برسالة عربية واضحة.

#### السلوك عند انقطاع الإنترنت أو تعطل الخادم

يحفظ Flutter البصمة محليًا عند انقطاع الإنترنت أو فشل `5xx` أو timeout. يحتفظ بالسجل نفسه عند إعادة المحاولة: `offlineId` (UUID v4)، `capturedAtUtc`، `timezone`، الإحداثيات، ومسار الصورة المحلي إن وجدت. لا يقرر التطبيق هل هي حضور أم انصراف.

عند عودة الاتصال، يرفع التطبيق الصورة أولًا إلى `/api/uploads/app` إن وجدت، ثم يرسل كل عنصر معلّق منفصلًا ومرتبًا تصاعديًا حسب `capturedAtUtc` إلى:

### `POST /api/mobile/attendance/offline-sync`

```json
{
  "offlineId": "6c2d91fd-4637-4172-8e78-4c2f1bfe1c58",
  "capturedAtUtc": "2026-08-23T07:14:12.000Z",
  "timezone": "Africa/Cairo",
  "lat": "24.7136",
  "long": "46.6753",
  "photo": "mobile_app/app-20260823abcd.jpg"
}
```

الخادم يقبل البصمة فقط خلال 24 ساعة من وقت الالتقاط ولا يقبل وقتًا مستقبليًا. يتحقق من الموظف والموقع والنطاق الجغرافي وقناة التسجيل والوردية، ثم يستخدم **وقت وتاريخ الالتقاط** لا وقت المزامنة لاختيار الشفت وتحديد ما إذا كانت العملية حضورًا أو انصرافًا وحساب التأخير والانصراف المبكر والساعات الإضافية. لذلك تُسجل البصمة مباشرة في سجل الحضور في موعدها الأصلي، مع حفظ وقت وصولها إلى الخادم وعلامة `requiresReview: true` للتدقيق.

`offlineId` فريد لكل موظف وبصمة. عند timeout يعيد Flutter الطلب نفسه بالقيم نفسها؛ يعيد الخادم النتيجة السابقة مع `replayed: true` ولا ينشئ بصمة ثانية. أما إعادة المعرّف نفسه ببيانات مختلفة فتعيد `409`، وأخطاء `400` أو `401` أو `403` أو `409` توقف المحاولة التلقائية وتحتاج عرض سببها للمستخدم.

### `POST /api/mobile/visit`

JSON: `{ "lat": "24.7", "long": "46.6", "img": "path?", "notes": "نص؟" }`  
نجاح: `{ "id": 33 }`.

## 7. التعاميم والإنذارات والطلبات العامة

### التعاميم

| العملية | response الناجح |
| --- | --- |
| `GET /api/mobile/circulars?page=1&perPage=20` | `{data:[Circular],total,page,perPage}`. كل `Circular`: `id`, `title`, `subject`, `date`, `image`, `seen`, `detail_id`, `ta3mem_id_fk`, `emp_id`, `emp_code`, `emp_name`, `ta3mem_title`, `ta3mem_date`, `ta3mem_img`, `seen_value`, `seen_date`, `seen_time`. |
| `GET /api/mobile/circulars/:id` | كائن `Circular` واحد، لا array، مع `attachments:[{id,title,file}]`. |
| `PATCH /api/mobile/circulars/:id/read` | `{id,seen:true}` |

### الإنذارات

| العملية | response الناجح |
| --- | --- |
| `GET /api/mobile/warnings?page=1&perPage=20` | `{data:[Warning],total,page,perPage}`. كل `Warning`: `id`, `type`, `details`, `date`, `time`, `hrNotes`, `seen`، إضافة إلى النسخ النصية: `enzar_id_fk`, `emp_name`, `emp_name_id`, `emp_edara`, `emp_edara_id`, `emp_qesm`, `emp_qesm_id`, `enzar_type`. |
| `GET /api/mobile/warnings/:id` | كائن `Warning` واحد + `attachments:[{id,title,file}]`. |
| `PATCH /api/mobile/warnings/:id/read` | `{id,seen:true}` |

### `GET /api/mobile/requests`

يعيد آخر 50 طلبًا عامًا:

```json
{
  "data": [
    {
      "id": 90, "type": 1, "requestNo": 2026,
      "status": 0, "reasonAction": "", "createdAt": "2026-08-23"
    }
  ]
}
```

## 8. اللوائح والأنشطة والموظفون والرسائل

هذه المسارات حديثة في عنوانها، لكن بعض البيانات فيها ذات بنية واسعة مصدرها جداول الموارد البشرية. الحقول المعروضة أدناه هي التي يجب أن تعتمد عليها Flutter؛ قد توجد أعمدة إضافية ولا يجب أن تعطل الـ parsing.

### اللوائح

| العملية | response الناجح |
| --- | --- |
| `GET /api/mobile/legal-files?page=1&perPage=20` | `LegalFileRow[]`: صفوف اللوائح الموجهة للمستخدم، وبها معرف اللائحة واسمها وملفها وحالة القراءة. |
| `PATCH /api/mobile/legal-files/:id/read` | `{layha_id:"id",seen:"1"}` |

### الأنشطة

| العملية | الطلب | response الناجح |
| --- | --- | --- |
| `GET /api/mobile/activities?page=1&perPage=20` | — | `ActivityRow[]`: سجل النشاط وملفاته/وقت الإرسال. |
| `POST /api/mobile/activities` | `{title,notes?,files:["path1","path2"]}` | `{main_id:"123"}` |
| `DELETE /api/mobile/activities/:id` | — | `""` |

قبل إنشاء النشاط، ارفع كل ملف إلى `/api/uploads/activity` ثم ضع قيمة `path` لكل ملف في `files`.

### الموظفون والرسائل الداخلية

| العملية | الطلب / query | response الناجح |
| --- | --- | --- |
| `GET /api/mobile/employees?page=1&perPage=20` | pagination اختيارية | `EmployeeRow[]`. استخدم `user_id` من الصف كمستلم في الرسائل. |
| `POST /api/mobile/messages` | `{toUserIds:[12,13],subject:"العنوان",message:"النص",file?:"path"}` | `{msg_id:"123"}` |
| `GET /api/mobile/messages/inbox?page=1&perPage=20&status=...` | `status` اختياري | `MessageRow[]` للرسائل الواردة. |
| `GET /api/mobile/messages/sent?page=1&perPage=20` | pagination اختيارية | `MessageRow[]` للرسائل الصادرة. |
| `GET /api/mobile/messages/:id` | — | `[MessageRow]` — array من عنصر واحد. |
| `PATCH /api/mobile/messages/:id/read` | — | `[MessageRow]` بعد جعله مقروءًا. |
| `DELETE /api/mobile/messages/:id` | — | `""` |

`MessageRow` يتضمن بيانات المرسل/المستلم والعنوان والنص والمرفق والتواريخ وحالة القراءة. للملف: ارفعه إلى `/api/uploads/message` ثم أرسل `path` في `file`.

## 9. السلف

### `GET /api/mobile/loans/meta`

```json
{
  "empId": 45, "employeeName": "اسم الموظف", "employeeCode": 1001,
  "jobTitle": "المسمى", "nextRequestNumber": 120,
  "requestDate": "2026-08-23", "maxInstallments": 12,
  "repaymentMethods": [
    {"id":1,"name":"دفع نقداً"},
    {"id":2,"name":"تخصم مرة واحدة من الراتب"},
    {"id":3,"name":"تخصم شهرياً من الراتب"}
  ]
}
```

قد يحتوي أيضًا حقول حد السلفة والمبالغ/الاستحقاقات التي تحسبها الخدمة.

### `GET /api/mobile/loans?page=1&perPage=20&mode=sader`

`mode` اختياري: `sader` (افتراضي) أو `wared`. الاستجابة:

```json
{ "data": [Loan], "total": 1, "page": 1, "perPage": 20 }
```

### `GET /api/mobile/loans/:id`

يعيد `Loan` واحدًا. لا يتاح إلا لصاحب الطلب أو الموظف أو المستلم الحالي.

شكل `Loan` كامل:

```json
{
  "id": 1, "requestNumber": 120, "requestDate": "2026-08-23",
  "employeeId": 45, "employeeName": "اسم الموظف", "amount": 5000,
  "reason": "السبب", "repaymentMethod": 3,
  "repaymentMethodName": "تخصم شهرياً من الراتب", "installments": 5,
  "installmentAmount": 1000, "deductionStartDate": "2026-09-01",
  "deductionEndDate": "2027-01-01", "status": "pending",
  "suspend": 0, "currentStage": "approve_direct_manager",
  "currentStageName": "موافقة المدير المباشر",
  "currentToUserId": 13, "currentToUserName": "المدير",
  "reasonAction": "", "canAction": false, "canCancel": true
}
```

### `POST /api/mobile/loans`

```json
{
  "amount": 5000,
  "repaymentMethod": 3,
  "reason": "سبب السلفة",
  "installments": 5,
  "deductionStartDate": "2026-09-01"
}
```

- `amount` عدد صحيح أكبر من صفر.
- `repaymentMethod`: `1` نقدًا، `2` خصم مرة واحدة، `3` خصم شهري.
- `installments` و`deductionStartDate` اختياريان.

نجاح: كائن `Loan` السابق، بحالة `pending` ومحول للمدير المباشر.

### `PATCH /api/mobile/loans/:id/action`

JSON: `{ "action": "accept", "reason": "اختياري" }` أو `reject`.  
نجاح:

```json
{
  "id": 1,
  "stage": "approve_direct_manager",
  "status": "pending",
  "suspend": 1
}
```

لا يستطيع تنفيذ الإجراء إلا المستخدم الموجود في `currentToUserId`.

### `DELETE /api/mobile/loans/:id`

نجاح: `{ "id": 1, "status": "cancelled" }`.  
يسمح بالإلغاء لصاحب الطلب فقط قبل أن يبدأ المدير المباشر إجراءه.

## 10. رفع الملفات

كل المسارات هنا: `POST`, Bearer token, `multipart/form-data`, والحقل الوحيد للملف هو `file`.

الـ response ثابت:

```json
{
  "path": "folder/generated-file.jpg",
  "filename": "generated-file.jpg",
  "url": "/uploads/folder/generated-file.jpg"
}
```

| المسار | الاستخدام | الأنواع المقبولة | الحد |
| --- | --- | --- | ---: |
| `POST /api/uploads/app` | صورة بصمة الحضور في `photo` | JPEG, PNG, GIF, WebP | 10MB |
| `POST /api/uploads/activity` | عناصر `files` للنشاط | JPEG, PNG, GIF, WebP | 10MB |
| `POST /api/uploads/message` | `file` للرسالة | صور، PDF، DOC/DOCX، XLS/XLSX | 20MB |
| `POST /api/uploads/document` | رفع مستند عام | صور، PDF، DOC/DOCX، XLS/XLSX | 20MB |

الخادم يفحص نوع المحتوى وتوقيع الملف وحجمه. `400` يعني فئة غير صحيحة أو ملف مفقود أو نوع/حجم/محتوى غير مقبول.

## 11. ملخص كامل للمسارات

| المجموعة | العمليات |
| --- | --- |
| حساب | `POST /mobile/login`, `GET /mobile/profile`, `POST /mobile/device-token` |
| إشعارات | `GET /mobile/notifications`, `PATCH /mobile/notifications/:id/read` |
| إجازات | `GET, POST /mobile/leaves`, `GET /mobile/leaves/types` |
| أذونات | `GET, POST /mobile/permissions`, `GET /mobile/permissions/available` |
| مهام | `GET, POST /mobile/tasks`, `DELETE /mobile/tasks/:id` |
| حضور | `POST /mobile/attendance/punch` |
| تعاميم | `GET /mobile/circulars`, `GET /mobile/circulars/:id`, `PATCH /mobile/circulars/:id/read` |
| إنذارات | `GET /mobile/warnings`, `GET /mobile/warnings/:id`, `PATCH /mobile/warnings/:id/read` |
| طلبات/زيارات | `GET /mobile/requests`, `POST /mobile/visit` |
| لوائح/أنشطة | `GET /mobile/legal-files`, `PATCH /mobile/legal-files/:id/read`, `GET, POST /mobile/activities`, `DELETE /mobile/activities/:id` |
| موظفون/رسائل | `GET /mobile/employees`, `POST /mobile/messages`, `GET /mobile/messages/inbox`, `GET /mobile/messages/sent`, `GET /mobile/messages/:id`, `PATCH /mobile/messages/:id/read`, `DELETE /mobile/messages/:id` |
| سلف | `GET /mobile/loans/meta`, `GET, POST /mobile/loans`, `GET /mobile/loans/:id`, `PATCH /mobile/loans/:id/action`, `DELETE /mobile/loans/:id` |
| ملفات | `POST /uploads/app`, `/activity`, `/message`, `/document` |

جميع المسارات في الملخص تبدأ بـ `/api`؛ مثلًا `GET /mobile/profile` تعني `GET /api/mobile/profile`.
