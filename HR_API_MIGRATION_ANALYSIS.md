# تقرير مقارنة APIs الموارد البشرية القديمة والجديدة

> النطاق فقط: الأذونات، الإجازات، الحضور والانصراف، تبديل/إضافة الشفتات، الساعات الإضافية، الإنذارات، والتعاميم.
>
> استُبعدت بقية وظائف controllers/Api.php، وكذلك الدوال المنتهية بـ old أو _ والدوال المعلّقة داخل التعليقات، وفق توجيه صاحبة المشروع.

## 1. Executive Summary

النظام القديم CodeIgniter/PHP، والـAPI محل التحليل في:

D:\asmaa\noamany_old\application\controllers\Api.php

النظام الجديد NestJS/TypeScript مع Prisma، ويقدم:

1. APIs حديثة تحت /api، محمية بـJWT وصلاحيات RBAC ونطاق الفروع.
2. طبقة توافق تحت /Api تحتفظ بأسماء الدوال القديمة وشكل الرد القديم لتشغيل تطبيق الموبايل.

| المجال | الحالة العامة | النتيجة |
|---|---|---|
| الأذونات | DIFFERENT_BUSINESS_LOGIC | المسارات موجودة، لكن السياسة تغيرت من إذنين شهريًا إلى 30 طلبًا مع حد 120 دقيقة شهريًا و120 دقيقة للطلب. |
| الإجازات | PARTIALLY_MATCHED | الوظائف موجودة، لكن توجد فروق في شرط الطلب المعلق وحالة الموظف، والحذف أصبح إلغاءً منطقيًا. |
| الحضور والانصراف | MATCHED | البصمة والتقارير موجودة بمنطق أقوى؛ هوية الموظف والاتجاه يحددهما الخادم. |
| تبديل/إضافة الشفتات | PARTIALLY_MATCHED | الـAPI الحديث يدعم الموظف الهدف، لكن مسار التوافق يتجاهل phone_num ويسجل للموظف الحالي. |
| الساعات الإضافية | PARTIALLY_MATCHED | نفس فجوة الموظف الهدف، مع فرق في بيانات الناشر. |
| الإنذارات | MATCHED | القراءة والتفاصيل والمشاهدة موجودة، والجديد يضيف الإدارة والقوالب والمرفقات. |
| التعاميم | MATCHED | القراءة والتفاصيل والمشاهدة موجودة، والجديد يضيف الإدارة والمستلمين والمرفقات. |

لا يوجد مجال كامل MISSING ضمن النطاق، لكن توجد فروق قواعد عمل وعقود توافق يجب حسمها قبل إيقاف /Api.

## 2. حدود التحليل ومنهجيته

المصادر الفعلية:

- القديم: Api.php وما يستدعيه من Models واستعلامات.
- الجديد: Controllers وServices وDTOs في backend/src/modules.
- قاعدة الجديد: backend/prisma/schema.prisma.
- التوافق: legacy-mobile.controller.ts وlegacy-mobile-compat.service.ts.

ملاحظات:

- القديم لا يفرض HTTP method في Controller. أغلب الوظائف تقرأ POST؛ لذلك POST هو الاستخدام الفعلي، مع عدم وجود قيد method صريح.
- مسارات التوافق الجديدة تستخدم @All وتجمع body وquery، لكنها محمية بـJWT.
- لم يُعثر داخل application على DDL قديم كامل موثوق. لذلك قيود وأنواع قاعدة القديم غير المثبتة مذكورة كـNOT FOUND.
- لم يُعدّل أي Controller أو Service أو Schema؛ هذا الملف تقرير فقط.

## 3. Old PHP API Inventory

المسار المعتاد قديمًا: Api/{function}.

### 3.1 الأذونات

| API القديم | الهدف | المدخلات الرئيسية | الجداول | القواعد |
|---|---|---|---|---|
| Ozonat_types | أنواع الأذونات | لا شيء جوهري | hr_ozonat_types | يعيد الأنواع المتاحة. |
| Add_Ezn | إنشاء إذن | emp_id, ezn_type_id, from_time, to_time, reason | hr_all_ozonat_orders، employees/users، history | يمنع halet_emp == 2، ووجود طلب معلق، وأكثر من إذنين في الشهر؛ ثم يرسل للمدير وإشعار 102. |
| Edit_Ezn | تعديل إذن | ezn_id, ezn_type_id, from_time, to_time, reason | hr_all_ozonat_orders | يعدل الطلب؛ validation القديم يشير أيضًا إلى emp_id بصورة غير متسقة. |
| Get_Ezn_List | الصادر | emp_id, page, per_page, status | orders/history | Pagination وفلترة الحالة. |
| Get_Wared_Ezn_List | الوارد | emp_id, page, per_page, status | orders/history | طلبات المستخدم ضمن دورة الاعتماد. |
| Get_Ezn_data | التفاصيل | ezn_id | orders/history | الطلب وحركاته. |
| Delete_ezn | الحذف | ezn_id | hr_all_ozonat_orders | حذف وفق وجود الطلب وحالته. |
| Egraa_ezn | قبول/رفض/تحويل | action_option, ezn_id, from_emp_id, reason | orders/history/users/notifications | Workflow متعدد المراحل مع تاريخ وإشعار. |

### 3.2 الإجازات

| API القديم | الهدف | المدخلات الرئيسية | الجداول | القواعد |
|---|---|---|---|---|
| Agazat_types | الأنواع والأرصدة | هوية الموظف عند الحاجة | holiday_setting | الأنواع والمتاح. |
| Add_Agaza | إنشاء إجازة | emp_id, no3_agaza_id, from_date, to_date, reason، ملف | hr_all_agzat_orders، balances/history | يمنع غير النشط والطلب المعلق، يفحص الرصيد، ويطلب إثباتًا طبيًا لأنواع محددة. |
| Add_Agazax | إنشاء بديل | نفس المدخلات تقريبًا | نفس الجداول | الطلب المعلق والإثبات الطبي؛ فحص الرصيد ليس مطابقًا تمامًا لـAdd_Agaza. |
| Edit_Agaza | تعديل | agaza_id، النوع والتواريخ والسبب وبيانات المرض | hr_all_agzat_orders | تعديل الطلب القائم. |
| Get_agaza_List | القائمة | emp_id, page, per_page, status | orders/history | Pagination وفلترة. |
| Get_Agaza_data | التفاصيل | agaza_id | orders/history/attachments | تفاصيل الطلب. |
| Delete_agaza | حذف | agaza_id | hr_all_agzat_orders | DELETE فعلي للسجل بعد التحقق من وجوده. |
| Egraa_agaza | إجراء اعتماد | action_option, agaza_id, from_emp_id, reason | orders/history/users/notifications | مسار متعدد الأطراف قد يشمل البديل والمدير والموارد البشرية. |

### 3.3 الحضور والانصراف

| API القديم | الهدف | المدخلات | الجداول/المنطق |
|---|---|---|---|
| attendance | بصمة - جيل أول | emp_id_fk, lat, long, type | always_setting, socity_branch, tbl_hr_staff_attendances وتاريخه؛ GPS ونوافذ وقت. |
| attendance_new | تطوير للجيل الأول | نفس المدخلات تقريبًا | نفس عائلة الجداول القديمة. |
| add_hdor_ensraf | بصمة بالكود والموقع | emp_code, lat, long | employees, tbl_sites ثم جداول الحضور. |
| add_hdor_ensraf_asly | مسار بديل للبصمة | emp_code والإحداثيات | جداول الحضور. |
| Basma_Today | بصمات اليوم | هوية الموظف | جداول الحضور. |
| Report_Basma | تقرير فترة | emp_id_fk, from_date, to_date, page, per_page | تقرير بصمة مع Pagination. |

### 3.4 تبديل/إضافة الشفتات

| API القديم | الهدف | المدخلات | القواعد |
|---|---|---|---|
| sheft_types | الأنواع | لا شيء | 1 تبديل شفت، 2 إضافة شفت. |
| dwam_types | الدوامات | Pagination عند الحاجة | يعيد الشفتات. |
| add_sheft_edafi | إنشاء تبديل/إضافة | publisher_emp_id, phone_num, ttype, dwam_id_fk, sheft_date | الموظف الهدف بالهاتف؛ user_level 2 ممنوع؛ منع تكرار الموظف/التاريخ/النوع؛ الفرع emp_sign إن كان رقميًا وإلا branch_id_fk. |
| report_tabdel_sheft | التقرير | emp_id_fk, page, per_page | tbl_emps_shef_edafi. |

### 3.5 الساعات الإضافية

| API القديم | الهدف | المدخلات | القواعد |
|---|---|---|---|
| add_hours_edafi | تسجيل ساعات | from_emp_id, emp_phone, num_hours, edafa_date | الموظف الهدف بالهاتف؛ user_level 2 ممنوع؛ منع تكرار الموظف والتاريخ؛ tbl_emps_hours_edafi. |
| Report_hours_edafi | التقرير | emp_id_fk, page, per_page | تقرير موظف مع Pagination. |

### 3.6 الإنذارات

| API القديم | الهدف | المدخلات | الجدول |
|---|---|---|---|
| Get_Enzarat_list | القائمة | emp_id, page, per_page | hr_enzarat |
| Get_enzar_data | التفاصيل | emp_id, enzar_id_fk | hr_enzarat |
| SeenEnzar | تعليم كمقروء | emp_id, enzar_id_fk | hr_enzarat |

القديم يتحقق أن الإنذار للموظف وأنه غير مقروء قبل التحديث.

### 3.7 التعاميم

| API القديم | الهدف | المدخلات | الجداول |
|---|---|---|---|
| Get_ta3mem_list | القائمة | emp_id, page, per_page | hr_ta3mem, hr_ta3mem_details |
| Get_ta3mem_data | التفاصيل | emp_id, ta3mem_id_fk | نفس الجداول |
| SeenTa3mem | تعليم كمقروء | emp_id, ta3mem_id_fk | hr_ta3mem_details |

## 4. New Node.js API Inventory

### 4.1 طبقة /Api المتوافقة

المسارات التالية موجودة بأسماء القديم:

- الإجازات: Agazat_types، Get_agaza_List، Get_Agaza_data، Add_Agaza، Add_Agazax، Edit_Agaza، Delete_agaza، Egraa_agaza.
- الأذونات: Ozonat_types، Add_Ezn، Get_Ezn_List، Get_Wared_Ezn_List، Get_Ezn_data، Edit_Ezn، Delete_ezn، Egraa_ezn.
- الحضور: attendance، attendance_new، add_hdor_ensraf، add_hdor_ensraf_asly، Basma_Today، Report_Basma.
- الشفتات: sheft_types، dwam_types، add_sheft_edafi، report_tabdel_sheft.
- الساعات: add_hours_edafi، Report_hours_edafi.
- الإنذارات: Get_Enzarat_list، Get_enzar_data، SeenEnzar.
- التعاميم: Get_ta3mem_list، Get_ta3mem_data، SeenTa3mem.

تحتفظ الطبقة بـstatus/message/data، لكنها تستخرج الموظف من JWT ولا تثق في emp_id المرسل.

### 4.2 APIs الحديثة

#### الإجازات — /api/leaves

- GET /api/leaves
- POST /api/leaves
- GET وPOST وPATCH وDELETE لأنواع الإجازات
- GET /balances وGET /available وPOST /carry-over
- POST /:id/approve و/reject و/cancel

CreateLeaveDto يدعم النوع والتواريخ والسبب والموظف المصرح به والبديل والبيانات والتقارير الطبية.

#### الأذونات — /api/permissions

- GET /api/permissions
- GET /api/permissions/available
- POST /api/permissions
- POST /:id/action و/approve و/reject

CreatePermissionDto: no3Ezn من 1 أو 2، eznDate، fromHour، toHour، reason، واختياريًا empId وfatraFk.

#### الحضور والشفتات والساعات — /api/attendance

- rules وsettings للعرض والتعديل.
- shifts للعرض والإنشاء والحذف.
- shift-swaps للعرض والإنشاء والحذف.
- extra-hours للعرض والإنشاء والحذف.
- تقارير basma وfull-sheet وlate وabsence وovertime وshift-swap.
- check للبصمة اليدوية الإدارية.
- manual-options، استيراد ملف جهاز، إدارة الأجهزة والمزامنة، ولوحة الحضور.
- بصمة الموظف عبر Mobile API و/Api.

CreateShiftSwapDto: empId, ttype, dwamIdFk, sheftDate.

CreateExtraHoursDto: empId, numHours بحد أدنى 1، edafaDate.

#### الإنذارات — /api/hr/warnings

القائمة والتفاصيل والأنواع، CRUD للقوالب، إنشاء وتعديل وحذف، send-hr وsend-emp، مرفقات وتاريخ.

#### التعاميم — /api/hr/circulars

القائمة والتفاصيل ومستلمو الإدارات، إنشاء وتعديل وحذف، seen، إرسال للجميع أو الإدارات أو موظفين محددين، ومرفقات.

## 5. API Mapping Matrix

### 5.1 الأذونات

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| Ozonat_types | /Api/Ozonat_types | MATCHED | النوعان متاحان. |
| Add_Ezn | /Api/Add_Ezn، POST /api/permissions | DIFFERENT_BUSINESS_LOGIC | الإنشاء والـworkflow موجودان، لكن حدود الشهر وقواعد المعلق/النشط مختلفة؛ يلزم قرار HR. |
| Edit_Ezn | /Api/Edit_Ezn | MATCHED | موجود في التوافق فقط؛ يلزم native edit فقط عند إزالة /Api. |
| Get_Ezn_List | /Api/Get_Ezn_List، GET /api/permissions | MATCHED | قائمة وPagination. |
| Get_Wared_Ezn_List | /Api/Get_Wared_Ezn_List | MATCHED | الوارد حسب المستخدم والـworkflow. |
| Get_Ezn_data | /Api/Get_Ezn_data | MATCHED | التفاصيل في التوافق؛ لا native GET /:id مستقل. |
| Delete_ezn | /Api/Delete_ezn | MATCHED | حذف مقيّد بملكية الموظف وحالة الطلب. |
| Egraa_ezn | /Api/Egraa_ezn، native action/approve/reject | MATCHED | الإجراء والتاريخ والإشعارات. |

### 5.2 الإجازات

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| Agazat_types | /Api/Agazat_types، GET /api/leaves/types | MATCHED | الأنواع مع إدارة أوسع. |
| Add_Agaza | /Api/Add_Agaza، POST /api/leaves | PARTIALLY_MATCHED | الرصيد والمرض والتداخل والـworkflow موجودة؛ شرط المعلق/غير النشط يحتاج قرارًا. |
| Add_Agazax | /Api/Add_Agazax، POST /api/leaves | PARTIALLY_MATCHED | الاسمان يوجهان لمنطق موحد؛ يلزم اختبار فرق الرصيد القديم. |
| Edit_Agaza | /Api/Edit_Agaza | MATCHED | تعديل الطلب المملوك قبل تقدمه؛ لا native edit. |
| Get_agaza_List | /Api/Get_agaza_List، GET /api/leaves | MATCHED | قائمة وفلترة وPagination. |
| Get_Agaza_data | /Api/Get_Agaza_data | MATCHED | تفاصيل محمية بالملكية؛ لا native detail مستقل. |
| Delete_agaza | /Api/Delete_agaza، POST /api/leaves/:id/cancel | DIFFERENT_BUSINESS_LOGIC | القديم hard delete؛ الجديد soft cancel مع history. |
| Egraa_agaza | /Api/Egraa_agaza، native approve/reject | MATCHED | workflow والتاريخ والإشعارات. |

### 5.3 الحضور والانصراف

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| attendance | /Api/attendance → mobilePunch | DIFFERENT_BUSINESS_LOGIC | الوظيفة متحققة؛ هوية/اتجاه العميل والجداول القديمة استبدلت بهوية موثقة وpipeline موحد. |
| attendance_new | /Api/attendance_new → mobilePunch | DIFFERENT_BUSINESS_LOGIC | نفس الدمج؛ يلزم Contract tests. |
| add_hdor_ensraf | /Api/add_hdor_ensraf → mobilePunch | MATCHED | بصمة موقع بتحقق أقوى. |
| add_hdor_ensraf_asly | /Api/add_hdor_ensraf_asly → mobilePunch | MATCHED | الاسم مدعوم ويستخدم نفس الخدمة. |
| Basma_Today | /Api/Basma_Today، تقرير basma | MATCHED | الموظف الحالي وتاريخ اليوم. |
| Report_Basma | /Api/Report_Basma، GET reports/basma | MATCHED | الفترة وPagination. |

الجديد يضيف JWT employee identity، geofence، قنوات التسجيل، emp_sign=all، قفلًا داخل العملية وقفل MySQL، transaction، منع تكرار 45 ثانية، شفتات متعددة وليلية وبديلة/إضافية، والتحقق من الإذن المعتمد.

### 5.4 تبديل/إضافة الشفتات

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| sheft_types | /Api/sheft_types | MATCHED | نفس القيم 1 و2. |
| dwam_types | /Api/dwam_types، GET /api/attendance/shifts | MATCHED | الدوامات موجودة. |
| add_sheft_edafi | /Api/add_sheft_edafi، POST /api/attendance/shift-swaps | PARTIALLY_MATCHED | native يدعم empId؛ alias يتجاهل phone_num ويسجل لصاحب JWT. |
| report_tabdel_sheft | /Api/report_tabdel_sheft، GET reports/shift-swap | MATCHED | تقرير ذاتي في التوافق وفلاتر إدارية في native. |

فروق البيانات:

- الجديد يكتب publisher=userId لكنه يضع publisher_emp_id=0.
- الجديد يستخدم branch_id_fk؛ القديم يفضل emp_sign الرقمي.
- منع التكرار وفحص وجود الشفت موجودان.

### 5.5 الساعات الإضافية

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| add_hours_edafi | /Api/add_hours_edafi، POST /api/attendance/extra-hours | PARTIALLY_MATCHED | native يدعم empId ويمنع التكرار؛ alias يتجاهل emp_phone ويسجل لصاحب JWT. |
| Report_hours_edafi | /Api/Report_hours_edafi، GET reports/overtime | MATCHED | تقرير ذاتي وفلاتر إدارية. |

الجديد يفرض attendance:create على المسار الإداري وحدًا أدنى للساعات، لكنه يضع publisher_emp_id=0.

### 5.6 الإنذارات

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| Get_Enzarat_list | /Api/Get_Enzarat_list، GET /api/hr/warnings | MATCHED | قائمة الموظف وPagination. |
| Get_enzar_data | /Api/Get_enzar_data، GET /api/hr/warnings/:id | MATCHED | التفاصيل والمرفقات؛ التوافق يمنع غير المستلم. |
| SeenEnzar | /Api/SeenEnzar | MATCHED | seen وseen_date وseen_time بعد فحص المستلم. |

الجديد أوسع: إنشاء وتعديل وحذف وأنواع وقوالب ومرفقات وتاريخ وإرسال للموارد البشرية ثم الموظف.

### 5.7 التعاميم

| Old PHP API | New Node API | Status | Coverage / Action |
|---|---|---|---|
| Get_ta3mem_list | /Api/Get_ta3mem_list، GET /api/hr/circulars | MATCHED | التوافق يعرض المنشور والموجه للموظف. |
| Get_ta3mem_data | /Api/Get_ta3mem_data، GET /api/hr/circulars/:id | MATCHED | تفاصيل ومرفقات مع فحص المستلم في التوافق. |
| SeenTa3mem | /Api/SeenTa3mem، PATCH /api/hr/circulars/:id/seen | MATCHED | تحديث المشاهدة وتاريخها ووقتها. |

قائمة الموبايل تقصر النتائج على send_all_t3mem=1 مع سجل مستلم للموظف في hr_ta3mem_details. التفاصيل والمشاهدة ترفضان أي تعميم غير موجه إليه.

## 6. Missing APIs

MISSING: NONE ضمن المجالات السبعة.

لكن بعض التفاصيل/التعديلات متاحة في /Api فقط، وبعض الوظائف موجودة بقواعد مختلفة؛ لذلك لا يعني ذلك تطابقًا كاملًا.

## 7. Partial APIs and Gaps

### 7.1 سياسة الأذونات

القديم:

- حد أقصى إذنان شهريًا.
- يمنع وجود طلب إذن معلق.
- يمنع halet_emp == 2.
- لا يظهر حد 120 دقيقة في Add_Ezn.

الجديد:

- MONTHLY_COUNT_CEILING = 30.
- MONTHLY_MINUTES_CEILING = 120.
- حد العملية الافتراضي 120 دقيقة.
- لا يظهر شرط مطابق لطلب معلق واحد أو halet_emp == 2 في الإنشاء.

هذا اختلاف سياسة HR جوهري، وليس اختلاف تسمية.

### 7.2 إنشاء الإجازة

الجديد يتحقق من التواريخ والحد الأدنى/الأقصى والتداخل مع إجازة معتمدة وبعض الأرصدة والبيانات الطبية. لكن شرطي الموظف غير النشط والطلب المعلق لا يظهران بنفس قاعدة القديم.

### 7.3 حذف/إلغاء الإجازة

- القديم يحذف من hr_all_agzat_orders.
- الجديد يضبط suspend=CANCELLED، وsuspend_date وreason_action=cancel، ويسجل history.
- /Api يتحقق أولًا أن الطلب للموظف.
- LeavesService.cancel لا يظهر فحص ملكية داخليًا للمسار الحديث؛ يجب مراجعة صلاحية POST /api/leaves/:id/cancel.

### 7.4 الموظف الهدف في الشفت والساعات

القديم يسمح لناشر العملية باختيار موظف آخر بالهاتف. native API الجديد يدعم empId للمصرح له، لكن aliases القديمة تفرض الموظف الحالي. يلزم قرار: دعم إداري آمن أم تسجيل ذاتي فقط.

### 7.5 الفرع والناشر

إذا كان emp_sign ما زال يمثل فرع الحضور الفعلي فلا يكفي branch_id_fk دائمًا. كما أن publisher_emp_id=0 يفقد معلومة تدقيق قديمة.

## 8. Database Mapping

| Old Table | New Prisma Model/Table | Status | Differences |
|---|---|---|---|
| employees | employees | MATCHED | مصدر الموظف؛ علاقات كثيرة منطقية وليست Prisma relations. |
| users | users | MATCHED | المستخدم والناشر وJWT. |
| holiday_setting | holiday_setting | MATCHED | أنواع وضوابط الإجازات. |
| hr_all_agzat_orders | hr_all_agzat_orders | MATCHED | PK الحالي id autoincrement؛ أعمدة workflow والرصيد والمرض والبديل موجودة. |
| hr_all_agzat_history | hr_all_agzat_history | MATCHED | تاريخ الإجراءات. |
| hr_ozonat_types | hr_ozonat_types | MATCHED | أنواع الأذونات. |
| hr_all_ozonat_orders | hr_all_ozonat_orders | MATCHED | PK id؛ الوقت والإجمالي والموظف والمدير والحالة والـworkflow. |
| hr_all_ozonat_history | hr_all_ozonat_history | MATCHED | التاريخ؛ id ليس autoincrement في Prisma الحالي. |
| always_setting | hr_shift_templates/إعدادات الحضور | DIFFERENT_BUSINESS_LOGIC | لا يستخدمه pipeline الجديد مباشرة؛ migration scripts تربطه دلاليًا بقوالب الشفت. |
| socity_branch | tbl_branches + branch_settings | DIFFERENT_BUSINESS_LOGIC | geofence والإعدادات في بنية الفروع الجديدة. |
| tbl_hr_staff_attendances | tbl_hdoor_emps | DIFFERENT_BUSINESS_LOGIC | الجيل الأول استبدل بالسجل القياسي؛ PK hodoor_id وحضور/انصراف أول وثانٍ وموقع وصور وتأخير وشفت وفرع. |
| tbl_hr_staff_attendances_history | tbl_hdoor_emps_history | DIFFERENT_BUSINESS_LOGIC | سجل خام لكل بصمة. |
| tbl_hdodr_setting | tbl_hdodr_setting | MATCHED | نوافذ الحضور والانصراف؛ PK id. |
| tbl_hdoor_dawms_emps | tbl_hdoor_dawms_emps | MATCHED | ربط موظف/دوام/فرع. |
| tbl_hdoor_emps | tbl_hdoor_emps | MATCHED | جدول التشغيل مع indexes للموظف/التاريخ/الشفت والسجل المفتوح. |
| tbl_hdoor_emps_history | tbl_hdoor_emps_history | MATCHED | سجل التاريخ. |
| tbl_emps_shef_edafi | tbl_emps_shef_edafi | PARTIALLY_MATCHED | نفس الجدول؛ الفرق في الفرع وpublisher_emp_id. |
| tbl_emps_hours_edafi | tbl_emps_hours_edafi | PARTIALLY_MATCHED | نفس الجدول؛ فرق الموظف الهدف والناشر. |
| hr_enzarat | hr_enzarat | MATCHED | المستلم والمشاهدة ودورة الإرسال. |
| hr_enzarat_files | hr_enzarat_files | MATCHED | المرفقات. |
| hr_enzarat_history | hr_enzarat_history | MATCHED | تاريخ السير. |
| hr_ta3mem | hr_ta3mem | MATCHED | المحتوى والصورة والنشر العام. |
| hr_ta3mem_details | hr_ta3mem_details | MATCHED | المستلمون والمشاهدة. |
| hr_ta3mem_attaches | hr_ta3mem_attaches | MATCHED | المرفقات. |

قيود:

- أنواع وPKs الحالية موثقة في Prisma. DDL القديم الكامل: NOT FOUND.
- Prisma لا يعرّف @relation لمعظم النماذج legacy. علاقات emp_id_fk وemp_code_fk وpublisher وta3mem_id_fk مستخدمة منطقيًا؛ وجود FK فعلي: NOT FOUND.
- تواريخ وأوقات كثيرة VarChar وليست DateTime، ولذلك تعتمد سلامتها على DTO/Service validation.

## 9. Authentication Comparison

| العنصر | PHP القديم | Node.js الجديد |
|---|---|---|
| هوية الموظف | emp_id أو emp_code من body غالبًا | JWT ثم ربط المستخدم بالموظف |
| الحماية العامة | لا يظهر guard عام | Global JWT guard |
| الصلاحيات | user_level وفحوص متفرقة | RBAC وRequiresPermission |
| نطاق الفرع | من الاستعلام والموظف | Branch-scope guard وفلاتر |
| Validation | CodeIgniter وفحوص يدوية | DTO + ValidationPipe + Service |
| الأخطاء | status/message/data غالبًا | HTTP exceptions؛ /Api يعيد envelope القديم |
| وصول الموظف | يعتمد على فحص كل دالة | الموبايل يستخرج الهوية ويتحقق من الملكية/المستلم |
| وصول الإدارة | مستويات خاصة | Permissions واضحة وempId في المسارات الإدارية |

يجب نقل الوظيفة، لا أسلوب الثقة القديم. لا ينبغي اعتبار emp_id أو emp_code أو الهاتف دليل هوية. تنفيذ مسؤول لموظف آخر يجب أن يمر بمسار إداري وصلاحية واضحة.

## 10. Business Logic Differences

1. إذنان شهريًا قديمًا مقابل 30 طلبًا و120 دقيقة شهريًا/للطلب جديدًا.
2. منع طلب معلق وحالة الموظف موجودان صراحة قديمًا ولا يظهران بالمثل جديدًا.
3. حذف الإجازة فعلي قديمًا مقابل إلغاء مع audit history جديدًا.
4. هوية واتجاه البصمة من العميل قديمًا مقابل JWT واستنتاج تلقائي جديدًا.
5. الجديد يضيف locks وtransaction ومنع تكرار 45 ثانية للبصمة.
6. هاتف الموظف الهدف قديمًا مقابل JWT في aliases وempId في native.
7. emp_sign له أولوية فرع قديمًا مقابل branch_id_fk جديدًا.
8. publisher_emp_id محفوظ قديمًا ومساوٍ صفرًا في إنشاء الشفت/الساعات الجديد.
9. الإنذارات والتعاميم الجديدة أقوى في عزل المستلم والإدارة والمرفقات.

## 11. Recommended Implementation Plan

1. اعتماد سياسة الأذونات رسميًا.
2. حسم قواعد الموظف غير النشط وطلب واحد معلق.
3. حسم عقد الموظف الهدف في الشفتات والساعات.
4. تصحيح أو اعتماد branch_id_fk وpublisher_emp_id.
5. مراجعة صلاحيات إلغاء الإجازة واعتماد soft cancel.
6. إضافة اختبارات Contract/E2E لمسارات /Api.
7. بعد تحديث العملاء، وضع deprecation للأسماء القديمة المكررة.

## 12. IMPLEMENTATION BACKLOG

### TASK-001 — سياسة حدود الأذونات

Source: Api.php::Add_Ezn  
Target: PermissionsService  
Status: DIFFERENT_BUSINESS_LOGIC  
Required: قرار موثق حول 2 مقابل 30، و120 دقيقة، ثم توحيد create وavailable والرسائل.  
Priority: CRITICAL

### TASK-002 — الموظف النشط والطلب المعلق

Source: Add_Ezn, Add_Agaza, Add_Agazax  
Target: PermissionsService وLeavesService  
Status: PARTIALLY_MATCHED  
Required: تأكيد القاعدتين وإضافتهما بصورة transaction-safe إن كانتا مطلوبتين.  
Priority: HIGH

### TASK-003 — عقد تبديل/إضافة الشفت

Source: add_sheft_edafi  
Target: LegacyMobileController وAttendanceService  
Status: PARTIALLY_MATCHED  
Required: دعم موظف هدف بصلاحية آمنة، أو إعلان التسجيل الذاتي وتحديث العميل؛ لا يستخدم الهاتف كصلاحية.  
Priority: HIGH

### TASK-004 — عقد الساعات الإضافية

Source: add_hours_edafi  
Target: LegacyMobileController وAttendanceService  
Status: PARTIALLY_MATCHED  
Required: قرار الموظف الهدف واختبار duplicate للموظف والتاريخ.  
Priority: HIGH

### TASK-005 — الفرع والناشر

Source: add_sheft_edafi, add_hours_edafi  
Target: AttendanceService  
Status: PARTIALLY_MATCHED  
Required: توثيق emp_sign، اختيار الفرع الصحيح، وملء publisher_emp_id بهوية الناشر.  
Priority: HIGH

### TASK-006 — إلغاء الإجازة وصلاحياته

Source: Delete_agaza  
Target: POST /api/leaves/:id/cancel وLeavesService  
Status: DIFFERENT_BUSINESS_LOGIC  
Required: اعتماد soft cancel وإضافة فحص ملكية/دور/حالة داخل Service.  
Priority: HIGH

### TASK-007 — اختبارات التوافق

Source: جميع مسارات /Api في التقرير  
Target: Integration/E2E tests  
Status: PARTIALLY_MATCHED  
Required: المدخلات والرد القديم وPagination والملكية والـworkflow والمرفقات وGPS والشفت الليلي والتكرار والمشاهدة.  
Priority: HIGH

### TASK-008 — Native parity قبل إزالة /Api

Source: Edit/Get detail للأذونات والإجازات وSeenEnzar  
Target: Permissions/Leaves/Warnings controllers  
Status: PARTIALLY_MATCHED  
Required: فقط عند قرار حذف /Api؛ توفير native routes أو منع الوظيفة صراحة وتحديث الموبايل.  
Priority: MEDIUM

## 13. الخلاصة التنفيذية

النظام الجديد يغطي المجالات السبعة ويقدم حماية وحضورًا أقوى. المانع الأساسي أمام إعلان التطابق هو سياسة الأذونات، ثم الموظف الهدف والفرع والناشر في الشفتات والساعات، ثم سياسة وصلاحية إلغاء الإجازة. بعد حسمها واختبار العقود يمكن الانتقال تدريجيًا من /Api إلى الـAPIs الحديثة.
