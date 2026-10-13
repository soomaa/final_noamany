# تطبيق الموظفين «طلباتي» — قائمة API

قاعدة الخدمة الحية: `https://final.noamanycenter.com/Api`.

## اختبار حي تم تنفيذه

في 23 سبتمبر 2026، تحققت المسارات العامة التالية من الخادم الحي بنجاح: `getAppinfo` و`getAppPolicy` و`SplashScreens`. أعادت جميعها HTTP 200 و`status: 200` ضمن غلاف الـAPI القديم.

## مصادقة التطبيق

`login_app` يستقبل `phone` و`user_pass` ويعيد `data.access_token`. جميع المسارات اللاحقة تستخدم `Authorization: Bearer <access_token>`.

## الخدمات المقابلة لشاشة «طلباتي»

| الخدمة | مسارات القراءة | مسارات التغيير |
|---|---|---|
| الرسائل | `InboxMessages`, `SentMessages`, `ViewMessage` | `SendMessage`, `SeenMessage`, `DeleteMessage` |
| الأذونات | `Ozonat_types`, `Get_Ezn_List`, `Get_Wared_Ezn_List`, `Get_Ezn_data` | `Add_Ezn`, `Edit_Ezn`, `Delete_ezn`, `Egraa_ezn` |
| الإجازات | `Agazat_types`, `Get_agaza_List`, `Get_Agaza_data` | `Add_Agaza`, `Edit_Agaza`, `Delete_agaza`, `Egraa_agaza` |
| الحضور والانصراف | `Basma_Today`, `Report_Basma` | `add_hdor_ensraf` |
| الإنذارات | `Get_Enzarat_list`, `Get_enzar_data` | `SeenEnzar` |
| المراسلات الإدارية | `Get_mosalat_list` | `Add_mosala_response` |
| الشيفتات | `sheft_types`, `dwam_types`, `report_tabdel_sheft` | `add_sheft_edafi` |
| الساعات الإضافية | `Report_hours_edafi` | `add_hours_edafi` |
| التعاميم | `Get_ta3mem_list`, `Get_ta3mem_data` | `SeenTa3mem` |
| السلف | `Solaf_meta`, `Get_Solaf_List`, `Get_Solfa_data` | `Add_Solfa`, `Delete_solfa`, `Egraa_solfa` |
| المهام | `Get_Tasks_List` | `Add_Task`, `Delete_task` |
| الخدمات الذاتية | `getProfile`, `today_notification`, `Get_emp_ehsaeyat`, `Get_emp_ntaq` | `register_device_token`, `update_pass`, `update_profile_image` |

جميع الطلبات التي تُنشئ أو تعدل بيانات فعلية معطّلة في الـCollection حتى تُضبط قيمة `allowWrites` إلى `true` داخل بيئة Postman محلية.
