import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const adminBase = process.env.NOAMANY_ADMIN_BASE ?? 'http://127.0.0.1:5176';
const evidenceRoot = new URL('../review/client-requirements-2026-09-09/', import.meta.url);
const fixedMonth = '2026-09';
const fixedDate = '2026-09-09';

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const branchFixtures = [
  { id: 11, name: 'فرع المعادي' },
  { id: 12, name: 'فرع التجمع' },
];

const employeeFixtures = [
  { id: 201, employee: 'كابتن أحمد سامي', emp_code: 2201, branch_id_fk: 11, mosma_wazefy_n: 'مدرب لياقة' },
  { id: 202, employee: 'سارة محمود', emp_code: 2202, branch_id_fk: 11, mosma_wazefy_n: 'موظف استقبال' },
  { id: 203, employee: 'منى إبراهيم', emp_code: 2203, branch_id_fk: 12, mosma_wazefy_n: 'مدير فرع' },
];

const templates = [
  { id: 301, role_key: 'trainer', title: 'نموذج أداء المدربين', version: 3, branch_id: null, questions: [{ id: 1, title: 'الالتزام بمواعيد الحصص', maxScore: 10 }, { id: 2, title: 'متابعة تقدم المشتركين', maxScore: 10 }] },
  { id: 302, role_key: 'reception', title: 'نموذج جودة الاستقبال', version: 2, branch_id: 11, questions: [{ id: 3, title: 'سرعة خدمة الأعضاء', maxScore: 10 }, { id: 4, title: 'دقة تسجيل البيانات', maxScore: 10 }] },
  { id: 303, role_key: 'branch_manager', title: 'نموذج قيادة الفرع', version: 4, branch_id: null, questions: [{ id: 5, title: 'تحقيق مستهدفات الفرع', maxScore: 10 }, { id: 6, title: 'متابعة فريق العمل', maxScore: 10 }] },
];

const monthlyEvaluations = [
  { id: 401, employee_id: 201, employeeName: 'كابتن أحمد سامي', employeeCode: 2201, template_id: 301, templateTitle: 'نموذج أداء المدربين', roleKey: 'trainer', month_key: fixedMonth, total_score: 18, max_score: 20, status: 'published' },
  { id: 402, employee_id: 202, employeeName: 'سارة محمود', employeeCode: 2202, template_id: 302, templateTitle: 'نموذج جودة الاستقبال', roleKey: 'reception', month_key: fixedMonth, total_score: 19, max_score: 20, status: 'published' },
];

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

function requestJson(request) {
  const text = request.postData();
  return text ? JSON.parse(text) : null;
}

function cleanApiPath(url) {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\/api/, '') || '/';
}

function targetRows(tab) {
  const shared = {
    subscriptions: [
      { id: 'sub-1', clientId: 501, clientName: 'محمد خالد', clientCode: 'M-1051', clientPhone: '01012345678', date: fixedDate, reference: 'SUB-26091', description: 'اشتراك سنوي', amount: 7200 },
      { id: 'sub-2', clientId: 502, clientName: 'أسماء علي', clientCode: 'W-2034', clientPhone: '01123456789', date: '2026-09-08', reference: 'SUB-26088', description: 'اشتراك نصف سنوي', amount: 4300 },
    ],
    private: [
      { id: 'private-1', clientId: 503, clientName: 'عمر حسام', clientCode: 'M-1140', clientPhone: '01234567890', date: fixedDate, reference: 'PT-905', description: 'باقة برايفت 12 حصة', amount: 3600 },
    ],
    sales: [
      { id: 'sale-1', clientId: 504, clientName: 'ياسمين شريف', clientCode: 'W-2115', clientPhone: '01098765432', date: fixedDate, reference: 'POS-4481', description: 'Whey Protein', amount: 1850, classification: 'protein' },
      { id: 'sale-2', clientId: 505, clientName: 'محمود طارق', clientCode: 'M-1193', clientPhone: '01512345678', date: fixedDate, reference: 'POS-4482', description: 'مشروب وطاقة بار', amount: 650, classification: 'bar' },
    ],
    classes: [
      { id: 'class-1', clientId: 506, clientName: 'دينا أحمد', clientCode: 'W-2188', clientPhone: '01055554444', date: fixedDate, reference: 'CLS-603', description: 'حصة CrossFit', amount: 300 },
    ],
  };
  return shared[tab] ?? shared.subscriptions;
}

function reportPayload(tab) {
  const rows = targetRows(tab);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    data: rows,
    total: rows.length,
    page: 1,
    pageSize: 25,
    summary: {
      count: rows.length,
      totalAmount,
      targetAmount: totalAmount,
      proteinAmount: tab === 'sales' ? 1850 : undefined,
      barAmount: tab === 'sales' ? 650 : undefined,
    },
  };
}

function subscriptionReportSummary() {
  return {
    period: { startDate: '2026-09-01', endDate: fixedDate },
    overview: { contractsCount: 14, contractsValue: 84600, subscriptionCollected: 73100, totalCollectedAllSources: 75600, remainingAmount: 11500, refundsAmount: 1200, refundsCount: 1, waiversAmount: 0, waiversCount: 0, discountedCount: 3 },
    statuses: [{ key: 'active', name: 'ساري', count: 12 }, { key: 'pending', name: 'قيد السداد', count: 2 }],
    services: [{ key: 'subscriptions', name: 'الاشتراكات', count: 14, amount: 73100 }, { key: 'private', name: 'البرايفت', count: 3, amount: 2500 }],
    payments: [{ key: 'cash', count: 9, amount: 48600 }, { key: 'card', count: 8, amount: 27000 }],
    sales: [{ id: 201, name: 'كابتن أحمد سامي', membersCount: 7, contractsCount: 8, contractsValue: 49100, collectedAmount: 45600, remainingAmount: 3500 }],
    users: [{ id: 1, name: 'مدير النظام', subscriptionsCount: 14, subscriptionsValue: 84600, receiptsCount: 17, collectedAmount: 75600 }],
    subscriptionTypes: [{ id: 1, name: 'سنوي', count: 8, value: 57600, collected: 52600 }, { id: 2, name: 'نصف سنوي', count: 6, value: 27000, collected: 20500 }],
    customerSources: [{ id: 1, name: 'ترشيح عضو', count: 8, value: 47200 }],
    trend: [{ date: '2026-09-07', subscriptions: 9800, services: 400 }, { date: '2026-09-08', subscriptions: 12600, services: 900 }, { date: fixedDate, subscriptions: 15400, services: 1200 }],
  };
}

function buildState() {
  return {
    targetPeriod: { id: 701, trainerId: 77, periodMonth: fixedMonth, periodStart: '2026-09-01', periodEnd: '2026-09-30', targetValue: 25, targetUnit: 'members', notes: 'هدف سبتمبر — متابعة أسبوعية' },
    payments: [{ id: 801, trainerId: 77, trainer: { id: 77, name: 'كابتن أحمد سامي' }, amount: 3500, paymentDate: '2026-09-05', periodFrom: '2026-09-01', periodTo: fixedDate, notes: 'دفعة تحت الحساب' }],
    permit: { id: 901, no3EznTitle: 'استئذان شخصي', date: fixedDate, fromTime: '14:00', toTime: '15:00', minutes: 60, status: 'pending', reason: 'موعد طبي', currentTo: 'مدير فرع المعادي', canAction: true },
    writes: [],
    apiCalls: [],
  };
}

async function installFixtureApi(context, state) {
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    // The glob also matches source modules such as /src/lib/api/club-events.ts.
    // Only the real HTTP API namespace is fixture-backed.
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = cleanApiPath(request.url());
    state.apiCalls.push({ method, path, query: Object.fromEntries(url.searchParams) });

    if (path === '/auth/refresh' && method === 'POST') return json(route, { accessToken: 'fixture-access-token' });
    if (path === '/auth/me') return json(route, { sub: 1, level: 1, emp_code: 2201, branch: 11, branch_name: 'فرع المعادي', man_women_type: 2, name: 'مراجع قبول النعماني', image: null, job_title: 'مدير النظام', is_trainer: false, trainer_id: null });
    if (path === '/me/permissions') return json(route, { superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} });
    if (path === '/me/workspace') return json(route, { homeRoute: '/dashboard', roleHint: 'admin', widgets: [] });
    if (path === '/me/menu' || path === '/me/nav') return json(route, []);
    if (path === '/notifications') return json(route, []);
    if (path === '/notifications/count') return json(route, 0);
    if (path === '/club/branch-options' || path === '/branches') return json(route, branchFixtures);

    if (path === '/club-trainers' && method === 'GET') return json(route, { data: [{ id: 77, name: 'كابتن أحمد سامي', employeeId: 201, specialization: 'لياقة بدنية', isActive: true }], total: 1, page: 1, pageSize: 200 });
    if (path === '/club-trainers/earning-payments' && method === 'GET') return json(route, state.payments);
    if (path === '/club-trainers/77/earnings-summary') return json(route, { earned: 11200, paid: 3500, remaining: 7700, classCommission: 6400, subscriptionCommission: 4800 });
    if (path === '/club-trainers/77/earning-payments' && method === 'POST') {
      const body = requestJson(request);
      state.writes.push({ feature: 'TGT-01', method, path, body });
      state.payments = [{ id: 802, trainerId: 77, trainer: { id: 77, name: 'كابتن أحمد سامي' }, ...body }, ...state.payments];
      return json(route, state.payments[0], 201);
    }
    if (path === '/club-trainers/77/workspace') return json(route, {
      trainer: { id: 77, name: 'كابتن أحمد سامي', employeeId: 201, specialization: 'لياقة بدنية' },
      stats: { sessions: 48, uniqueMembers: 19, achievementPct: 76, earned: 11200, paid: 3500, remaining: 7700, revenue: 28500, ratingAvg: 4.8, ratingCount: 36 },
      classes: [], payments: state.payments, ratings: [],
      activeSalary: { classCommissionPercentage: 30, subscriptionCommissionPercentage: 12 },
    });
    if (path === '/club-trainers/77/target-periods' && method === 'GET') return json(route, [state.targetPeriod]);
    if (path === `/club-trainers/77/target-periods/${fixedMonth}` && method === 'PUT') {
      const body = requestJson(request);
      state.writes.push({ feature: 'TGT-02', method, path, body });
      state.targetPeriod = { ...state.targetPeriod, ...body };
      return json(route, state.targetPeriod);
    }

    if (path === '/targets/people') return json(route, [{ id: 201, name: 'كابتن أحمد سامي', code: 2201, branchId: 11 }]);
    if (path === '/targets/report') return json(route, reportPayload(url.searchParams.get('tab') ?? 'subscriptions'));

    if (path === '/hr/evaluations/templates' && method === 'GET') return json(route, templates);
    if (path === '/hr/evaluations/templates' && method === 'POST') {
      const body = requestJson(request);
      state.writes.push({ feature: 'EVAL-01', method, path, body });
      return json(route, { id: 304, version: 1, role_key: body.roleKey, title: body.title, branch_id: body.branchId ?? null, questions: body.questions.map((question, index) => ({ id: 10 + index, ...question })) }, 201);
    }
    if (path === '/hr/evaluations/monthly' && method === 'GET') return json(route, monthlyEvaluations);
    if (path === '/hr/evaluations/monthly' && method === 'POST') {
      const body = requestJson(request);
      state.writes.push({ feature: 'EVAL-02', method, path, body });
      return json(route, { id: 403, status: 'published', ...body }, 201);
    }
    if (path === '/hr/evaluations') return json(route, { data: [], total: 0, page: 1, pageSize: 20 });
    if (path === '/employees') return json(route, { data: employeeFixtures, total: employeeFixtures.length, page: 1, pageSize: 200 });

    if (path === '/mobile/evaluations') return json(route, [{ id: 401, month_key: fixedMonth, total_score: 18, max_score: 20, status: 'published' }]);
    if (path === '/mobile/evaluations/401') return json(route, { id: 401, month_key: fixedMonth, total_score: 18, max_score: 20, status: 'published', answers: [{ questionTitle: 'الالتزام بمواعيد الحصص', score: 9, maxScore: 10, note: 'التزام ممتاز طوال الشهر' }, { questionTitle: 'متابعة تقدم المشتركين', score: 9, maxScore: 10, note: 'تقارير المتابعة مكتملة' }] });

    if (path === '/mobile/permissions' && method === 'GET') return json(route, { data: [state.permit], total: 1, page: 1, pageSize: 30 });
    if (path === '/mobile/permissions/available') return json(route, { remainMinutes: 120, remainNum: 2, usedMinutes: 60, usedCount: 1 });
    if (path === '/mobile/permissions' && method === 'POST') {
      const body = requestJson(request);
      state.writes.push({ feature: 'EVAL-04-self-create', method, path, body });
      state.permit = { ...state.permit, ...body, id: 902, no3EznTitle: 'استئذان شخصي', date: body.eznDate, fromTime: body.fromHour, toTime: body.toHour, minutes: 60, status: 'pending', currentTo: 'مدير فرع المعادي', canAction: true };
      return json(route, state.permit, 201);
    }
    if (/^\/mobile\/permissions\/\d+$/.test(path)) return json(route, { ...state.permit, ezn_date_ar: state.permit.date, from_hour: state.permit.fromTime, to_hour: state.permit.toTime, current_to_user_name: state.permit.currentTo });
    if (path === '/permissions' && method === 'GET') return json(route, { data: [state.permit], total: 1, page: 1, pageSize: 20 });
    if (/^\/permissions\/\d+\/approve$/.test(path) && method === 'POST') {
      state.writes.push({ feature: 'EVAL-04-admin-approve', method, path, body: null });
      state.permit = { ...state.permit, status: 'approved', canAction: false, currentTo: 'تم الاعتماد' };
      return json(route, state.permit);
    }
    if (path === '/permissions/available') return json(route, { remainMinutes: 120, remainNum: 2, usedMinutes: 60, usedCount: 1 });

    if (path === '/users/45/permissions' && method === 'GET') return json(route, {
      userId: 45,
      username: 'reception.maadi.women',
      fullName: 'سارة محمود — استقبال حريمي',
      permissions: ['1001', '1002'],
      scope: { branchId: 11, gender: 'female', editable: true },
      tree: [{ id: 1001, title: 'الأعضاء', link: '/club/members', children: [{ id: 1002, title: 'عرض الأعضاء', link: '/club/members', children: [] }] }, { id: 1003, title: 'تقارير الاشتراكات', link: '/club/subscriptions/reports', children: [] }],
    });
    if (path === '/users/45/permissions' && method === 'PUT') {
      const body = requestJson(request);
      state.writes.push({ feature: 'SCOPE-03', method, path, body });
      return json(route, { ok: true });
    }

    if (path === '/club-subscription-types') return json(route, [{ id: 1, name: 'سنوي' }, { id: 2, name: 'نصف سنوي' }]);
    if (path === '/employees/sales-reps') return json(route, [{ id: 201, name: 'كابتن أحمد سامي', empCode: 2201 }]);
    if (path === '/club-customer-sources') return json(route, [{ id: 1, name: 'ترشيح عضو' }]);
    if (path === '/club-subscriptions/reports/summary') return json(route, subscriptionReportSummary());
    if (path === '/club-subscriptions/reports/details') return json(route, { data: [], total: 0, page: 1, pageSize: 10 });

    if (path === '/club-members/next-code') return json(route, { memberCode: 'M-260901' });
    if (path === '/club-members/statistics') return json(route, { total: 1250, active: 1184, inactive: 66 });
    if (path === '/club-membership-types') return json(route, [{ id: 1, name: 'عضوية أساسية' }]);
    if (path === '/club-members' && method === 'GET') return json(route, { data: [], total: 0, page: 1, pageSize: 20 });
    if (path === '/club-attendance/statistics') return json(route, { total: 0, checkedIn: 0, checkedOut: 0 });
    if (path.startsWith('/club-attendance')) return json(route, { data: [], total: 0, page: 1, pageSize: 20 });

    // Ancillary shell/list queries are intentionally isolated too. No API request in this
    // harness is allowed to reach the real backend.
    if (method === 'GET') return json(route, path.includes('statistics') ? {} : { data: [], total: 0, page: 1, pageSize: 20 });
    state.writes.push({ feature: 'UNEXPECTED', method, path, body: requestJson(request) });
    return json(route, { ok: true });
  });
}

async function openFixturePage(browser, id, viewportName, route, runJourney) {
  const state = buildState();
  const context = await browser.newContext({ viewport: viewports[viewportName], locale: 'ar-EG', timezoneId: 'Africa/Cairo', colorScheme: 'light', reducedMotion: 'reduce' });
  await installFixtureApi(context, state);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badModules = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const contentType = response.headers()['content-type'] ?? '';
    if (response.url().includes('/src/') && contentType.includes('application/json')) badModules.push(response.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem('one80_locale', 'ar');
    localStorage.setItem('one80.sidebar.collapsed', '1');
    localStorage.setItem('one80.onboarding.members.v1.user-1', 'done');
  });
  await page.goto(`${adminBase}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1_200);
  if (!(await page.locator('body').innerText()).trim() || pageErrors.some((message) => message.includes('dynamically imported module'))) {
    // Vite can return a transient JSON transform response while another workspace
    // process invalidates a large lazy chunk. A single reload reads the completed
    // transform; this is not a retry of feature behavior or an API write.
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await page.locator('main').last().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(250);
  try {
    await runJourney(page, state, viewportName);
  } catch (error) {
    const debugPath = `/tmp/noamany-${id}-${viewportName}-acceptance-debug.png`;
    await page.screenshot({ path: debugPath, fullPage: false });
    process.stderr.write(`DEBUG ${id}/${viewportName} url=${page.url()} screenshot=${debugPath}\nbadModules=${badModules.join(' | ')}\nconsole=${consoleErrors.join(' | ')}\npageErrors=${pageErrors.join(' | ')}\n${(await page.locator('body').innerText()).slice(0, 3000)}\n`);
    throw error;
  }
  await page.waitForTimeout(250);
  assert(!page.url().includes('/login'), `${id}/${viewportName} redirected to login`);
  assert.equal(pageErrors.length, 0, `${id}/${viewportName} page errors: ${pageErrors.join(' | ')}`);
  const fatalConsole = consoleErrors.filter((message) => !message.includes('favicon'));
  assert.equal(fatalConsole.length, 0, `${id}/${viewportName} console errors: ${fatalConsole.join(' | ')}`);
  const body = await page.locator('body').innerText();
  assert(!/تعذر تحميل|حدث خطأ|غير مرتبط بموظف/.test(body), `${id}/${viewportName} contains a failure state`);
  const targetDir = new URL(`${id}/`, evidenceRoot);
  await mkdir(targetDir, { recursive: true });
  const screenshot = new URL(`${id}/${viewportName}.png`, evidenceRoot);
  await page.screenshot({ path: screenshot.pathname, fullPage: false });
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(dimensions.scrollWidth <= dimensions.viewport, `${id}/${viewportName} horizontal overflow ${dimensions.scrollWidth} > ${dimensions.viewport}`);
  await context.close();
  return { id, viewport: viewportName, route, writes: state.writes, apiCalls: state.apiCalls, dimensions };
}

const scenarios = [
  {
    id: 'TGT-01', route: '/club/fitness/trainer-payments',
    run: async (page, state) => {
      await page.getByRole('heading', { name: 'مستحقات المدربين' }).waitFor();
      await page.getByRole('button', { name: /تسجيل صرف/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('المكتسب', { exact: false }).waitFor();
      await dialog.locator('input').last().fill('تسوية مستحقات سبتمبر');
      await dialog.locator('input[type="number"]').focus();
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByText('تم تسجيل المبلغ المصروف للمدرب').waitFor();
      await page.getByText('تسوية مستحقات سبتمبر').waitFor();
      assert(state.writes.some((item) => item.feature === 'TGT-01'));
    },
  },
  {
    id: 'TGT-02', route: `/club/fitness/trainers/77?tab=target`,
    run: async (page, state) => {
      await page.getByText('التارجت والعمولات', { exact: true }).last().waitFor();
      await page.locator('#trainer-target-value').fill('30');
      await page.locator('#trainer-target-notes').fill('هدف سبتمبر المراجع أسبوعيًا');
      await page.getByRole('button', { name: 'تحديث تارجت الشهر' }).click();
      await page.getByText('تم تحديث تارجت الشهر').waitFor();
      assert.equal(state.writes.find((item) => item.feature === 'TGT-02')?.body.targetValue, 30);
      await page.getByText('سجل التارجت الشهري').scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'TGT-03', route: '/club/targets?tab=subscriptions',
    run: async (page, state, viewportName) => {
      await page.getByRole('heading', { name: 'تقرير التارجت الموحد' }).waitFor();
      const memberName = page.getByText('محمد خالد', { exact: true });
      await (viewportName === 'mobile' ? memberName.last() : memberName.first()).waitFor();
      assert((await page.locator('body').innerText()).includes('M-1051'));
      if (viewportName === 'mobile') await memberName.last().scrollIntoViewIfNeeded();
      assert(state.apiCalls.some((call) => call.path === '/targets/report' && call.query.tab === 'subscriptions'));
    },
  },
  {
    id: 'TGT-04', route: '/club/targets?tab=sales',
    run: async (page, state, viewportName) => {
      await page.getByRole('tab', { name: 'المبيعات' }).waitFor();
      await page.getByText('Protein / Bar', { exact: true }).waitFor();
      const protein = page.getByText('Whey Protein', { exact: false });
      const bar = page.getByText('مشروب وطاقة بار', { exact: false });
      await (viewportName === 'mobile' ? protein.last() : protein.first()).waitFor();
      await (viewportName === 'mobile' ? bar.last() : bar.first()).waitFor();
      if (viewportName === 'mobile') await protein.last().scrollIntoViewIfNeeded();
      assert(state.apiCalls.some((call) => call.path === '/targets/report' && call.query.tab === 'sales'));
    },
  },
  {
    id: 'EVAL-01', route: '/hr/evaluations?tab=criteria',
    run: async (page) => {
      await page.getByRole('heading', { name: 'إدارة التقييمات' }).waitFor();
      await page.getByText('نموذج أداء المدربين').waitFor();
      await page.getByText('نموذج جودة الاستقبال').waitFor();
      await page.getByText('نموذج قيادة الفرع').waitFor();
    },
  },
  {
    id: 'EVAL-02', route: '/hr/evaluations?tab=report',
    run: async (page, state) => {
      await page.getByRole('tab', { name: 'التقارير' }).waitFor();
      await page.getByText('كابتن أحمد سامي', { exact: true }).waitFor();
      await page.getByText('سارة محمود', { exact: true }).waitFor();
      assert(state.apiCalls.some((call) => call.path === '/hr/evaluations/monthly' && call.query.monthKey === fixedMonth));
    },
  },
  {
    id: 'EVAL-03', route: '/me/evaluations',
    run: async (page) => {
      await page.getByRole('heading', { name: 'تقييماتي' }).waitFor();
      await page.getByText(`تقييم شهر ${fixedMonth}`).click();
      await page.getByRole('heading', { name: 'تفاصيل التقييم' }).waitFor();
      await page.getByText('الالتزام بمواعيد الحصص').waitFor();
      await page.getByText('18 / 20', { exact: false }).waitFor();
    },
  },
  {
    id: 'EVAL-04', route: '/me/permissions',
    run: async (page, state, viewportName) => {
      await page.getByRole('heading', { name: 'أذوناتي' }).waitFor();
      if (viewportName === 'desktop') {
        await page.goto(`${adminBase}/permissions`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: 'الأذونات' }).waitFor();
        await page.getByRole('button', { name: /اعتماد/ }).click();
        await page.getByText('تم اعتماد الإذن').waitFor();
        await page.getByText('مقبول').first().waitFor();
        assert(state.writes.some((item) => item.feature === 'EVAL-04-admin-approve'));
      } else {
        state.permit = { ...state.permit, status: 'approved', canAction: false, currentTo: 'تم الاعتماد' };
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: 'أذوناتي' }).waitFor();
        await page.getByText('مقبول').click();
        await page.getByRole('heading', { name: 'تفاصيل طلب الإذن' }).waitFor();
        await page.getByText('موعد طبي').waitFor();
      }
    },
  },
  {
    id: 'SCOPE-01', route: '/club/members',
    run: async (page, _state, viewportName) => {
      const newMember = page.getByRole('button', { name: /عضو جديد|إضافة عضو/ }).first();
      await newMember.waitFor();
      await newMember.click();
      await page.getByRole('dialog').waitFor();
      const selects = page.getByRole('dialog').locator('select');
      await selects.nth(0).selectOption('11');
      const textInputs = page.getByRole('dialog').locator('input');
      await textInputs.nth(1).fill('عضو قبول تجريبي');
      await textInputs.nth(2).fill('01012345678');
      await selects.nth(1).selectOption(viewportName === 'mobile' ? 'female' : 'male');
      assert.equal(await textInputs.nth(1).inputValue(), 'عضو قبول تجريبي');
      assert.equal(await textInputs.nth(2).inputValue(), '01012345678');
      assert.equal(await selects.nth(1).inputValue(), viewportName === 'mobile' ? 'female' : 'male');
      if (viewportName === 'mobile') await selects.nth(1).scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'SCOPE-02', route: '/club/subscriptions/reports',
    run: async (page, state) => {
      await page.getByRole('heading', { name: 'تقارير الاشتراكات' }).waitFor();
      const branchSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'فرع المعادي' }) }).first();
      await branchSelect.selectOption('11');
      await page.getByLabel('القسم').selectOption('female');
      await page.waitForTimeout(300);
      assert(state.apiCalls.some((call) => call.path === '/club-subscriptions/reports/summary' && (call.query.branch === '11' || call.query.branchId === '11')));
      assert(state.apiCalls.some((call) => call.path === '/club-subscriptions/reports/summary' && call.query.gender === 'female'));
      await branchSelect.scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'SCOPE-03', route: '/users/45/permissions',
    run: async (page, state) => {
      await page.getByRole('heading', { name: 'صلاحيات المستخدم' }).waitFor();
      await page.locator('#user-scope-branch').selectOption('11');
      await page.locator('#user-scope-gender').selectOption('female');
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByText('تم حفظ الصلاحيات').waitFor();
      const write = state.writes.find((item) => item.feature === 'SCOPE-03');
      assert.deepEqual(write?.body.scope, { branchId: 11, gender: 'female' });
    },
  },
];

const browser = await chromium.launch({ headless: true });
const results = [];
const selectedIds = new Set((process.env.NOAMANY_ACCEPTANCE_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
try {
  for (const scenario of scenarios.filter((item) => selectedIds.size === 0 || selectedIds.has(item.id))) {
    for (const viewportName of Object.keys(viewports)) {
      results.push(await openFixturePage(browser, scenario.id, viewportName, scenario.route, scenario.run));
      process.stdout.write(`PASS ${scenario.id}/${viewportName}\n`);
    }
  }
} finally {
  await browser.close();
}

let consolidatedResults = results;
if (selectedIds.size > 0) {
  try {
    const previous = JSON.parse(await readFile(new URL('ui-acceptance-targets-eval.json', evidenceRoot), 'utf8'));
    const retained = (previous.scenarios ?? []).filter((item) => !selectedIds.has(item.id));
    consolidatedResults = [...retained, ...results].sort((a, b) => {
      const idOrder = scenarios.findIndex((scenario) => scenario.id === a.id) - scenarios.findIndex((scenario) => scenario.id === b.id);
      return idOrder || (a.viewport === 'desktop' ? -1 : 1);
    });
  } catch {
    // A focused first run has no previous consolidated report to merge.
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  source: 'Playwright against the real Noamany frontend with all /api requests intercepted by deterministic in-memory fixtures',
  destructive: false,
  adminBase,
  scenarios: consolidatedResults,
};
await writeFile(new URL('ui-acceptance-targets-eval.json', evidenceRoot), `${JSON.stringify(report, null, 2)}\n`);
for (const scenario of scenarios.filter((item) => selectedIds.size === 0 || selectedIds.has(item.id))) {
  const scenarioResults = results.filter((item) => item.id === scenario.id);
  await writeFile(
    new URL(`${scenario.id}/api.json`, evidenceRoot),
    `${JSON.stringify({
      requirement: scenario.id,
      fixtureIntercepted: true,
      realBackendReached: false,
      note: 'Generated by capture-ui-acceptance-targets-eval.mjs; request traces come from the real frontend talking to deterministic in-memory Playwright responses.',
      viewports: scenarioResults.map(({ viewport, route, writes, apiCalls, dimensions }) => ({ viewport, route, writes, apiCalls, dimensions })),
    }, null, 2)}\n`,
  );
}
process.stdout.write(`Captured ${results.length} acceptance screenshots with intercepted fixtures; no real API writes.\n`);
