/* Builds the single, complete Flutter handoff collection from the verified legacy collection. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const docs = path.join(root, 'docs');
const outputDir = path.join(docs, 'flutter-handoff');
fs.mkdirSync(outputDir, { recursive: true });

const collection = JSON.parse(fs.readFileSync(
  path.join(docs, 'noamany-flutter-legacy-api.postman_collection.json'),
  'utf8',
));

collection.info = {
  ...collection.info,
  name: 'Noamany HR - Complete Flutter Application API',
  description: 'Verified Flutter handoff (2026-08-17): new production /api/mobile/login with phone and default password 102030, compatibility /Api endpoints served by the new backend, modern /api/mobile REST endpoints, uploads, and attendance geofencing by employees.emp_sign.',
};

const variables = new Map((collection.variable || []).map((item) => [item.key, item]));
variables.set('baseUrl', { key: 'baseUrl', value: 'https://final.noamanycenter.com' });
variables.set('password', { key: 'password', value: '102030' });
for (const [key, value] of Object.entries({
  employeeId: '1', taskId: '1', circularId: '1', warningId: '1', legalFileId: '1',
  activityId: '1', messageId: '1', loanId: '1', notificationId: '1', attendanceId: '1',
  shiftId: '1', shiftSwapId: '1', extraHoursId: '1', deviceId: '1', photoPath: '',
  activityPhotoPath: '', messageFilePath: '', recipientUserId: '1',
  documentPath: '',
})) {
  if (!variables.has(key)) variables.set(key, { key, value });
}
collection.variable = [...variables.values()];

const bearer = { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] };
const jsonHeader = [{ key: 'Content-Type', value: 'application/json' }];
const rawBody = (value) => ({ mode: 'raw', raw: JSON.stringify(value, null, 2), options: { raw: { language: 'json' } } });
const formBody = (values) => ({
  mode: 'urlencoded',
  urlencoded: Object.entries(values).map(([key, value]) => ({ key, value: String(value), type: 'text' })),
});
const request = (name, method, url, body, options = {}) => ({
  name,
  ...(options.event ? { event: options.event } : {}),
  request: {
    method,
    ...(options.noauth ? { auth: { type: 'noauth' } } : { auth: bearer }),
    ...(body && body.mode === 'raw' ? { header: jsonHeader } : {}),
    ...(body ? { body } : {}),
    url: `{{baseUrl}}${url}`,
    ...(options.description ? { description: options.description } : {}),
  },
});

const loginEvent = [{ listen: 'test', script: { exec: [
  'const body = pm.response.json();',
  'if (body.accessToken) pm.collectionVariables.set("accessToken", body.accessToken);',
] } }];
const pathId = (name) => `{{${name}}}`;

// Keep every legacy alias exposed by LegacyMobileController in the handoff.
// These aliases are still used by some released Flutter builds even though
// they execute the same backend operations as the canonical requests.
const attendanceFolder = collection.item.find((folder) => folder.name === '06 Attendance and overtime');
const employeeServicesFolder = collection.item.find((folder) => folder.name === '08 Employee services');
const legacyPunchBody = {
  mode: 'formdata',
  formdata: [
    { key: 'lat', value: '30.0', type: 'text' },
    { key: 'long', value: '31.0', type: 'text' },
    { key: 'basma_img', type: 'file', src: [] },
  ],
};
attendanceFolder?.item?.push(
  request('add_hdor_ensraf_asly', 'POST', '/Api/add_hdor_ensraf_asly', legacyPunchBody),
  request('attendance', 'POST', '/Api/attendance', legacyPunchBody),
);
employeeServicesFolder?.item?.push(
  request('Get_mangar_ehsaeyat', 'POST', '/Api/Get_mangar_ehsaeyat'),
);

const modernMobile = [
  request('Login', 'POST', '/api/mobile/login', rawBody({ username: '{{phone}}', password: '{{password}}' }), {
    noauth: true,
    event: loginEvent,
    description: 'username is the employee phone number. New employee accounts default to 102030 and mustChangePassword is false.',
  }),
  request('Profile', 'GET', '/api/mobile/profile'),
  request('Register FCM token', 'POST', '/api/mobile/device-token', rawBody({ token: 'FCM_DEVICE_TOKEN' })),
  request('Notifications', 'GET', '/api/mobile/notifications'),
  request('Mark notification read', 'PATCH', `/api/mobile/notifications/${pathId('notificationId')}/read`),
  request('Leaves list', 'GET', '/api/mobile/leaves'),
  request('Create leave', 'POST', '/api/mobile/leaves', rawBody({ leaveTypeId: 1, startDate: '2026-09-01', endDate: '2026-09-01', reason: 'سبب الإجازة' })),
  request('Permissions list', 'GET', '/api/mobile/permissions?page=1&pageSize=20'),
  request('Create permission', 'POST', '/api/mobile/permissions', rawBody({ no3Ezn: 1, eznDate: '2026-09-01', fromHour: '10:00', toHour: '11:00', reason: 'سبب الإذن', fatraFk: 1 })),
  request('Tasks list', 'GET', '/api/mobile/tasks?page=1&perPage=20'),
  request('Create task', 'POST', '/api/mobile/tasks', rawBody({ title: 'عنوان المهمة', notes: 'تفاصيل المهمة', status: 'inprogress' })),
  request('Delete task', 'DELETE', `/api/mobile/tasks/${pathId('taskId')}`),
  request('Attendance punch', 'POST', '/api/mobile/attendance/punch', rawBody({ lat: '30.044420', long: '31.235712', photo: '{{photoPath}}' }), {
    description: 'Do not send branchId. The backend geofences against employees.emp_sign, not branch_id_fk. Numeric emp_sign restricts punching to that branch; emp_sign=all selects the nearest configured branch containing the coordinates.',
  }),
  request('Circulars list', 'GET', '/api/mobile/circulars?page=1&perPage=20'),
  request('Circular detail', 'GET', `/api/mobile/circulars/${pathId('circularId')}`),
  request('Mark circular read', 'PATCH', `/api/mobile/circulars/${pathId('circularId')}/read`),
  request('Warnings list', 'GET', '/api/mobile/warnings?page=1&perPage=20'),
  request('Warning detail', 'GET', `/api/mobile/warnings/${pathId('warningId')}`),
  request('Mark warning read', 'PATCH', `/api/mobile/warnings/${pathId('warningId')}/read`),
  request('Generic requests list', 'GET', '/api/mobile/requests'),
  request('Create visit', 'POST', '/api/mobile/visit', rawBody({ lat: '30.044420', long: '31.235712', notes: 'تفاصيل الزيارة' })),
  request('Legal files list', 'GET', '/api/mobile/legal-files?page=1&perPage=20'),
  request('Mark legal file read', 'PATCH', `/api/mobile/legal-files/${pathId('legalFileId')}/read`),
  request('Activities list', 'GET', '/api/mobile/activities?page=1&perPage=20'),
  request('Create activity', 'POST', '/api/mobile/activities', rawBody({ title: 'عنوان النشاط', notes: 'تفاصيل النشاط', files: ['{{activityPhotoPath}}'] })),
  request('Delete activity', 'DELETE', `/api/mobile/activities/${pathId('activityId')}`),
  request('Employees directory', 'GET', '/api/mobile/employees?page=1&perPage=100'),
  request('Send internal message', 'POST', '/api/mobile/messages', rawBody({ toUserIds: [1], subject: 'عنوان الرسالة', message: 'نص الرسالة', file: '{{messageFilePath}}' })),
  request('Inbox messages', 'GET', '/api/mobile/messages/inbox?page=1&perPage=20'),
  request('Sent messages', 'GET', '/api/mobile/messages/sent?page=1&perPage=20'),
  request('Message detail', 'GET', `/api/mobile/messages/${pathId('messageId')}`),
  request('Mark message read', 'PATCH', `/api/mobile/messages/${pathId('messageId')}/read`),
  request('Delete message', 'DELETE', `/api/mobile/messages/${pathId('messageId')}`),
  request('Loan metadata', 'GET', '/api/mobile/loans/meta'),
  request('Loans sent', 'GET', '/api/mobile/loans?mode=sader&page=1&perPage=20'),
  request('Loans incoming', 'GET', '/api/mobile/loans?mode=wared&page=1&perPage=20'),
  request('Loan detail', 'GET', `/api/mobile/loans/${pathId('loanId')}`),
  request('Create loan request', 'POST', '/api/mobile/loans', rawBody({ amount: 1000, repaymentMethod: 3, installments: 5, deductionStartDate: '2026-09-01', reason: 'سبب طلب السلفة' })),
  request('Accept loan stage', 'PATCH', `/api/mobile/loans/${pathId('loanId')}/action`, rawBody({ action: 'accept', reason: '' })),
  request('Reject loan stage', 'PATCH', `/api/mobile/loans/${pathId('loanId')}/action`, rawBody({ action: 'reject', reason: 'سبب الرفض' })),
  request('Cancel loan request', 'DELETE', `/api/mobile/loans/${pathId('loanId')}`),
];

const uploads = ['app', 'activity', 'message', 'document'].map((category) => {
  const variable = category === 'app' ? 'photoPath' : category === 'activity' ? 'activityPhotoPath' : category === 'message' ? 'messageFilePath' : 'documentPath';
  return request(`Upload ${category}`, 'POST', `/api/uploads/${category}`, {
    mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: [] }],
  }, { event: [{ listen: 'test', script: { exec: [
    'const body = pm.response.json();',
    `if (body.path) pm.collectionVariables.set("${variable}", body.path);`,
  ] } }] });
});

const attendance = [
  request('Rules', 'GET', '/api/attendance/rules'),
  request('Update rules', 'PATCH', '/api/attendance/rules', rawBody({ rules: [{ key: 'late', enabled: true, threshold: '0', graceMin: '10', multiplier: '1' }] })),
  request('Settings', 'GET', '/api/attendance/settings'),
  request('Update settings', 'PATCH', '/api/attendance/settings', rawBody({ channels: { app: true, device: true, gps: true } })),
  request('Shifts list', 'GET', '/api/attendance/shifts?page=1&pageSize=20'),
  request('Create shift', 'POST', '/api/attendance/shifts', rawBody({ title: 'وردية', hdoorFromTime: '08:00', hdoorToTime: '09:00', hdoorKhasmFrom: '08:15', ensrafFromTime: '16:00', ensrafToTime: '17:00', ensrafKhasmFrom: '16:15' })),
  request('Update shift', 'PUT', `/api/attendance/shifts/${pathId('shiftId')}`, rawBody({ title: 'وردية معدلة', hdoorFromTime: '08:00', hdoorToTime: '09:00', hdoorKhasmFrom: '08:15', ensrafFromTime: '16:00', ensrafToTime: '17:00', ensrafKhasmFrom: '16:15' })),
  request('Delete shift', 'DELETE', `/api/attendance/shifts/${pathId('shiftId')}`),
  request('Shift swaps list', 'GET', '/api/attendance/shift-swaps?page=1&pageSize=20'),
  request('Create shift swap', 'POST', '/api/attendance/shift-swaps', rawBody({ empId: 1, ttype: 1, dwamIdFk: 1, sheftDate: '2026-09-01' })),
  request('Delete shift swap', 'DELETE', `/api/attendance/shift-swaps/${pathId('shiftSwapId')}`),
  request('Extra hours list', 'GET', '/api/attendance/extra-hours?page=1&pageSize=20'),
  request('Create extra hours', 'POST', '/api/attendance/extra-hours', rawBody({ empId: 1, numHours: 2, edafaDate: '2026-09-01' })),
  request('Delete extra hours', 'DELETE', `/api/attendance/extra-hours/${pathId('extraHoursId')}`),
  ...['basma', 'full-sheet', 'late', 'absence', 'overtime', 'shift-swap'].map((name) => request(`Report ${name}`, 'GET', `/api/attendance/reports/${name}?page=1&pageSize=20&empCode=all&dateFrom=2026-09-01&dateTo=2026-09-30`)),
  request('Devices list', 'GET', '/api/attendance/devices?page=1&pageSize=20'),
  request('Create device', 'POST', '/api/attendance/devices', rawBody({ title: 'جهاز البصمة', ip: '192.168.1.100', branchId: 1 })),
  request('Sync all devices', 'POST', '/api/attendance/devices/sync-all'),
  request('Sync device', 'POST', `/api/attendance/devices/${pathId('deviceId')}/sync`),
  request('Delete device', 'DELETE', `/api/attendance/devices/${pathId('deviceId')}`),
  request('Manual attendance check', 'POST', '/api/attendance/check', rawBody({ empCode: '1001', branchId: '1', type: 'in', checkIn: '08:00', channel: 'app' })),
  request('Manual attendance options', 'GET', '/api/attendance/manual-options'),
  request('Import attendance XLSX', 'POST', '/api/attendance/imports/device-file', { mode: 'formdata', formdata: [{ key: 'hdoor_file', type: 'file', src: [] }] }),
  request('Attendance board', 'GET', '/api/attendance?page=1&pageSize=20'),
];

collection.item = [
  ...collection.item,
  { name: '10 Modern Mobile REST API', item: modernMobile },
  { name: '11 Uploads', item: uploads },
  { name: '12 Attendance Full Administration', item: attendance },
];

const output = path.join(outputDir, 'NOAMANY_FLUTTER_COMPLETE.postman_collection.json');
fs.writeFileSync(output, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');

const copies = [
  ['flutter/noamany_legacy_api.dart', 'noamany_legacy_api.dart'],
  ['FLUTTER_LEGACY_API_HANDOFF.md', 'FLUTTER_LEGACY_API_HANDOFF.md'],
  ['FLUTTER_ATTENDANCE_API.md', 'FLUTTER_ATTENDANCE_API.md'],
  ['FLUTTER_CONTENT_AND_LOANS_API.md', 'FLUTTER_CONTENT_AND_LOANS_API.md'],
  ['MOBILE_API_INTEGRATION_TEST_REPORT.md', 'MOBILE_API_INTEGRATION_TEST_REPORT.md'],
];
for (const [source, target] of copies) {
  fs.copyFileSync(path.join(docs, source), path.join(outputDir, target));
}

const count = collection.item.reduce((sum, folder) => sum + (folder.item?.length || 0), 0);
console.log(JSON.stringify({ output, folders: collection.item.length, requests: count, copiedFiles: copies.length }, null, 2));
