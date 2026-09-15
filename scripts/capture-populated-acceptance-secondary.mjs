/** Non-destructive, deterministic browser acceptance evidence for remaining client requirements. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { PNG } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs/lib/png.js';

const admin = process.env.NOAMANY_ADMIN_URL ?? 'http://127.0.0.1:5176';
const site = process.env.NOAMANY_PUBLIC_URL ?? 'http://127.0.0.1:5175';
const root = new URL('../review/client-requirements-2026-09-09/', import.meta.url);
const only = new Set((process.env.NOAMANY_ACCEPTANCE_ONLY ?? '').split(',').map(value => value.trim()).filter(Boolean));
const now = '2026-09-09T10:30:00.000Z';
const branch = { id: 7, name: 'فرع النعماني الرئيسي', nameAr: 'فرع النعماني الرئيسي', status: 'active' };
const user = { sub: 1, level: 1, emp_code: 1001, branch: 7, branch_name: branch.name, man_women_type: -1, name: 'مدير النعماني', image: null, job_title: 'مدير النظام', is_trainer: false, trainer_id: null };
const member = { id: 101, name: 'محمد السيد', memberCode: 'N-1001', member_code: 'N-1001', phone: '01000000000', branchId: 7, branch_id: 7, status: 'active', gender: 'male', profilePicture: null, membershipType: { id: 1, name: 'اشتراك سنوي' }, createdAt: now };
const followup = { id: 41, member_id: 101, memberName: member.name, memberCode: member.memberCode, memberPhone: member.phone, subscriptionNumber: 'SUB-2026-001', subscriptionStartDate: '2026-01-01', subscriptionEndDate: '2026-12-31', contact_date: '2026-09-09', note: 'تمت المتابعة والعضو راضٍ عن الخدمة.', opinion: 'النظافة والخدمة ممتازتان.', membership_status: 'active', gender: 'male' };
const online = { id: 501, status: 'submitted', applicant_name: 'سارة محمد', applicant_phone: '01000000001', applicant_email: 'sara@example.test', applicant_gender: 'female', package_name_snapshot: 'العضوية الذهبية', package_days_snapshot: 365, price_snapshot: 12000, branch_id: 7, payment_name_snapshot: 'إنستاباي', payment_destination_snapshot: 'Noamany Fitness', payment_account_snapshot: '01000000000', submitted_at: now, created_at: now, proofUrl: '/online-subscriptions/501/proof' };
const shellReads = new Set(['GET /api/me/menu', 'GET /api/notifications/count', 'GET /api/notifications', 'GET /api/shift-sessions/current?branchId=7', 'GET /api/shifts?branchId=7&isActive=true', 'GET /api/shifts/schedule-status?branchId=7', 'GET /api/pos/employee-options']);
const requests = new Set();

function hasVisualContent(pngBuffer) {
  const { data } = PNG.sync.read(pngBuffer);
  let nonWhiteSamples = 0;
  for (let index = 0; index < data.length; index += 160) {
    if (data[index] < 242 || data[index + 1] < 242 || data[index + 2] < 242) nonWhiteSamples += 1;
  }
  return nonWhiteSamples > 100;
}

function dataFor(url, isPublic = false) {
  const path = url.pathname.replace(isPublic ? /^\/api\/public\/portal/ : /^\/api/, '');
  if (!isPublic) {
    if (path === '/auth/refresh') return { accessToken: 'fixture-token' };
    if (path === '/auth/me') return user;
    if (path === '/me/permissions') return { superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} };
    if (path === '/me/nav') return []; if (path === '/me/workspace') return { homeRoute: '/dashboard', roleHint: 'مدير النظام', widgets: [] };
    if (path === '/me/workspace/widgets') return { config: { widgets: [] }, data: {} };
    if (path === '/club/branch-options' || path === '/branches') return [branch];
    if (path === '/club/customer-service/follow-ups' || path === '/club/customer-service/opinions') return { data: [followup], total: 1 };
    if (path === '/club/customer-service/questions') return [{ id: 1, title: 'هل الخدمة مناسبة لاحتياجك؟', version: 2, branch_id: 7, is_active: true }, { id: 2, title: 'هل لديك اقتراح لتحسين التجربة؟', version: 1, branch_id: null, is_active: true }];
    if (path === '/club/customer-service/follow-ups/41') return { ...followup, answers: [{ id: 1, question_title: 'هل الخدمة مناسبة لاحتياجك؟', question_version: 2, answer: 'نعم، ممتازة.' }] };
    if (path === '/club-members') return { data: [member], total: 1, page: 1, pageSize: 100 };
    if (path === '/club-members/101') return member;
    if (path === '/club-members/101/membership-documents') return [{ id: 1, label: 'بطاقة الرقم القومي', type: 'national_id', originalFilename: 'national-id.pdf', byteSize: 120000, createdAt: now, url: '/uploads/member-id.pdf' }];
    if (path === '/club-members/barcode-preview') return { member, membership: { status: 'active', label: 'عضوية سارية' }, barcode: member.memberCode, latestSubscriptions: [{ id: 201, subscriptionNumber: 'SUB-2026-001', subscriptionType: 'اشتراك سنوي', endDate: '2026-12-31', remainingAmount: 0 }], lockerSubscriptions: [{ id: 1, lockerNumber: 'L-12', type: 'شهري', status: 'active' }], freezes: [] };
    if (path === '/club-members/barcode-range') return { data: [member], capped: false };
    if (path === '/attendance/barcode-preview') return { employee: { id: 55, name: 'أحمد الاستقبال', empCode: '1001', department: 'الاستقبال', section: 'رجالي' }, branchId: 7, branchName: branch.name, action: 'check_in', nextActionLabel: 'تأكيد الحضور', recentPunches: [{ id: 1, action: 'حضور', date: '2026-09-08', time: '08:00' }], message: 'جاهز لتسجيل الحضور' };
    if (path === '/club/search/recent-checkins') return [{ id: 1, memberName: member.name, memberCode: member.memberCode, checkedInAt: now, branchName: branch.name }];
    if (path === '/club/search') { const hit = { id: 101, memberCode: member.memberCode, name: member.name, phone: member.phone, cardNumber: null, branchId: 7, isActive: true, matchType: 'code', activeSubscriptionType: 'اشتراك سنوي', subscriptionStatus: 'active', remainingAmount: 0, lastCheckIn: null, score: 100 }; return { hits: [hit], entitlement: { allowed: true, reasons: [], warnings: [] }, topMatch: hit }; }
    if (path === '/club/entitlement/validate') return { allowed: true, member: { id: 101, memberCode: member.memberCode, name: member.name, phone: member.phone, branchId: 7, isActive: true }, activeSubscription: { id: 201, subscriptionNumber: 'SUB-2026-001', subscriptionType: 'اشتراك سنوي', status: 'active', derivedStatus: 'active', remainingAmount: 0, isTimeBased: true, timeFrom: null, timeTo: null, isLinkedToSessions: false, isSpecial: false, specialClassTypeId: null, sessionsRemaining: null, allowMultipleDailyEntries: false, daysRemaining: 113, startDate: '2026-01-01', endDate: '2026-12-31' }, latestSubscription: { id: 201, subscriptionNumber: 'SUB-2026-001', subscriptionType: 'اشتراك سنوي', status: 'active', derivedStatus: 'active', remainingAmount: 0, startDate: '2026-01-01', endDate: '2026-12-31', daysRemaining: 113 }, reasons: [], warnings: [] };
    if (path === '/club-subscriptions') return { data: [{ id: 201, subscriptionNumber: 'SUB-2026-001', status: 'active', registrationDate: '2026-01-01', branchId: 7, memberId: 101, customerName: member.name, subscriptionTypeId: 1, subscriptionType: 'اشتراك سنوي', subscriptionStartDate: '2026-01-01', subscriptionEndDate: '2026-12-31', subscriptionValue: 12000, discountEnabled: false, discountValue: 0, paidAmount: 12000, remainingAmount: 0, paymentMethod: 'cash', receiptNumber: 'R-2026-001', customerSourceId: null, guardianName: null, guardianPhone: null, gender: 'male', isSpecial: false }], total: 1 };
    if (path === '/club-subscription-types') return [{ id: 1, name: 'اشتراك سنوي', branchId: 7, price: 12000 }];
    if (path === '/club-quick-services/catalog') return [];
    if (path === '/online-subscriptions') return [online, { ...online, id: 502, applicant_name: 'كريم أحمد', status: 'approved', promoted_subscription_id: 202 }];
    if (path === '/online-subscriptions/options') return { branches: [branch] };
    if (path === '/online-subscriptions/501') return online;
    if (path === '/portal/payment-methods') return [{ id: 1, name: 'إنستاباي النعماني', type: 'instapay', destination: 'Noamany Fitness', account: '01000000000', hasSecret: true, branchId: 7, isActive: true, displayOrder: 1 }];
    if (path === '/portal/payment-methods/options') return { branches: [branch], canManageGlobal: true };
    if (path.startsWith('/portal-management')) return path === '/portal-management/options' ? { branches: [branch], employees: [] } : { items: [{ id: 701, title: 'محتوى قسم العضوية', status: 'active', isActive: true, branchId: 7, data: { sectionKey: 'membership', subtitle: 'عضوية تناسبك', extraText: 'ابدأ رحلتك معنا' } }], total: 1 };
    return null;
  }
  if (path === '/memberships/1') return { id: 1, name: 'العضوية الذهبية', description: 'عضوية كاملة للنادي مع مرونة في التجميد.', days: 365, price: 12000, branchId: 7, invitationsCount: 4, inbodyCount: 4, sessionsCount: 0, freezeDays: 14 };
  if (path === '/payment-methods') return [{ id: 1, name: 'إنستاباي النعماني', type: 'instapay', destination: 'Noamany Fitness', account: '01000000000' }];
  if (path === '/home') return { branches: [branch], content: { 'section-settings': [] }, classes: [], offers: [], photos: [], sliders: [], trainers: [], videos: [], company: {}, about: {} };
  if (path === '/memberships') return [{ id: 1, name: 'العضوية الذهبية', days: 365, price: 12000, branchId: 7, description: 'عضوية كاملة', invitationsCount: 4, inbodyCount: 4, sessionsCount: 0, freezeDays: 14 }];
  if (path === '/products') return { items: [] };
  return null;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ar-EG', timezoneId: 'Africa/Cairo', colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  await context.route('**/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    // Vite module URLs such as /src/lib/api/club-events.ts also contain "/api/".
    // They are application code, not backend traffic, and must not be mocked.
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const publicCall = url.pathname.startsWith('/api/public/portal'); const body = dataFor(url, publicCall);
    if (body !== null) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    requests.add(`${request.method()} ${url.pathname}${url.search}`); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  const page = await context.newPage(); const results = []; const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  async function capture(id, base, path, required, interaction) {
    if (only.size && !only.has(id)) return;
    console.log(`Capturing ${id}`);
    const dir = new URL(`${id}/`, root); await mkdir(dir, { recursive: true }); await page.setViewportSize({ width: 1440, height: 900 });
    console.log(`Navigating ${id}`); await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); console.log(`Waiting ${id}`); await page.getByText(required, { exact: false }).first().waitFor({ state: 'visible', timeout: 12000 });
    if (id !== 'BAR-04') {
      const scannerClose = page.getByRole('dialog').getByTitle('إغلاق السكانر');
      if (await scannerClose.isVisible().catch(() => false)) await scannerClose.click();
    }
    if (interaction) { console.log(`Interacting ${id}`); await interaction(page); } await page.waitForTimeout(300);
    const textAtCapture = await page.locator('body').innerText();
    if (!textAtCapture.includes(required)) throw new Error(`${id}: required visible text disappeared before screenshot`);
    if (id === 'WEB-01' && textAtCapture.includes('سكانر مستمر')) throw new Error('WEB-01: persistent scanner leaked into CMS evidence');
    const overflowDesktop = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const desktop = await page.screenshot({ path: new URL(`${id}/desktop.png`, root).pathname, fullPage: false });
    if (!hasVisualContent(desktop)) throw new Error(`${id}: desktop screenshot is visually blank`);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
    const overflowMobile = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const mobile = await page.screenshot({ path: new URL(`${id}/mobile.png`, root).pathname, fullPage: false });
    if (!hasVisualContent(mobile)) throw new Error(`${id}: mobile screenshot is visually blank`);
    results.push({ id, path, status: 'passed', overflowDesktop, overflowMobile, pageErrors: pageErrors.splice(0) });
  }
  await capture('CS-01', admin, '/club/customer-service?tab=follow-up', 'خدمة العملاء', async p => { await p.locator('#cs-filter-branch').selectOption('7'); await p.getByRole('button', { name: 'عرض الردود', exact: true }).click(); await p.getByText('تفاصيل المتابعة', { exact: true }).waitFor(); });
  await capture('CS-02', admin, '/club/customer-service?tab=questions', 'خدمة العملاء', async p => { await p.getByText('هل الخدمة مناسبة لاحتياجك؟', { exact: true }).waitFor(); });
  await capture('CS-03', admin, '/club/customer-service?tab=opinions', 'خدمة العملاء', async p => { await p.getByText('النظافة والخدمة ممتازتان.', { exact: true }).waitFor(); });
  await capture('BAR-01', admin, '/club/reception?scan=N-1001', 'الاستقبال', async p => { await p.getByRole('dialog').getByText('محمد السيد', { exact: true }).waitFor(); });
  await capture('BAR-02', admin, '/club/members/barcode-management?tab=staff', 'إدارة الباركود', async p => { await p.getByPlaceholder('كود الموظف').fill('1001'); await p.getByRole('button', { name: 'فحص الكود', exact: true }).click(); await p.getByText('أحمد الاستقبال', { exact: true }).waitFor(); });
  await capture('BAR-03', admin, '/club/members/barcode-management?tab=classes', 'إدارة الباركود');
  await capture('BAR-04', admin, '/club/reception', 'الاستقبال', async p => { await p.getByRole('button', { name: 'فتح السكانر المستمر', exact: true }).click(); await p.getByRole('dialog').getByText('سكانر مستمر', { exact: true }).waitFor(); });
  await capture('MEM-01', admin, '/club/members/101?tab=documents', 'الأعضاء', async p => { const document = p.getByRole('listitem').getByText('بطاقة الرقم القومي', { exact: true }); await document.waitFor(); await document.scrollIntoViewIfNeeded(); });
  await capture('APP-03', site, '/memberships/1?branchId=7', 'العضوية الذهبية');
  await capture('APP-04', admin, '/portal/payment-methods', 'طرق الدفع الأونلاين');
  await capture('APP-05', site, '/membership-checkout?packageId=1&branchId=7', 'أرسل طلب عضويتك', async p => { await p.locator('#paymentMethod').selectOption('1'); });
  await capture('APP-06', admin, '/club/subscriptions/online', 'الاشتراكات الأونلاين', async p => { await p.getByRole('button', { name: 'مراجعة', exact: true }).first().click(); await p.getByText('مراجعة طلب أونلاين', { exact: false }).waitFor(); });
  await capture('APP-07', admin, '/club/subscriptions/online', 'الاشتراكات الأونلاين', async p => { await p.getByText('مراجعة', { exact: true }).first().click(); await p.getByText('اعتماد وترحيل الاشتراك', { exact: true }).waitFor(); });
  await capture('WEB-01', admin, '/portal/section-settings', 'إدارة البوابة');
  const reportUrl = new URL('acceptance-secondary-report.json', root);
  let prior = { results: [], interceptedUnmapped: [] };
  if (only.size) {
    try { prior = JSON.parse(await readFile(reportUrl, 'utf8')); } catch { /* first selective capture */ }
  }
  const merged = [...(prior.results ?? []).filter(row => !only.has(row.id)), ...results];
  await writeFile(reportUrl, JSON.stringify({ capturedAt: new Date().toISOString(), fixtureOnly: true, results: merged, interceptedUnmapped: [...new Set([...(prior.interceptedUnmapped ?? []), ...requests])] }, null, 2));
  await browser.close();
  // An unmapped read is still fulfilled locally as an empty deterministic response
  // and is recorded in the report; any unplanned write fails the run.
  const unsafe = [...requests].filter(x => !x.startsWith('GET '));
  if (unsafe.length) throw new Error(`Unexpected write calls:\n${unsafe.join('\n')}`);
  console.log(`Captured ${results.length} secondary deterministic journeys.`);
}
await main();
