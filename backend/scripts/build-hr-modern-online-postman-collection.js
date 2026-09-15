/*
 * Builds a Postman v2.1 collection for the modern HR management system and
 * modern employee application only. When credentials are supplied through
 * environment variables, every route is checked against production and the
 * sanitized live response is attached as a Postman example.
 */
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_FULL_NEW_API.postman_collection.json');
const outputPath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_MODERN_API_WITH_ONLINE_RESPONSES.postman_collection.json');
const reportPath = path.join(workspaceRoot, 'docs', 'NOAMANY_HR_MODERN_API_ONLINE_TEST_REPORT.json');
const baseUrl = (process.env.HR_ONLINE_BASE_URL || 'https://final.noamanycenter.com').replace(/\/$/, '');
const username = process.env.HR_ONLINE_USERNAME || '';
const password = process.env.HR_ONLINE_PASSWORD || '';
const timeoutMs = Math.max(3000, Number(process.env.HR_ONLINE_TIMEOUT_MS || 20000));
const concurrency = Math.max(1, Math.min(8, Number(process.env.HR_ONLINE_CONCURRENCY || 4)));

const HR_FOLDER_NAMES = new Set([
  'ActionScreen',
  'Activities',
  'AdministrativeDecisions',
  'Archive',
  'Attendance',
  'Auth',
  'Branches',
  'Circulars',
  'Clearance',
  'Custody',
  'DailyReports',
  'Dashboard',
  'Documents',
  'Employees',
  'Evaluations',
  'FormsSettings',
  'GymRates',
  'HrWarnings',
  'Initiatives',
  'InsuranceSettings',
  'JobRequests',
  'Leaves',
  'LegalFiles',
  'Loans',
  'LoanSettings',
  'Lookups',
  'Messaging',
  'Missions',
  'Mobile',
  'Notifications',
  'Org',
  'Partners',
  'Payroll',
  'Penalties',
  'Permissions',
  'Reports',
  'Requests',
  'Rewards',
  'SalaryScale',
  'SiteVisits',
  'Tasks',
  'Uploads',
  'WeeklyLeaves',
]);

const PLACEHOLDER_VALUES = {
  id: '1',
  rowId: '1',
  fileId: '1',
  groupId: '1',
  empId: '1',
  employeeId: '1',
  empCode: '1',
  branchId: '1',
  type: 'general',
  category: 'documents',
  key: 'attendance-daily',
  action: 'calculate',
  nationalityType: '1',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requestRawUrl(item) {
  return typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '';
}

function isModernRequest(item) {
  const raw = requestRawUrl(item);
  return raw.includes('/api/') && !raw.includes('/Api/');
}

function filterItems(items) {
  return (items || []).flatMap((item) => {
    if (item.request) return isModernRequest(item) ? [clone(item)] : [];
    if (item.item) {
      const children = filterItems(item.item);
      return children.length ? [{ ...clone(item), item: children }] : [];
    }
    return [];
  });
}

function filterHrCollection(source) {
  const collection = clone(source);
  collection.info = {
    ...collection.info,
    _postman_id: 'b91486f4-97ce-4e02-a1f9-71b2256209bb',
    name: 'Noamany HR - Modern Management & Employee App API (Online Responses)',
    description: [
      'Modern HR management and modern employee application APIs only.',
      'All routes use the lowercase /api/ prefix. Legacy /Api/ compatibility routes are excluded.',
      'The collection includes sanitized response examples captured from the online server.',
      'Club, sales, inventory, procurement, accounting, finance, and member APIs are excluded.',
    ].join(' '),
  };
  collection.item = (source.item || [])
    .filter((folder) => HR_FOLDER_NAMES.has(folder.name))
    .map((folder) => ({ ...clone(folder), item: filterItems(folder.item) }))
    .filter((folder) => folder.item.length > 0);
  collection.variable = (collection.variable || []).map((variable) => {
    if (variable.key === 'baseUrl') return { ...variable, value: baseUrl };
    if (variable.key === 'token') return { ...variable, value: '' };
    return variable;
  });
  collection.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] };
  return collection;
}

function isSafeOnlineRequest(method, route) {
  const verb = String(method || '').toUpperCase();
  return verb === 'GET' || (verb === 'POST' && ['/api/auth/login', '/api/mobile/login'].includes(route));
}

function sanitizeResponseData(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => sanitizeResponseData(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(?:password|pass|token|secret|authorization|cookie)/i.test(key)) result[key] = '[REDACTED]';
    else result[key] = sanitizeResponseData(child, seen);
  }
  return result;
}

function routeFromRaw(raw) {
  return raw.replace(/^\{\{baseUrl\}\}/, '').split('?')[0];
}

function substitutePlaceholders(raw) {
  const today = new Date().toISOString().slice(0, 10);
  return raw.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    if (key === 'baseUrl') return baseUrl;
    if (/date/i.test(key)) return today;
    if (/^(?:page|pageSize|perPage|limit)$/i.test(key)) return key.toLowerCase() === 'page' ? '1' : '5';
    if (/^(?:include|active|enabled|sellable)/i.test(key)) return 'false';
    return encodeURIComponent(PLACEHOLDER_VALUES[key] || '1');
  });
}

function onlineUrlForItem(item) {
  const raw = substitutePlaceholders(requestRawUrl(item));
  const url = new URL(raw);
  for (const [key, value] of [...url.searchParams.entries()]) {
    if (value === '1' && /(?:search|status|mode|sort|order|type|employee|department|keyword|query|q)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      status: null,
      statusText: '',
      headers: {},
      data: null,
      elapsedMs: Date.now() - started,
      error: error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'Request timed out'
        : String(error?.message || error),
    };
  }
}

function responseCategory(result) {
  if (result.error) return result.error === 'Request timed out' ? 'timeout' : 'network_error';
  const message = typeof result.data === 'object' && result.data
    ? String(result.data.message || result.data.error || '')
    : String(result.data || '');
  if (result.status === 404 && /^Cannot\s+(?:GET|POST|PUT|PATCH|DELETE)\s+/i.test(message)) return 'missing_route';
  if (result.status >= 500) return 'server_error';
  if (result.status === 401 || result.status === 403) return 'auth_guard';
  if (result.status >= 400) return 'business_response';
  return 'ok';
}

function responseExample(item, result, label) {
  const headers = Object.entries(result.headers || {})
    .filter(([key]) => ['content-type', 'content-length'].includes(key.toLowerCase()))
    .map(([key, value]) => ({ key, value: String(value) }));
  const sanitized = sanitizeResponseData(result.data);
  return {
    name: `${label} - HTTP ${result.status ?? 'NO_RESPONSE'}`,
    originalRequest: clone(item.request),
    status: result.statusText || (result.error ? 'Network Error' : ''),
    code: result.status || 0,
    _postman_previewlanguage: 'json',
    header: headers,
    cookie: [],
    body: typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized, null, 2),
  };
}

function walkRequests(items, rows = [], folderName = '') {
  for (const item of items || []) {
    if (item.request) rows.push({ item, folderName });
    if (item.item) walkRequests(item.item, rows, folderName || item.name);
  }
  return rows;
}

function setLoginScript(item) {
  item.auth = { type: 'noauth' };
  item.event = (item.event || []).filter((event) => event.listen !== 'test');
  item.event.push({
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'const body = pm.response.json();',
        "if (body.accessToken) pm.collectionVariables.set('token', body.accessToken);",
      ],
    },
  });
}

async function login(route) {
  return fetchJson(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

async function runOnlineChecks(collection) {
  if (!username || !password) throw new Error('HR_ONLINE_USERNAME and HR_ONLINE_PASSWORD are required');

  const staffLogin = await login('/api/auth/login');
  const mobileLogin = await login('/api/mobile/login');
  const staffToken = staffLogin.data?.accessToken || '';
  const mobileToken = mobileLogin.data?.accessToken || '';
  if (!staffToken && !mobileToken) {
    throw new Error(`Online login failed (staff=${staffLogin.status || staffLogin.error}, mobile=${mobileLogin.status || mobileLogin.error})`);
  }

  const rows = walkRequests(collection.item);
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      const { item, folderName } = rows[index];
      const method = String(item.request.method || 'GET').toUpperCase();
      const route = routeFromRaw(requestRawUrl(item));
      let result;
      let label;

      if (method === 'POST' && route === '/api/auth/login') {
        result = staffLogin;
        label = 'Online login test (sanitized)';
        setLoginScript(item);
      } else if (method === 'POST' && route === '/api/mobile/login') {
        result = mobileLogin;
        label = 'Online mobile login test (sanitized)';
        setLoginScript(item);
      } else if (method === 'GET') {
        const token = route.startsWith('/api/mobile/') ? (mobileToken || staffToken) : (staffToken || mobileToken);
        result = await fetchJson(onlineUrlForItem(item), {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        });
        label = 'Online authenticated read test';
      } else {
        // Route/auth-guard probe only. No token and no payload means production
        // data cannot be created, edited, approved, or deleted.
        result = await fetchJson(onlineUrlForItem(item), {
          method,
          headers: { Accept: 'application/json' },
        });
        label = 'Online route and auth-guard test (no mutation payload)';
      }

      const category = responseCategory(result);
      item.response = [responseExample(item, result, label)];
      results.push({
        folder: folderName,
        method,
        route,
        httpStatus: result.status,
        category,
        elapsedMs: result.elapsedMs,
        message: result.error || (category === 'ok' ? null : String(result.data?.message || result.data?.error || '').slice(0, 180)),
      });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  results.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
  return { staffLogin, mobileLogin, results };
}

function summarize(collection, online) {
  const requests = walkRequests(collection.item);
  const byMethod = {};
  for (const { item } of requests) {
    const method = String(item.request.method || 'GET').toUpperCase();
    byMethod[method] = (byMethod[method] || 0) + 1;
  }
  const byCategory = {};
  for (const result of online.results) byCategory[result.category] = (byCategory[result.category] || 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    scope: 'Modern HR management and modern employee application only; legacy /Api routes excluded.',
    folders: collection.item.length,
    requests: requests.length,
    byMethod,
    online: {
      staffLoginStatus: online.staffLogin.status,
      mobileLoginStatus: online.mobileLogin.status,
      byCategory,
      failures: online.results.filter((row) => ['missing_route', 'server_error', 'timeout', 'network_error'].includes(row.category)),
      results: online.results,
    },
  };
}

async function main() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const collection = filterHrCollection(source);
  const online = await runOnlineChecks(collection);
  const report = summarize(collection, online);
  fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    reportPath,
    folders: report.folders,
    requests: report.requests,
    byMethod: report.byMethod,
    online: report.online.byCategory,
    failures: report.online.failures.length,
  }, null, 2));
  if (report.online.failures.length) process.exitCode = 1;
}

module.exports = {
  HR_FOLDER_NAMES,
  filterHrCollection,
  isSafeOnlineRequest,
  sanitizeResponseData,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ fatal: String(error?.message || error) }, null, 2));
    process.exitCode = 2;
  });
}
