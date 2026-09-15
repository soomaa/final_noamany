/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = (process.env.ONLINE_BASE_URL || 'https://final.noamanycenter.com').replace(/\/$/, '');
const phone = process.env.ONLINE_PHONE;
const password = process.env.ONLINE_PASSWORD;
const timeoutMs = Number(process.env.ONLINE_TIMEOUT_MS || 30000);
const root = path.resolve(__dirname, '..', '..');
const collectionPath = path.join(
  root,
  'release',
  'noamany-flutter-api-handoff-20260817',
  'NOAMANY_FLUTTER_COMPLETE.postman_collection.json',
);

if (!phone || !password) {
  throw new Error('ONLINE_PHONE and ONLINE_PASSWORD are required');
}

const results = [];
let accessToken = '';

async function http(method, route, { json, form, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(Object.entries(form).map(([key, value]) => [key, String(value)]));
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function check(name, method, route, options = {}, legacy = false) {
  const started = Date.now();
  try {
    const response = await http(method, route, options);
    const logicalStatus = legacy && Number.isFinite(Number(response.data?.status))
      ? Number(response.data.status)
      : null;
    const serverError = response.status >= 500 || (logicalStatus != null && logicalStatus >= 500);
    const authError = response.status === 401 || response.status === 403;
    const businessError = response.status >= 400 || (logicalStatus != null && logicalStatus >= 400);
    const category = serverError
      ? 'server_error'
      : authError
        ? 'auth_error'
        : businessError
          ? 'business_error'
          : 'ok';
    results.push({
      name,
      method,
      route,
      httpStatus: response.status,
      logicalStatus,
      category,
      elapsedMs: Date.now() - started,
      message: category === 'ok' ? null : String(response.data?.message || response.data?.error || '').slice(0, 180),
    });
    return response;
  } catch (error) {
    results.push({
      name,
      method,
      route,
      httpStatus: null,
      logicalStatus: null,
      category: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_error',
      elapsedMs: Date.now() - started,
      message: String(error?.message || error),
    });
    return null;
  }
}

function flatten(items, rows = []) {
  for (const item of items || []) {
    if (item.request) rows.push(item);
    flatten(item.item, rows);
  }
  return rows;
}

function rawUrl(item) {
  const value = typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '';
  return value.replace(/^\{\{baseUrl\}\}/, '').split('?')[0];
}

function swaggerMatches(collectionRoute, swaggerRoute) {
  const expected = collectionRoute.split('/').filter(Boolean);
  const actual = swaggerRoute.split('/').filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => {
    const dynamic = /^\{\{[^}]+\}\}$/.test(segment) || /^:[A-Za-z0-9_]+$/.test(segment);
    return dynamic || segment === actual[index] || /^\{[^}]+\}$/.test(actual[index]);
  });
}

async function main() {
  const login = await check('Modern login', 'POST', '/api/mobile/login', {
    auth: false,
    json: { username: phone, password },
  });
  accessToken = login?.data?.accessToken || '';
  if (!accessToken) throw new Error('Online login did not return accessToken');

  await check('getAppinfo', 'POST', '/Api/getAppinfo', { auth: false }, true);
  await check('getAppPolicy', 'POST', '/Api/getAppPolicy', { auth: false }, true);
  await check('SplashScreens', 'POST', '/Api/SplashScreens', { auth: false }, true);
  await check('Check_Option', 'POST', '/Api/Check_Option', {
    auth: false,
    form: { emp_option: 'mob', emp_value: phone },
  }, true);

  const modernReads = [
    '/api/mobile/profile',
    '/api/mobile/notifications',
    '/api/mobile/leaves',
    '/api/mobile/permissions?page=1&pageSize=20',
    '/api/mobile/tasks?page=1&perPage=20',
    '/api/mobile/circulars?page=1&perPage=20',
    '/api/mobile/warnings?page=1&perPage=20',
    '/api/mobile/requests',
    '/api/mobile/legal-files?page=1&perPage=20',
    '/api/mobile/activities?page=1&perPage=20',
    '/api/mobile/employees?page=1&perPage=100',
    '/api/mobile/messages/inbox?page=1&perPage=20',
    '/api/mobile/messages/sent?page=1&perPage=20',
    '/api/mobile/loans/meta',
    '/api/mobile/loans?mode=sader&page=1&perPage=20',
    '/api/mobile/loans?mode=wared&page=1&perPage=20',
  ];
  for (const route of modernReads) await check(route, 'GET', route);

  const today = new Date().toISOString().slice(0, 10);
  const legacyReads = [
    ['getProfile', {}], ['today_notification', {}], ['Agazat_types', {}],
    ['Get_agaza_List', { status: 'sader', page: 1 }], ['Ozonat_types', {}],
    ['Get_Ezn_List', { status: 'sader', page: 1 }], ['Get_Wared_Ezn_List', { status: 'wared', page: 1 }],
    ['Get_Tasks_List', { page: 1 }], ['Get_ta3mem_list', { page: 1 }],
    ['Get_Enzarat_list', { page: 1 }], ['Get_lawa2h_list', { page: 1 }],
    ['AllEmplyees', { page: 1, per_page: 100 }], ['InboxMessages', { page: 1 }],
    ['SentMessages', { page: 1 }], ['AppServices', {}], ['Months_List', {}],
    ['Get_mosalat_list', { page: 1 }], ['Ntaqat_types', {}], ['Get_emp_ntaq', {}],
    ['Talabat_types', {}], ['Get_emp_ehsaeyat', {}], ['Get_mangar_ehsaeyat', {}],
    ['Get_Talabat_List', { page: 1 }], ['Get_Mobadarat_List', { page: 1 }],
    ['Get_Nashat_List', { page: 1 }], ['get_employee_visits', { page: 1 }],
    ['All_sliders', {}], ['get_branches', {}], ['Solaf_meta', {}],
    ['Get_Solaf_List', { status: 'sader', page: 1 }], ['Basma_Today', {}],
    ['Report_Basma', { date_from: today, date_to: today }], ['sheft_types', {}],
    ['dwam_types', { page: 1 }], ['Report_hours_edafi', {}], ['report_tabdel_sheft', {}],
  ];
  for (const [endpoint, form] of legacyReads) {
    await check(endpoint, 'POST', `/Api/${endpoint}`, { form }, true);
  }

  const docs = await http('GET', '/api/docs-json');
  const swaggerDocument = docs.data?.paths ? docs.data : docs.data?.data?.paths ? docs.data.data : null;
  const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
  const requests = flatten(collection.item);
  const swaggerPaths = Object.entries(swaggerDocument?.paths || {});
  const routeCoverage = swaggerDocument ? requests.map((item) => {
      const route = rawUrl(item);
      const method = String(item.request.method || 'GET').toLowerCase();
      const match = swaggerPaths.find(([swaggerRoute, operations]) =>
        swaggerMatches(route, swaggerRoute) && Boolean(operations?.[method]));
      return { name: item.name, method: method.toUpperCase(), route, documentedOnline: Boolean(match) };
    }) : [];
  const undocumented = routeCoverage.filter((row) => !row.documentedOnline);
  const byCategory = results.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1;
    return acc;
  }, {});
  const serverFailures = results.filter((row) => ['server_error', 'timeout', 'network_error'].includes(row.category));

  console.log(JSON.stringify({
    testedAt: new Date().toISOString(),
    baseUrl,
    loginUser: phone,
    liveReadChecks: { total: results.length, byCategory, serverFailures },
    onlineDocumentationCoverage: {
      available: Boolean(swaggerDocument),
      note: swaggerDocument ? null : 'The production /api/docs-json URL is intercepted by the /Api compatibility dispatcher.',
      collectionRequests: requests.length,
      documentedOnline: swaggerDocument ? routeCoverage.length - undocumented.length : null,
      undocumentedCount: swaggerDocument ? undocumented.length : null,
      undocumented,
    },
    results,
  }, null, 2));
  if (serverFailures.length || (swaggerDocument && undocumented.length)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: String(error?.message || error) }, null, 2));
  process.exitCode = 2;
});
