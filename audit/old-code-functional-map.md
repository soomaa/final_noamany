# خريطة الوظائف المؤكدة من كود النظام القديم

المصدر: `E:\final_projects\asmaa\23-8-2026\php_noamany_old\application` (CodeIgniter). هذه الخريطة تكمل تدقيق الواجهة ولا تستنتج سلوك النظام الجديد من الكود، لأن كوده غير متاح.

| الصفحة/المسار | Controller method | الوظيفة المؤكدة في الكود | أثر المقارنة |
| --- | --- | --- | --- |
| `/Members` | `Members::get_ajax_member` | يعرض تعديل العضو، حذف العضو، إضافة مرفقات، تفاصيل، ومستندات العضوية | القديم أوسع من مجرد القائمة التي ظهرت في الفحص الأول |
| `/Members/add_member` | `Members::add_member`, `get_code`, `code_check_app` | إنشاء عضو، توليد كود عضوية، وفحص كود/حساب التطبيق | يقابل إنشاء العضو الجديد؛ اختلاف التنفيذ يحتاج مقارنة كود الجديد |
| `/Members/edit_member/{id}` | `Members::edit_member`, `edit_member_data` | تعديل بيانات وصورة العضو | الجديد يثبت تعديلًا من الواجهة |
| `/Members/member_details/{id}/{code}` | `Members::member_details` | صفحة تفاصيل عضو مستقلة | لم تظهر تفاصيل مستقلة في الجديد |
| `/Members/add_images/{id}` | `add_images`, `save_member_files`, `delete_images` | مرفقات متعددة للعضو، رفع وحذف ملفات/صور | الجديد يثبت صورة واحدة؛ المرفقات المتعددة غير مثبتة |
| مستندات العضوية | `print_membership_bundle`, `upload_membership_file`, `upload_membership_file_form` | طباعة نموذج العضوية ورفع PDF موقّع حتى 5MB | ناقص/غير مثبت في الجديد |
| `/Members/add_block` | `add_block`, `save_block`, `delete_member_block` | حظر عضو وإزالة الحظر | الجديد يعرض تبويب المحظورين فقط؛ Workflow غير مثبت |
| قياسات الأعضاء | `add_inbody`, `edit_inbody`, `delete_inbody`, `all_inbody` | CRUD لقياسات InBody وإيصالاتها | الجديد يثبت فواتير InBody، لا CRUD للقياسات ضمن الصفحات المفحوصة |
| `/Subscription/*` | `edit_subscription`, `delete_subs_member`, `print_receipt` | تعديل وحذف اشتراك وطباعة إيصال | في الجديد لم تفتح قائمة إجراءات الاشتراك؛ يلزم تحقق إضافي قبل الحكم بالنقص |
| تجميد الاشتراك | `stop_subscription`, `process_stoped`, `delete_stoped_subs_member` | إيقاف اشتراك، معالجة/تعديل الوقف، وحذف سجل الوقف | الجديد يثبت قائمة موقوفة فقط، لا تفاصيل الإجراءات |
| الاشتراكات البرايفت | `addSpecialSubscription`, `allSpecialSubscription` | إنشاء وقائمة البرايفت | يقابل إدارة الاشتراكات الخاصة الجديدة |
| `/Barcode/findBarcode` | `Get_DataMember`, `process_add` | قراءة الباركود وجلب العضو وتسجيل العملية | يقابل الاستقبال/الحضور في الجديد |
| حضور الحصص | `barcode_classess`, `tasgel_hdoor`, `delete_class` | تسجيل حضور حصة وحذف تسجيل حصة | ماسح الحصص وحذف التسجيل غير ظاهرين في الجديد |
| حضور السبا | `barcode_spa`, `tasgel_hdoor_spa` | تسجيل حضور السبا بالباركود | غير ظاهر في الجديد |
| طباعة الباركود | `createBarcodes`, `getBarcodes` | توليد/عرض باركود ضمن نطاق أكواد | الجديد يطبع بطاقات عضو؛ Workflow مختلف |
| تحويلات الاشتراك | `add_transformation`, `update_transformation`, `delete_trans` | إنشاء وتعديل وحذف تحويل الاشتراك | الجديد يظهر زر تحويلات خطة؛ العمليات التفصيلية غير مثبتة |
| مرتجع الاشتراك | `save_hadback`, `edit_hadback`, `update_hadback`, `delete_hadback` | إنشاء وتعديل وحذف مرتجع | الجديد يعرض مسار بحث/اختيار اشتراك؛ تفاصيل CRUD غير مثبتة |
| تقارير الحضور | `member_attendance_report`, `get_ajax_member_attendance` | فلترة وعرض حضور حسب الفترة/النوع | الجديد بديل عام بدخول/خروج/مدة لكن لا يثبت نوع الحضور نفسه |

## الصفحات القديمة التي تُنفذ وظائف مختلفة فعلًا

هذه أبرز الصفحات التي لا يكفي تشابه اسمها مع صفحة جديدة للحكم بالتكافؤ:

1. `Members/member_details/{id}/{code}` — صفحة تفاصيل مستقلة، لا مجرد نافذة تعديل.
2. `Members/add_images/{id}` — مرفقات متعددة وحذف مرفقات، لا صورة الملف الشخصي فقط.
3. `Members/print_membership_bundle/{id}` ورفع PDF الموقّع — Workflow مستندات عضوية كامل.
4. `Subscription/edit_subscription/{id}` و`delete_subs_member/{id}` — CRUD صريح للاشتراك.
5. `Subscription/stop_subscription/{id}` و`process_stoped` — تجميد له دورة مستقلة، لا حالة عرض فقط.
6. `Barcode/barcode_classess` — ماسح وتسجيل/حذف حضور حصة.
7. `Barcode/barcode_spa` — ماسح حضور سبا.
8. `Barcode/createBarcodes` — طباعة نطاق باركود من كود إلى كود.
9. `eshtrakat/Transformation/*` — تحويل الاشتراك CRUD كامل.
10. `eshtrakat/Hadback/*` — مرتجع الاشتراك CRUD كامل.
