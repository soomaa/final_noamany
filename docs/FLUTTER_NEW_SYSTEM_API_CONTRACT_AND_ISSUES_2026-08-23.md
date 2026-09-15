# عقد Flutter API للنظام الجديد ومراجعة التعارضات

> **تاريخ المراجعة:** 2026-08-23  
> **مصدر الحقيقة:** كود الـ Backend الحالي داخل `backend/src`، وليس ملفات Postman أو وثائق التسليم الأقدم.  
> **النطاق:** تطبيق الموظفين الجديد فقط: 44 عملية تحت `/api/mobile`، وأربع عمليات رفع يحتاجها التطبيق تحت `/api/uploads`. واجهة `/Api` القديمة وواجهة أعضاء النادي `/api/member` خارج النطاق.

> **آخر تحديث تنفيذي:** تم تطبيق قواعد الإجازة المرضية الاختيارية، حد ثلاث طلبات مرضية في الشهر، وتبويبات/إجراءات الإجازات والأذونات والسلف الواردة في هذا المستند. في حال تعارض فقرة قديمة مع هذا التحديث، تكون هذه القواعد والـ endpoints أدناه هي المرجع.

## الخلاصة التنفيذية

- العنوان الحديث يبدأ دائمًا بـ `/api` بحروف صغيرة. الخادم يفعّل case-sensitive routing؛ لذلك `/Api` واجهة أخرى قديمة وليست alias للحديثة.
- نجاح الـ API الحديث لا يملك غلافًا موحدًا. توجد استجابات كائن، وarray خام، و`{data: [...]}`، وشكلان مختلفان للـ pagination. لا يجوز استخدام parser واحد يفترض دائمًا `response.data['data']`.
- كل العمليات محمية بـ Bearer JWT ما عدا `POST /api/mobile/login`. مدة access token الافتراضية ساعتان وrefresh token سبعة أيام.
- `POST` يعيد غالبًا HTTP `201`، باستثناء login وdevice-token والـ auth المشترك اللذين يعيدان `200`. Flutter يجب أن يعتبر كل `2xx` نجاحًا، لا `200` فقط.
- لا يوجد سورس تطبيق Flutter الكامل في مساحة العمل. الموجود `docs/flutter/noamany_legacy_api.dart` يخص الواجهة القديمة ويثبت `/Api`. لذلك يمكن تأكيد عقد الخادم والتعارض مع ملفات التسليم، لكن لا يمكن إثبات أي endpoint تستدعيه نسخة APK الفعلية دون سورسها أو network log منها.

## قرار منطق العمل المطلوب ومقارنته بالحالي

هذه هي متطلبات العمل التي يجب اعتبارها معيار القبول، بصرف النظر عن أسماء حقول JSON:

| الوظيفة | السلوك المطلوب | حالة الـ Backend الحديث الآن |
| --- | --- | --- |
| الإجازة المرضية | عند اختيار النوع المرضي يظهر إرفاق تقرير طبي **اختياري**. يقبل صورة أو ملفًا، يُرفع أولًا إن اختاره المستخدم، ثم يحفظ مساره مع الطلب. لا يمنع غياب التقرير إرسال الطلب. الحد الأقصى 3 طلبات مرضية في الشهر للموظف. | **منفذ.** يقبل `POST /api/mobile/leaves` حقول التقرير الاختيارية، ويحفظها عند وجودها. |
| الصادر | طلبات الإجازة/الإذن/السلفة التي أنشأها المستخدم الحالي، مع حالتها الحالية. | **منفذ:** `mode=sader`، وهو الافتراضي. |
| الوارد | الطلبات المفتوحة المحولة الآن للمستخدم الحالي، مع `canAction` وإجراء قبول/رفض. | **منفذ** في الموديولات الثلاثة عبر `mode=wared` و`PATCH .../:id/action`. |
| المقبولة | الطلبات ذات `suspend=1` أو `suspend=4` بحسب قاعدة العمل المعتمدة. | **منفذ:** `mode=accept`. |
| المرفوضة | الطلبات ذات `suspend=2` أو `suspend=5` بحسب قاعدة العمل المعتمدة. | **منفذ:** `mode=reject`. السلف تضيف تبويبًا أدق `mode=cancelled` لقيمة `5`. |

### دورة الإجازة المرضية الصحيحة

1. يعتمد Backend الحالي على النوعين 3 و4 للإجازة المرضية.
2. عند اختيار هذا النوع، Flutter يظهر اختيار الملف **اختياريًا**.
3. Flutter يرفع الصورة/الملف إلى `POST /api/uploads/document` بالحقل `file`.
4. يأخذ `path` من response، ثم يرسل `hospitalReport:path` مع بيانات الإجازة. يمكن إرسال `maradName` و`hospitalName` إذا كانا مطلوبين في النموذج.
5. Backend DTO يسمح بهذه الحقول، والخدمة لا تشترط التقرير؛ وتمنع فقط إنشاء طلب مرضي رابع في الشهر نفسه.
6. نجاح إنشاء الطلب لا يعني اعتماده؛ يبدأ في الصادر بحالة pending ويتحول إلى الوارد عند المدير المباشر.

### دورة الصادر والوارد والمقبولة والمرفوضة

العقد الوظيفي الأنسب للموديولات الثلاثة هو نفس query ونفس المعنى:

```text
GET /api/mobile/{leaves|permissions}?mode=sader|wared|accept|reject&page=1&pageSize=20
GET /api/mobile/loans?mode=sader|wared|accept|reject|cancelled&page=1&perPage=20
```

- `sader`: كل ما أنشأه المستخدم، مع الحالة الحالية.
- `wared`: ما كان `current_to_user_id` فيه هو المستخدم الحالي وما زال له إجراء مفتوح.
- `accept`: `suspend=1` أو `suspend=4`.
- `reject`: `suspend=2` أو `suspend=5`.
- `cancelled`: للسلف فقط، وهي subset دقيقة من المرفوض حيث `suspend=5`.
- قبول/رفض الوارد يجب أن يكون بعقد موحد مثل `PATCH /api/mobile/{module}/:id/action`، ولا يُسمح به إلا للمستخدم الحالي في `current_to_user_id`.
- بعد أي action يجب أن يخرج الطلب من وارد المنفذ، وينتقل للمحطة التالية أو للحالة النهائية، مع حفظ تاريخ الإجراء كي لا تضيع الطلبات التي سبق للمدير التعامل معها.

كل workflows الداخلية للإجازات والأذونات والسلف متاحة الآن من الـ MobileController بالعقود أعلاه.

## 1. إعداد الاتصال في Flutter

### العناوين

إذا كان أصل الخادم مثلًا:

```text
https://final.noamanycenter.com
```

فاستخدمي قيمتين منفصلتين:

```dart
const origin = 'https://final.noamanycenter.com';
const apiBaseUrl = '$origin/api';
```

- API: `apiBaseUrl + '/mobile/profile'`.
- ملف عام من response الرفع: `origin + response.url`، وليس `apiBaseUrl + response.url`؛ لأن `url` يبدأ بـ `/uploads` وليس `/api/uploads`.

### Headers

```http
Authorization: Bearer <accessToken>
Accept: application/json
Content-Type: application/json
```

في رفع الملفات يضبط Dio حدود `multipart/form-data` بنفسه، ويجب أن يكون اسم الحقل `file` حرفيًا. لا تعتمدي على إرسال token داخل multipart body؛ الحارس يعمل قبل تحليل الملف، لذلك Bearer header هو الطريقة المضمونة.

### نموذج Dio مختصر

```dart
final dio = Dio(BaseOptions(
  baseUrl: '$origin/api',
  headers: {'Accept': 'application/json'},
  validateStatus: (code) => code != null && code < 500,
));

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) async {
    final token = await secureStorage.read(key: 'accessToken');
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  },
));
```

افحصي success هكذا: `statusCode >= 200 && statusCode < 300`. لا تفترضي أن body Map؛ بعض العمليات تعيد `List` أو string فارغة.

### الأخطاء العامة

كل أخطاء الواجهة الحديثة تستخدم HTTP status حقيقيًا، ويحوّلها الفلتر العام إلى:

```json
{
  "statusCode": 400,
  "message": "رسالة عربية أو قائمة رسائل تحقق"
}
```

الحالات الأهم: `400` بيانات/قواعد عمل، `401` token مفقود أو منتهي، `403` المورد ليس للمستخدم، `404` غير موجود، `409` قيمة مكررة، `500` عطل غير متوقع يجب تسجيله في الخادم.

## 2. الحساب والجلسة والإشعارات

### `POST /api/mobile/login` — عام — HTTP 200

Request:

```json
{ "username": "employee_username", "password": "secret" }
```

كل قيمة string وطولها 3 أحرف على الأقل. `username` هو `users.username`؛ رقم الهاتف يعمل فقط إذا كان هو نفسه اسم المستخدم المسجل.

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "sub": 12,
    "level": 2,
    "emp_code": 45,
    "branch": 3,
    "branch_name": "الفرع",
    "man_women_type": 1,
    "name": "اسم المستخدم",
    "image": "file.png",
    "job_title": "المسمى",
    "is_trainer": false,
    "trainer_id": null
  },
  "message": "تم تسجيل الدخول بنجاح",
  "accountType": "staff",
  "mustChangePassword": false
}
```

يرفض login الحساب غير المعتمد، أو غير المرتبط بموظف، أو المرتبط بسجل موظف غير موجود. الحد 10 محاولات/دقيقة.

### `GET /api/mobile/profile` — HTTP 200

Response كائن خام:

```json
{
  "user_id": "12",
  "emp_id": "45",
  "emp_code": "1001",
  "card_num": "123456",
  "employee": "اسم الموظف",
  "edara_name": "الإدارة",
  "qsm_name": "القسم",
  "mosma_wazefy_name": "المسمى",
  "phone_number": "010...",
  "personal_photo": "photo.png",
  "emp_img": "/uploads/human_resources/emp_photo/thumbs/photo.png",
  "users_signatures": "sign.png",
  "emp_signature": "/uploads/emp_signatures/sign.png",
  "barcode_path": "...",
  "qrcode_path": "...",
  "email": "name@example.com",
  "send_msg": "no",
  "add_agaza": "yes",
  "add_ezn": "yes",
  "add_mobadra": "yes",
  "add_edary": "yes",
  "add_nashat": "yes",
  "show_netaq": "yes",
  "show_alert_screen": "yes",
  "with_ads": "yes",
  "show_main_ehsay": "no",
  "show_zeyara": "no",
  "add_zeyara": "yes"
}
```

مهم: اسم الموظف هو `employee` وليس `emp_name`، والهاتف `phone_number` وليس `phone`.

### `POST /api/mobile/device-token` — HTTP 200

Request: `{ "token": "FCM_TOKEN" }`  
Response: `{ "ok": true }`.

يحفظ الخادم token واحدًا فقط على صف المستخدم؛ تسجيل جهاز ثانٍ يستبدل قيمة الجهاز الأول.

### `GET /api/mobile/notifications` — HTTP 200

Response **array خام**، بحد أقصى آخر 50 إشعارًا:

```json
[
  {
    "id": 9,
    "fromUser": 5,
    "date": "2026-08-23",
    "time": "10:30",
    "seen": false,
    "seenDate": null,
    "code": 101,
    "notifyId": 7,
    "targetId": 123
  }
]
```

الـ response لا يحتوي `title` أو `message`.

### `PATCH /api/mobile/notifications/:id/read` — HTTP 200

Body: لا يوجد.  
Response: `{ "id": 9, "seen": true }`.

لا يمكن تعليم إشعار مستخدم آخر كمقروء.

### عمليات auth مشتركة يحتاجها Flutter

هذه ليست ضمن عدّاد `/api/mobile` لكنها جزء من دورة الجلسة الحديثة:

| العملية | request | response |
| --- | --- | --- |
| `POST /api/auth/refresh` | `{ "refreshToken": "jwt" }` | `{ "accessToken": "jwt-new", "user": JwtUser }` |
| `POST /api/auth/logout` | Bearer access token | `{ "message": "تم تسجيل الخروج" }`؛ يمسح cookies فقط، لذلك Flutter يمسح token المخزن محليًا أيضًا |
| `POST /api/auth/change-password` | Bearer + `{currentPassword,newPassword}`، الجديدة 6 أحرف على الأقل | `{ "message": "تم تغيير كلمة المرور بنجاح" }` |

## 3. الإجازات

### `GET /api/mobile/leaves` — HTTP 200

Query: `mode=sader|wared|accept|reject` (الافتراضي `sader`)، و`page` (1)، و`pageSize` (20، أقصى 500)، و`search?`.

- `sader`: ما أنشأه المستخدم الحالي.
- `wared`: الطلبات المفتوحة المحولة إلى المستخدم الحالي، والتي يحق له تنفيذ action عليها.
- `accept`: ما أنشأه المستخدم و` suspend` فيه 1 أو 4.
- `reject`: ما أنشأه المستخدم و` suspend` فيه 2 أو 5.

```json
{
  "data": [
    {
      "id": 17,
      "agaza_rkm": 5001,
      "employeeName": "اسم الموظف",
      "leaveType": "اعتيادية",
      "f2aAgaza": 0,
      "startDate": "2026-09-01",
      "endDate": "2026-09-03",
      "days": 3,
      "currentTo": "اسم المدير",
      "actionsSends": "send_to_direct_manager",
      "status": "pending",
      "canAction": false
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### `GET /api/mobile/leaves/types` — HTTP 200

لا توجد query مستخدمة من controller؛ يفرض الخادم داخليًا `page=1,pageSize=100`:

```json
{
  "data": [
    {
      "id": 2,
      "title": "اعتيادية",
      "minDays": 1,
      "maxDays": 30,
      "agazaTtype": 0,
      "dateFrom": null,
      "dateTo": null,
      "hasSubstitute": false,
      "isActive": true
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 100
}
```

Flutter يجب أن يعرض حاليًا `isActive == true && agazaTtype != 1` فقط؛ الخادم نفسه لا يفلتر القائمة، بينما إنشاء الطلب يرفض النوع الرسمي `agazaTtype == 1`.

### `POST /api/mobile/leaves` — HTTP 201

Request المسموح فعليًا بعد whitelist:

```json
{
  "leaveTypeId": 4,
  "startDate": "2026-09-01",
  "endDate": "2026-09-03",
  "reason": "سبب اختياري",
  "maradName": "اسم الحالة اختياري",
  "hospitalName": "اسم المستشفى اختياري",
  "hospitalReport": "documents/report.pdf"
}
```

Response:

```json
{ "id": 17, "agaza_rkm": 5001 }
```

الخادم يحسب الأيام ويمنع التداخل مع إجازة معتمدة. لا يُطبق رصيد الإجازة على إنشاء الطلب من تطبيق الموظف الجديد. لا ترسلي `empId`؛ الهوية تأتي من JWT.

للنوعين 3 و4 يظهر Flutter رفع التقرير الطبي اختياريًا: ارفعيه إلى `POST /api/uploads/document` ثم أرسلي قيمة `path` في `hospitalReport`. يجوز إرسال الطلب من دون أي من الحقول الطبية. لا يقبل الخادم أكثر من **3 طلبات مرضية** لنفس الموظف في الشهر الميلادي الواحد (وتستثنى الطلبات المرفوضة أو الملغاة من العد).

### `PATCH /api/mobile/leaves/:id/action` — HTTP 200

Request: `{ "action": "accept", "reason": "اختياري" }` أو `{ "action": "reject", "reason": "اختياري" }`.

```json
{ "id": 17, "stage": "approve_direct_manager", "suspend": 1, "status": "pending" }
```

لا ينفذ الإجراء إلا المستخدم الموجود في `currentToUserId`. القبول يحول الطلب للمحطة التالية أو يغلقه نهائيًا؛ الرفض يعيده لصاحب الطلب بحالة من قيم `suspend` المرفوضة.

## 4. الأذونات

### `GET /api/mobile/permissions` — HTTP 200

Query: `mode=sader|wared|accept|reject` (الافتراضي `sader`)، و`page` (default 1)، `pageSize` (default 20, max 500)، و`status?`.

دلالات الحالات مطابقة للإجازات: `accept` يقرأ `suspend=1 أو 4` و`reject` يقرأ `suspend=2 أو 5`.

```json
{
  "data": [
    {
      "id": 20,
      "eznRkm": 8001,
      "no3Ezn": 1,
      "no3EznTitle": "استئذان شخصي",
      "employeeName": "اسم الموظف",
      "date": "2026-09-02",
      "fromTime": "10:00",
      "toTime": "11:00",
      "minutes": 60,
      "currentTo": "اسم المدير",
      "actionsSends": "send_to_direct_manager",
      "status": "pending",
      "canAction": false
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### `GET /api/mobile/permissions/available?date=2026-09-02` — HTTP 200

```json
{
  "remainMinutes": 60,
  "remainNum": 1,
  "usedMinutes": 60,
  "usedCount": 1
}
```

الأسماء الصحيحة هي `remainMinutes` و`remainNum`، وليست `remainingMinutes` و`remainingCount`. إذا حُذف `date` يستخدم تاريخ الخادم. التاريخ غير الصحيح يتحول بصمت إلى الشهر الحالي بدل `400`.

### `POST /api/mobile/permissions` — HTTP 201

```json
{
  "no3Ezn": 1,
  "eznDate": "2026-09-02",
  "fromHour": "10:00",
  "toHour": "11:00",
  "reason": "سبب الإذن",
  "fatraFk": 1
}
```

- `no3Ezn`: 1 شخصي، 2 للعمل.
- `fatraFk`: اختياري؛ 1 صباحي، 2 مسائي منطقيا، لكن DTO لا يقيده بهاتين القيمتين.
- الحقول الزمنية strings. لا يفرض DTO صيغة `HH:mm`؛ يجب أن يفرضها Flutter.
- الهوية من JWT وأي `empId` مرسل يُحذف.

Response:

```json
{ "id": 20, "eznRkm": 8001, "minutes": 60 }
```

لا يسمح Backend بمدة أكبر من **120 دقيقة في الطلب الواحد**.

### `PATCH /api/mobile/permissions/:id/action` — HTTP 200

Request: `{ "action": "accept", "reason": "اختياري" }` أو `{ "action": "reject", "reason": "اختياري" }`.

```json
{ "id": 20, "stage": "approve_direct_manager", "suspend": 1, "status": "pending" }
```

المستلم الحالي فقط (`currentToUserId`) يستطيع تنفيذ الإجراء.

## 5. المهام

### `GET /api/mobile/tasks?page=1&perPage=20&status=done` — HTTP 200

```json
{
  "data": [
    {
      "id": 55,
      "send_date_ar": "2026-08-23",
      "send_time": "10:30 AM",
      "emp_id_fk": 45,
      "title": "المهمة",
      "status": "done",
      "notes": "تفاصيل",
      "for_month": 8,
      "for_year": 2026,
      "suspend": 0,
      "rad_notes": null
    }
  ],
  "total": 1,
  "page": 1,
  "perPage": 20
}
```

`perPage` يُقص إلى 100 داخل الخدمة.

### `POST /api/mobile/tasks` — HTTP 201

Request: `{ "title": "...", "notes": "...", "status": "inprogress" }`؛ `status` إما `inprogress` أو `done`.  
Response: `{ "id": 55 }`.

### `DELETE /api/mobile/tasks/:id` — HTTP 200

Response: `{ "id": 55 }`. لا يحذف إلا صاحب المهمة.

## 6. الحضور والانصراف والزيارة

### `POST /api/mobile/attendance/punch` — HTTP 201

Request:

```json
{ "lat": "30.044420", "long": "31.235712", "photo": "mobile_app/app-....jpg" }
```

`lat` و`long` يجب أن يكونا strings، لا أرقام JSON. `photo` اختياري وهو `path` الناتج من `/api/uploads/app`.

Response حضور:

```json
{
  "id": 700,
  "type": "in",
  "lateMin": 5,
  "branchId": 3,
  "branchName": "اسم الفرع",
  "distanceMeters": 72
}
```

Response انصراف:

```json
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

الخادم يحدد `in/out` حسب الشفت وسجل اليوم، ويتحقق من geofence، ويمنع التكرار خلال 45 ثانية. لا يقبل `capturedAt` أو idempotency key؛ لذلك لا توجد بصمة أوفلاين موثوقة، وإعادة الطلب بعد timeout قد تسجل محاولة ثانية أو تسجل وقت المزامنة بدل وقت الالتقاط.

### `POST /api/mobile/attendance/offline-sync` — HTTP 201

مزامنة بصمة التقطها التطبيق من دون اتصال. Request:

```json
{
  "offlineId": "6c2d91fd-4637-4172-8e78-4c2f1bfe1c58",
  "capturedAtUtc": "2026-08-23T20:15:00.000Z",
  "timezone": "Africa/Cairo",
  "lat": "30.044420",
  "long": "31.235712",
  "photo": "mobile_app/app-....jpg"
}
```

- `offlineId` UUID v4 ويجب أن يظل ثابتًا عند إعادة نفس المحاولة.
- `capturedAtUtc` ISO-8601 و`timezone` مطلوبان؛ يراجع الخادم وقت الجهاز ويعلّم النتيجة للمراجعة.
- `photo` اختياري وهو `path` من `/api/uploads/app`.

Response يضم response البصمة العادي ويضيف بيانات المزامنة:

```json
{
  "id": 700,
  "type": "in",
  "branchId": 3,
  "branchName": "اسم الفرع",
  "distanceMeters": 72,
  "offlineId": "6c2d91fd-4637-4172-8e78-4c2f1bfe1c58",
  "capturedAtDevice": "2026-08-23T20:15:00.000Z",
  "receivedAtServer": "2026-08-23T20:30:00.000Z",
  "requiresReview": true,
  "replayed": false
}
```

إذا أعاد التطبيق نفس `offlineId` وبنفس البيانات، يعيد الخادم النتيجة نفسها مع `replayed:true`. أما استخدام المعرف نفسه ببيانات مختلفة فيعيد `409`.

### `POST /api/mobile/visit` — HTTP 201

Request: `{ "lat": "30.04", "long": "31.23", "img": "path?", "notes": "...?" }`.  
Response: `{ "id": 107 }`.

على عكس البصمة، هذا المسار يتحقق فقط أن الإحداثيات strings غير فارغة، ولا يتحقق من كونها أرقامًا أو من حدودها.

## 7. التعاميم

### `GET /api/mobile/circulars?page=1&perPage=20` — HTTP 200

```json
{
  "data": [
    {
      "id": 1,
      "title": "عنوان",
      "subject": "الموضوع",
      "date": "2026-08-23",
      "image": "file",
      "seen": false,
      "detail_id": "10",
      "ta3mem_id_fk": "1",
      "emp_id": "45",
      "emp_code": "1001",
      "emp_name": "اسم الموظف",
      "ta3mem_title": "عنوان",
      "ta3mem_date": "2026-08-23",
      "ta3mem_img": "file",
      "seen_value": "0",
      "seen_date": "",
      "seen_time": ""
    }
  ],
  "total": 1,
  "page": 1,
  "perPage": 20
}
```

`perPage` أقصاه الفعلي 100. `status` مسموح في DTO لكنه غير مستخدم هنا.

### `GET /api/mobile/circulars/:id` — HTTP 200

يعيد كائن التعميم السابق **وليس array**، ويضيف:

```json
{ "attachments": [{ "id": 3, "title": "مرفق", "file": "path" }] }
```

### `PATCH /api/mobile/circulars/:id/read` — HTTP 200

Response: `{ "id": 1, "seen": true }`.

## 8. الإنذارات

### `GET /api/mobile/warnings?page=1&perPage=20` — HTTP 200

```json
{
  "data": [
    {
      "id": 4,
      "type": "نوع الإنذار",
      "details": "التفاصيل",
      "date": "2026-08-23",
      "time": "10:30",
      "hrNotes": "ملاحظات",
      "seen": false,
      "enzar_id_fk": "4",
      "emp_name": "اسم الموظف",
      "emp_name_id": "45",
      "emp_edara": "الإدارة",
      "emp_edara_id": "2",
      "emp_qesm": "القسم",
      "emp_qesm_id": "3",
      "enzar_type": "نوع الإنذار",
      "enzar_type_id": "1",
      "enzar_date_ar": "2026-08-23",
      "enzar_time": "10:30",
      "hr_notes": "ملاحظات",
      "seen_value": "0"
    }
  ],
  "total": 1,
  "page": 1,
  "perPage": 20
}
```

`status` مسموح في DTO لكنه غير مستخدم هنا.

### `GET /api/mobile/warnings/:id` — HTTP 200

يعيد كائن الإنذار السابق ويضيف `attachments:[{id,title,file}]`.

### `PATCH /api/mobile/warnings/:id/read` — HTTP 200

Response: `{ "id": 4, "seen": true }`.

## 9. الطلبات العامة

### `GET /api/mobile/requests` — HTTP 200

آخر 50 سجلًا فقط، بلا pagination:

```json
{
  "data": [
    {
      "id": 90,
      "type": 1,
      "requestNo": 2026,
      "status": 0,
      "reasonAction": "",
      "createdAt": "2026-08-23"
    }
  ]
}
```

هذا endpoint قراءة فقط ولا توجد تحته عمليات create/detail/delete للطلبات العامة.

## 10. اللوائح والأنشطة

### `GET /api/mobile/legal-files?page=1&perPage=20` — HTTP 200

Response **array خام**:

```json
[
  {
    "layha_id": "8",
    "layha_name": "اسم اللائحة",
    "details": "التفاصيل",
    "layha_path": "files/file.pdf",
    "seen": "0",
    "seen_date": "",
    "seen_time": ""
  }
]
```

لا يعيد `total/page/perPage`. `status` مسموح في DTO لكنه غير مستخدم.

### `PATCH /api/mobile/legal-files/:id/read` — HTTP 200

Response: `{ "layha_id": "8", "seen": "1" }`؛ لاحظ أن id وseen strings.

### `GET /api/mobile/activities?page=1&perPage=20` — HTTP 200

Response **array خام**:

```json
[
  {
    "id": "12",
    "emp_id": 45,
    "title": "نشاط",
    "send_date": "2026-08-23",
    "send_time": "10:30",
    "suspend": "0",
    "notes": "ملاحظات",
    "rad_notes": null,
    "emp_name": "اسم الموظف",
    "halet_talab": "قيد المراجعة",
    "edit_delete": "yes",
    "all_images": [
      { "id": "21", "main_id_fk": 12, "file_name": "nashat/file.png", "uploaded_on": "2026-08-23" }
    ]
  }
]
```

لا يعيد pagination metadata. `status` مسموح لكنه غير مستخدم.

### `POST /api/mobile/activities` — HTTP 201

Request:

```json
{ "title": "نشاط", "notes": "اختياري", "files": ["nashat/file.png"] }
```

`files` array غير فارغ لمسارات `/api/uploads/activity`.  
Response: `{ "main_id": "12" }`؛ المعرّف string.

### `DELETE /api/mobile/activities/:id` — HTTP 200

Response هو JSON string فارغ: `""`. لا يمكن الحذف بعد انتقال `suspend` من 0.

## 11. دليل الموظفين والرسائل الداخلية

### `GET /api/mobile/employees?page=1&perPage=20` — HTTP 200

Response **array خام** لموظفي نفس فرع المستخدم، مع استبعاد المستخدم نفسه ومن لا يملك حسابًا معتمدًا:

```json
[
  {
    "emp_id": "46",
    "user_id": "13",
    "card_num": "123",
    "emp_code": "1002",
    "employee": "اسم الموظف",
    "edara_name": "الإدارة",
    "qsm_name": "القسم",
    "mosma_wazefy_name": "المسمى",
    "phone_number": "010...",
    "personal_photo": "photo.png",
    "emp_img": "/uploads/human_resources/emp_photo/thumbs/photo.png"
  }
]
```

استخدمي `user_id`، وليس `emp_id`، داخل `toUserIds`. لا يوجد search في عقد controller الحديث رغم أن خدمة التوافق الداخلية تستطيع البحث.

### `POST /api/mobile/messages` — HTTP 201

```json
{
  "toUserIds": [13, 14],
  "subject": "العنوان",
  "message": "النص",
  "file": "human_resources/msg_files/msg-file.pdf"
}
```

`file` اختياري من `/api/uploads/message`.  
Response: `{ "msg_id": "33" }`.

### `GET /api/mobile/messages/inbox?page=1&perPage=20&status=0` — HTTP 200

Response **array خام**. `status` يتحول إلى فلتر `seen`; استخدمي `0` لغير المقروء و`1` للمقروء:

```json
[
  {
    "msg_id": "33",
    "msg_date": "2026-08-23",
    "msg_time": "10:30",
    "subject": "العنوان",
    "message": "النص",
    "file": "",
    "detail_id": "70",
    "seen": "0",
    "seen_date": "",
    "seen_time": "",
    "from_employee_name": "المرسل",
    "from_employee_edara_name": "الإدارة",
    "from_employee_qsm_name": "القسم",
    "from_employee_mosma_wazefy_name": "المسمى",
    "from_emp_img": "/uploads/..."
  }
]
```

### `GET /api/mobile/messages/sent?page=1&perPage=20` — HTTP 200

Response **array خام**:

```json
[
  {
    "msg_id": "33",
    "msg_date": "2026-08-23",
    "msg_time": "10:30",
    "subject": "العنوان",
    "message": "النص",
    "file": "",
    "to_users": [
      {
        "detail_id": "70",
        "to_user_id": "13",
        "seen": "0",
        "seen_date": "",
        "seen_time": "",
        "to_employee_name": "المستلم",
        "to_employee_edara_name": "الإدارة",
        "to_employee_qsm_name": "القسم",
        "to_employee_mosma_wazefy_name": "المسمى",
        "to_emp_img": "/uploads/..."
      }
    ]
  }
]
```

### `GET /api/mobile/messages/:id` — HTTP 200

يعيد **array من عنصر واحد** بالشكل الصادر السابق، لا كائنًا مفردًا.

### `PATCH /api/mobile/messages/:id/read` — HTTP 200

يعيد أيضًا **array من عنصر واحد** بعد تحديث القراءة، لا ack مستقلًا.

### `DELETE /api/mobile/messages/:id` — HTTP 200

Response هو JSON string فارغ: `""`.

## 12. السلف

### شكل Loan المشترك

```json
{
  "id": 1,
  "requestNumber": 120,
  "requestDate": "2026-08-23",
  "employeeId": 45,
  "employeeName": "اسم الموظف",
  "amount": 5000,
  "reason": "السبب",
  "repaymentMethod": 3,
  "repaymentMethodName": "تخصم شهرياً من الراتب",
  "installments": 5,
  "installmentAmount": 1000,
  "deductionStartDate": "2026-09-01",
  "deductionEndDate": "2027-01-01",
  "status": "pending",
  "suspend": 0,
  "currentStage": "approve_direct_manager",
  "currentStageName": "موافقة المدير المباشر",
  "currentToUserId": 13,
  "currentToUserName": "المدير",
  "reasonAction": "",
  "canAction": false,
  "canCancel": true
}
```

`status` يساوي `pending|approved|rejected|cancelled`. تبقى قيمة `suspend=5` ظاهرة في تبويب المرفوضة حسب قاعدة العمل، وفي تبويب الملغاة الدقيق أيضًا.

### `GET /api/mobile/loans/meta` — HTTP 200

```json
{
  "empId": 45,
  "employeeName": "اسم الموظف",
  "employeeCode": 1001,
  "jobTitle": "المسمى",
  "department": "الإدارة",
  "section": "القسم",
  "ceiling": 10000,
  "maxInstallments": 12,
  "hasActiveLoan": false,
  "previousRequests": 2,
  "previousRequestDate": "2026-01-10",
  "repaymentMethods": [
    { "id": 1, "name": "دفع نقداً" },
    { "id": 2, "name": "تخصم مرة واحدة من الراتب" },
    { "id": 3, "name": "تخصم شهرياً من الراتب" }
  ]
}
```

هذا response لا يحتوي `nextRequestNumber` أو `requestDate`.

### `GET /api/mobile/loans?page=1&perPage=20&mode=sader` — HTTP 200

`mode`: `sader` (افتراضي)، أو `wared`، أو `accept`، أو `reject`، أو `cancelled`.

- `sader`: ما أنشأه المستخدم أو ما يخص سجل الموظف الحالي.
- `wared`: طلب مفتوح محول حاليًا للمستخدم.
- `accept`: الطلبات التي أنشأها المستخدم و` suspend` فيها 1 أو 4.
- `reject`: الطلبات التي أنشأها المستخدم و` suspend` فيها 2 أو 5.
- `cancelled`: الطلبات التي أنشأها المستخدم و` suspend=5` فقط.

```json
{
  "data": [Loan],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

هذا endpoint يستقبل query باسم `perPage` لكنه يعيد metadata باسم `pageSize`.

### `GET /api/mobile/loans/:id` — HTTP 200

Response: كائن `Loan` واحد. يتاح لصاحب الطلب/الموظف أو المستلم الحالي فقط.

### `POST /api/mobile/loans` — HTTP 201

```json
{
  "amount": 5000,
  "repaymentMethod": 3,
  "reason": "سبب السلفة",
  "installments": 5,
  "deductionStartDate": "2026-09-01"
}
```

- `amount` integer موجب؛ الكسور ترفض.
- `repaymentMethod`: 1 أو 2 أو 3.
- `reason`: مطلوب، أقصى 100 حرف.
- `installments` و`deductionStartDate` اختياريان.
- إذا كان المدير المباشر موجودًا ومربوطًا بحساب معتمد، يستلم الطلب أولًا.
- إذا لم يوجد مدير مباشر، يرسل الطلب مباشرة إلى مسؤول الموارد البشرية المعرّف في إعدادات مسمى الوظيفة 44، ويتخطى مرحلتي المدير المباشر ومدير الإدارة.
- إذا لم يوجد أي منهما، يعيد `400` برسالة واضحة.

Response: كائن `Loan` الكامل.

### `PATCH /api/mobile/loans/:id/action` — HTTP 200

Request: `{ "action": "accept", "reason": "اختياري" }` أو `reject`.

```json
{
  "id": 1,
  "stage": "approve_direct_manager",
  "status": "pending",
  "suspend": 1
}
```

لا ينفذ الإجراء إلا `currentToUserId`. المراحل: المدير المباشر، مدير الإدارة، HR، ثم الموافقة النهائية.

### `DELETE /api/mobile/loans/:id` — HTTP 200

Response: `{ "id": 1, "status": "cancelled" }`. يسمح لصاحب الطلب قبل بدء اعتماد المدير فقط.

## 13. رفع الملفات

كل العمليات التالية: Bearer، `POST multipart/form-data`، field باسم `file`، HTTP `201`.

Response موحد:

```json
{
  "path": "folder/generated-file.jpg",
  "filename": "generated-file.jpg",
  "url": "/uploads/folder/generated-file.jpg"
}
```

| endpoint | الاستخدام | الأنواع | الحد |
| --- | --- | --- | ---: |
| `/api/uploads/app` | `photo` في بصمة الحضور | JPEG, PNG, GIF, WebP | 10MB |
| `/api/uploads/activity` | عناصر `files` في النشاط | JPEG, PNG, GIF, WebP | 10MB |
| `/api/uploads/message` | `file` في الرسالة | صور، PDF، DOC/DOCX، XLS/XLSX | 20MB |
| `/api/uploads/document` | `hospitalReport` الاختياري للإجازة المرضية، أو مستند عام | صور، PDF، DOC/DOCX، XLS/XLSX | 20MB |

الخادم يتحقق من MIME ومن توقيع محتوى الملف، لا الامتداد فقط. استخدمي `path` عند إنشاء السجل، و`origin + url` للعرض/التحميل.

## 14. طريقة العمل حسب الشاشة

### بدء الجلسة

1. `POST /api/mobile/login`.
2. احفظي `accessToken` و`refreshToken` في secure storage.
3. أرسلي Bearer مع كل عملية محمية.
4. عند `401` نفذي مرة واحدة `POST /api/auth/refresh` ثم أعيدي الطلب الأصلي مرة واحدة فقط.
5. إذا فشل refresh، امسحي الجلسة وارجعي إلى login.

### إجازة

1. `GET /api/mobile/leaves/types`.
2. اعرضي النشط وغير الرسمي فقط.
3. في النوعين المرضيين 3 أو 4، أظهري زر إرفاق التقرير الطبي **اختياريًا**. عند اختيار ملف، ارفعيه إلى `/api/uploads/document` وأرسلي `path` في `hospitalReport`.
4. `POST /api/mobile/leaves`، من دون حقل رصيد أو `empId`.
5. اعرضي التبويبات بواسطة `GET /api/mobile/leaves?mode=sader|wared|accept|reject`.
6. في الوارد فقط نفذي `PATCH /api/mobile/leaves/:id/action` عندما يكون `canAction=true`.

### إذن

1. `GET /api/mobile/permissions/available?date=...`.
2. تحققي محليًا من `remainMinutes/remainNum` ومن صيغة الوقت.
3. `POST /api/mobile/permissions`.
4. لا تسمحي بمدة تتجاوز 120 دقيقة للطلب الواحد.
5. اعرضي التبويبات بواسطة `GET /api/mobile/permissions?mode=sader|wared|accept|reject`.
6. في الوارد فقط نفذي `PATCH /api/mobile/permissions/:id/action` عندما يكون `canAction=true`.

### سلفة

1. `GET /api/mobile/loans/meta` لعرض الحد الأقصى وطرق السداد قبل إدخال الطلب.
2. `POST /api/mobile/loans` مع المبلغ وطريقة السداد والسبب.
3. إن كان للموظف مدير مباشر، يتجه الطلب إليه. وإن لم يوجد، يوجّه Backend الطلب تلقائيًا إلى مسؤول الموارد البشرية.
4. اعرضي التبويبات بواسطة `GET /api/mobile/loans?mode=sader|wared|accept|reject|cancelled&page=1&perPage=20`.
5. في الوارد فقط، عند `canAction=true`، استخدمي `PATCH /api/mobile/loans/:id/action` للقبول أو الرفض.
6. لا تستخدمي الإلغاء إلا عندما يكون `canCancel=true`، عبر `DELETE /api/mobile/loans/:id`.

### بصمة بصورة

1. التقطي الموقع والصورة.
2. ارفعي الصورة إلى `/api/uploads/app`.
3. خذي `path`، لا `url`، وضعيه في `photo`.
4. أرسلي `/api/mobile/attendance/punch`.
5. اعرضي النوع الذي أعاده الخادم (`in` أو `out`) ولا تستنتجيه مسبقًا في Flutter.

### نشاط أو رسالة بمرفق

1. ارفعي الملف إلى category المناسب.
2. خزني `path` من response.
3. أرسلي JSON إنشاء النشاط/الرسالة.
4. لا تحاولي decode لعمليات الحذف كـ Map؛ response الحالي string فارغ.

## 15. التعارضات والمشكلات المكتشفة

### P0 — قد تمنع التطبيق أو تكسر شاشات كاملة

| المشكلة المؤكدة | الأثر على Flutter | الدليل/القرار |
| --- | --- | --- |
| ملف Dart الوحيد الموجود للتسليم يثبت `apiRoot = '/Api'` القديمة، بينما النظام الجديد هو `/api/mobile`. | لو استُخدم في التطبيق الجديد فكل الـ paths والـ envelopes وأسماء token ستكون مختلفة. | `docs/flutter/noamany_legacy_api.dart:5`. يجب إنشاء client حديث منفصل وعدم تعديل parser القديم ليخدم الاثنين. |
| لا تزال الإجازة المرضية تعتمد على IDs ثابتة 3 و4. | إذا تغيرت IDs بين البيئات، قد لا يظهر زر التقرير في النوع الصحيح. | ثبتي IDs في بيانات النظام أو أضيفي لاحقًا خاصية صريحة مثل `requiresMedicalReport` إلى نوع الإجازة. |
| إنشاء الإجازة والإذن عندما لا يوجد مدير مباشر قد يبقى بلا مستلم. | الطلب يظل pending بلا وارد يمكنه اعتماده. | تم حل fallback للسلف فقط حسب المطلوب؛ يلزم قرار مستقل إن أريد نفس fallback للإجازات والأذونات. |

### P1 — أعطال وظيفية مرجحة

| المشكلة | الأثر | التوصية |
| --- | --- | --- |
| النوع المرضي محدد في الخدمة بالـ IDs الثابتة 3 و4 بدل خاصية على نوع الإجازة. | اختلاف seed/import بين البيئات قد يجعل نوعًا صحيحًا لا يحسب ضمن حد الثلاثة أو لا يعرض حقل التقرير. | إضافة خاصية صريحة `requires_medical_report` في إعداد نوع الإجازة وإعادتها لتطبيق Flutter. |
| `GET leaves/types` يعيد الأنواع غير النشطة والرسمية، بينما POST يرفض الرسمية. | المستخدم يختار نوعًا ظاهرًا ثم يحصل على 400. | فلترة Backend هي الحل الصحيح؛ مؤقتًا فلترة Flutter بـ `isActive && agazaTtype != 1`. |
| إنشاء الإجازة أو الإذن لا يرفض غياب مدير مباشر له حساب؛ يمكن إنشاء صف بـ `current_to_user_id=null`. | الطلب يظل pending بلا أي وارد يمكنه اعتماده. | تم حل fallback لمسار السلفة فقط؛ يلزم قرار مستقل لتطبيقه على الإجازات والأذونات إن كان مطلوبًا. |
| تبويب `accept` يشمل `suspend=1` وهي مرحلة اعتماد وسيطة. | سيظهر الطلب في المقبولة حسب قاعدة العمل المعتمدة حتى لو كان ما زال في سير الموافقات. | هذا مقصود بناءً على تعريف العمل: المقبولة = 1 أو 4. |
| مجموعة Postman الحديثة فيها 45 item لكن 43 method/path فريدًا فقط، وتغيب عنها `GET /api/mobile/leaves/types` و`GET /api/mobile/permissions/available`. | الاختبارات اليدوية لا تغطي مسارين ضروريين للنماذج، وتقرير “تغطية كاملة” القديم لم يعد دقيقًا. | تحديث collection وتوليد coverage من controller في CI. |
| login يعيد refresh token، لكن لا يوجد `/api/mobile/refresh`; يلزم endpoint مشترك `/api/auth/refresh`. | client المحصور في prefix الموبايل سيسجل خروجًا بعد ساعتين. | وثّقي shared auth في Flutter ونفذي retry واحدًا بعد refresh. |
| notification rows لا تحتوي عنوانًا أو نصًا، بل أكوادًا ومعرفات فقط. | شاشة الإشعارات قد تظهر بلا محتوى إذا كانت models تتوقع `title/message`. | إما map للأكواد في Flutter أو، الأفضل، توسيع Backend response بنص جاهز موحد. |
| بصمة offline تستخدم وقت جهاز مضبوطًا وتعود دائمًا بـ `requiresReview:true`. | لا ينبغي اعتبارها إثبات حضور نهائيًا قبل المراجعة الإدارية. | خزني `offlineId` ونتيجة sync، وأظهري للمستخدم أنها قيد المراجعة عند الحاجة. |
| `emp_img` يشير إلى مجلد `thumbs`، لكن ملفات workspace في `uploads/human_resources/emp_photo` بلا مجلد `thumbs`، والرفع لا ينشئ thumbnail. مسار avatar الافتراضي `/asisst/.../avatar5.png` غير موجود في `backend/public`. | صور الموظفين/default avatar قد تعيد 404 أو HTML بدل صورة. | إرجاع URL موجود فعليًا أو إضافة توليد thumbnail/asset واختبار Content-Type. |
| إنشاء الإذن والسلفة أعادا 500 على بيئة online في تقرير 2026-08-20، بينما اختبارات المصدر المحلية الأقدم ذكرت نجاحًا. | هناك احتمال drift بين كود التشغيل وقاعدة/نسخة الخادم. | لا نعدّ 500 الحالي مؤكدًا من source فقط. أعيدي اختبار online بعد deploy الحالي وافحصي server logs وschema عند التكرار. |

### P2 — مخاطر تكامل وجودة

| المشكلة | الأثر | التوصية |
| --- | --- | --- |
| شكل response غير موحد داخل نفس `/api/mobile`: array خام، `{data}`, شكلان للـ pagination، كائن، و`""`. | parser عام واحد يسبب type cast/null errors، لكنه لا يغير منطق العمل نفسه. | DTO/decoder منفصل لكل endpoint إلى أن يوحد Backend العقود. |
| مستندات التسليم السابقة تصف عدة response fields/envelopes بصورة غير مطابقة للكود. | قد يفشل parsing رغم صحة الـ business operation. | هذا الملف هو المرجع المصحح؛ والأفضل توليد OpenAPI/clients من المصدر. |
| `POST` قد يعيد 200 أو 201 حسب العملية. | client يفشل إذا اعتبر 200 وحده نجاحًا. | كل `2xx` نجاح. |
| المعرّفات والـ booleans مختلطة بين number وstring، خصوصًا compat-backed endpoints. | `type 'String' is not a subtype of int/bool`. | parsers متسامحة (`toString` ثم parse) مع models خاصة لكل endpoint. |
| أسماء pagination مختلفة: `pageSize` للأذونات؛ `perPage` لبقية query؛ loans تستقبل `perPage` وتعيد `pageSize`; بعض القوائم بلا metadata. | تكرار الصفحة الأولى أو قراءة key خاطئ. | لا تنشئي pagination DTO عالميًا قبل توحيد Backend. |
| `status` مقبول في `MobileListDto` لكنه مهمل في circulars/warnings/legal-files/activities/employees؛ ويُقبل أيضًا في قائمة الأذونات دون أن تستخدمه الخدمة. يستخدم فقط tasks وinbox بمعان مختلفة. | الفلاتر تبدو فعالة في UI لكنها لا تغيّر النتائج. | إخفاء الفلتر في تلك الشاشات أو تنفيذ الفلترة صراحة في Backend. |
| لا يوجد search في endpoint دليل الموظفين الحديث. | البحث المرسل من Flutter سيُحذف بالـ whitelist. | إضافة `search` إلى MobileListDto وتمريره، أو البحث محليًا في الصفحة الحالية فقط مع توضيح القيد. |
| رفع الملفات يعيد `url` نسبيًا. | جمعه مع base URL المنتهي بـ `/api` ينتج `/api/uploads/...` الخاطئ. | استخدمي `origin + url`. |
| البصمة لا تدعم idempotency أو captured time. | timeout/offline قد ينتج حالة غير معلومة أو وقتًا غير صحيح. | لا تعرضي offline punch كمعتمد قبل إضافة عقد server خاص بالمزامنة. |
| الزيارة لا تتحقق من أرقام/حدود الإحداثيات. | بيانات زيارة تالفة يمكن أن تُحفظ. | إضافة تحقق مماثل للبصمة في Backend. |
| device token واحد لكل user. | الجهاز السابق يتوقف عن استقبال push عند تسجيل جهاز جديد. | جدول devices متعدد إذا كان تعدد الأجهزة مطلوبًا. |

## 16. ترتيب التشخيص المقترح لمشكلة تطبيق الموبايل

1. التقطي request/response الفعلي من الجهاز مع إخفاء token وكلمة المرور.
2. تحققي أولًا من الـ URL: يجب أن يبدأ `/api/mobile` لا `/Api` ولا `/api/Api`.
3. تحققي أن Flutter يقبل 201 وأنه لا يفترض Map لكل response.
4. قارني body keys حرفيًا مع هذا الملف، خصوصًا `employee`, `remainMinutes`, `remainNum`, و`pageSize` في رد السلف.
5. عند 401: اختبري refresh المشترك مرة واحدة.
6. عند 400: سجلي `message` كاملًا؛ غالبًا هو validation/business rule.
7. عند 500: اربطي وقت الطلب بالـ server log، وحددي هل الفشل في route أم service أم Prisma/schema. لا تغيّري Flutter لتجاوز 500.
8. اختبري الشاشات ذات الاحتمال الأعلى للكسر بهذا الترتيب: login/session، profile image، notifications، leave types/create، permission balance/create، loan meta/list/create، ثم uploads/messages.

## 17. قائمة قبول قبل إصدار APK

- [ ] لا يوجد أي استدعاء إلى `/Api` في client الجديد.
- [ ] كل endpoint له response model خاص أو decoder واضح.
- [ ] كل `2xx` يعد نجاحًا.
- [ ] 204/empty/string/list/map لا تسبب cast crash.
- [ ] access/refresh محفوظان آمنًا، وrefresh يعاد مرة واحدة فقط عند 401.
- [ ] `origin` منفصل عن `apiBaseUrl` لعرض `/uploads`.
- [ ] `lat/long` في البصمة يرسلان strings.
- [ ] `toUserIds` يستخدم `user_id` من دليل الموظفين.
- [ ] `path` الناتج من upload هو ما يرسل في JSON، لا `filename` ولا URL الكامل.
- [ ] الإجازات الرسمية/غير النشطة مخفية، وفي النوعين المرضيين 3 و4 يظهر إرفاق التقرير الطبي اختياريًا.
- [ ] شاشة اعتماد الإجازة/الإذن تستخدم `mode=wared` و`PATCH .../:id/action` فقط عند `canAction=true`.
- [ ] تم اختبار 200 و201 و400 و401 و404 و500 وtimeout على جهاز فعلي.
- [ ] تم اختبار response فارغ لحذف activity/message.
- [ ] تم اختبار صور profile/default avatar عبر HTTP مع `Content-Type: image/*`.

## 18. ملفات الأدلة

- `backend/src/main.ts`: case sensitivity، global `/api` prefix، ValidationPipe.
- `backend/src/modules/mobile/mobile.controller.ts`: العمليات الـ41 وعقد الربط بالخدمات.
- `backend/src/modules/mobile/dto/mobile.dto.ts`: أجسام الطلبات الحديثة.
- `backend/src/modules/mobile/mobile.service.ts`: profile، notifications، leaves، tasks، circulars، warnings، requests، visits.
- `backend/src/modules/mobile/legacy-mobile-compat.service.ts`: اللوائح، الأنشطة، الموظفون، والرسائل المستخدمة تحت العنوان الحديث.
- `backend/src/modules/leaves/leaves.service.ts`: إنشاء الإجازة وشروط النوع المرضي.
- `backend/src/modules/permissions/permissions.service.ts`: list/available/create للأذونات.
- `backend/src/modules/attendance/attendance.service.ts`: geofence وتحديد الحضور/الانصراف والـ response.
- `backend/src/modules/attendance/attendance.mobile-punch.spec.ts` و`offline-attendance.util.ts`: دليل التنفيذ الجزئي غير المكتمل لدعم offline.
- `backend/src/modules/loans/loans.service.ts`: metadata والقوائم والإنشاء والاعتماد والإلغاء.
- `backend/src/modules/uploads/uploads.controller.ts` و`uploads.service.ts`: multipart والفئات والقيود والـ response.
- `backend/src/modules/auth/auth.controller.ts` و`auth.service.ts`: refresh/logout/change-password ومدة الجلسة.
- `docs/flutter/noamany_legacy_api.dart`: عقد Flutter القديم الموجود في workspace؛ ليس client للنظام الجديد.
- `docs/NOAMANY_HR_NEW_MOBILE_API.postman_collection.json`: collection حديثة لكنها ناقصة عمليتي lookup المذكورتين.
- `docs/superpowers/specs/2026-08-23-offline-attendance-design.md` و`plans/2026-08-23-offline-attendance-sync.md`: تصميم وخطة غير مكتمل تنفيذهما في controller/service الحاليين.
