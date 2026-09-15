const fs = require('node:fs');
const path = require('node:path');

const outputDir = path.resolve(__dirname, '..', '..', 'docs', 'hr_api');
const outputPath = path.join(outputDir, 'NOAMANY_HR_FLUTTER_APP_API.postman_collection.json');
const baseUrl = 'https://final.noamanycenter.com';

const FOLDER_ORDER = [
  '01 - الدخول والتطبيق',
  '02 - الحضور والانصراف',
  '03 - تقارير الحضور والانصراف',
  '04 - الإجازات',
  '05 - الأذونات',
  '06 - السلف',
  '07 - الشفتات والساعات الإضافية',
  '08 - الرسائل الداخلية',
  '09 - الإنذارات والتعاميم',
  '10 - الأنشطة واللوائح',
  '11 - المأموريات والمهام',
  '12 - الإشعارات والخصوصية',
  '13 - إحصائيات الموظف',
];

function request(name, method, endpoint, { body, description = '', publicRoute = false } = {}) {
  const [pathname, search = ''] = endpoint.split('?');
  const query = [...new URLSearchParams(search).entries()].map(([key, value]) => ({ key, value }));
  const item = {
    name,
    request: {
      method,
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: { raw: `{{baseUrl}}${endpoint}`, host: ['{{baseUrl}}'], path: pathname.split('/').filter(Boolean), ...(query.length ? { query } : {}) },
      description,
    },
    response: [],
  };
  if (body) item.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  if (publicRoute) item.request.auth = { type: 'noauth' };
  if (name === 'تسجيل الدخول') {
    item.event = [{
      listen: 'test',
      script: { type: 'text/javascript', exec: [
        'const body = pm.response.json();',
        'const token = body.accessToken || body.access_token;',
        "if (token) pm.collectionVariables.set('token', token);",
      ] },
    }];
  }
  return item;
}

function folder(name, item) { return { name, item }; }

function buildCollection() {
  const c = {
    info: {
      _postman_id: 'ab8b583b-4402-473c-a395-2ce65e2af7d1',
      name: 'Noamany HR - Flutter Employee App (Modern APIs)',
      description: 'Modern /api APIs for the Flutter HR employee application. Ordered by the app flow. Legacy /Api routes are excluded. Responses are added by the online test runner.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: baseUrl, type: 'string' }, { key: 'token', value: '', type: 'string' },
      { key: 'username', value: '', type: 'string' }, { key: 'password', value: '', type: 'string' },
      { key: 'employeeId', value: '2593', type: 'string' }, { key: 'employeeCode', value: '163', type: 'string' },
      { key: 'employeePhone', value: '01007699888', type: 'string' },
      { key: 'recipientUserId', value: '369', type: 'string' }, { key: 'leaveTypeId', value: '17', type: 'string' },
      { key: 'leaveId', value: '6380', type: 'string' }, { key: 'permissionId', value: '1', type: 'string' },
      { key: 'loanId', value: '1', type: 'string' }, { key: 'shiftId', value: '1', type: 'string' },
      { key: 'shiftSwapId', value: '1', type: 'string' }, { key: 'extraHoursId', value: '1', type: 'string' },
      { key: 'messageId', value: '1', type: 'string' }, { key: 'warningId', value: '1', type: 'string' },
      { key: 'circularId', value: '1', type: 'string' }, { key: 'legalFileId', value: '4', type: 'string' },
      { key: 'activityId', value: '539', type: 'string' }, { key: 'notificationId', value: '1', type: 'string' },
      { key: 'latitude', value: '30.5694625', type: 'string' }, { key: 'longitude', value: '31.0080154', type: 'string' },
      { key: 'attendancePhoto', value: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png', type: 'string' }, { key: 'activityFilePath', value: '', type: 'string' },
      { key: 'uploadedPhotoName', value: '', type: 'string' }, { key: 'fcmToken', value: '', type: 'string' },
      { key: 'permissionDate', value: '2026-09-01', type: 'string' }, { key: 'leaveStartDate', value: '2026-12-20', type: 'string' },
      { key: 'leaveEndDate', value: '2026-12-20', type: 'string' }, { key: 'dateFrom', value: '2026-08-01', type: 'string' },
      { key: 'dateTo', value: '2026-08-31', type: 'string' }, { key: 'nextMonthFirstDay', value: '2026-09-01', type: 'string' },
      { key: 'reportSearch', value: '', type: 'string' },
      { key: 'shiftDate', value: '2026-12-20', type: 'string' }, { key: 'extraHoursDate', value: '2026-12-20', type: 'string' },
      { key: 'offlineId', value: '00000000-0000-4000-8000-000000000001', type: 'string' },
      { key: 'capturedAtUtc', value: '2026-08-24T08:00:00.000Z', type: 'string' },
      { key: 'statsMonth', value: '8', type: 'string' }, { key: 'statsYear', value: '2026', type: 'string' },
    ],
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    item: [],
  };
  c.item.push(folder(FOLDER_ORDER[0], [
    request('تسجيل الدخول', 'POST', '/api/mobile/login', { body: { username: '{{username}}', password: '{{password}}' }, publicRoute: true, description: 'يحفظ اختبار Postman التوكن في متغير collection token.' }),
    request('البروفايل', 'GET', '/api/mobile/profile'),
    request('تغيير كلمة المرور', 'POST', '/api/auth/change-password', { body: { currentPassword: '{{currentPassword}}', newPassword: '{{newPassword}}' } }),
    request('رفع صورة شخصية', 'POST', '/api/uploads/emp-photo', { description: 'multipart/form-data: field name file. بعد الرفع استخدم تحديث الموظف بالصورة الناتجة.' }),
    request('تحديث الصورة الشخصية', 'PUT', '/api/employees/{{employeeId}}', { body: { personal_photo: '{{uploadedPhotoName}}' }, description: 'يتطلب صلاحية تعديل بيانات الموظف.' }),
  ]));
  c.item.push(folder(FOLDER_ORDER[1], [
    request('تسجيل حضور أو انصراف بالبصمة', 'POST', '/api/mobile/attendance/punch', { body: { lat: '{{latitude}}', long: '{{longitude}}', photo: '{{attendancePhoto}}' }, description: 'نفس المسار يسجل دخولًا أو خروجًا حسب آخر حالة حضور.' }),
    request('مزامنة بصمة تم حفظها أثناء انقطاع النت', 'POST', '/api/mobile/attendance/offline-sync', { body: { offlineId: '{{offlineId}}', capturedAtUtc: '{{capturedAtUtc}}', timezone: 'Africa/Cairo', lat: '{{latitude}}', long: '{{longitude}}', photo: '{{attendancePhoto}}' }, description: 'عند انقطاع النت: خزّن البصمة محليًا مع offlineId UUID، ثم أرسلها عند عودة الاتصال. لا تحذفها من التخزين المحلي إلا بعد نجاح 2xx.' }),
  ]));
  c.item.push(folder(FOLDER_ORDER[2], [
    request('تقرير الحضور اليومي', 'GET', '/api/mobile/attendance/reports/basma?dateFrom={{dateFrom}}&dateTo={{dateTo}}&search={{reportSearch}}', { description: 'يعرض بصمات الموظف المسجل فقط؛ يتم تحديد الموظف والفرع من التوكن.' }),
    request('تقرير التأخير', 'GET', '/api/mobile/attendance/reports/late?dateFrom={{dateFrom}}&dateTo={{dateTo}}&search={{reportSearch}}', { description: 'يعرض تأخيرات الموظف المسجل فقط؛ يتم تحديد الموظف والفرع من التوكن.' }),
    request('تقرير الغياب', 'GET', '/api/mobile/attendance/reports/absence?dateFrom={{dateFrom}}&dateTo={{dateTo}}&search={{reportSearch}}', { description: 'يعرض غياب الموظف المسجل فقط؛ يتم تحديد الموظف والفرع من التوكن.' }),
    request('تقرير الساعات الإضافية الخاصة بي', 'GET', '/api/mobile/attendance/extra-hours?page=1&perPage=20&dateFrom={{dateFrom}}&dateTo={{dateTo}}&search={{reportSearch}}', { description: 'يعرض فقط الساعات التي أُضيفت بطلب إضافة ساعات إضافية، ولا يحسب ساعات تلقائيًا من الحضور.' }),
    request('تقرير تبديل أو إضافة الشيفتات الخاصة بي', 'GET', '/api/mobile/attendance/shift-swaps?page=1&perPage=20&dateFrom={{dateFrom}}&dateTo={{dateTo}}&search={{reportSearch}}', { description: 'يعرض طلبات التبديل أو الإضافة الخاصة بالموظف؛ يعيد قائمة فارغة عند عدم وجود طلبات.' }),
  ]));
  c.item.push(folder(FOLDER_ORDER[3], [
    request('أنواع الإجازات', 'GET', '/api/mobile/leaves/types'),
    request('الإجازات الصادرة', 'GET', '/api/mobile/leaves?mode=sader&page=1&pageSize=20'),
    request('الإجازات الواردة أو الواقفة عندي', 'GET', '/api/mobile/leaves?mode=wared&page=1&pageSize=20'),
    request('الإجازات المقبولة', 'GET', '/api/mobile/leaves?mode=accept&page=1&pageSize=20'),
    request('الإجازات المرفوضة', 'GET', '/api/mobile/leaves?mode=reject&page=1&pageSize=20'),
    request('إضافة إجازة', 'POST', '/api/mobile/leaves', { body: { leaveTypeId: '{{leaveTypeId}}', startDate: '{{leaveStartDate}}', endDate: '{{leaveEndDate}}', reason: 'طلب إجازة من تطبيق الموظف' } }),
    request('قبول إجازة محولة لي', 'PATCH', '/api/mobile/leaves/{{leaveId}}/action', { body: { action: 'accept', reason: 'تمت الموافقة' } }),
    request('رفض إجازة محولة لي', 'PATCH', '/api/mobile/leaves/{{leaveId}}/action', { body: { action: 'reject', reason: 'تم الرفض' } }),
  ]));
  c.item.push(folder(FOLDER_ORDER[4], [
    request('رصيد الأذونات المتاح', 'GET', '/api/mobile/permissions/available?date={{permissionDate}}'),
    request('الأذونات الصادرة', 'GET', '/api/mobile/permissions?mode=sader&page=1&pageSize=20'),
    request('الأذونات الواردة أو الواقفة عندي', 'GET', '/api/mobile/permissions?mode=wared&page=1&pageSize=20'),
    request('الأذونات المقبولة', 'GET', '/api/mobile/permissions?mode=accept&page=1&pageSize=20'),
    request('الأذونات المرفوضة', 'GET', '/api/mobile/permissions?mode=reject&page=1&pageSize=20'),
    request('أنواع الأذونات (من النظام)', 'GET', '/api/lookups', { description: 'الأنواع الحديثة الثابتة: 1 = إذن شخصي، 2 = إذن للعمل. لا يوجد endpoint منفصل للأنواع في الإصدار المنشور؛ هذا الطلب يجلب كتالوجات النظام، واستخدمي القيم الثابتة في طلب الإذن.' }),
    request('إضافة إذن', 'POST', '/api/mobile/permissions', { body: { no3Ezn: 1, eznDate: '{{permissionDate}}', fromHour: '10:00', toHour: '11:00', reason: 'إذن من تطبيق الموظف' } }),
    request('قبول إذن محول لي', 'PATCH', '/api/mobile/permissions/{{permissionId}}/action', { body: { action: 'accept', reason: 'تمت الموافقة' } }),
    request('رفض إذن محول لي', 'PATCH', '/api/mobile/permissions/{{permissionId}}/action', { body: { action: 'reject', reason: 'تم الرفض' } }),
  ]));
  c.item.push(folder(FOLDER_ORDER[5], [
    request('بيانات السلف', 'GET', '/api/mobile/loans/meta'), request('السلف الصادرة', 'GET', '/api/mobile/loans?mode=sader&page=1&perPage=20'),
    request('السلف الواردة أو الواقفة عندي', 'GET', '/api/mobile/loans?mode=wared&page=1&perPage=20'), request('السلف المقبولة', 'GET', '/api/mobile/loans?mode=accept&page=1&perPage=20'), request('السلف المرفوضة', 'GET', '/api/mobile/loans?mode=reject&page=1&perPage=20'),
    request('تفاصيل سلفة', 'GET', '/api/mobile/loans/{{loanId}}'), request('إضافة طلب سلفة', 'POST', '/api/mobile/loans', { body: { amount: 100, repaymentMethod: 3, installments: 2, deductionStartDate: '{{nextMonthFirstDay}}', reason: 'طلب اختبار من تطبيق الموظف' } }),
    request('قبول سلفة محولة لي', 'PATCH', '/api/mobile/loans/{{loanId}}/action', { body: { action: 'accept', reason: 'تمت الموافقة' } }), request('رفض سلفة محولة لي', 'PATCH', '/api/mobile/loans/{{loanId}}/action', { body: { action: 'reject', reason: 'تم الرفض' } }), request('إلغاء طلب السلفة الصادر', 'DELETE', '/api/mobile/loans/{{loanId}}'),
  ]));
  c.item.push(folder(FOLDER_ORDER[6], [
    request('أنواع الشيفتات المتاحة للموظف', 'GET', '/api/mobile/attendance/shift-types?page=1&pageSize=20'),
    request('أنواع عملية الشيفت', 'GET', '/api/mobile/attendance/shift-operation-types', { description: 'يعيد دائمًا نوعَي العملية لاستخدامهما في نموذج المدير: 1 = تبديل شيفت، 2 = إضافة شيفت.' }),
    request('المدير: تبديل شيفت لموظف', 'POST', '/api/mobile/attendance/shift-swaps', { body: { employeePhone: '{{employeePhone}}', ttype: 1, dwamIdFk: '{{shiftId}}', sheftDate: '{{shiftDate}}' }, description: 'يكتب المدير رقم هاتف الموظف. الباك يبحث عنه ثم يتحقق أن المرسل مديره المباشر أو HR قبل الحفظ.' }),
    request('المدير: إضافة شيفت لموظف', 'POST', '/api/mobile/attendance/shift-swaps', { body: { employeePhone: '{{employeePhone}}', ttype: 2, dwamIdFk: '{{shiftId}}', sheftDate: '{{shiftDate}}' }, description: 'لا يمكن للموظف إضافة شفت لنفسه؛ المدير أو HR فقط.' }),
    request('تقرير تبديل وإضافة شيفتاتي', 'GET', '/api/mobile/attendance/shift-swaps?page=1&perPage=20'),
    request('المدير: إضافة ساعات إضافية لموظف', 'POST', '/api/mobile/attendance/extra-hours', { body: { employeePhone: '{{employeePhone}}', numHours: 2, edafaDate: '{{extraHoursDate}}' }, description: 'المدير يدخل رقم هاتف الموظف. المدير المباشر أو HR فقط؛ هذه الساعات لا تُحسب تلقائيًا من الحضور.' }), request('تقرير ساعاتي الإضافية', 'GET', '/api/mobile/attendance/extra-hours?page=1&perPage=20'),
  ]));
  c.item.push(folder(FOLDER_ORDER[7], [
    request('كل الرسائل الواردة', 'GET', '/api/mobile/messages/inbox?page=1&perPage=20'), request('الرسائل غير المقروءة', 'GET', '/api/mobile/messages/inbox?page=1&perPage=20&status=0'), request('الرسائل المقروءة', 'GET', '/api/mobile/messages/inbox?page=1&perPage=20&status=1'), request('الرسائل الصادرة', 'GET', '/api/mobile/messages/sent?page=1&perPage=20'), request('تفاصيل رسالة داخلية', 'GET', '/api/mobile/messages/{{messageId}}'), request('إرسال رسالة داخلية', 'POST', '/api/mobile/messages', { body: { toUserIds: ['{{recipientUserId}}'], subject: 'رسالة من التطبيق', message: 'رسالة اختبار' } }), request('تعليم الرسالة كمقروءة', 'PATCH', '/api/mobile/messages/{{messageId}}/read'),
  ]));
  c.item.push(folder(FOLDER_ORDER[8], [
    request('كل الإنذارات', 'GET', '/api/mobile/warnings?page=1&perPage=20'), request('تفاصيل إنذار', 'GET', '/api/mobile/warnings/{{warningId}}'), request('تعليم الإنذار كمقروء', 'PATCH', '/api/mobile/warnings/{{warningId}}/read'), request('كل التعاميم', 'GET', '/api/mobile/circulars?page=1&perPage=20'), request('تفاصيل تعميم', 'GET', '/api/mobile/circulars/{{circularId}}'), request('تعليم التعميم كمقروء وزيادة المشاهدة', 'PATCH', '/api/mobile/circulars/{{circularId}}/read'),
  ]));
  c.item.push(folder(FOLDER_ORDER[9], [
    request('طلباتي من الأنشطة', 'GET', '/api/mobile/activities/my-requests?page=1&perPage=20'), request('طلبات الأنشطة الجديدة من النظام', 'GET', '/api/mobile/activities/new-requests?page=1&perPage=20'), request('كل الأنشطة الخاصة بي', 'GET', '/api/mobile/activities?page=1&perPage=20'), request('تفاصيل نشاط', 'GET', '/api/activities/{{activityId}}', { description: 'تفاصيل النشاط متاحة في إدارة HR وتتطلب صلاحيتها.' }), request('إضافة نشاط بدون مرفق', 'POST', '/api/mobile/activities', { body: { title: 'نشاط من تطبيق الموظف', notes: 'تفاصيل النشاط' }, description: 'يحفظ في جدول hr_ansheta ويظهر في طلباتي. المرفق اختياري.' }), request('إضافة نشاط بمرفق اختياري', 'POST', '/api/mobile/activities', { body: { title: 'نشاط من تطبيق الموظف', notes: 'تفاصيل النشاط', files: ['{{activityFilePath}}'] }, description: 'ارفعي الملف أولًا عبر /api/uploads/activity ثم أرسلي المسار الناتج.' }), request('كل اللوائح', 'GET', '/api/mobile/legal-files?page=1&perPage=20'), request('تفاصيل لائحة', 'GET', '/api/legal-files/{{legalFileId}}', { description: 'تفاصيل اللائحة متاحة في إدارة HR وتتطلب صلاحيتها.' }), request('تعليم اللائحة كمقروءة وزيادة المشاهدة', 'PATCH', '/api/mobile/legal-files/{{legalFileId}}/read'),
  ]));
  c.item.push(folder(FOLDER_ORDER[10], [
    request('قائمة المأموريات', 'GET', '/api/missions?page=1&pageSize=20', { description: 'يتطلب صلاحية leaves.missions:view. الإصدار الحالي لا يفلتر المأموريات تلقائيًا للموظف.' }),
    request('تفاصيل مأمورية', 'GET', '/api/missions/{{missionId}}', { description: 'يتطلب صلاحية leaves.missions:view.' }),
    request('قائمة مهام الموظف', 'GET', '/api/mobile/tasks?page=1&perPage=20', { description: 'القائمة الحالية في تطبيق الموظف.' }),
    request('تفاصيل مهمة', 'GET', '/api/tasks/{{taskId}}', { description: 'تفاصيل المهمة متاحة حاليًا عبر إدارة HR وتتطلب صلاحية affairs.tasks:view؛ لا يوجد GET تفصيلي مخصص لتطبيق الموظف في النسخة المنشورة.' }),
  ]));
  c.item.push(folder(FOLDER_ORDER[11], [
    request('كل الإشعارات', 'GET', '/api/mobile/notifications'), request('تعليم إشعار كمقروء', 'PATCH', '/api/mobile/notifications/{{notificationId}}/read'), request('عن تطبيق الموارد البشرية', 'GET', '/api/mobile/content/about', { description: 'محتوى HR مستقل ومتاح للموظف المسجل فقط.' }), request('سياسة خصوصية الموارد البشرية', 'GET', '/api/mobile/content/privacy-policy', { description: 'ليست سياسة النظام أو تطبيق الأعضاء؛ تُدار من /api/hr/mobile-content بعد النشر.' }), request('تحديث FCM token', 'POST', '/api/mobile/device-token', { body: { token: '{{fcmToken}}' } }),
  ]));
  c.item.push(folder(FOLDER_ORDER[12], [
    request('إحصائيات الموظف للشهر الحالي', 'GET', '/api/mobile/statistics/monthly', { description: 'يعيد أرقام الموظف المسجل فقط: leavesCount, permissionsCount, lateCount, lateMinutes, loansTotal, warningsCount.' }),
    request('إحصائيات الموظف لشهر محدد', 'GET', '/api/mobile/statistics/monthly?month={{statsMonth}}&year={{statsYear}}'),
  ]));
  const login = c.item[0].item[0];
  login.event = [{ listen: 'test', script: { type: 'text/javascript', exec: ["const data = pm.response.json();", "if (data.accessToken) pm.collectionVariables.set('token', data.accessToken);"] } }];
  return c;
}

function write() { const collection = buildCollection(); fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`); console.log(outputPath); }
if (require.main === module) write();
module.exports = { buildCollection, FOLDER_ORDER, outputPath };
