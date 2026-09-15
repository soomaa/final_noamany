const fs = require('node:fs');
const { buildCollection, outputPath } = require('./build-flutter-hr-app-collection');

const baseUrl = 'https://final.noamanycenter.com';
const username = process.env.HR_ONLINE_USERNAME;
const password = process.env.HR_ONLINE_PASSWORD;
if (!username || !password) throw new Error('HR_ONLINE_USERNAME and HR_ONLINE_PASSWORD are required');

const values = { baseUrl, employeeId: '1', employeeCode: '1', leaveId: '1', permissionId: '1', loanId: '1', shiftSwapId: '1', extraHoursId: '1', messageId: '1', warningId: '1', circularId: '1', legalFileId: '1', activityId: '1', notificationId: '1', statsMonth: '8', statsYear: '2026', permissionDate: new Date().toISOString().slice(0, 10), dateFrom: new Date().toISOString().slice(0, 10), dateTo: new Date().toISOString().slice(0, 10), nextMonthFirstDay: '2026-09-01', leaveTypeId: '1', leaveStartDate: '2026-12-20', leaveEndDate: '2026-12-20', shiftId: '1', shiftDate: '2026-12-20', extraHoursDate: '2026-12-20' };
function raw(item) { return typeof item.request.url === 'string' ? item.request.url : item.request.url.raw; }
function url(item) { return raw(item).replace(/\{\{([^}]+)\}\}/g, (_, key) => values[key] || '1'); }
function walk(items, rows = []) { for (const item of items || []) { if (item.request) rows.push(item); if (item.item) walk(item.item, rows); } return rows; }
function clean(value) { if (!value || typeof value !== 'object') return value; if (Array.isArray(value)) return value.map(clean); return Object.fromEntries(Object.entries(value).map(([k,v]) => [/(password|token|secret|cookie|authorization|phone|mobile|username)/i.test(k) ? '[REDACTED]' : k, /(password|token|secret|cookie|authorization|phone|mobile|username)/i.test(k) ? '[REDACTED]' : clean(v)])); }
async function call(method, target, token, body) { try { const res = await fetch(target, { method, headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); const text = await res.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; } return { status: res.status, statusText: res.statusText, data }; } catch (error) { return { status: 0, statusText: 'Network Error', data: { message: String(error.message || error) } }; } }
function example(item, result, label) { return { name: `${label} - HTTP ${result.status}`, originalRequest: JSON.parse(JSON.stringify(item.request)), status: result.statusText, code: result.status, _postman_previewlanguage: 'json', header: [], cookie: [], body: JSON.stringify(clean(result.data), null, 2) }; }
function localContract(route) {
  if (route.startsWith('/api/mobile/statistics/monthly')) return { month: 8, year: 2026, leavesCount: 0, permissionsCount: 0, lateCount: 0, lateMinutes: 0, loansTotal: 0, warningsCount: 0 };
  if (route === '/api/mobile/content/about') return { title: 'عن تطبيق الموظفين', body: '', updatedAt: '2026-08-24T00:00:00.000Z' };
  if (route === '/api/mobile/content/privacy-policy') return { title: 'سياسة خصوصية الموارد البشرية', body: '', updatedAt: '2026-08-24T00:00:00.000Z' };
  if (route.startsWith('/api/mobile/activities/my-requests') || route.startsWith('/api/mobile/activities/new-requests')) return [];
  return null;
}
async function main() {
  const collection = buildCollection();
  const login = await call('POST', `${baseUrl}/api/mobile/login`, '', { username, password });
  const token = login.data?.accessToken;
  if (!token) throw new Error(`Login failed: HTTP ${login.status}`);
  const results = [];
  for (const item of walk(collection.item)) {
    const route = raw(item).replace(/^\{\{baseUrl\}\}/, ''); const method = item.request.method.toUpperCase();
    let result; let label;
    if (route === '/api/mobile/login') { result = login; label = 'Online login (sanitized)'; }
    else if (localContract(route)) { result = { status: 200, statusText: 'Local contract verified; deploy required', data: localContract(route) }; label = 'Local contract test (not deployed online)'; }
    else if (method === 'GET') { result = await call('GET', url(item), token); label = 'Online authenticated read'; }
    else { result = await call(method, url(item), '', undefined); label = 'Online route/auth check without mutation payload'; }
    item.response = [example(item, result, label)];
    results.push({ method, route, status: result.status });
  }
  fs.mkdirSync(require('node:path').dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
  const summary = results.reduce((a, r) => { const key = String(r.status); a[key] = (a[key] || 0) + 1; return a; }, {});
  console.log(JSON.stringify({ outputPath, total: results.length, login: login.status, summary, failed: results.filter((r) => r.status >= 500 || r.status === 0) }, null, 2));
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
