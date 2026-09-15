# عقد API لتطبيق Flutter ومراجعة التعارضات

> مصدر الحقيقة: كود الـ Backend الحالي في `backend/src/modules/mobile` و`uploads` والخدمات التي يستدعيها، وليس مجموعة Postman أو تطبيق Flutter. تاريخ المراجعة: 2026-08-23.

## النطاق والقاعدة الأساسية

يغطي هذا الملف كل واجهة موجهة لتطبيق الموظفين ومكشوفة حاليًا من الـ Backend:

| الواجهة | المسار | العدد |
| --- | --- | ---: |
| واجهة التوافق القديمة | `/Api/{action}` (حرف `A` كبير) | 92 اسم مسار/alias |
| واجهة الموبايل الحديثة | `/api/mobile/*` | 41 عملية HTTP |
| رفع الملفات الذي تحتاجه الشاشات الحديثة | `/api/uploads/{category}` | 4 فئات مستخدمة من الموبايل |

لا يشمل هذا الملف واجهات لوحة الإدارة العامة مثل `/api/attendance/*`؛ فهي ليست واجهة موظف Flutter، حتى لو أمكن لمستخدم ذي صلاحية استدعاؤها. لا يوجد مصدر Flutter في مساحة العمل، لذلك «المسارات الموجودة في Flutter» هنا تعني كل المسارات التي يعرّضها الـ Backend حاليًا للموبايل، لا إثبات أن كل واحد مستدعى في نسخة APK معينة.

**الاختيار الموصى به للتطبيق الجديد:** استخدم `/api/mobile/*` حيث يوجد مكافئ، واستخدم `/Api/*` فقط للوظائف التي لم تهاجر بعد (وبالأخص اعتماد إجازة/إذن وارد). لا تدمج الردود القديمة والحديثة في parser واحد.

## قواعد عامة قبل أي شاشة

| بند | العقد |
| --- | --- |
| Base URL | الواجهة الحديثة: `https://host/api` ثم `/mobile/...` أو `/uploads/...`. الواجهة القديمة خارج الـ prefix: `https://host/Api/...`. حالة الأحرف مهمة؛ `/api/Api` و`/api/api` ليسا بديلين. |
| المصادقة | كل المسارات عدا المسارات القديمة العامة وlogin الحديث تحتاج `Authorization: Bearer <accessToken>`. لا ترسل `emp_id` لتغيير هوية الطلب؛ الخدمات الحديثة تستخلص الهوية من JWT. |
| JSON | أرسل `Content-Type: application/json` للواجهة الحديثة. الواجهة القديمة تدعم body أو query، لكن Flutter يجب أن يرسل **POST** فقط؛ `@All` يقبل أفعالًا متعددة وهو سلوك توافق قديم وليس عقدًا جيدًا للعميل. |
| ملفات | ارفع `multipart/form-data` بالحقل الحرفي `file` أولًا إلى `/api/uploads/{category}`، ثم أرسل `path` الناتج في JSON. الاستثناءات القديمة تقبل رفعًا مباشرًا بحقول قديمة مثل `basma_img` أو `msg_image`. |
| الأرقام الكبيرة | يحول الـ Backend قيم `BigInt` إلى strings عند JSON. عامل الأكواد والمبالغ ومعرّفات بعض صفوف legacy كـ `String` إن لم يثبت نوعها في الاستجابة. |
| الترقيم | الحديث في قوائم `MobileListDto`: `page`, `perPage` (الافتراضي 1 و20). قائمتا الإذن/الإجازة الإدارية تستخدمان `page`, `pageSize`. القديم غالبًا `page`, `per_page`. |

## صيغ الاستجابة التي تشير إليها الجداول

### L — واجهة `/Api` القديمة

كل مسارات `/Api`، باستثناء `login_app`، تلف النتيجة بهذه الصيغة:

```json
{ "status": 200, "message": "نص عربي", "data": "T" }
```

`T` هو النوع المكتوب في عمود **الرد** بالأسفل. أخطاء منطق الأعمال الملتقطة تُعاد غالبًا أيضًا عبر HTTP 200 ولكن بداخلها:

```json
{ "status": 400, "message": "سبب الخطأ", "data": null }
```

لذلك في Legacy يجب أن يفحص Flutter كلًا من HTTP status و`body.status`، ولا يعدّ `200` الشبكي وحده نجاحًا. صيغة `login_app` مختلفة:

```json
{
  "status": 200,
  "message": "تم التسجيل بنجاح",
  "logout_option": 1,
  "data": {
    "access_token": "jwt", "refresh_token": "jwt", "logout_option": 1,
    "user_id": "12", "emp_id": "45", "emp_code": "1001"
  }
}
```

وعند الفشل: `{ "status": 400, "logout_option": 0, "data": null, "message": "..." }`.

### M — واجهة `/api/mobile` الحديثة

نجاح المسارات الحديثة هو JSON خام بلا غلاف `status/message/data`، والأخطاء هي HTTP حقيقية بالشكل:

```json
{ "statusCode": 400, "message": "نص أو قائمة رسائل", "...details": "عند وجودها" }
```

أهم الأنواع المتكررة:

| الرمز | شكل الاستجابة الناجحة |
| --- | --- |
| `M-ID` | `{ "id": 123 }` |
| `M-ACK` | `{ "ok": true }` أو `{ "id": 123, "seen": true }` |
| `M-LIST` | `{ "data": [ ... ] }` |
| `M-PAGE` | `{ "data": [ ... ], "total": 42, "page": 1, "perPage": 20 }` |
| `M-WORKFLOW` | `{ "id": 123, "stage": "approve_direct_manager", "suspend": 1, "status": "pending|approved|rejected" }` |

`status` في `M-WORKFLOW` هو نص للعرض، بينما `suspend` هو رقم قاعدة البيانات. لا تخلط هذا الحقل مع `status` في الغلاف القديم.

## الواجهة الحديثة — `/api/mobile`

كل الصفوف المحمية هنا تحتاج Bearer token. أمثلة الحقول تمثل الحقول المطلوبة ما لم تذكر كلمة اختياري.

| HTTP والمسار | الطلب / query | الرد الفعلي |
| --- | --- | --- |
| `POST /api/mobile/login` عام | `{username,password}`، كل منهما 3 أحرف على الأقل | `{accessToken,refreshToken,user,message,accountType:"staff",mustChangePassword:false}`. استخدم هذا login الجديد فقط. |
| `GET /api/mobile/profile` | — | كائن ملف موظف legacy-compatible: `user_id`, `emp_id`, `emp_code`, `card_num`, `emp_name`, `phone`, `branch...`؛ المعرّفات strings. |
| `POST /api/mobile/device-token` | `{token}` | `M-ACK` = `{ok:true}` |
| `GET /api/mobile/notifications` | — | `M-LIST`؛ الصفوف إشعارات المستخدم، ومن مفاتيحها `id`, `title`, `msg`, `seen`, `date`, `time`. |
| `PATCH /api/mobile/notifications/:id/read` | — | `{id,seen:true}` |
| `GET /api/mobile/leaves` | — | `M-LIST` حتى 50 طلبًا: `{id,requestNo,leaveTypeId,fromDate,toDate,days,suspend,status,createdAt}`. لا توجد pagination. |
| `GET /api/mobile/leaves/types` | — | نتيجة pagination للإجازات: `{data:[{id,title,...}],total,page,pageSize}`؛ `pageSize=100` داخليًا. |
| `POST /api/mobile/leaves` | `{leaveTypeId:int,startDate,endDate,reason?}` | كائن إنشاء الإجازة، ومنه `id`, `requestNo`, `suspend:0`, `actionsSends:"send_to_direct_manager"` وبيانات الطلب. لا يقبل `hospitalReport`. |
| `GET /api/mobile/permissions` | `page`, `pageSize`, `status?`؛ يفرض الخادم `mode=sader` | `{data:[{id,requestNo,no3Ezn,eznDate,fromTime,toTime,minutes,currentTo,actionsSends,status,canAction}],total,page,pageSize}`. |
| `GET /api/mobile/permissions/available` | `date?=YYYY-MM-DD` | `{remainingMinutes,usedMinutes,remainingCount,usedCount,...}`؛ قيمة الرصيد الشهرية للإذن الشخصي. **راجع P1 أدناه قبل الاعتماد عليه.** |
| `POST /api/mobile/permissions` | `{no3Ezn:1|2,eznDate,fromHour,toHour,reason,fatraFk?}` | كائن إنشاء إذن، ومنه `id`, `suspend:0`, `actionsSends:"send_to_direct_manager"`. |
| `GET /api/mobile/tasks` | `page?`, `perPage?`, `status?` | `M-PAGE`؛ صف المهمة من جدول التقرير اليومي. |
| `POST /api/mobile/tasks` | `{title,notes,status:"inprogress"|"done"}` | `M-ID` |
| `DELETE /api/mobile/tasks/:id` | — | `M-ID` |
| `POST /api/mobile/attendance/punch` | `{lat:string,long:string,photo?:"upload path"}` | كائن البصمة: نتيجة الحضور/الانصراف مع `branchId`, `branchName`, `distanceMeters`، وحالة/وقت البصمة التي تعيدها خدمة الحضور. يرفض الإحداثيات أو النطاق الجغرافي غير الصحيحين بـ HTTP 400. |
| `GET /api/mobile/circulars` | `page?`, `perPage?`, `status?` | `M-PAGE`; صف: `id,title,subject,date,image,seen,detail_id,ta3mem_id_fk,emp_id,emp_code,emp_name,ta3mem_title,ta3mem_date,ta3mem_img,seen_value,seen_date,seen_time`. |
| `GET /api/mobile/circulars/:id` | — | كائن التعميم نفسه + `attachments:[{id,title,file}]`، **ليس array**. |
| `PATCH /api/mobile/circulars/:id/read` | — | `{id,seen:true}` |
| `GET /api/mobile/warnings` | `page?`, `perPage?`, `status?` | `M-PAGE`; الصف: `id,type,details,date,time,sendToHr,sendToEmp,seen,seenDate,seenTime,hrNotes?`. |
| `GET /api/mobile/warnings/:id` | — | كائن الإنذار + `attachments:[{id,title,file}]`، **ليس array**. |
| `PATCH /api/mobile/warnings/:id/read` | — | `{id,seen:true}` |
| `GET /api/mobile/requests` | — | `M-LIST` حتى 50 صفًا: `{id,requestNo,typeId,status,reasonAction,createdAt}`. |
| `POST /api/mobile/visit` | `{lat,long,img?,notes?}` | `M-ID` |
| `GET /api/mobile/legal-files` | `page?`, `perPage?`, `status?` | صفوف اللوائح من legacy compat؛ الرد الخام هو array/قائمة صفوف legacy (لا غلاف حديث ثابت). |
| `PATCH /api/mobile/legal-files/:id/read` | — | كائن تأكيد legacy مثل `{layha_id:"...",seen:"1"}`. |
| `GET /api/mobile/activities` | `page?`, `perPage?`, `status?` | صفوف الأنشطة legacy؛ array/صفوف قديمة. |
| `POST /api/mobile/activities` | `{title,notes?,files:["upload path",...]}` | `{main_id:"123"}` (معرّف string من compat). |
| `DELETE /api/mobile/activities/:id` | — | استجابة فارغة legacy-compatible: `""`. |
| `GET /api/mobile/employees` | `page?`, `perPage?`, `status?` | array موظفين legacy؛ يحتوي `user_id` الذي يلزم كمستلم رسالة. |
| `POST /api/mobile/messages` | `{toUserIds:number[],subject,message,file?}` | `{msg_id:"123"}`. يجب أن يكون `file` مسارًا من upload `message`. |
| `GET /api/mobile/messages/inbox` | `page?`, `perPage?`, `status?` | array رسائل واردة legacy. |
| `GET /api/mobile/messages/sent` | `page?`, `perPage?` | array رسائل صادرة legacy. |
| `GET /api/mobile/messages/:id` | — | array فيه صف الرسالة: `[{...}]`، لا كائن مفرد. |
| `PATCH /api/mobile/messages/:id/read` | — | يعيد array صف الرسالة بعد التعليم كمقروء. |
| `DELETE /api/mobile/messages/:id` | — | `""` |
| `GET /api/mobile/loans/meta` | — | `{empId,employeeName,employeeCode,jobTitle,nextRequestNumber,requestDate,maxInstallments,...,repaymentMethods:[{id,name}]}`. |
| `GET /api/mobile/loans` | `page?`, `perPage?`, `mode?:sader|wared` | `M-PAGE`; صف السلفة: `id,requestNumber,requestDate,employeeName,amount,repaymentMethod,status,suspend,canAction,...`. |
| `GET /api/mobile/loans/:id` | — | كائن تفصيلي للسلفة ودفعاتها/حالة الاعتماد. |
| `POST /api/mobile/loans` | `{amount:int,repaymentMethod:1|2|3,reason,installments?,deductionStartDate?}` | كائن صف السلفة الحديث؛ يبدأ محولًا للمدير المباشر. |
| `PATCH /api/mobile/loans/:id/action` | `{action:"accept"|"reject",reason?}` | `M-WORKFLOW` |
| `DELETE /api/mobile/loans/:id` | — | `{id,status:"cancelled"}` |

### رفع الملفات الحديث — `/api/uploads`

كلها `POST multipart/form-data`، Bearer token، واسم الحقل **`file`** حرفيًا. الاستجابة نفسها:

```json
{ "path": "human_resources/.../file.ext", "filename": "file.ext", "url": "/uploads/..." }
```

| المسار | الاستخدام اللاحق | القيود الأساسية |
| --- | --- | --- |
| `POST /api/uploads/app` | `photo` للحضور | صور فقط، حتى 10MB |
| `POST /api/uploads/activity` | `files[]` في إنشاء نشاط | صور فقط، حتى 10MB |
| `POST /api/uploads/message` | `file` في إرسال رسالة | صور/PDF/Office، حتى 20MB |
| `POST /api/uploads/document` | مستندات عامة؛ لا يوجد حقل لها في إنشاء الإجازة الحديث | صور/PDF/Office، حتى 20MB |

## واجهة التوافق القديمة — `/Api`

كل المسارات أدناه تقبل فعليًا `@All`. الاستخدام المعتمد من Flutter هو `POST`، وحقول الطلب يمكن أن تكون body أو query؛ الجداول تكتب أسماء الحقول القديمة الأساسية. كل الردود تحمل غلاف `L` السابق، لذلك عمود **الرد** يصف `data` فقط.

### عامة، حساب، وإشعارات

| `POST /Api/...` | حقول الطلب | `data` في الرد |
| --- | --- | --- |
| `login_app` عام | `phone` أو `username` أو `emp_code` + `user_pass` أو `password` | صيغة login الخاصة السابقة (`access_token`, `refresh_token`, `user_id`...). |
| `getAppinfo` عام | — | `AppInfo[]` صفوف إعدادات التطبيق. |
| `getAppPolicy` عام | — | `string` أو `null`. |
| `SplashScreens` عام | — | `SplashScreen[]`. |
| `Check_Option` عام | حقول خيار التطبيق | `AppOption[]`/صف إعدادات مطابق. |
| `getProfile` | — | كائن profile نفسه للحديث، لكن داخل `data`. |
| `today_notification` | — | `{data:[NotificationRow...]}` داخل غلاف L (أي `data.data` للوصول للصفوف). |
| `register_device_token`, `insert_update_token` | `device_token` أو `token` | `{ok:true}`. |
| `AppServices` | — | `AppService[]`. |
| `All_sliders` | — | `Slide[]`. |
| `get_branches` | — | `Branch[]`. |
| `show_screen_alert` | — | `{show_screen:"no"}`. |
| `Alert_Screen` | — | `AlertScreen[]`. |
| `Add_Screen_action` | حقول إجراء التنبيه | صف/تأكيد الإجراء legacy. |

### الإجازات والأذونات — الإنشاء والقوائم والإجراء

| `POST /Api/...` | حقول الطلب | `data` في الرد |
| --- | --- | --- |
| `Agazat_types` | `page?`, `per_page?` | `LeaveType[]`. |
| `Get_agaza_List` | `status?:sader|wared`, `page?`, `per_page?` | `LeaveRow[]` (الغلاف لا يحتفظ بـ total). |
| `Get_Agaza_data` | `agaza_id` أو `id` | `[LeaveRow]` — array من عنصر واحد. |
| `Add_Agaza`, `Add_Agazax` | `no3_agaza_id`, `from_date`, `to_date`, `reason?`؛ multipart اختياري | كائن إنشاء الإجازة. **رفع ملف باسم multipart لا يصل إلى `hospitalReport` حاليًا؛ راجع P1.** |
| `Edit_Agaza` | حقول الإجازة/`agaza_id` | `{agaza_id:"..."}` أو صف معدل. |
| `Delete_agaza` | `agaza_id` أو `id` | `{id,status:"cancelled"}`. |
| `Egraa_agaza` | `agaza_id` أو `id`, `action_option:accept|reject`, `reason?` | `M-WORKFLOW` داخل L. |
| `Ozonat_types` | — | `[{id:1,title:"استئذان شخصي"},{id:2,title:"استئذان للعمل"}]`. |
| `Get_Ezn_List`, `Get_Wared_Ezn_List` | يجب تمرير `status=wared` للوارد، `page?`, `per_page?` | `PermissionRow[]`. **اسم `Get_Wared_Ezn_List` وحده لا يغير mode؛ راجع P1.** |
| `Get_Ezn_data` | `ezn_id` أو `id` | `[PermissionRow]`. |
| `Add_Ezn` | `ezn_type_id`, `ezn_date?`, `from_time`, `to_time`, `reason?` | كائن إنشاء الإذن. |
| `Edit_Ezn` | حقول الإذن و`ezn_id` | `{ezn_id:"..."}` أو صف معدل. |
| `Delete_ezn` | `ezn_id` | `""`. |
| `Egraa_ezn` | `ezn_id` أو `id`, `action_option:accept|reject`, `reason?` | `M-WORKFLOW` داخل L. |

### السلف، المهام، الحضور، التعميمات والإنذارات

| `POST /Api/...` | حقول الطلب | `data` في الرد |
| --- | --- | --- |
| `Solaf_meta` | — | Loan metadata. |
| `Get_Solaf_List` | `status?:sader|wared`, `page?`, `per_page?` | `LoanRow[]`. |
| `Get_Solfa_data` | `solfa_id` أو `loan_id` أو `id` | `[LoanRow]`. |
| `Add_Solfa` | `qemt_solaf`, `sadad_solfa`, `solaf_reason`, `qst_num?`, `khsm_form_date_m?` | كائن صف سلفة جديد. |
| `Egraa_solfa` | `solfa_id` أو `loan_id`, `action_option`, `reason?` | `M-WORKFLOW` داخل L. |
| `Delete_solfa` | `solfa_id` أو `loan_id` | `{id,status:"cancelled"}`. |
| `Add_Task` | `title`, `notes`, `status:inprogress|done` | `{id}`. |
| `Get_Tasks_List` | `page?`, `per_page?`, `status?` | `TaskRow[]`. |
| `Delete_task` | `task_id` أو `id` | `{id}`. |
| `add_hdor_ensraf`, `add_hdor_ensraf_asly`, `attendance_new`, `attendance` | `lat`, `long` أو `lng`، وmultipart اختياري | كائن بصمة الحضور نفسه للحديث داخل L. هذه أربعة aliases للخط نفسه؛ استدع واحدًا فقط. |
| `Get_ta3mem_list` | `page?`, `per_page?` | `CircularRow[]`. |
| `Get_ta3mem_data` | `ta3mem_id_fk` أو `id` | `[CircularRow]`. |
| `SeenTa3mem` | `ta3mem_id_fk` أو `id` | `{id,seen:true}`. |
| `Get_Enzarat_list` | `page?`, `per_page?` | `WarningRow[]`. |
| `Get_enzar_data` | `enzar_id_fk` أو `id` | `[WarningRow]`. |
| `SeenEnzar` | `enzar_id_fk` أو `id` | `{id,seen:true}`. |

### رسائل، لوائح، مراسلات، طلبات، مبادرات وأنشطة

| `POST /Api/...` | حقول الطلب | `data` في الرد |
| --- | --- | --- |
| `AllEmplyees` | `page?`, `per_page?` | `EmployeeRow[]`؛ استخدم `user_id` كمستلم رسالة. |
| `SendMessage` | `to_user_ids` (JSON array أو CSV), `subject`, `message`, `msg_image?` أو multipart | `{msg_id:"..."}`. |
| `InboxMessages` | `page?`, `per_page?`, `seen?` | `MessageRow[]`. |
| `SentMessages` | `page?`, `per_page?` | `MessageRow[]`. |
| `ViewMessage` | `msg_id` | `[MessageRow]`. |
| `SeenMessage` | `msg_id` | `[MessageRow]` بعد التحديث. |
| `DeleteMessage` | `msg_id` | `""`. |
| `Get_lawa2h_list` | `page?`, `per_page?` | `LegalFileRow[]`. |
| `SeenLayha` | `layha_id` | `{layha_id:"...",seen:"1"}`. |
| `Months_List` | — | `[{month_id,month_name}]`. |
| `Get_mosalat_list` | pagination/فلتر legacy | `CorrespondenceRow[]`، وقد تتضمن إجابات. |
| `Add_mosala_response` | حقول الرد ومنها معرف المراسلة | `""`. |
| `Ntaqat_types` | — | `RangeTypeRow[]`. |
| `Get_emp_ntaq` | — | `EmployeeRangeRow` أو `null`. |
| `Talabat_types` | — | `RequestTypeRow[]`. |
| `Get_emp_ehsaeyat`, `Get_mangar_ehsaeyat` | — | `StatisticsRow[]`. |
| `Add_Talab` | حقول نوع/سبب الطلب legacy | `{order_id:"..."}`. |
| `Get_Talabat_List` | pagination/filters | `RequestRow[]`. |
| `Get_Talab_data` | معرف الطلب وfilters | `RequestRow[]` (تفصيل). |
| `Delete_Talab_order` | معرف الطلب | `""`. |
| `Add_Mobadra` | بيانات المبادرة | `{mobadra_id:"..."}`. |
| `Get_Mobadarat_List` | pagination | `InitiativeRow[]`. |
| `Delete_Mobadra` | `mobadra_id` | `""`. |
| `add_nashat` | `title`, `notes?`, `files?`؛ multipart مسموح | `{main_id:"..."}`. |
| `Get_Nashat_List` | pagination | `ActivityRow[]`. |
| `Delete_Nashat` | `main_id` | `""`. |

### الزيارات والتقارير والشفتات والساعات الإضافية وإعدادات الحساب

| `POST /Api/...` | حقول الطلب | `data` في الرد |
| --- | --- | --- |
| `Add_location_basma` | `lat`, `long` أو `lng`, `emp_img?`, `notes?`؛ multipart مسموح | `{zeyara_id:"..."}`. |
| `get_employee_visits` | pagination | `VisitRow[]`. |
| `Delete_zeyara` | معرف الزيارة | `""`. |
| `Report_hours_edafi` | `date_from`, `date_to`, pagination | `OvertimeRow[]`. |
| `report_tabdel_sheft` | `date_from`, `date_to`, pagination | `ShiftSwapRow[]`. |
| `Report_Basma` | `date_from`/`from_date`, `date_to`/`to_date`, pagination | تقرير الحضور paginated: `{data:[AttendanceRow],total,page,pageSize}`. |
| `Basma_Today` | pagination | تقرير حضور اليوم بنفس الشكل. |
| `sheft_types` | — | `[{id:"1",title:"تبديل شفت"},{id:"2",title:"إضافة شفت"}]`. |
| `dwam_types` | `page?`, `per_page?` | `{data:[ShiftRow],total,page,pageSize}`. |
| `add_sheft_edafi` | `ttype` أو `sheft_type_id`, `dwam_id_fk` أو `dwam_id`, `sheft_date` أو `date` | كائن إنشاء تبديل/إضافة شفت، ومنه `id`. |
| `add_hours_edafi` | `num_hours`, `edafa_date` أو `date` | كائن إنشاء ساعات إضافية، ومنه `id`. |
| `update_pass` | حقول كلمة المرور الحالية/الجديدة legacy | ملف/هوية الحساب بعد التحديث. |
| `update_pass_past` | حقول كلمة المرور السابقة/الجديدة legacy | ملف/هوية الحساب بعد التحديث. |
| `update_profile_image` | multipart/`m_image` | ملف/هوية الحساب بعد التحديث. |
| `Add_signature` | multipart/`m_image` | ملف/هوية الحساب بعد التحديث. |

## مسار اعتماد الإجازة والإذن: ما الذي ينفذه الـ Backend الآن؟

الحديث والقديم يستدعيان الآن نفس خدمتي `LeavesService` و`PermissionsService`، وبالتالي تسلسل الموافقة في الكود الحالي هو نفسه في الإنشاء والإجراء:

```text
الموظف ينشئ الطلب
  suspend=0, actions_sends=send_to_direct_manager
       ↓ المدير المباشر يقبل
  suspend=1, actions_sends=approve_direct_manager
       ↓ مستلم role code 32/36/42 يقبل
  suspend=4, actions_sends=approve_moder_edara
       ↓ مسؤول الموارد البشرية (role code 44) يقبل
  suspend=4, actions_sends=approve_hr
       ↓ المدير العام (role code 25) يقبل
  suspend=4, actions_sends=close_talab، والطلب يعود لصاحبه
```

الرفض من المدير المباشر يجعل `suspend=2`؛ الرفض في أي مرحلة لاحقة يجعل `suspend=5`. توجد نقطة مهمة: التسميات في الواجهة السابقة تقول «مدير فرع»، لكن الكود يختار فعليًا عناوين وظيفية 32/36/42 بحسب نوع/إدارة الموظف، وليس role عام ثابت باسم مدير الفرع.

واجهة `/api/mobile` تحتوي للمستخدم العادي على إنشاء/قائمة الصادر فقط؛ **لا تحتوي** على قائمة إجازات/أذونات واردة أو endpoint عمل اعتماد لها. المدير في تطبيق Flutter لا يزال يحتاج `POST /Api/Egraa_agaza` و`POST /Api/Egraa_ezn` (مع `Get_*_List` و`status=wared`) ما لم تنتقل الشاشة إلى واجهات الإدارة المقيّدة بالصلاحيات.

## تعارضات ومخاطر يمكن أن تفسر مشكلة Flutter

| الأولوية | الدليل في الكود الحالي | أثر Flutter | القرار/الإجراء المطلوب |
| --- | --- | --- | --- |
| **P0** | ملف تغطية Flutter الحالي يفوّت `GET /api/mobile/leaves/types` و`GET /api/mobile/permissions/available`، كما أن script يجمع المسارات في `Set` حسب **path فقط** فيفقد فرق `GET/POST/DELETE` للمسار نفسه. | شاشة تقديم الإجازة أو رصيد الإذن قد تعتمد على endpoint غير موثق أو مفقود من الاختبارات، مع تقرير تغطية مضلل. | أضف العمليتين إلى client/collection، وعدّل مدقق التغطية ليستخدم `METHOD + path`. لا تعتبر تقرير «0 missing» الحالي دليلًا. |
| **P0** | `leaves.action` و`permissions.action` بعد الرفض يتركان `actions_sends` عند المرحلة نفسها، و`canAction`/التحقق من action لا يفحصان `suspend in [2,5]`. | يمكن نظريًا أن يظهر الطلب المرفوض لصاحبه ثم ينفذ إجراء اعتماد آخر بدل أن يغلق. هذا خلل workflow/صلاحية لا يحل في Flutter وحده. | أصلح الـ Backend: ارفض action إن كان `suspend` مرفوضًا/ملغى، أو غيّر `actions_sends` إلى `close_talab` عند الرفض. أخفِ زر الإجراء في Flutter عندما `status=rejected` كحماية إضافية فقط. |
| **P1** | `Get_Ezn_List` و`Get_Wared_Ezn_List` يستدعيان نفس handler؛ لا يتغير `mode` إلا إذا أرسل العميل `status=wared`. | شاشة «الوارد» قد تعرض طلبات الموظف الصادرة رغم أن اسم endpoint يوحي بالعكس. | عند استعمال القديم أرسل دائمًا `status=wared`، أو صحح alias في الـ Backend. |
| **P1** | `/Api/Add_Agaza` يخزن الملف المرفوع في `input.hospital_report` ثم يبني DTO من `f_file` أو `hospitalReport` فقط. | تقرير طبي مرفوع multipart قد يختفي من طلب الإجازة. والـ modern create لا يملك `hospitalReport` أصلًا. | أصلح ربط الحقل في الـ Backend، واحتفظ بالمسار الناتج. لا تقدّم Flutter إجازة مرضية بمستند حتى يختبر السيناريو end-to-end. |
| **P1** | `/api/mobile/permissions/available` يمرر `user.emp_code` إلى خدمة تجمع بواسطة `emp_id_fk`، بينما أجزاء أخرى تفرق بين employee ID وbusiness employee code. | قد يعرض رصيد إذن لموظف آخر أو صفرًا إذا لم يتساوَ الكود والمعرّف. | اختبر بحساب قيمتا `employees.id` و`employees.emp_code` فيه مختلفتان؛ صحح الاستدعاء إلى employee ID إن تأكد الاختلاف. |
| **P1** | القديم: غلاف L وقد يرجع خطأ منطقي HTTP 200. الحديث: JSON خام وأخطاء HTTP صريحة. | parser موحد يقرأ `data` من الرد الحديث أو يتوقع `statusCode` في القديم سيعطي null/نتائج متعارضة. | افصل `LegacyApiClient` و`MobileApiClient` أو طبقة adapter إجبارية؛ لا تمرر raw JSON للشاشات. |
| **P1** | كلا login مكشوفان: `/Api/login_app` يعيد snake_case وغلافًا، و`/api/mobile/login` يعيد camelCase خامًا. | خلط token keys يؤدي إلى session غير محفوظ أو logout خاطئ. | اجعل login الحديث فقط هو المصدر في Flutter: `accessToken`, `refreshToken`. لا تستدعِ `login_app` إلا لدعم نسخة قديمة مؤقتًا. |
| **P1** | `@All(':action')` يجعل typo في اسم action يمر إلى wrapper كخطأ أعمال (غالبًا status 400 داخل HTTP 200) بدل 404. | retry/error interceptor قد يعامل typo كنجاح أو يحجب سبب المشكلة. | client allow-list ثابت من هذا الملف، واعتبر `body.status != 200` خطأ صريحًا في legacy. |
| **P2** | لا توجد endpoints حديثة واردة/اعتماد للإجازة والإذن؛ فقط legacy `Egraa_*`. | حساب مدير يستخدم أجزاء حديثة وأجزاء قديمة، فيظهر اختلاف data model أو يفقد شاشة الطلبات الواردة. | اعتبر اعتماد الإجازة/الإذن legacy-only حتى تضاف endpoints mobile حديثة كاملة. |
| **P2** | تفاصيل circular/warning الحديثة كائن، بينما القديمة `[row]`. الرسائل الحديثة نفسها تعيد array لأن الخدمة compatibility. | أخطاء `first`/`map` وواجهات فارغة عند تبديل endpoint. | اجعل normalizer لكل مورد، لا قاعدة عامة تقول إن detail كائن أو array. |
| **P2** | `Add_Agaza`/`Add_Agazax` مكرران، وأربعة أسماء حضور تستدعي pipeline واحدة، ومسارات Legacy تقبل كل HTTP methods. | إرسالين متوازيين من retry أو migration يمكن أن ينشئا طلبين/بصمتين. | اختر aliasًا واحدًا إن اضطررت للقديم (`Add_Agaza`, `attendance`) وانتقل للحديث حيث متاح؛ امنع double tap في UI. |
| **P2** | الحديث يعتمد `perPage` في قوائم عامة، و`pageSize` في قوائم الإذن؛ القديم يستخدم غالبًا `per_page`. | pagination لا تعمل أو تتكرر الصفحة الأولى عندما يرسل client اسمًا غير صحيح. | أنشئ DTO لكل endpoint، لا pagination model عالميًا. |
| **P2** | الحديث يجلب الإجازات والطلبات بحد 50 دون `total` أو pagination، بينما القديم يعيد قوائم مختلفة/محدودة. | اختلاف عدد الصفوف بين شاشتي القديم والحديث ليس بالضرورة تلف بيانات. | لا تستخدم القائمة الحديثة كتقرير تاريخ كامل؛ استخدم endpoint مناسبًا أو أضف pagination في الـ Backend. |

## قواعد انتقال عملية لـ Flutter

| المجال | المسار canonical الآن | ملاحظة |
| --- | --- | --- |
| Login/profile/token/notifications | `/api/mobile/login`, `/profile`, `/device-token`, `/notifications` | حديث فقط. |
| طلب إجازة/إذن للموظف | `/api/mobile/leaves`, `/api/mobile/permissions` | استخدم lookup types وavailable أولًا بعد معالجة P0/P1. |
| اعتماد إجازة/إذن وارد للمدير | `/Api/Get_agaza_List` أو `Get_Ezn_List` مع `status=wared` ثم `Egraa_*` | legacy-only حاليًا؛ طبّق L adapter. |
| حضور/انصراف | `/api/mobile/attendance/punch` | ارفع الصورة إلى `uploads/app` أولًا إذا وجدت. |
| مهام/تعليمات/إنذارات | `/api/mobile/tasks`, `/circulars`, `/warnings` | انتبه إلى detail object في circular/warning. |
| أنشطة ورسائل | modern endpoints مع upload المسبق | الردود في هذه المجموعة لا تزال legacy-shaped جزئيًا؛ طبّق normalizer. |
| شفتات/ساعات إضافية/تقارير | `/Api/sheft_types`, `dwam_types`, `add_sheft_edafi`, `add_hours_edafi`, `Report_*` | لا يوجد مكافئ `/api/mobile` حاليًا. |

## اختبار قبول قبل إصدار APK

1. سجّل دخولًا حديثًا فقط، ثم تحقق من Bearer token في profile وdevice-token.
2. نفّذ upload حقيقي لكل فئة ثم استعمل `path` — لا `url` — في activity/message/photo.
3. أنشئ إجازة وإذن بحساب موظف، وتحقق من `suspend=0` ووجهة المدير المباشر.
4. مرّر طلبًا عبر المراحل الأربع، ثم نفّذ رفضًا مستقلًا في كل مرحلة، وتحقق أنه لا يمكن لأي مستخدم إجراء action بعد الرفض.
5. بحساب مدير، استدعِ القوائم القديمة مع `status=wared` ثم `Egraa_agaza` و`Egraa_ezn`.
6. اختبر employee whose `id != emp_code` لطلب `permissions/available`.
7. اختبر 400/401/403/404 لكل من client الحديث والقديم؛ يجب أن تكون رسالة الخطأ موحدة داخل طبقة التطبيق لا في كل Widget.
8. شغّل فحص collection بعد إضافة المسارين المفقودين، مع مقارنة `HTTP method + path` لا path وحده.

## ملفات الأدلة الرئيسية

- `backend/src/modules/mobile/mobile.controller.ts` — 41 عملية حديثة.
- `backend/src/modules/mobile/legacy-mobile.controller.ts` — 92 alias قديم وتغليف L.
- `backend/src/modules/mobile/mobile.service.ts` و`legacy-mobile-compat.service.ts` — أشكال الردود الفعلية.
- `backend/src/modules/leaves/leaves.service.ts` و`backend/src/modules/permissions/permissions.service.ts` — الاعتماد، القوائم، وحالة `suspend`.
- `backend/src/modules/leaves/approval-chain.util.ts` — مراحل اعتماد الإجازة والأكواد الوظيفية.
- `backend/src/modules/uploads/uploads.controller.ts` و`uploads.service.ts` — عقد رفع الملفات.
- `backend/src/common/filters/all-exceptions.filter.ts` — عقد الخطأ الحديث.
