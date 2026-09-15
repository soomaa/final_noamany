const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  filterHrCollection,
  isSafeOnlineRequest,
  sanitizeResponseData,
} = require('./build-hr-modern-online-postman-collection');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_FULL_NEW_API.postman_collection.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const filtered = filterHrCollection(source);
const folderNames = filtered.item.map((folder) => folder.name);

for (const required of [
  'Employees',
  'Attendance',
  'Leaves',
  'Payroll',
  'HrWarnings',
  'AdministrativeDecisions',
  'Mobile',
]) {
  assert(folderNames.includes(required), `Expected HR folder ${required}`);
}

for (const forbidden of [
  'AccountingReports',
  'CafeProducts',
  'ClubMembers',
  'InventoryTransactions',
  'PurchaseOrders',
  'QuickSales',
]) {
  assert(!folderNames.includes(forbidden), `Non-HR folder leaked: ${forbidden}`);
}

function walk(items, visit) {
  for (const item of items || []) {
    if (item.request) visit(item);
    if (item.item) walk(item.item, visit);
  }
}

walk(filtered.item, (item) => {
  const raw = typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
  assert(raw.includes('/api/'), `Modern API prefix missing: ${raw}`);
  assert(!raw.includes('/Api/'), `Legacy API leaked: ${raw}`);
});

assert.equal(isSafeOnlineRequest('GET', '/api/employees'), true);
assert.equal(isSafeOnlineRequest('POST', '/api/auth/login'), true);
assert.equal(isSafeOnlineRequest('POST', '/api/leaves'), false);
assert.equal(isSafeOnlineRequest('PATCH', '/api/payroll/runs/1'), false);
assert.equal(isSafeOnlineRequest('DELETE', '/api/employees/1'), false);

assert.deepEqual(
  sanitizeResponseData({
    accessToken: 'secret-token',
    refreshToken: 'secret-refresh',
    password: 'secret-password',
    user: { id: 9, name: 'Test User' },
  }),
  {
    accessToken: '[REDACTED]',
    refreshToken: '[REDACTED]',
    password: '[REDACTED]',
    user: { id: 9, name: 'Test User' },
  },
);

console.log(JSON.stringify({
  ok: true,
  folders: folderNames.length,
  message: 'HR-only modern collection filtering tests passed',
}));
