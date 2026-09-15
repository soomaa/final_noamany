/**
 * Non-destructive visual acceptance harness for the migrated Noamany surfaces.
 *
 * It never contacts the database: every /api request is intercepted and fulfilled
 * with deterministic, representative data.  The script is deliberately kept out
 * of the product bundle so it can double as repeatable client-evidence capture.
 *
 * Run while the frontend dev server is up:
 *   node scripts/capture-populated-acceptance.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const adminBase = process.env.NOAMANY_ADMIN_URL ?? 'http://127.0.0.1:5176';
const evidenceRoot = new URL('../review/client-requirements-2026-09-09/', import.meta.url);
const missingRequests = new Set();
const now = '2026-09-09T10:30:00.000Z';
const branch = { id: 7, name: 'فرع النعماني الرئيسي', nameAr: 'فرع النعماني الرئيسي', nameEn: 'Noamany Main', status: 'active' };
const user = { sub: 1, level: 1, emp_code: 1001, branch: 7, branch_name: branch.name, man_women_type: -1, name: 'مدير النعماني', image: null, job_title: 'مدير النظام', is_trainer: false, trainer_id: null };
const product = (id, name, classification, price, stock) => ({
  id, productCode: `CAF-${id}`, name, categoryId: classification === 'protein' ? 10 : 20,
  categoryName: classification === 'protein' ? 'Protein' : 'Bar', productType: 'ready',
  businessClassification: classification, inventoryProductId: id + 100, sellPrice: price,
  cost: Math.round(price * .46 * 100) / 100, profit: Math.round(price * .54 * 100) / 100,
  marginPercentage: 54, imageUrl: null, isActive: true, recipeCount: 2, variantCount: 0,
  variants: [], currentStock: stock, createdAt: now, updatedAt: now,
});
const products = [product(1, 'بروتين شيك فانيليا', 'protein', 135, 24), product(2, 'بار طاقة بالشوكولاتة', 'bar', 75, 18), product(3, 'مياه معدنية', 'bar', 18, 52)];
const categories = [
  { id: 10, nameAr: 'Protein', nameEn: 'Protein', emoji: '🥤', sortOrder: 1, isActive: true, parent: null, createdAt: now, updatedAt: now },
  { id: 20, nameAr: 'Bar', nameEn: 'Bar', emoji: '🍫', sortOrder: 2, isActive: true, parent: null, createdAt: now, updatedAt: now },
];
const report = {
  totalSales: 18640, totalOrders: 186, averageOrderValue: 100.22, netRevenue: 17320,
  previousRevenue: 15200, revenueGrowth: 13.95, totalDiscounts: 420, totalTaxes: 900,
  totalRefunds: 120, wasteCost: 240, grossProfit: 8120, materialsCost: 8960,
  materialsCostPercentage: 51.73, settledAccountsRevenue: 1220, uncollectedAccountsValue: 0,
  paymentSummary: { collected: 17320, outstanding: 0, total: 17320, payments: [
    { key: 'cash', label: 'نقدي', amount: 9500 }, { key: 'card', label: 'بطاقة', amount: 5520 }, { key: 'wallet', label: 'محفظة', amount: 2300 },
  ] },
  sectionBreakdown: {
    protein: { quantity: 92, billed: 12420, collected: 12420, cost: 5840, profit: 6580 },
    bar: { quantity: 94, billed: 6220, collected: 4900, cost: 3120, profit: 1780 },
    managementWithdrawals: [{ id: 501, reference: 'صرف الإدارة — فعالية سبتمبر', date: now, status: 'approved', amount: 640, reason: 'ضيافة فعالية الأعضاء', items: [{ name: 'بار طاقة بالشوكولاتة', quantity: 8, cost: 600 }, { name: 'مياه معدنية', quantity: 2, cost: 40 }] }],
  },
  products: {
    soldSummary: [{ productId: 1, name: products[0].name, quantity: 92, revenue: 12420, cost: 5840, profit: 6580, orders: 92 }],
    soldTotals: { items: 3, quantity: 186, revenue: 18640, cost: 8960, profit: 8120, orders: 186 },
    shifts: [{ sessionId: 71, label: 'وردية صباحية — 09 سبتمبر' }],
    bestSelling: [{ productId: 1, name: products[0].name, quantity: 92, revenue: 12420, cost: 5840, profit: 6580, orders: 92 }],
    worstSelling: [{ productId: 3, name: products[2].name, quantity: 14, revenue: 252, cost: 90, profit: 162, orders: 14 }],
    highestRevenue: [{ productId: 1, name: products[0].name, quantity: 92, revenue: 12420, cost: 5840, profit: 6580, orders: 92 }],
    lowestRevenue: [{ productId: 3, name: products[2].name, quantity: 14, revenue: 252, cost: 90, profit: 162, orders: 14 }], neverSold: [],
  },
  time: { byHour: [{ hour: 10, label: '10:00', orders: 28, sales: 3100 }, { hour: 18, label: '18:00', orders: 41, sales: 4860 }], byDay: [{ date: '2026-09-09', orders: 186, sales: 18640 }], byWeek: [], byMonth: [{ label: 'سبتمبر', orders: 186, sales: 18640 }], byWeekday: [{ day: 2, name: 'الثلاثاء', orders: 186, sales: 18640 }], rushHours: [{ label: '18:00', sales: 4860 }], quietHours: [{ label: '10:00', sales: 3100 }] },
  customers: { averageBasketSize: 1.7, returningCustomers: 72, newCustomers: 34, highestSpending: [{ name: 'محمد السيد', phone: '01000000000', orders: 9, spend: 1220 }], ratings: [{ rating: 5, comment: 'خدمة ممتازة', date: now, invoiceId: 1001 }], averageRating: 4.8 },
  employees: [{ userId: 11, name: 'أحمد مبيعات', orders: 78, sales: 8120, discounts: 220, refunds: 0, averageInvoice: 104 }],
  inventory: { lowStock: [{ productId: 2, name: products[1].name, stock: 18, reorderPoint: 25 }], fastMoving: [], slowMoving: [], nearExpiration: [], waste: { totalCost: 240, manualCost: 240, automaticCost: 0, transactionCount: 1, topItems: [{ productId: 2, name: products[1].name, quantity: 3, cost: 240, unit: 'قطعة' }], recent: [{ id: 41, reference: 'هالك-41', invoiceNumber: 'W-41', date: now, amount: 240, reason: 'تلف تغليف' }] } },
  insights: ['Protein حقق هامشًا أعلى من Bar خلال الفترة المحددة.', 'راجع حد إعادة طلب بار الطاقة قبل نهاية الوردية.'],
};
const subscriptions = {
  period: { startDate: '2026-09-01', endDate: '2026-09-09' },
  overview: { contractsCount: 36, contractsValue: 52100, subscriptionCollected: 46500, totalCollectedAllSources: 49500, remainingAmount: 5600, refundsAmount: 450, refundsCount: 1, waiversAmount: 200, waiversCount: 1, discountedCount: 5 },
  statuses: [{ key: 'active', name: 'ساري', count: 31 }, { key: 'expired', name: 'منتهي', count: 3 }, { key: 'frozen', name: 'مجمّد', count: 2 }],
  services: [{ key: 'gym', name: 'اشتراكات الجيم', count: 31, amount: 42100 }, { key: 'locker', name: 'اشتراكات اللوكر', count: 5, amount: 10000 }],
  payments: [{ key: 'cash', count: 18, amount: 28600 }, { key: 'card', count: 12, amount: 17900 }],
  users: [{ id: 11, name: 'أحمد مبيعات', subscriptionsCount: 21, subscriptionsValue: 28700, receiptsCount: 19, collectedAmount: 27000 }, { id: 12, name: 'سارة مبيعات', subscriptionsCount: 15, subscriptionsValue: 23400, receiptsCount: 14, collectedAmount: 22500 }],
  subscriptionTypes: [{ id: 1, name: 'اشتراك سنوي', count: 20, value: 34000, collected: 31500 }, { id: 2, name: 'اشتراك شهري', count: 16, value: 18100, collected: 15000 }],
  customerSources: [{ id: 1, name: 'تجديد', count: 12, value: 18600 }],
  sales: [{ id: 11, name: 'أحمد مبيعات', membersCount: 20, contractsCount: 21, contractsValue: 28700, collectedAmount: 27000, remainingAmount: 1700 }, { id: 12, name: 'سارة مبيعات', membersCount: 14, contractsCount: 15, contractsValue: 23400, collectedAmount: 22500, remainingAmount: 3900 }],
  trend: [{ date: '2026-09-07', subscriptions: 13200, services: 2000 }, { date: '2026-09-08', subscriptions: 15800, services: 1800 }, { date: '2026-09-09', subscriptions: 20500, services: 2200 }],
  monthlyAnalysis: { period: { startDate: '2026-09-01', endDate: '2026-09-30', label: 'سبتمبر 2026' }, scope: { branchIds: [7], audience: null, sharedBranchExpenses: false }, revenues: [{ key: 'subscriptions', label: 'تحصيل الاشتراكات', amount: 49500 }], expenses: [{ key: 'commissions', label: 'عمولات المبيعات', amount: 4500 }], netProfit: { label: 'صافي الربح', amount: 45000 } },
};
const dailyClose = { date: '2026-09-09', branchId: 7, audience: null, state: 'open', summary: { subscriptionsCount: 36, contractsValue: 52100, subscriptionPaid: 46500, remainingAmount: 5600, receiptsCount: 33, expectedAmount: 49500 }, latest: null, history: [] };
const lockers = [{ id: 91, locker_number: 'A-101', main_branch_id: 7, is_available: true }, { id: 92, locker_number: 'A-102', main_branch_id: 7, is_available: false }];
const draftSession = { id: 301, branch_id: 7, inventory_date: '2026-09-09', status: 'draft', notes: 'جرد أول الوردية' };
const finalizedSession = { id: 302, branch_id: 7, inventory_date: '2026-09-08', status: 'finalized', notes: 'بانتظار اعتماد المدير' };
const sessionDetail = (session) => ({ ...session, totals: { counted: 2, differences: 1 }, lines: [
  { id: 1, locker_id: 91, lockerNumber: 'A-101', expected_status: 'available', actual_status: 'available', notes: 'مطابق', hasDifference: false },
  { id: 2, locker_id: 92, lockerNumber: 'A-102', expected_status: 'occupied', actual_status: 'damaged', notes: 'قفل يحتاج صيانة', hasDifference: true },
] });

function responseFor(url) {
  const path = url.pathname.replace(/^\/api/, '');
  if (path === '/auth/refresh') return { accessToken: 'fixture-token' };
  if (path === '/auth/me') return user;
  if (path === '/me/permissions') return { superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} };
  if (path === '/me/nav') return [];
  if (path === '/me/workspace') return { homeRoute: '/dashboard', roleHint: 'مدير النظام', widgets: [] };
  if (path === '/club/branch-options' || path === '/branches') return [branch];
  if (path === '/categories') return { data: categories, total: categories.length, page: 1, pageSize: 500 };
  if (path === '/cafe-products') return { data: products, total: products.length, page: 1, pageSize: 100 };
  if (path === '/cafe-products/partners/list') return [{ id: 1, partnerCode: 'PART-01', name: 'شركة النعماني', phone: '01000000000', phones: [{ phone: '01000000000' }], isActive: true }];
  if (path === '/quick-sales/customers/lookup') return { found: false, name: null, phone: '' };
  if (path === '/pos-settings/general') return [{ key: 'enable_tax', value: true }, { key: 'tax_rate', value: 14 }, { key: 'default_discount_percentage', value: 5 }, { key: 'employee_discount_enabled', value: true }];
  if (path === '/pos-invoice-templates') return { data: [], total: 0, page: 1, pageSize: 50 };
  if (path === '/pos-payment-methods') return { data: [{ id: 1, name: 'نقدي', code: 'cash', baseMethod: 'cash', isEnabled: true, supportsMixedPayment: true, requiresReference: false }, { id: 2, name: 'بطاقة', code: 'card', baseMethod: 'card', isEnabled: true, supportsMixedPayment: true, requiresReference: false }], total: 2, page: 1, pageSize: 100 };
  if (path === '/products') return { data: [{ id: 101, nameAr: 'بار طاقة بالشوكولاتة', unitOfMeasure: 'piece' }, { id: 102, nameAr: 'مياه معدنية', unitOfMeasure: 'piece' }], total: 2, page: 1, pageSize: 250 };
  if (path === '/cafe-products/reports/summary') return report;
  if (path === '/club-subscription-types') return [{ id: 1, name: 'اشتراك سنوي' }, { id: 2, name: 'اشتراك شهري' }];
  if (path === '/employees/sales-reps') return [{ id: 11, name: 'أحمد مبيعات' }, { id: 12, name: 'سارة مبيعات' }];
  if (path === '/club-customer-sources') return [{ id: 1, name: 'تجديد' }];
  if (path === '/club-subscriptions/reports/summary') return subscriptions;
  if (path === '/club-subscriptions/reports/monthly-analysis') return subscriptions.monthlyAnalysis;
  if (path === '/club-subscriptions/reports/daily-close') return dailyClose;
  if (path === '/club-subscriptions/reports/details') return { data: [], total: 0, page: 1, pageSize: 10 };
  if (path === '/club-lockers') return lockers;
  if (path === '/club-lockers/inventory') return url.searchParams.get('status') === 'finalized' ? [finalizedSession] : url.searchParams.get('status') === 'draft' ? [draftSession] : [draftSession, finalizedSession];
  if (/^\/club-lockers\/inventory\/\d+$/.test(path)) return sessionDetail(path.endsWith('302') ? finalizedSession : draftSession);
  if (path === '/targets/people') return [{ id: 11, name: 'أحمد مبيعات', code: 1101, branchId: 7 }];
  if (path === '/targets/report') return { data: [
    { id: 'protein-1', clientId: 101, clientName: 'محمد السيد', clientCode: 'M-101', clientPhone: '01000000000', date: '2026-09-09', reference: 'CAF-1001', description: 'بروتين شيك فانيليا', amount: 135, classification: 'protein' },
    { id: 'bar-1', clientId: 102, clientName: 'سارة محمد', clientCode: 'M-102', clientPhone: '01000000001', date: '2026-09-09', reference: 'CAF-1002', description: 'بار طاقة بالشوكولاتة', amount: 75, classification: 'bar' },
  ], total: 2, page: 1, pageSize: 25, summary: { count: 2, totalAmount: 210, targetAmount: 135, proteinAmount: 135, barAmount: 75 } };
  if (path === '/club-targets' || path.includes('/targets')) return { data: [], total: 0, page: 1, pageSize: 25 };
  return null;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ar-EG', timezoneId: 'Africa/Cairo', colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  await context.route('**/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const body = responseFor(url);
    if (body !== null) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    missingRequests.add(`${request.method()} ${url.pathname}${url.search}`);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  const page = await context.newPage();
  const results = [];
  async function capture(id, path, required, interact) {
    const dir = new URL(`${id}/`, evidenceRoot); await mkdir(dir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${adminBase}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText(required, { exact: false }).first().waitFor({ state: 'visible', timeout: 12000 });
    if (interact) await interact(page);
    await page.waitForTimeout(350);
    await page.screenshot({ path: new URL(`${id}/desktop.png`, evidenceRoot).pathname, fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
    await page.screenshot({ path: new URL(`${id}/mobile.png`, evidenceRoot).pathname, fullPage: false });
    const rendered = await page.locator('body').innerText();
    if (!rendered.includes(required)) throw new Error(`${id}: required label was lost after interaction: ${required}`);
    results.push({ id, path, required, desktop: 'desktop.png', mobile: 'mobile.png', status: 'passed' });
  }
  await capture('CAFE-01', '/sales/new', 'نقطة بيع الكافيه', async (p) => {
    await p.getByText('بروتين شيك فانيليا', { exact: true }).click();
    await p.getByText('سلة الطلب', { exact: true }).waitFor();
    await p.getByText('بروتين شيك فانيليا', { exact: true }).last().waitFor();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${adminBase}/club/cafe/inventory?tab=management-withdrawals`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('صرف الإدارة من مخزون الكافيه', { exact: true }).waitFor({ state: 'visible', timeout: 12000 });
  await page.locator('#withdraw-branch').selectOption('7');
  await page.locator('#withdraw-reference').fill('صرف فعالية سبتمبر');
  await page.locator('#withdraw-reason').fill('ضيافة فعالية الأعضاء');
  await page.locator('#withdraw-product-0').selectOption('101');
  await page.screenshot({ path: new URL('CAFE-01/management-withdrawal-desktop.png', evidenceRoot).pathname, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
  await page.screenshot({ path: new URL('CAFE-01/management-withdrawal-mobile.png', evidenceRoot).pathname, fullPage: false });
  results.push({ id: 'CAFE-01', path: '/club/cafe/inventory?tab=management-withdrawals', required: 'صرف الإدارة من مخزون الكافيه', desktop: 'management-withdrawal-desktop.png', mobile: 'management-withdrawal-mobile.png', status: 'passed' });
  await capture('CAFE-02', '/club/cafe/reports', 'تحليلات أعمال الكافيه');
  await capture('CAFE-03', '/club/targets?tab=sales', 'تقرير التارجت الموحد', async (p) => { await p.getByText('Protein / Bar', { exact: true }).waitFor(); });
  await capture('SUB-01', '/club/subscriptions/reports?preset=today', 'تقارير الاشتراكات');
  await capture('SUB-02', '/club/subscriptions/reports', 'تقارير الاشتراكات', async (p) => { await p.getByRole('tab', { name: /أخصائي المبيعات/ }).click(); await p.getByText('أحمد مبيعات', { exact: true }).waitFor(); });
  await capture('REP-01', '/club/subscriptions/reports?tab=monthly-analysis', 'تقارير الاشتراكات', async (p) => { await p.getByRole('tab', { name: /التحليل الشهري/ }).click(); await p.getByText('صافي الربح', { exact: true }).waitFor(); });
  await capture('REP-02', '/club/subscriptions/reports?tab=daily-close', 'تقارير الاشتراكات', async (p) => {
    await p.getByText('الإقفال اليومي', { exact: true }).last().waitFor();
    await p.locator('select').first().selectOption('7');
    await p.getByText('تسوية تحصيل اليوم', { exact: false }).waitFor();
  });
  await capture('LOCK-01', '/club/lockers?tab=inventory', 'إدارة اللوكر والجرد', async (p) => { await p.getByText('جرد أول الوردية', { exact: true }).waitFor(); await p.getByRole('button', { name: 'فتح', exact: true }).click(); await p.getByText('جلسة جرد اللوكر', { exact: true }).waitFor(); });
  await capture('LOCK-02', '/club/lockers?tab=inventory-review', 'إدارة اللوكر والجرد', async (p) => { await p.getByText('بانتظار اعتماد المدير', { exact: true }).waitFor(); await p.getByRole('button', { name: 'فتح', exact: true }).click(); await p.getByRole('button', { name: 'اعتماد', exact: true }).waitFor(); });
  await writeFile(new URL('acceptance-populated-report.json', evidenceRoot), JSON.stringify({ capturedAt: new Date().toISOString(), fixtureOnly: true, routes: results, unhandledApiRequests: [...missingRequests] }, null, 2));
  await browser.close();
  const shellOnlyReads = new Set([
    'GET /api/me/menu', 'GET /api/notifications/count', 'GET /api/notifications',
    'GET /api/shift-sessions/current?branchId=7', 'GET /api/shifts?branchId=7&isActive=true',
    'GET /api/shifts/schedule-status?branchId=7', 'GET /api/pos/employee-options',
  ]);
  const unexpected = [...missingRequests].filter((request) => !shellOnlyReads.has(request));
  if (unexpected.length) throw new Error(`Unhandled fixture API requests:\n${unexpected.join('\n')}`);
  process.stdout.write(`Captured ${results.length} populated acceptance journeys without touching the API or database.\n`);
}

await run();
