# تسليم API تطبيق الموظفين – Noamany HR

## النتيجة

تم إنشاء طبقة توافق داخل الـNestJS تحت نفس المسار والأسماء التي تستخدمها شاشات Flutter الحالية. النظام المستهدف الوحيد هو:

```text
https://final.noamanycenter.com
```

مسارات الشاشات المتوافقة تكون بالشكل:

```text
https://YOUR-DOMAIN/Api/<OLD_ENDPOINT_NAME>
```

المسار يبدأ بحرف `A` كبير، ولا تضاف قبله `/api`. مثال:

```text
POST https://YOUR-DOMAIN/Api/Get_agaza_List
POST https://YOUR-DOMAIN/Api/add_hdor_ensraf
```

الاستجابة المتوافقة:

```json
{
  "status": 200,
  "message": "تمت العملية بنجاح",
  "data": []
}
```

`status` داخل JSON هو المرجع المتوافق مع التطبيق القديم. عمليات التحقق والأعمال ترجع عادة HTTP 200 مع `status: 400`، بينما فشل التوكن نفسه يرجع HTTP 401.

## التعديل المطلوب في Flutter

بعد نجاح `POST /api/mobile/login` خزّن:

```dart
final token = response['accessToken'];
```

ثم أرسله مع كل endpoint محمي بالطريقة المفضلة:

```http
Authorization: Bearer <access_token>
```

ولتقليل تعديل التطبيق القديم، يقبل السيرفر أيضًا `access_token` أو `token` داخل body/query. لا تعتمد على `emp_id` أو `user_id` لتحديد صاحب العملية؛ السيرفر يأخذ الموظف من التوكن لحماية البيانات.

## تسجيل الدخول على النظام الجديد

`POST /api/mobile/login` بصيغة JSON:

| الحقل | مطلوب | ملاحظة |
|---|---:|---|
| `username` | نعم | رقم هاتف الموظف |
| `password` | نعم | القيمة الافتراضية لحساب الموظف الجديد `102030` |

الاستجابة تعيد `accessToken` و`refreshToken` و`user` و`mustChangePassword` في المستوى العلوي. طلب Postman المسمى `login_app - NEW /api/mobile/login` يستخدم هذا المسار ويحفظ `accessToken` تلقائيًا.

## جرد endpoints التطبيق المنقولة

كل المسارات التالية تقبل POST، كما تقبل GET عند الحاجة للتوافق. حقول الصفحة القديمة `page` و`per_page` ما زالت مدعومة.

### عام وتسجيل الدخول والبروفايل

| Endpoint | المدخلات الأساسية | الوظيفة |
|---|---|---|
| `getAppinfo` | — | بيانات التطبيق |
| `getAppPolicy` | — | سياسة الخصوصية |
| `SplashScreens` | — | شاشات البداية |
| `login_app - NEW /api/mobile/login` | `username`, `password` | تسجيل الدخول الحديث وإصدار JWT من النظام الجديد |
| `Check_Option` | `emp_option=code|mob`, `emp_value` | البحث للاسترجاع القديم |
| `getProfile` | token | البروفايل بنفس أسماء الحقول القديمة |
| `AppServices` | token | خدمات/شاشات التطبيق الفعالة |
| `AllEmplyees` | `page`, `per_page`, `search_title?` | دليل الموظفين |
| `update_pass` | `user_pass`, `confirm_user_pass` | تعيين كلمة مرور من جلسة موثقة |
| `update_pass_past` | `current_pass`, `user_pass`, `confirm_user_pass` | تغيير كلمة المرور بعد التحقق من الحالية |
| `update_profile_image` | multipart `m_image` | صورة الموظف |
| `Add_signature` | multipart `m_image` | توقيع الموظف |
| `show_screen_alert` | token | علم شاشة الإقرار؛ نفس منطق القديم (`no`) |
| `Alert_Screen` | token | بنود الإقرار |
| `Add_Screen_action` | `eqrar_id` | تسجيل موافقة الموظف مرة واحدة |

### الرسائل والإشعارات

| Endpoint | المدخلات الأساسية |
|---|---|
| `SendMessage` | `to_user_ids` كـJSON array، `subject`, `message`, و`msg_image?` |
| `InboxMessages` | `page`, `per_page`, `seen?` |
| `SentMessages` | `page`, `per_page` |
| `ViewMessage` | `msg_id` |
| `SeenMessage` | `msg_id` |
| `DeleteMessage` | `msg_id` |
| `today_notification` | token |
| `register_device_token` | `device_token` |
| `insert_update_token` | `device_token` أو `token` |

الحذف في الرسائل Soft Delete مثل القديم: حذف المرسل يخفي الرسالة، وحذف المستلم يخفي نسخته فقط.

### الإجازات

| Endpoint | المدخلات الأساسية |
|---|---|
| `Agazat_types` | `page`, `per_page` |
| `Add_Agaza` / `Add_Agazax` | `no3_agaza_id`, `from_date`, `to_date`, `reason?`, multipart `hospital_report?` |
| `Get_agaza_List` | `status=sader|wared`, `page`, `per_page` |
| `Get_Agaza_data` | `agaza_id` |
| `Edit_Agaza` | `agaza_id` وباقي حقول الإضافة |
| `Delete_agaza` | `agaza_id` |
| `Egraa_agaza` | `agaza_id`, `action_option=accept|refuse`, `reason?` |

منطق الرصيد، النوع، التقرير الطبي، سلسلة الاعتماد، التحويل للمستلم الحالي، التاريخ والإشعارات يتم من خدمات النظام الجديدة المطابقة للقديم. لا يمكن تعديل/حذف طلب تجاوز مرحلة الانتظار.

### الأذونات

| Endpoint | المدخلات الأساسية |
|---|---|
| `Ozonat_types` | — |
| `Add_Ezn` | `ezn_type_id`, `ezn_date?`, `from_time`, `to_time`, `reason?` |
| `Get_Ezn_List` / `Get_Wared_Ezn_List` | `status=sader|wared`, `page`, `per_page` |
| `Get_Ezn_data` | `ezn_id` |
| `Edit_Ezn` | `ezn_id`, `ezn_type_id`, `from_time`, `to_time`, `reason?` |
| `Delete_ezn` | `ezn_id` |
| `Egraa_ezn` | `ezn_id`, `action_option=accept|refuse`, `reason?` |

يطبق حد المرة الواحدة، الحد الشهري والرصيد بالدقائق، ومسار الاعتماد القديم.

### الحضور والإضافي

| Endpoint | المدخلات الأساسية |
|---|---|
| `attendance`, `attendance_new`, `add_hdor_ensraf`, `add_hdor_ensraf_asly` | `lat`, `long`، وmultipart `basma_img?` |
| `get_branches` | — |
| `Report_Basma` | `date_from?`, `date_to?`, `page`, `per_page` |
| `Basma_Today` | `page`, `per_page` |
| `sheft_types` | — |
| `dwam_types` | `page`, `per_page` |
| `add_sheft_edafi` | `ttype`, `dwam_id_fk`, `sheft_date` |
| `add_hours_edafi` | `num_hours`, `edafa_date` |
| `Report_hours_edafi` | `page`, `per_page` |
| `report_tabdel_sheft` | `page`, `per_page` |

البصمة تستخدم الموظف من التوكن، أقرب/الفرع المخصص، نصف القطر، نافذة الدوام، منع التكرار وحساب التأخير أو الانصراف المبكر من خدمة الحضور الأساسية.

### التعاميم والإنذارات واللوائح والمراسلات

| Endpoint | المدخلات الأساسية |
|---|---|
| `Get_ta3mem_list`, `Get_Enzarat_list`, `Get_lawa2h_list` | `page`, `per_page` |
| `Get_ta3mem_data` | `ta3mem_id_fk` |
| `SeenTa3mem` | `ta3mem_id_fk` |
| `Get_enzar_data` | `enzar_id_fk` |
| `SeenEnzar` | `enzar_id_fk` |
| `SeenLayha` | `layha_id` |
| `Months_List` | — |
| `Get_mosalat_list` | `page`, `per_page` |
| `Add_mosala_response` | `mosala_id`, `answer_reasons?`, `answer_mobarer?`, `answer_other?` |

### الطلبات والمبادرات والأنشطة والمهام والزيارات

| Endpoint | المدخلات الأساسية |
|---|---|
| `Talabat_types`, `Ntaqat_types`, `Get_emp_ehsaeyat`, `Get_mangar_ehsaeyat` | — |
| `Get_emp_ntaq` | token |
| `Add_Talab` | `talab_type_id`, `notes?` |
| `Get_Talabat_List`, `Get_Talab_data`, `Delete_Talab_order` | `order_id` حسب العملية |
| `Add_Mobadra` | `title`, `notes` |
| `Get_Mobadarat_List`, `Delete_Mobadra` | `mobadra_id` حسب العملية |
| `add_nashat` | multipart `files[]`, `title`, `notes?` |
| `Get_Nashat_List`, `Delete_Nashat` | `main_id` حسب العملية |
| `Add_Task` | `title`, `notes`, `status=inprogress|done` |
| `Get_Tasks_List`, `Delete_task` | `task_id` حسب العملية |
| `Add_location_basma` | `lat`, `long`, `site_id`, `site_name?`, `notes?`, صورة اختيارية |
| `get_employee_visits`, `Delete_zeyara` | `zeyara_id` حسب العملية |
| `All_sliders` | `page`, `per_page` |

## الملفات المرفقة للتسليم

- `docs/flutter/noamany_legacy_api.dart`: ثوابت المسارات وقراءة الاستجابة والتوكن.
- `docs/noamany-flutter-legacy-api.postman_collection.json`: Collection جاهزة؛ غيّر متغير `baseUrl` فقط.
- `backend/src/modules/mobile/legacy-mobile.controller.ts`: الأسماء القديمة وطبقة التوجيه.
- `backend/src/modules/mobile/legacy-mobile-compat.service.ts`: منطق وحدود الملكية للموظف.

## دوال موجودة في Api.php وليست Mobile endpoints

الملف القديم يعلن كثيرًا من الأدوات الداخلية كـ`public` بسبب أسلوب CodeIgniter، مثل `Msg_200`, `distance`, `num_days`, `upload_*`, `send_notify`, `addEvaluationDetails`, `resolve_action_date`, `get_shift_datetimes`. هذه ليست endpoints يستدعيها Flutter ولم يتم كشفها عمدًا.

مجموعة تقييم المدارس/الزيارات التعليمية (`AddVisit`, `Get_All_Teachers`, `My_Visits_list` وما يتبعها) كانت تعتمد على اتصال CodeIgniter منفصل باسم `otherdb` غير موجود في قاعدة النظام الجديد، لذلك لم تُدمج كمسارات موظفين وهمية. كذلك مجموعة التقييم القديمة كانت تستدعي جداول `evaluation_types` و`evaluation_setting` غير الموجودة أصلًا في نسخة قاعدة البيانات القديمة المرفقة، وكانت غير قابلة للتنفيذ كما هي. المسار العام يعيد `status: 400` باسم أي مسار قديم غير مصنف بدل نجاح كاذب.

## التشغيل قبل التسليم

```bash
cd backend
npm run prisma:generate
npx prisma migrate deploy
npm run typecheck
npm run start:dev
```

ثم استورد Postman Collection ونفّذ بالترتيب: Login → Profile → Lists → Create/Edit/Action/Delete. لا تستخدم بيانات الإنتاج لاختبارات الإضافة والحذف.
