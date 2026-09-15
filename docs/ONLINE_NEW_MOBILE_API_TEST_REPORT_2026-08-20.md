# تقرير اختبار API الموبايل الجديد — الأونلاين

**تاريخ الاختبار:** 20 أغسطس 2026  
**الخادم:** `https://final.noamanycenter.com`  
**النطاق:** المسارات الحديثة فقط: `/api/mobile/*` و`/api/uploads/*`؛ لا يشمل أي مسار `/Api/*` قديم.  
**ملف Postman:** `docs/NOAMANY_HR_NEW_MOBILE_API.postman_collection.json`

## الحسابات

- موظف: رقم ينتهي بـ `9111` (صلاحية level 1).
- مدير: رقم ينتهي بـ `9888` (صلاحية level 2).
- لا يحتوي التقرير على كلمات مرور أو رموز دخول.

## الملخص

| الفحص | النتيجة |
|---|---:|
| تسجيل الدخول | 200 ناجح |
| مسارات القراءة | 16/16 أعادت 200 |
| طلبات الكتابة المنفذة | 4 ناجحة، 2 أعطال/إعدادات، 1 رفض تحقق متوقع |
| أعطال خادم مؤكدة | 2 (السلفة والإذن) |

## نتائج الطلبات الفعلية

| API | بيانات التجربة | الحالة | النتيجة |
|---|---|---:|---|
| `POST /api/mobile/login` | `username`, `password` | 200 | نجح |
| `POST /api/mobile/device-token` | `token: ONLINE_API_TEST_<timestamp>` | 200 | نجح |
| `POST /api/mobile/leaves` | `leaveTypeId: 1`, `startDate/endDate: 2027-12-01` | 400 | رفض سليم: نوع الإجازة 1 غير موجود في بيانات الأونلاين؛ يلزم اختيار نوع موجود من بيانات النظام. |
| `POST /api/mobile/permissions` | `no3Ezn: 1`, `eznDate: 2027-12-02`, `fromHour: 10:00`, `toHour: 11:00`, `fatraFk: 1` | **500** | عطل خادم: `حدث خطأ غير متوقع`. |
| `POST /api/mobile/tasks` | عنوان يحمل `ONLINE_API_TEST_<timestamp>` | 201 | نجح، ثم حُذف. |
| `DELETE /api/mobile/tasks/{id}` | `id: 55` | 200 | نجح. |
| `POST /api/mobile/attendance/punch` | `lat: 0`, `long: 0` | 400 | رفض تحقق سليم: لا يوجد موقع بصمة بإعدادات الفروع. لم نرسل بصمة حضور ناجحة كي لا نسجل دوامًا فعليًا. |
| `POST /api/mobile/visit` | إحداثيات `30.044420, 31.235712` وملاحظة اختبار | 201 | نجح؛ سجل زيارة برقم 107. |
| `POST /api/mobile/activities` | `files: []` | 400 | رفض تحقق سليم: حقل `files` يحتاج ملفًا واحدًا على الأقل. |
| `POST /api/mobile/messages` | رسالة إلى الحساب نفسه بعلامة اختبار | 201 | نجح. |
| `POST /api/mobile/loans` | `amount: 1000`, `repaymentMethod: 3`, `installments: 5`, `deductionStartDate: 2027-12-01` | **500** | عطل خادم: `حدث خطأ غير متوقع`؛ لذلك تعذر تنفيذ إجراء المدير. |

## مسارات القراءة الناجحة (200)

- `GET /api/mobile/profile`
- `GET /api/mobile/notifications`
- `GET /api/mobile/leaves`
- `GET /api/mobile/permissions?page=1&pageSize=20`
- `GET /api/mobile/tasks?page=1&perPage=20`
- `GET /api/mobile/circulars?page=1&perPage=20`
- `GET /api/mobile/warnings?page=1&perPage=20`
- `GET /api/mobile/requests`
- `GET /api/mobile/legal-files?page=1&perPage=20`
- `GET /api/mobile/activities?page=1&perPage=20`
- `GET /api/mobile/employees?page=1&perPage=100`
- `GET /api/mobile/messages/inbox?page=1&perPage=20`
- `GET /api/mobile/messages/sent?page=1&perPage=20`
- `GET /api/mobile/loans/meta`
- `GET /api/mobile/loans?mode=sader&page=1&perPage=20`
- `GET /api/mobile/loans?mode=wared&page=1&perPage=20`

## بيانات الاختبار الكاملة لكل API

ملف Postman المرفق هو المرجع التنفيذي: يحتوي كل المسارات الجديدة الـ45، الـmethod، الـheaders، Bearer token، المتغيرات، وJSON التجريبي لكل طلب كتابة. قبل التشغيل في Postman، اضبطي المتغيرات `baseUrl` و`phone` و`password` ثم انسخي `accessToken` الناتج من تسجيل الدخول.

## مطلوب إصلاحه

1. تتبع سجل الخادم لطلب `POST /api/mobile/permissions`؛ لا يجب تحويل خطأ إدخال/إعداد إلى 500 عام.
2. تتبع سجل الخادم لطلب `POST /api/mobile/loans`؛ نفس المشكلة تمنع إنشاء السلفة قبل وصولها للمدير.
3. توفير endpoint أو metadata لأنواع الإجازات المتاحة لتطبيق الموبايل الجديد، أو تضمين الأنواع في استجابة الإجازات؛ التطبيق لا يستطيع معرفة `leaveTypeId` الصحيح حاليًا من هذا الـAPI وحده.
