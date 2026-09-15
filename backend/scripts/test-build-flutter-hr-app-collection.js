const assert = require('node:assert/strict');

const { buildCollection, FOLDER_ORDER } = require('./build-flutter-hr-app-collection');

const collection = buildCollection();
assert.deepEqual(collection.item.map((folder) => folder.name), FOLDER_ORDER);

const rows = [];
function walk(items) {
  for (const item of items || []) {
    if (item.request) rows.push(item);
    if (item.item) walk(item.item);
  }
}
walk(collection.item);

const employeeReportFolder = collection.item.find((folder) => folder.name === '03 - تقارير الحضور والانصراف');
assert.deepEqual(employeeReportFolder?.item.map((item) => item.name), [
  'تقرير الحضور اليومي',
  'تقرير التأخير',
  'تقرير الغياب',
  'تقرير الساعات الإضافية الخاصة بي',
  'تقرير تبديل أو إضافة الشيفتات الخاصة بي',
]);

for (const requiredRoute of [
  '/api/mobile/login',
  '/api/mobile/attendance/punch',
  '/api/mobile/attendance/offline-sync',
  '/api/mobile/attendance/reports/basma',
  '/api/mobile/attendance/reports/late',
  '/api/mobile/attendance/reports/absence',
  '/api/mobile/leaves?mode=wared',
  '/api/mobile/leaves/{{leaveId}}/action',
  '/api/mobile/permissions?mode=wared',
  '/api/mobile/permissions/{{permissionId}}/action',
  '/api/mobile/loans/{{loanId}}/action',
  '/api/mobile/attendance/shift-types',
  '/api/mobile/attendance/shift-operation-types',
  '/api/mobile/attendance/shift-swaps',
  '/api/mobile/attendance/extra-hours',
  '/api/mobile/messages/inbox?page=1&perPage=20&status=0',
  '/api/mobile/circulars/{{circularId}}/read',
  '/api/mobile/legal-files/{{legalFileId}}/read',
  '/api/missions?page=1&pageSize=20',
  '/api/missions/{{missionId}}',
  '/api/mobile/tasks?page=1&perPage=20',
  '/api/tasks/{{taskId}}',
  '/api/auth/change-password',
  '/api/mobile/content/about',
  '/api/mobile/content/privacy-policy',
  '/api/mobile/activities/my-requests',
  '/api/mobile/activities/new-requests',
  '/api/mobile/statistics/monthly',
]) {
  assert(rows.some((item) => String(item.request.url.raw || item.request.url).includes(requiredRoute)), `Missing ${requiredRoute}`);
}

for (const [name, expected] of [
  ['تقرير الحضور اليومي', { dateFrom: '{{dateFrom}}', dateTo: '{{dateTo}}', search: '{{reportSearch}}' }],
  ['تقرير التأخير', { dateFrom: '{{dateFrom}}', dateTo: '{{dateTo}}', search: '{{reportSearch}}' }],
  ['تقرير الغياب', { dateFrom: '{{dateFrom}}', dateTo: '{{dateTo}}', search: '{{reportSearch}}' }],
  ['تقرير الساعات الإضافية الخاصة بي', { dateFrom: '{{dateFrom}}', dateTo: '{{dateTo}}', search: '{{reportSearch}}' }],
  ['تقرير تبديل أو إضافة الشيفتات الخاصة بي', { dateFrom: '{{dateFrom}}', dateTo: '{{dateTo}}', search: '{{reportSearch}}' }],
  ['الإجازات الواردة أو الواقفة عندي', { mode: 'wared', page: '1', pageSize: '20' }],
  ['الإجازات المقبولة', { mode: 'accept' }],
  ['الأذونات الواردة أو الواقفة عندي', { mode: 'wared' }],
  ['السلف الواردة أو الواقفة عندي', { mode: 'wared', page: '1', perPage: '20' }],
]) {
  const item = rows.find((row) => row.name === name);
  assert(item, `Missing ${name}`);
  const query = Object.fromEntries((item.request.url.query || []).map((entry) => [entry.key, entry.value]));
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(query[key], value, `${name} must persist query parameter ${key}=${value}`);
  }
}

for (const item of rows) {
  const url = String(item.request.url.raw || item.request.url);
  assert(url.includes('/api/'), `Modern prefix missing: ${url}`);
  assert(!url.includes('/Api/'), `Legacy endpoint leaked: ${url}`);
  assert(!url.includes('/api/attendance/reports/'), `Admin attendance report leaked: ${url}`);
  assert(!url.includes('/api/attendance/reports/overtime'), `Admin overtime report leaked: ${url}`);
  assert(!url.includes('/api/attendance/reports/shift-swap'), `Admin shift report leaked: ${url}`);
}

assert.equal(collection.variable.find((entry) => entry.key === 'latitude')?.value, '30.5694625');
assert.equal(collection.variable.find((entry) => entry.key === 'longitude')?.value, '31.0080154');
assert.match(collection.variable.find((entry) => entry.key === 'attendancePhoto')?.value ?? '', /^https:\/\//);
const login = rows.find((item) => item.name === 'تسجيل الدخول');
assert(login?.event?.[0]?.script?.exec?.some((line) => line.includes("collectionVariables.set('token'")));

console.log(JSON.stringify({ ok: true, folders: collection.item.length, requests: rows.length }));
