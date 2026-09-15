# تغطية كاملة لمسارات تطبيق HR الجديد على الأونلاين

**الخادم:** `https://final.noamanycenter.com`  
**النطاق:** الـ45 مسارًا في `NOAMANY_HR_NEW_MOBILE_API.postman_collection.json` فقط؛ لا توجد مسارات `/Api` قديمة.

## النتيجة حسب المجموعة

| المجموعة | ما تم اختباره | النتيجة |
|---|---|---|
| Login / Profile / FCM | POST login، GET profile، POST device-token | 200 |
| Attendance | POST punch بإحداثيات غير صالحة | 400 تحقق صحيح. لم نرسل بصمة نجاح كي لا نضيف دوامًا فعليًا. |
| Leaves | GET list، POST create | GET 200؛ POST 400 لأن `leaveTypeId=1` غير موجود في بيانات الأونلاين. |
| Permissions | GET list، POST create | GET 200؛ **POST 500 — عطل مؤكد**. |
| Tasks | GET، POST، DELETE | 200 / 201 / 200. |
| Notifications | GET | 200؛ لا توجد سجلات حالية لاختبار PATCH read. |
| Circulars | GET list، GET detail، PATCH read | القائمة 200 وفارغة؛ detail/read لمعرف غير موجود: 404 صحيح. |
| Warnings | GET list، GET detail، PATCH read | القائمة 200 وفارغة؛ detail/read لمعرف غير موجود: 404 صحيح. |
| Requests | GET | 200. |
| Visit | POST | 201. |
| Legal files | GET list، PATCH read | 200 / 200. |
| Activities | GET، POST، DELETE | 200 / 201 / 200 (مع صورة مرفوعة). |
| Employees | GET | 200. |
| Messages | POST، GET inbox/sent/detail، PATCH read، DELETE | 201 ثم 200 لكل المسارات. |
| Loans | GET meta/sent/incoming/detail، POST create، PATCH action، DELETE | مسارات القوائم 200؛ **POST 500 — عطل مؤكد**. detail/action/delete لمعرف غير موجود: 404 صحيح، ولا يمكن اختبار نجاحها بسبب عطل الإنشاء. |
| Uploads | POST app/activity/message/document | 201 للأقسام الأربعة عند `multipart/form-data`، الحقل `file`، وMIME `image/png`. |

## البيانات التجريبية المستخدمة

- علامة التتبع: `ONLINE_API_TEST_<timestamp>`.
- الإذن: `no3Ezn: 1`, `eznDate: 2027-12-02`, `fromHour: 10:00`, `toHour: 11:00`, `fatraFk: 1` → 500.
- السلفة: `amount: 1000`, `repaymentMethod: 3`, `installments: 5`, `deductionStartDate: 2027-12-01` → 500.
- الإجازة: `leaveTypeId: 1`, وتاريخ 2027-12-01 → 400 لنوع إجازة غير موجود.
- الرفع: ملف PNG وحقل multipart باسم `file` → 201.

## الأعطال المطلوب إصلاحها

1. `POST /api/mobile/permissions` يعيد 500 بدل رسالة تحقق أو خطأ أعمال واضح.
2. `POST /api/mobile/loans` يعيد 500 ويمنع دورة السلفة واعتماد المدير.
3. لا يوجد في الـcollection endpoint يوفّر أنواع الإجازات الحديثة؛ لذلك لا يستطيع التطبيق تحديد `leaveTypeId` صالح من الـAPI الجديد وحده.

الـcollection نفسه يحتوي method، header، variables، وJSON التجريبي لكل مسار: `docs/NOAMANY_HR_NEW_MOBILE_API.postman_collection.json`.
