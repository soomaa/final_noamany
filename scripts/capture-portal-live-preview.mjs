/**
 * Deterministic, non-destructive acceptance for the admin -> public live preview.
 *
 * Prerequisites:
 *   frontend Vite:          http://127.0.0.1:5176
 *   website-redesign Vite:  http://127.0.0.1:5175
 *
 * Every application API call is intercepted. The only content mutation exercised is
 * the explicitly intercepted settings publish request; no request reaches a backend.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { PNG } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs/lib/png.js';

const adminBase = process.env.NOAMANY_ADMIN_URL ?? 'http://127.0.0.1:5176';
const publicBase = process.env.NOAMANY_PUBLIC_URL ?? 'http://127.0.0.1:5175';
const evidenceDir = new URL('../review/client-requirements-2026-09-09/WEB-PREVIEW/', import.meta.url);
const productId = 44;
const selectedBadgeId = 126;
const branch = { id: 7, name: 'فرع النعماني الرئيسي', nameAr: 'فرع النعماني الرئيسي', status: 'active' };
const user = { sub: 1, level: 1, emp_code: 1001, branch: 7, branch_name: branch.name, man_women_type: -1, name: 'مدير النعماني', image: null, job_title: 'مدير النظام', is_trainer: false, trainer_id: null };
const publishedAbout = {
  title: 'عن النعماني المنشور', details: 'قصة منشورة ثابتة للاختبار', mainImage: `${publicBase}/assets/hero.png`,
  accessToken: 'must-never-leave-fixture', publisher: { authorization: 'also-private' }, futureMetadata: 'must-not-persist',
};
let publicAboutState = { title: publishedAbout.title, details: publishedAbout.details, image: publishedAbout.mainImage };
const richBadge = { id: selectedBadgeId, name: 'اختيار الصفحة الثانية', nameEn: 'Second page pick', type: 'sale', backgroundColor: '#7f1d1d', textColor: '#ffffff' };
const productRow = {
  id: productId, title: 'منتج منشور', status: 'active', isActive: true, branchId: null,
  data: { nameEn: 'Published Product', categoryId: 3, categoryName: 'مكملات', price: 500, oldPrice: 650, currentStock: 12, selectedBadge: selectedBadgeId, image: `${publicBase}/assets/hero-red.png`, images: [`${publicBase}/assets/hero-red.png`, `${publicBase}/assets/hero.png`], shortDescription: 'ملخص مستقل للمنتج', description: 'تفاصيل كاملة للمنتج', specifications: '{"الوزن":"1 كجم","النكهة":"شوكولاتة"}', displayOrder: 1, isFeatured: true, isNew: true },
};
const publicProduct = {
  id: productId, name: productRow.title, nameEn: productRow.data.nameEn, categoryId: 3, category: 'مكملات',
  price: 500, oldPrice: 650, stock: 12, stockStatus: 'in_stock', image: `${publicBase}/assets/hero-red.png`, images: productRow.data.images,
  shortDescription: productRow.data.shortDescription, description: productRow.data.description, specifications: JSON.parse(productRow.data.specifications), displayOrder: 1, featured: true, isNew: true,
  badge: richBadge, related: [],
};
const secondaryProduct = { ...publicProduct, id: 45, name: 'منتج تالٍ', nameEn: 'Later Product', displayOrder: 9, featured: false, isNew: false, badge: null };
const videoRow = { id: 88, title: 'فيديو الأهلية', status: 'active', isActive: true, branchId: null, data: { slugTitle: 'حصة حية', date: '2026-09-10', videoLink: 'https://example.test/video', mainImage: `${publicBase}/assets/hero-red.png`, mainPageVideo: true } };
const publicVideo = { id: videoRow.id, title: videoRow.title, subtitle: videoRow.data.slugTitle, date: videoRow.data.date, videoLink: videoRow.data.videoLink, image: videoRow.data.mainImage, mainPageVideo: true, isActive: true };
const offerRow = { id: 89, title: 'عرض يوم القاهرة', status: 'active', isActive: true, branchId: null, data: { subtitle: 'حد محلي شامل', startDate: '2026-09-10', endDate: '2026-09-10', value: 250, image: `${publicBase}/assets/hero-red.png`, details: 'سارٍ في يوم القاهرة' } };
const publicOffer = { id: offerRow.id, title: offerRow.title, subtitle: offerRow.data.subtitle, fromDate: offerRow.data.startDate, toDate: offerRow.data.endDate, value: offerRow.data.value, image: offerRow.data.image, details: offerRow.data.details, isActive: true };

function badgeRow(id) {
  const badge = id === selectedBadgeId ? richBadge : { id, name: `شارة ${id}`, nameEn: `Badge ${id}`, type: 'custom', backgroundColor: '#111111', textColor: '#ffffff' };
  return { id, title: badge.name, status: 'active', isActive: true, branchId: null, data: { nameEn: badge.nameEn, badgeType: badge.type, backgroundColor: badge.backgroundColor, textColor: badge.textColor, displayOrder: id } };
}
const allBadgeRows = Array.from({ length: selectedBadgeId }, (_, index) => badgeRow(index + 1));

function publicHome() {
  return {
    branches: [branch], classes: [], sliders: [{ id: 1, title: 'النعماني', main_image: '/assets/hero-red.png' }], trainers: [], offers: [publicOffer], photos: [], videos: [publicVideo], heroVideos: [], products: [],
    company: { nameweb: 'مركز النعماني', footer: 'نساعدك تصبح أقوى.', facebook: 'https://example.test/noamany' },
    about: { ...publicAboutState },
    content: { 'section-settings': [] },
  };
}

function hasVisualContent(buffer) {
  const { data } = PNG.sync.read(buffer);
  let nonWhite = 0;
  for (let index = 0; index < data.length; index += 160) {
    if (data[index] < 242 || data[index + 1] < 242 || data[index + 2] < 242) nonWhite += 1;
  }
  return nonWhite > 200;
}

function assertNoOverflow(metrics, label) {
  assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${label} horizontal overflow: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
}

async function waitForPreviewFrame(page, pathname) {
  await page.waitForFunction(({ origin, pathname }) => Array.from(document.querySelectorAll('iframe')).some((node) => {
    try { const url = new URL(node.src); return url.origin === origin && url.pathname === pathname && url.searchParams.get('cmsPreview') === '1'; } catch { return false; }
  }), { origin: new URL(publicBase).origin, pathname });
  const handle = await page.locator('iframe').evaluateHandle((_, expected) => Array.from(document.querySelectorAll('iframe')).find((node) => {
    try { const url = new URL(node.src); return url.origin === expected.origin && url.pathname === expected.pathname && url.searchParams.get('cmsPreview') === '1'; } catch { return false; }
  }), { origin: new URL(publicBase).origin, pathname });
  const element = handle.asElement();
  assert.ok(element, `preview iframe ${pathname} exists`);
  const frame = await element.contentFrame();
  assert.ok(frame, `preview iframe ${pathname} has a browsing context`);
  await frame.waitForLoadState('domcontentloaded');
  await frame.locator('.cms-preview-badge').waitFor({ state: 'visible' });
  return frame;
}

function overlaps(a, b) {
  return a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function assertBadgeClearOfHeader(frame, label) {
  const boxes = await frame.evaluate(() => {
    const rect = (selector) => { const node = document.querySelector(selector); if (!node) return null; const value = node.getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom }; };
    return { badge: rect('.cms-preview-badge'), header: rect('.commerce-header, header'), logo: rect('.commerce-logo, .logo') };
  });
  assert.ok(boxes.badge, `${label}: private-preview badge exists`);
  assert.equal(overlaps(boxes.badge, boxes.header), false, `${label}: preview badge overlaps header`);
  assert.equal(overlaps(boxes.badge, boxes.logo), false, `${label}: preview badge overlaps logo`);
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ar-EG', timezoneId: 'Africa/Cairo', colorScheme: 'light', viewport: { width: 1440, height: 1000 } });
  const apiReads = [];
  const shellWrites = [];
  const contentWrites = [];
  const contentWriteBodies = [];
  const pageErrors = [];
  const consoleErrors = [];
  let badgeAttempt = 0;
  let badgePageTwoReads = 0;
  let expectedPublishResponse = publishedAbout;
  let stallNextShopPreview = false;

  await context.route('**/shop.html?*', async (route) => {
    const url = new URL(route.request().url());
    if (stallNextShopPreview && url.searchParams.get('cmsPreview') === '1') {
      stallNextShopPreview = false;
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="ar"><body>fixture intentionally never signals ready</body></html>' });
    }
    return route.continue();
  });

  await context.addInitScript(() => {
    window.__noamanyAcceptanceMessages = [];
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'noamany:cms-preview') window.__noamanyAcceptanceMessages.push(structuredClone(event.data));
    }, true);
  });

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const signature = `${request.method()} ${url.pathname}${url.search}`;
    if (request.method() === 'GET') apiReads.push(signature);
    else if (url.pathname.startsWith('/api/auth/')) shellWrites.push(signature);
    else { contentWrites.push(signature); contentWriteBodies.push(request.postDataJSON?.() ?? null); }

    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/refresh') return json({ accessToken: 'fixture-token' });
    if (url.pathname === '/api/auth/me') return json(user);
    if (url.pathname === '/api/me/permissions') return json({ superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} });
    if (url.pathname === '/api/me/nav') return json([]);
    if (url.pathname === '/api/me/workspace') return json({ homeRoute: '/dashboard', roleHint: 'مدير النظام', widgets: [] });
    if (url.pathname === '/api/me/workspace/widgets') return json({ config: { widgets: [] }, data: {} });
    if (url.pathname === '/api/notifications' || url.pathname === '/api/notifications/count') return json(url.pathname.endsWith('/count') ? { count: 0 } : []);
    if (url.pathname === '/api/portal-management/options') return json({ branches: [branch], employees: [], categories: [{ id: 3, name: 'مكملات' }], badges: [{ id: selectedBadgeId, name: richBadge.name }], jobs: [] });
    if (url.pathname === '/api/portal-management/settings/about' && request.method() === 'GET') return json(publishedAbout);
    if (url.pathname === '/api/portal-management/settings/about' && request.method() === 'PUT') return json(expectedPublishResponse);
    if (url.pathname === '/api/portal-management/products' && request.method() === 'GET') return json({ items: [productRow], total: 1 });
    if (url.pathname === '/api/portal-management/videos' && request.method() === 'GET') return json({ items: [videoRow], total: 1 });
    if (url.pathname === '/api/portal-management/offers' && request.method() === 'GET') return json({ items: [offerRow], total: 1 });
    if (/^\/api\/portal-management\/(photos|hero-videos|stats|services|about-features|section-settings)$/.test(url.pathname) && request.method() === 'GET') return json({ items: [], total: 0 });
    if (url.pathname === '/api/portal-management/badges' && request.method() === 'GET') {
      const page = Number(url.searchParams.get('page') || 1);
      if (page === 1) {
        badgeAttempt += 1;
        // The repository query client performs one automatic retry. Exhaust the
        // initial two attempts, then let the explicit user retry succeed.
        if (badgeAttempt <= 2) return json({ message: 'fixture rich badge failure' }, 503);
      }
      if (page === 2) badgePageTwoReads += 1;
      const start = (page - 1) * 100;
      return json({ items: allBadgeRows.slice(start, start + 100), total: allBadgeRows.length, page, pageSize: 100 });
    }
    if (url.pathname === '/api/public/portal/home') return json(publicHome());
    if (url.pathname === '/api/public/portal/products') return json({ items: [secondaryProduct, publicProduct], categories: [{ id: 3, name: 'مكملات' }] });
    if (url.pathname === `/api/public/portal/products/${productId}`) return json(publicProduct);
    return json([]);
  });

  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location().url || '';
    if (location.includes('/api/portal-management/badges')) return;
    consoleErrors.push(`${message.text()}${location ? ` @ ${location}` : ''}`);
  });

  try {
    // Real admin settings editor + real public homepage iframe.
    await page.goto(`${adminBase}/portal/about`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'نبذة عن الجيم' }).waitFor();
    let frame = await waitForPreviewFrame(page, '/');
    await frame.locator('.about-copy h2').getByText(publishedAbout.title, { exact: false }).waitFor();
    const titleInput = page.getByLabel('العنوان');
    assert.equal(await titleInput.inputValue(), publishedAbout.title, 'admin and public begin from the same nonempty published baseline');

    for (const expected of ['مسودة A المباشرة', 'مسودة B المباشرة']) {
      await titleInput.fill(expected);
      await frame.locator('.about-copy h2').getByText(expected, { exact: false }).waitFor();
    }
    await titleInput.fill('');
    await frame.waitForFunction((published) => !document.querySelector('.about-copy h2')?.innerText.includes(published), publishedAbout.title);
    publicAboutState = { title: '', details: '', image: '' };
    const freshPage = await context.newPage();
    await freshPage.goto(publicBase, { waitUntil: 'domcontentloaded' });
    await freshPage.locator('.about-copy h2').waitFor();
    const freshClearedAbout = (await freshPage.locator('.about-copy h2').innerText()).replace(/\s+/g, ' ').trim();
    await freshPage.close();
    publicAboutState = { title: publishedAbout.title, details: publishedAbout.details, image: publishedAbout.mainImage };
    await frame.waitForFunction((expected) => document.querySelector('.about-copy h2')?.innerText.replace(/\s+/g, ' ').trim() === expected, freshClearedAbout);
    assert.notEqual((await frame.locator('.about-copy h2').innerText()).replace(/\s+/g, ' ').trim(), publishedAbout.title, 'clear does not restore the admin published baseline');
    const messages = await frame.evaluate(() => window.__noamanyAcceptanceMessages ?? []);
    assert.ok(messages.length >= 4, `expected baseline + A + B + cleared snapshots, saw ${messages.length}`);
    const sequences = messages.map((message) => message.sequence);
    assert.ok(sequences.every((value, index) => index === 0 || value > sequences[index - 1]), `preview sequences must strictly increase: ${sequences.join(', ')}`);
    assert.deepEqual(messages.slice(-3).map((message) => message.draft.title), ['مسودة A المباشرة', 'مسودة B المباشرة', '']);

    // Safety on the real homepage preview: anchors/scroll stay usable; escape/form/cart/external actions do not.
    await frame.locator('a[href="#about"]').first().evaluate((anchor) => anchor.click());
    assert.equal(new URL(frame.url()).hash, '#about', 'same-page anchor remains usable');
    const beforeBlockedUrl = frame.url();
    await frame.locator('a[href="/shop.html"]').first().evaluate((anchor) => anchor.click());
    assert.equal(frame.url(), beforeBlockedUrl, 'cross-page navigation is blocked');
    assert.equal(await frame.locator('.contact-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))), false, 'form submission is prevented');
    const externalUrl = frame.url();
    await frame.locator('.footer-social a[href^="https://"]').first().evaluate((anchor) => anchor.click());
    assert.equal(frame.url(), externalUrl, 'external navigation is blocked');
    await frame.locator('[data-modal="cart-modal"]').first().evaluate((anchor) => anchor.click());
    assert.equal(await frame.locator('#cart-modal').evaluate((node) => node.classList.contains('open')), false, 'cart modal remains closed');

    // Local save/reload/discard is browser-only and never invokes an application content write.
    const writesBeforeDraft = contentWrites.length;
    await titleInput.fill('مسودة محلية باقية');
    await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
    assert.equal(contentWrites.length, writesBeforeDraft);
    const storedAboutDraft = await page.evaluate(() => localStorage.getItem('noamany:portal-draft:about:settings'));
    assert.ok(storedAboutDraft);
    assert.deepEqual(Object.keys(JSON.parse(storedAboutDraft).fields).sort(), ['details', 'mainImage', 'title']);
    assert.doesNotMatch(storedAboutDraft, /accessToken|authorization|publisher|futureMetadata/i, 'local settings draft excludes metadata');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('العنوان').waitFor();
    assert.equal(await page.getByLabel('العنوان').inputValue(), 'مسودة محلية باقية');
    await page.getByText('مسودة محفوظة على هذا الجهاز', { exact: true }).waitFor();
    frame = await waitForPreviewFrame(page, '/');
    await frame.locator('.about-copy h2').getByText('مسودة محلية باقية', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'إلغاء المسودة' }).click();
    assert.equal(await page.getByLabel('العنوان').inputValue(), publishedAbout.title);
    await frame.locator('.about-copy h2').getByText(publishedAbout.title, { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('noamany:portal-draft:about:settings')), null);
    assert.equal(contentWrites.length, writesBeforeDraft);

    // Publish is the only exercised content write and is intercepted before any backend.
    expectedPublishResponse = { ...publishedAbout, title: 'نسخة النشر المعترضة' };
    await page.getByLabel('العنوان').fill(expectedPublishResponse.title);
    await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
    await page.getByRole('button', { name: 'نشر التعديلات' }).click();
    await page.getByText('تم النشر بنجاح', { exact: true }).waitFor();
    assert.equal(contentWrites.length, 1);
    assert.equal(contentWrites[0], 'PUT /api/portal-management/settings/about');
    assert.deepEqual(Object.keys(contentWriteBodies[0]).sort(), ['details', 'mainImage', 'title']);
    assert.doesNotMatch(JSON.stringify(contentWriteBodies[0]), /accessToken|authorization|publisher|futureMetadata/i, 'publish payload excludes metadata');
    assert.equal(await page.evaluate(() => localStorage.getItem('noamany:portal-draft:about:settings')), null);

    // Existing record eligibility is live and reversible in the real homepage renderer.
    await page.goto(`${adminBase}/portal/videos`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'مكتبة الفيديوهات' }).waitFor();
    await page.getByRole('button', { name: 'تعديل' }).click();
    frame = await waitForPreviewFrame(page, '/');
    await frame.locator('.video-card').filter({ hasText: videoRow.title }).waitFor();
    const eligibility = page.getByLabel('يظهر في الرئيسية');
    await eligibility.click();
    await frame.locator('.video-card').filter({ hasText: videoRow.title }).waitFor({ state: 'hidden' });
    assert.equal(await frame.locator('.media-showcase').evaluate((node) => node.hidden), true, 'ineligible video hides the public section');
    await eligibility.click();
    await frame.locator('.video-card').filter({ hasText: videoRow.title }).waitFor();
    assert.equal(contentWrites.length, 1, 'eligibility preview transitions never publish');
    await page.keyboard.press('Escape');

    // Africa/Cairo's 2026-09-10 calendar day is inclusive at both offer bounds.
    await page.goto(`${adminBase}/portal/offers`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'عروض الموقع' }).waitFor();
    await page.getByRole('button', { name: 'تعديل' }).click();
    frame = await waitForPreviewFrame(page, '/');
    const cairoOffer = frame.locator('.offer').filter({ hasText: offerRow.title });
    await cairoOffer.waitFor();
    await page.getByLabel('نهاية العرض').fill('2026-09-09');
    await cairoOffer.waitFor({ state: 'hidden' });
    await page.getByLabel('نهاية العرض').fill('2026-09-10');
    await cairoOffer.waitFor();
    await page.keyboard.press('Escape');

    // Every Task 5C home-record family reaches its real renderer with an honest
    // draft-labelled state. Services additionally prove independent subtitle/link copy.
    const honestFamilies = [
      { route: 'photos', heading: 'مكتبة الصور', text: 'ألبوم صور جديد — غير منشور' },
      { route: 'hero-videos', heading: 'فيديوهات الرئيسية', text: 'فيديو رئيسي جديد — غير منشور' },
      { route: 'offers', heading: 'عروض الموقع', text: 'عرض جديد — غير منشور' },
      { route: 'stats', heading: 'إحصائيات الموقع', text: 'إحصائية جديدة — غير منشورة' },
      { route: 'about-features', heading: 'مميزات عن الجيم', text: 'ميزة جديدة — غير منشورة' },
    ];
    for (const family of honestFamilies) {
      await page.goto(`${adminBase}/portal/${family.route}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: family.heading }).waitFor();
      await page.getByRole('button', { name: 'إضافة جديد' }).click();
      frame = await waitForPreviewFrame(page, '/');
      await frame.getByText(family.text, { exact: false }).first().waitFor();
      await page.getByText('معاينة سجل جديد — أكمل الحقول قبل النشر', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
    }

    await page.goto(`${adminBase}/portal/services`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'خدمات الموقع' }).waitFor();
    await page.getByRole('button', { name: 'إضافة جديد' }).click();
    frame = await waitForPreviewFrame(page, '/');
    await frame.getByText('خدمة جديدة — غير منشورة', { exact: false }).first().waitFor();
    await page.getByLabel('اسم الخدمة').fill('خدمة التجربة');
    await page.getByLabel('عنوان فرعي').fill('عنوان فرعي مستقل');
    await page.getByLabel('وصف الخدمة').fill('جسم الخدمة');
    await page.getByLabel('نص الرابط').fill('اكتشف الخدمة');
    await page.getByLabel('مسار الرابط').fill('#contact');
    const serviceCard = frame.locator('.service').filter({ hasText: 'خدمة التجربة' });
    await serviceCard.waitFor();
    assert.equal(await serviceCard.locator('.service-subtitle').innerText(), 'عنوان فرعي مستقل');
    assert.equal((await serviceCard.locator('a').innerText()).replace(/\s+/g, ' ').trim(), 'اكتشف الخدمة ←');
    assert.equal(await serviceCard.locator('a').getAttribute('href'), '#contact');
    await page.keyboard.press('Escape');

    await page.goto(`${adminBase}/portal/section-settings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'إعدادات أقسام الموقع' }).waitFor();
    await page.getByRole('button', { name: 'إضافة جديد' }).click();
    frame = await waitForPreviewFrame(page, '/');
    const unassignedSectionState = frame.locator('.section-setting-draft--unassigned');
    await unassignedSectionState.getByText('إعداد قسم جديد — غير منشور', { exact: true }).waitFor();
    await unassignedSectionState.getByText('اختر القسم لتظهر المعاينة في مكانها الصحيح.', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'القسم *', exact: true }).click();
    await page.getByRole('option', { name: 'طلب الاشتراك' }).click();
    await unassignedSectionState.waitFor({ state: 'detached' });
    await frame.getByText('إعداد قسم جديد — غير منشور', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('نص الزر').count(), 1, 'lead exposes its real button-copy target');
    assert.equal(await page.getByLabel('مسار الزر').count(), 0, 'lead omits unsupported linkUrl');
    assert.equal(await page.getByLabel('الصورة').count(), 0, 'lead omits unsupported image');
    assert.equal(await page.getByLabel('الوصف').count(), 0, 'lead omits unsupported details');
    await page.getByLabel('العنوان الصغير').fill('ابدأ الآن');
    await page.getByLabel('العنوان الرئيسي').fill('خطوتك تبدأ هنا');
    await page.getByLabel('نص الزر').fill('انضم الآن');
    await frame.getByText('خطوتك تبدأ هنا', { exact: false }).waitFor();
    await frame.waitForFunction(() => document.querySelector('.cta-band button')?.textContent?.includes('انضم الآن'));
    assert.equal((await frame.locator('.cta-band button').innerText()).replace(/\s+/g, ' ').trim(), 'انضم الآن ←');
    await page.keyboard.press('Escape');
    assert.equal(contentWrites.length, 1, 'new-family browser previews never publish');

    // Rich badge gating: deterministic failure, visible retry, complete pagination, selected page-two record.
    await page.goto(`${adminBase}/portal/products`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'إدارة المنتجات' }).waitFor();
    await page.getByRole('button', { name: 'تعديل' }).click();
    await page.getByText('تعذر تحميل بيانات الشارة الكاملة', { exact: false }).waitFor();
    await page.waitForTimeout(500);
    const badgePageTwoResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/portal-management/badges' && url.searchParams.get('page') === '2' && response.status() === 200;
    });
    const badgeRetry = page.locator('.portal-live-preview__state').filter({ hasText: 'تعذر تحميل بيانات الشارة الكاملة' }).getByRole('button', { name: 'إعادة المحاولة' });
    await badgeRetry.click();
    await badgePageTwoResponse;
    frame = await waitForPreviewFrame(page, '/product.html');
    await frame.locator('.product-copy h1').getByText(productRow.title, { exact: true }).waitFor();
    assert.ok(badgePageTwoReads >= 1, 'selected rich badge was loaded beyond page one');

    await page.getByLabel('اسم المنتج').fill('منتج المعاينة النهائي');
    await page.getByRole('spinbutton', { name: 'السعر *', exact: true }).fill('777');
    await frame.locator('.product-copy h1').getByText('منتج المعاينة النهائي', { exact: true }).waitFor();
    assert.match(await frame.locator('.detail-price strong').innerText(), /٧٧٧/);
    assert.match(await frame.locator('.product-badge').innerText(), /اختيار الصفحة الثانية/);
    assert.equal(await frame.locator('.product-short-description').innerText(), productRow.data.shortDescription);
    assert.match(await frame.locator('.product-copy > p').last().innerText(), /تفاصيل كاملة/);
    assert.equal(await frame.locator('.product-thumbnails button').count(), 2, 'detail surface exposes the primary and additional gallery images');
    assert.deepEqual(await frame.locator('.product-specifications dt').allTextContents(), ['الوزن', 'النكهة']);
    assert.deepEqual(await frame.locator('.product-specifications dd').allTextContents(), ['1 كجم', 'شوكولاتة']);
    const imageState = await frame.locator('[data-product-image]').evaluate((image) => ({ src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 }));
    assert.match(imageState.src ?? '', /hero-red\.png/);
    assert.equal(imageState.loaded, true, 'product image loads in the real renderer');
    assert.equal(await frame.locator('.cms-preview-badge').innerText(), 'معاينة خاصة — غير منشورة');
    await assertBadgeClearOfHeader(frame, 'desktop product preview');

    // The accessible saved-product switch proves catalog-only effects in the real shop DOM.
    const detailSurfaceButton = page.getByRole('button', { name: 'معاينة التفاصيل' });
    const shopSurfaceButton = page.getByRole('button', { name: 'معاينة المتجر' });
    assert.equal(await detailSurfaceButton.getAttribute('aria-pressed'), 'true');
    await shopSurfaceButton.click();
    frame = await waitForPreviewFrame(page, '/shop.html');
    assert.equal(await shopSurfaceButton.getAttribute('aria-pressed'), 'true');
    const catalogNames = await frame.locator('.shop-product').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-name')));
    assert.deepEqual(catalogNames.slice(0, 2), ['منتج المعاينة النهائي', 'منتج تالٍ'], 'displayOrder controls actual shop DOM order');
    const catalogProduct = frame.locator('.shop-product').first();
    assert.equal(await catalogProduct.getAttribute('data-display-order'), '1');
    assert.deepEqual(await catalogProduct.locator('.product-state-badges span').allTextContents(), ['منتج مميز', 'جديد']);
    assert.equal(await catalogProduct.locator('.product-summary').innerText(), productRow.data.shortDescription);
    await detailSurfaceButton.click();
    frame = await waitForPreviewFrame(page, '/product.html');
    assert.equal(await detailSurfaceButton.getAttribute('aria-pressed'), 'true');
    await frame.locator('.product-copy h1').getByText('منتج المعاينة النهائي', { exact: true }).waitFor();

    // Product transactions and navigation stay inert.
    assert.equal(await frame.evaluate(() => localStorage.getItem('noamany_store_cart_v2')), null);
    await frame.locator('#addProduct').click();
    assert.equal(await frame.evaluate(() => localStorage.getItem('noamany_store_cart_v2')), null, 'add-to-cart does not mutate storage');
    const productUrl = frame.url();
    await frame.locator('.commerce-cart').click();
    assert.equal(frame.url(), productUrl, 'checkout navigation is blocked');
    await frame.locator('.commerce-logo').click();
    assert.equal(frame.url(), productUrl, 'cross-page product navigation is blocked');

    // Desktop split, toolbar viewport controls, reload/readiness, and fullscreen enter/exit.
    const split = await page.locator('.portal-live-preview').evaluate((node) => ({ display: getComputedStyle(node).display, columns: getComputedStyle(node).gridTemplateColumns, width: node.getBoundingClientRect().width }));
    assert.equal(split.display, 'grid');
    const columnWidths = split.columns.split(' ').map((value) => Number.parseFloat(value));
    assert.equal(columnWidths.length, 2);
    assert.ok(columnWidths[0] / split.width > 0.38 && columnWidths[0] / split.width < 0.46, `editor column is not approximately 42%: ${split.columns}`);
    await page.getByRole('button', { name: 'عرض الهاتف' }).click();
    assert.ok(await page.locator('.portal-live-preview__canvas').evaluate((node) => node.classList.contains('is-mobile')));
    await page.getByRole('button', { name: 'عرض سطح المكتب' }).click();
    assert.ok(await page.locator('.portal-live-preview__canvas').evaluate((node) => node.classList.contains('is-desktop')));
    const oldNonce = new URL(frame.url()).searchParams.get('previewNonce');
    await page.getByRole('button', { name: 'إعادة تحميل المعاينة' }).click();
    frame = await waitForPreviewFrame(page, '/product.html');
    const newNonce = new URL(frame.url()).searchParams.get('previewNonce');
    assert.notEqual(newNonce, oldNonce, 'reload creates a fresh preview session');
    await frame.locator('.product-copy h1').getByText('منتج المعاينة النهائي', { exact: true }).waitFor();
    const fullscreenSupported = await page.locator('iframe').evaluate((node) => typeof node.requestFullscreen === 'function');
    if (fullscreenSupported) {
      await page.getByRole('button', { name: 'ملء الشاشة' }).click();
      await page.waitForFunction(() => document.fullscreenElement instanceof HTMLIFrameElement);
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => document.fullscreenElement === null);
    }

    // A real new-product editor gets an honest shop state. Its first iframe is
    // deterministic and never signals ready, proving skeleton, timeout, and retry.
    await page.keyboard.press('Escape');
    stallNextShopPreview = true;
    await page.getByRole('button', { name: 'إضافة جديد' }).click();
    const newPreview = page.locator('.portal-live-preview[data-preview-new-record="true"]');
    await newPreview.waitFor();
    assert.equal(await newPreview.getAttribute('data-preview-state'), 'loading');
    await newPreview.locator('.portal-live-preview__state.is-skeleton').waitFor();
    await newPreview.locator('.portal-live-preview__skeleton-block').waitFor();
    await page.waitForFunction(() => document.querySelector('.portal-live-preview[data-preview-new-record="true"]')?.getAttribute('data-preview-state') === 'error', null, { timeout: 10000 });
    await newPreview.getByRole('button', { name: 'إعادة المحاولة' }).click();
    frame = await waitForPreviewFrame(page, '/shop.html');
    await frame.getByText('منتج جديد — غير منشور', { exact: false }).first().waitFor();
    assert.equal(await newPreview.getAttribute('data-preview-state'), 'ready');
    const newProductDraftBefore = contentWrites.length;
    await page.getByLabel('اسم المنتج').fill('منتج جديد محلي');
    await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
    const storedProductDraft = await page.evaluate(() => localStorage.getItem('noamany:portal-draft:products:new'));
    assert.ok(storedProductDraft);
    assert.doesNotMatch(storedProductDraft, /accessToken|authorization|publisher|futureMetadata|\"id\"|createdAt/i, 'new-product local draft is fields-only');
    assert.equal(contentWrites.length, newProductDraftBefore, 'new-product local save is browser-only');
    await page.keyboard.press('Escape');

    // Return to the saved product so final evidence remains the fully populated,
    // settled preview rather than a transient new-record or loading state.
    await page.getByRole('button', { name: 'تعديل' }).click();
    frame = await waitForPreviewFrame(page, '/product.html');
    await page.getByLabel('اسم المنتج').fill('منتج المعاينة النهائي');
    await page.getByRole('spinbutton', { name: 'السعر *', exact: true }).fill('777');
    await frame.locator('.product-copy h1').getByText('منتج المعاينة النهائي', { exact: true }).waitFor();
    await assertBadgeClearOfHeader(frame, 'desktop recapture');
    await page.getByText('محفوظ على هذا الجهاز', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 });

    const desktopPng = await page.screenshot({ path: new URL('desktop.png', evidenceDir).pathname, fullPage: false });
    assert.ok(hasVisualContent(desktopPng), 'desktop evidence is not visually blank');

    // 390px edit/preview tabs and document/iframe overflow checks.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'التعديل' }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'التعديل' }).getAttribute('aria-selected'), 'true');
    const editTab = page.getByRole('tab', { name: 'التعديل' });
    const previewTab = page.getByRole('tab', { name: 'المعاينة' });
    assert.equal(await editTab.getAttribute('aria-controls'), await page.locator('[role="tabpanel"][aria-label="التعديل"]').getAttribute('id'));
    assert.equal(await previewTab.getAttribute('aria-controls'), await page.locator('[role="tabpanel"][aria-label="المعاينة"]').getAttribute('id'));
    await editTab.focus();
    await editTab.press('ArrowLeft');
    assert.equal(await previewTab.getAttribute('aria-selected'), 'true');
    assert.equal(await previewTab.getAttribute('tabindex'), '0');
    await previewTab.press('Home');
    assert.equal(await editTab.getAttribute('aria-selected'), 'true');
    await editTab.press('End');
    assert.equal(await page.getByRole('tab', { name: 'المعاينة' }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'عرض الهاتف' }).click();
    await page.locator('[role="dialog"]').evaluate((node) => { node.scrollTop = 0; });
    const mobileChrome = await page.locator('.portal-live-preview').evaluate((node) => {
      const tabs = node.querySelector('.portal-live-preview__mobile-tabs')?.getBoundingClientRect();
      const toolbar = node.querySelector('.portal-live-preview__toolbar')?.getBoundingClientRect();
      return { tabs: tabs && { top: tabs.top, bottom: tabs.bottom }, toolbar: toolbar && { top: toolbar.top, bottom: toolbar.bottom }, viewportHeight: innerHeight };
    });
    assert.ok(mobileChrome.tabs && mobileChrome.tabs.top >= 0 && mobileChrome.tabs.bottom <= mobileChrome.viewportHeight, 'mobile tabs are fully visible in evidence');
    assert.ok(mobileChrome.toolbar && mobileChrome.toolbar.top >= 0 && mobileChrome.toolbar.bottom <= mobileChrome.viewportHeight, 'mobile preview toolbar is fully visible in evidence');
    frame = await waitForPreviewFrame(page, '/product.html');
    await frame.locator('.product-copy h1').getByText('منتج المعاينة النهائي', { exact: true }).waitFor();
    await assertBadgeClearOfHeader(frame, 'mobile product preview');
    assertNoOverflow(await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })), 'admin at 390px');
    assertNoOverflow(await frame.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })), 'public iframe at 390px');
    const mobilePng = await page.screenshot({ path: new URL('mobile.png', evidenceDir).pathname, fullPage: false });
    assert.ok(hasVisualContent(mobilePng), 'mobile evidence is not visually blank');

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join('\n')}`);
    assert.deepEqual(contentWrites, ['PUT /api/portal-management/settings/about']);

    const report = {
      status: 'passed', fixtureOnly: true, databaseWrites: 0,
      repeatedSequences: sequences, repeatedDrafts: messages.slice(-3).map((message) => message.draft.title),
      contentWrites, contentWriteBodies, shellWrites, badgeAttempt, badgePageTwoReads, fullscreen: fullscreenSupported ? 'entered-and-exited' : 'unsupported-fallback-recorded',
      clearContract: { freshPublicText: freshClearedAbout, clearMatchesFreshPublic: true, discardRestoresPublished: true },
      coverage: {
        loadingSkeleton: true, iframeTimeoutRetry: true, newProductShopState: true,
        matchedNonemptyAdminPublicBaseline: true, eligibilityFalseTrue: true, cairoInclusiveOfferBoundary: '2026-09-10',
        productSurfaceSwitch: ['product', 'shop'], productDetailEffects: ['gallery', 'specifications', 'shortDescription', 'description'],
        productShopEffects: ['displayOrder', 'featured', 'isNew', 'shortDescription'],
        honestNewFamilies: [...honestFamilies.map((family) => family.route), 'services', 'section-settings'],
        constrainedSectionSetting: { unassignedPlaceholderBeforeSelection: true, placeholderRemovedAfterSelection: true, sectionKey: 'lead', omitted: ['details', 'image', 'linkUrl'], visible: ['subtitle', 'extraText', 'linkText'] },
        serviceEffects: ['subtitle', 'details', 'linkText', 'linkUrl'],
        ariaKeyboard: ['ArrowLeft', 'Home', 'End'], fieldOnlyStorageAndPublish: true, badgeHeaderCollision: false,
      },
      screenshots: ['desktop.png', 'mobile.png'], pageErrors, consoleErrors, apiReadCount: apiReads.length,
    };
    await writeFile(new URL('acceptance-report.json', evidenceDir), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

await main();
