# واجهة الحضور والانصراف لتطبيق Flutter

هذه الواجهة هي النسخة المعتمدة للتطبيق الجديد، مع إبقاء مسارات التطبيق القديم متاحة للتوافق الخلفي.

## الإعداد

- `baseUrl`: رابط الخادم بدون `/api`، مثال `https://example.com`.
- ترسل كل الطلبات المحمية الهيدر: `Authorization: Bearer <accessToken>`.
- هوية الموظف لا تُقبل من التطبيق في طلب البصمة؛ الخادم يستخرجها حصراً من JWT.
- الإحداثيات نصان عشريان (`lat`, `long`). وقت وتاريخ البصمة من ساعة الخادم.
- الحد الأقصى لصورة البصمة 10MB، والصيغ: JPEG/PNG/GIF/WebP.

## التدفق الحديث الموصى به

### 1) تسجيل الدخول

`POST {{baseUrl}}/api/mobile/login`

```json
{
  "username": "01012345678",
  "password": "102030"
}
```

- قيمة `username` هي رقم هاتف الموظف المسجل في النظام.
- كلمة المرور الافتراضية للحساب الذي يُنشأ مع الموظف هي `102030`.
- `mustChangePassword` تكون `false`؛ تغيير كلمة المرور اختياري من الموظف وليس شرطاً لأول دخول.

النجاح `200`:

```json
{
  "accessToken": "JWT",
  "refreshToken": "JWT",
  "user": { "sub": 12, "emp_code": 1007, "name": "اسم الموظف" },
  "message": "تم تسجيل الدخول بنجاح",
  "accountType": "staff",
  "mustChangePassword": false
}
```

احفظ `accessToken` في التخزين الآمن ولا تسجله في logs.

### 2) رفع صورة البصمة (اختياري)

`POST {{baseUrl}}/api/uploads/app`

- النوع: `multipart/form-data`
- اسم الحقل: `file`
- الهيدر: Bearer token

```json
{
  "path": "mobile_app/app-20260811abc123.jpg",
  "filename": "app-20260811abc123.jpg",
  "url": "/uploads/mobile_app/app-20260811abc123.jpg"
}
```

أرسل قيمة `path` في `photo` بالطلب التالي. يمكن تنفيذ البصمة بدون صورة إذا لم تكن إلزامية في واجهة التطبيق.

### 3) إرسال البصمة

`POST {{baseUrl}}/api/mobile/attendance/punch`

```json
{
  "lat": "30.044420",
  "long": "31.235712",
  "photo": "mobile_app/app-20260811abc123.jpg"
}
```

الخادم يحدد تلقائياً حضوراً أو انصرافاً والوردية الصحيحة. النجاح `201`:

```json
{
  "id": 3234,
  "type": "in",
  "lateMin": 0,
  "branchId": 3,
  "branchName": "الفرع الرئيسي",
  "distanceMeters": 18
}
```

نجاح الانصراف:

```json
{
  "id": 3234,
  "type": "out",
  "mobakerMin": 0,
  "overtimeMin": 20,
  "branchId": 3,
  "branchName": "الفرع الرئيسي",
  "distanceMeters": 18
}
```

قواعد مهمة للتطبيق:

- لا ترسل `type` أو وقتاً؛ القرار من الخادم وفق الوردية.
- لا ترسل `branchId` في طلب البصمة؛ الخادم يحدد مكان البصمة من بيانات الموظف.
- امنع ضغط الزر بعد الإرسال حتى وصول الرد، لكن اعرض رسالة الخادم كما هي.
- الخادم يمنع التكرار خلال 45 ثانية ويقفل الطلبات المتزامنة لنفس الموظف.
- الحضور متاح من 60 دقيقة قبل بداية الوردية.
- الانصراف المبكر يتطلب إذناً معتمداً يغطي الوقت الحالي.
- المقارنة الجغرافية تعتمد على `employees.emp_sign` (مكان البصمة)، ولا تعتمد على `employees.branch_id_fk` (فرع الموظف الإداري).
- إذا كانت `emp_sign` رقم فرع، يجب أن تكون الإحداثيات داخل نطاق هذا الفرع فقط.
- إذا كانت `emp_sign = "all"`، يمكن التبصيم في أي فرع له إعدادات جغرافية صحيحة، ويختار الخادم أقرب فرع يقع الموظف داخل نطاقه.
- يعيد الخادم `branchId` و`branchName` الفعليين المستخدمين في تسجيل الحضور أو الانصراف.
- كل بصمة تُحفظ مع سجل تاريخي في معاملة واحدة؛ فشل أحدهما يلغي الاثنين.

### 4) بيانات الموظف

`GET {{baseUrl}}/api/mobile/profile`

### 5) رمز إشعارات Firebase

`POST {{baseUrl}}/api/mobile/device-token`

```json
{ "token": "FCM_DEVICE_TOKEN" }
```

## أخطاء متوقعة

واجهات `/api/mobile/*` تستخدم HTTP status حقيقي، والرسالة في `message`:

```json
{ "statusCode": 400, "message": "خارج نطاق أي دوام متاح حالياً للموظف", "error": "Bad Request" }
```

- `400`: بيانات ناقصة، خارج الموقع/الوردية، تكرار البصمة، أو انصراف مبكر بدون إذن.
- من أخطاء `400` أيضاً: عدم تسجيل مكان بصمة للموظف، أو عدم وجود الفرع/إحداثياته في إعدادات الفروع.
- `401`: token مفقود/منتهي/غير صالح؛ ارجع لشاشة الدخول.
- `403`: الحساب لا يملك الصلاحية المطلوبة.
- لا تعتبر أي استجابة نجاحاً إلا إذا كان HTTP status بين 200 و299.

## توافق شاشات التطبيق الحالية مع النظام الجديد

تسجيل الدخول في جميع الحالات يتم من مسار النظام الجديد:

`POST {{baseUrl}}/api/mobile/login`

```json
{ "username": "01012345678", "password": "102030" }
```

يُحفظ التوكن من الحقل العلوي `accessToken`. بعد ذلك يمكن للشاشات الحالية استخدام مسارات `/Api/*` المتوافقة، وجميعها تعمل داخل الـBackend الجديد نفسه.

### البصمة القديمة

`POST {{baseUrl}}/Api/add_hdor_ensraf` أو `POST {{baseUrl}}/Api/attendance_new`

```json
{ "lat": "30.044420", "long": "31.235712", "basma_img": "mobile_app/app-....jpg" }
```

مع Bearer token المستخرج من `accessToken`. في هذه المسارات افحص `body.status == 200` أيضاً لأن مسارات التوافق تعيد أخطاء العمل داخل غلاف `{status,message,data}`.

## مثال Dart (Dio)

```dart
final response = await dio.post(
  '$baseUrl/api/mobile/attendance/punch',
  data: {'lat': lat.toString(), 'long': lng.toString(), 'photo': photoPath},
  options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
);
final type = response.data['type'] as String; // in | out
```

للتجربة الجاهزة استخدم [مجموعة Postman](./flutter-attendance.postman_collection.json).
