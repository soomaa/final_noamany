# تسليم API محتوى التطبيق والسلف لمهندس Flutter

هذا الملف يغطي اللوائح والملفات، الأنشطة، الرسائل الداخلية، وطلبات السلف. جميع المسارات المحمية تحتاج:

```http
Authorization: Bearer ACCESS_TOKEN
Accept: application/json
```

يمكن الاستمرار على أسماء التطبيق القديم تحت `/Api/*` بأقل تعديل، أو استخدام REST الحديث تحت `/api/mobile/*`. هوية الموظف تؤخذ من الـJWT ولا يُعتمد أي `emp_id` مرسل من التطبيق.

## المسارات القديمة المتوافقة

كل هذه المسارات تقبل `POST` وتعيد الغلاف القديم:

```json
{ "status": 200, "message": "...", "data": [] }
```

### اللوائح والملفات

- `POST /Api/Get_lawa2h_list`: الحقول الاختيارية `page`, `per_page`.
- `POST /Api/SeenLayha`: الحقل `layha_id`.
- كل عنصر يعيد: `layha_id`, `layha_name`, `details`, `layha_path`, `seen`, `seen_date`, `seen_time`.

### الأنشطة

- `POST /Api/add_nashat` كـ`multipart/form-data`: `title`, `notes`, وملف أو أكثر باسم `files`.
- `POST /Api/Get_Nashat_List`: `page`, `per_page`.
- `POST /Api/Delete_Nashat`: `main_id`. الحذف متاح قبل بدء الاعتماد فقط.

### الرسائل الداخلية

- `POST /Api/AllEmplyees`: لجلب المستلمين. استخدم قيمة `user_id`.
- `POST /Api/SendMessage` كـ`multipart/form-data`: `to_user_ids` كمصفوفة JSON مثل `[12,19]`، و`subject`, `message`، وملف اختياري باسم `msg_image`.
- `POST /Api/InboxMessages`: `page`, `per_page`, و`seen` اختيارياً (`0` أو `1`).
- `POST /Api/SentMessages`: `page`, `per_page`.
- `POST /Api/ViewMessage`, `/Api/SeenMessage`, `/Api/DeleteMessage`: الحقل `msg_id`.

### السلف

- `POST /Api/Solaf_meta`: حد السلفة، الحد الأقصى للأقساط، وطرق السداد.
- `POST /Api/Add_Solfa`:
  - `qemt_solaf`: المبلغ، عدد صحيح أكبر من صفر.
  - `sadad_solfa`: `1` دفع نقداً، `2` خصم مرة واحدة من الراتب، `3` خصم شهري.
  - `qst_num`: مطلوب عملياً للطريقة `3`. الطريقتان `1` و`2` تُحفظان قسطاً واحداً.
  - `solaf_reason`: سبب السلفة، مطلوب.
  - `khsm_form_date_m`: تاريخ بداية الخصم `YYYY-MM-DD`، اختياري؛ الافتراضي أول الشهر التالي.
- `POST /Api/Get_Solaf_List`: `status=sader` لطلبات الموظف أو `status=wared` للطلبات المحولة إليه، مع `page`, `per_page`.
- `POST /Api/Get_Solfa_data`: `solfa_id`.
- `POST /Api/Egraa_solfa`: `solfa_id`, و`action_option=accept|reject`، و`reason` اختياري.
- `POST /Api/Delete_solfa`: `solfa_id`. الإلغاء متاح لصاحب الطلب فقط وقبل أن يبدأ المدير المباشر الإجراء.

## REST الحديث

### اللوائح والأنشطة والرسائل

- `GET /api/mobile/legal-files?page=1&perPage=20`
- `PATCH /api/mobile/legal-files/:id/read`
- `GET /api/mobile/activities?page=1&perPage=20`
- `POST /api/mobile/activities` JSON: `{ "title": "...", "notes": "...", "files": ["/uploads/..."] }`
- `DELETE /api/mobile/activities/:id`
- `GET /api/mobile/employees?page=1&perPage=20`
- `POST /api/mobile/messages` JSON: `{ "toUserIds": [12], "subject": "...", "message": "...", "file": "/uploads/..." }`
- `GET /api/mobile/messages/inbox?page=1&perPage=20&status=0`
- `GET /api/mobile/messages/sent?page=1&perPage=20`
- `GET /api/mobile/messages/:id`
- `PATCH /api/mobile/messages/:id/read`
- `DELETE /api/mobile/messages/:id`

لرفع ملف قبل REST استخدم `POST /api/uploads/activity` أو `POST /api/uploads/message` كـ`multipart/form-data` باسم `file`، ثم أرسل قيمة `path` الراجعة في الطلب.

### السلف

- `GET /api/mobile/loans/meta`
- `GET /api/mobile/loans?mode=sader&page=1&perPage=20`
- `GET /api/mobile/loans?mode=wared&page=1&perPage=20`
- `GET /api/mobile/loans/:id`
- `POST /api/mobile/loans`

```json
{
  "amount": 1000,
  "repaymentMethod": 3,
  "installments": 5,
  "deductionStartDate": "2026-09-01",
  "reason": "سبب طلب السلفة"
}
```

- `PATCH /api/mobile/loans/:id/action` مع `{ "action": "accept", "reason": "" }` أو `{ "action": "reject", "reason": "سبب الرفض" }`.
- `DELETE /api/mobile/loans/:id` لإلغاء طلب لم يبدأ اعتماده.

## دورة السلفة وحالات الواجهة

الطلب الجديد يكون `status=pending` ويذهب للمدير المباشر، ثم مدير الإدارة، ثم الموارد البشرية، ثم الموافقة النهائية. الحقل `canAction=true` يظهر فقط للمستخدم الذي حُوّل إليه الطلب، و`canCancel=true` لصاحب الطلب قبل أول إجراء.

لا يتم إنشاء جدول الأقساط ولا القيد المحاسبي عند تقديم الطلب. يتم إنشاؤهما داخل معاملة واحدة بعد الموافقة النهائية فقط. عند الرفض في أي مرحلة يعود الطلب لصاحبه بحالة `rejected`، وعند اكتمال السلسلة يصبح `approved`.

إذا أعاد الإنشاء رسالة عدم وجود مدير مباشر، يجب ربط `employees.manger` بحساب مدير له مستخدم فعال. انتقالات مدير الإدارة والموارد البشرية والمدير العام تعتمد نفس إعدادات إجراءات الإجازات في `hr_egraat_emp_setting`.

## ملفات التسليم

- مجموعة Postman: `docs/noamany-flutter-legacy-api.postman_collection.json`
- ثوابت Dart: `docs/flutter/noamany_legacy_api.dart`
- توثيق التطبيق القديم الكامل: `docs/FLUTTER_LEGACY_API_HANDOFF.md`
