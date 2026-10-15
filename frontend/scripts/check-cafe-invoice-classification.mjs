import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createFixtureServer } from './local-app-fixture-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer();
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const output = fileURLToPath(new URL('../../outputs/cafe-invoice-restore-20261015/', import.meta.url));
await mkdir(output, { recursive: true });
const writes = [];
const pageErrors = [];
const products = [
  { id: 7, name: 'لاتيه تجريبي', productCode: 'CP7', categoryId: 1, categoryIds: [1, 7],
    productType: 'ready', sellPrice: 40, currentStock: 100, isActive: true, imageUrl: null, variants: [], variantCount: 0 },
  { id: 8, name: 'مياه تجريبية', productCode: 'CP8', categoryId: 2, categoryIds: [2],
    productType: 'ready', sellPrice: 10, currentStock: 100, isActive: true, imageUrl: null, variants: [], variantCount: 0 },
];
const bundle = { id: 3, bundleCode: 'B3', name: 'باندل تجريبي', description: null, imageUrl: null,
  pricingMode: 'fixed', fixedPrice: 30, discountPercentage: 0, isActive: true,
  groups: [{ id: 30, name: 'مشروب', minSelect: 1, maxSelect: 1, sortOrder: 0,
    options: [{ id: 31, cafeProductId: 7, productName: products[0].name, productCode: 'CP7', cafeVariantId: null,
      variantName: null, categoryId: 1, categoryIds: [1, 7], sellPrice: 40, priceDelta: 0, sortOrder: 0, isActive: true }] }] };
const draft = { id: 42, editRevision: 0, saleNumber: 'TEST-42', dailyNumber: 42, branchId: 1,
  status: 'draft', saleType: 'customer', customerName: 'عميل نقدي', gender: 'male', cafeCategoryId: 7,
  paymentMethod: 'cash', payments: [], subtotal: 30, totalAmount: 30, discountAmount: 0, taxAmount: 0,
  discountPercentage: 0, taxPercentage: 0, inventoryPosted: false, receiptPrinted: false,
  items: [{ id: 420, name: bundle.name, productCode: bundle.bundleCode, productId: 0, cafeProductId: null,
    bundleId: 3, bundleSelections: [{ groupId: 30, cafeProductId: 7, cafeVariantId: null }],
    quantity: 1, unitPrice: 30, lineTotal: 30 }] };

try {
  for (const [name, viewport, locale] of [
    ['desktop', { width: 1440, height: 1100 }, 'ar'],
    ['mobile', { width: 390, height: 844 }, 'en'],
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(value => localStorage.setItem('hr_locale', value), locale);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.slice(4);
      let body = [];
      if (request.method() !== 'GET' && path.startsWith('/quick-sales')) {
        const payload = request.postDataJSON();
        writes.push({ path, ...payload });
        body = { ...draft, ...payload, id: 42, status: payload.onHold ? 'draft' : 'completed' };
      } else if (path === '/auth/me') body = { sub: 1, id: 1, name: 'Test Operator', level: 1, branch: 1 };
      else if (path === '/me/permissions') body = { superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} };
      else if (path === '/me/workspace') body = { homeRoute: '/sales/new', widgets: [], roleHint: 'admin' };
      else if (path.endsWith('branches') || path.endsWith('branch-options')) body = [{ id: 1, name: 'فرع تجريبي', isActive: true }];
      else if (path === '/categories') body = [1, 2, 7].map(id => ({ id, nameAr: `فئة ${id}`, nameEn: `Category ${id}`, isActive: true, sortOrder: id }));
      else if (path === '/cafe-products') {
        const category = Number(url.searchParams.get('categoryId'));
        const data = category ? products.filter(product => product.categoryIds.includes(category)) : products;
        body = { data, total: data.length, page: 1, pageSize: 100 };
      } else if (path === '/cafe-bundles/3') body = bundle;
      else if (path === '/cafe-bundles') body = { data: [{ ...bundle, groupCount: 1, optionCount: 1 }], total: 1, page: 1, pageSize: 100 };
      else if (path === '/quick-sales/42') body = draft;
      else if (path === '/quick-sales/shift-board') body = { sessions: [], totals: { orders: 0, completed: 0, value: 0, held: 0, drafts: 0 } };
      else if (path === '/pos-settings/general') body = [{ key: 'enable_tax', value: false }, { key: 'inventory_tracking_enabled', value: true }];
      else if (path === '/pos-payment-methods' || path === '/pos-invoice-templates') body = { data: [], total: 0 };
      else if (path === '/pos/stock-watch') body = { configured: true, since: '2026-10-15', shift: null, items: [] };
      else if (path === '/shift-sessions/current') body = null;
      else if (path === '/shifts/schedule-status') body = { current: null, next: null, secondsUntilNext: null, alertActive: false };
      else if (path.endsWith('/unread-count')) body = { count: 0 };
      await route.fulfill({ json: body });
    });

    await page.goto(`${base}/sales/new`);
    const category = page.locator('#invoice-category');
    const gender = page.locator('#invoice-gender');
    await category.waitFor();
    assert.equal(await category.inputValue(), '', 'new invoices must not inherit a guessed category');
    assert.equal(await gender.inputValue(), '', 'new invoices must not inherit a guessed gender');
    await category.selectOption('7');
    await page.getByRole('button').filter({ hasText: products[0].name }).click();
    const save = page.getByRole('button', { name: locale === 'ar' ? 'تعليق وحفظ' : 'Hold and save', exact: true });
    const count = writes.length;
    await save.click();
    await page.getByText(locale === 'ar' ? 'اختر جنس العميل' : 'Select customer gender', { exact: true }).last().waitFor();
    assert.equal(writes.length, count, 'a missing gender must never reach the API');
    await gender.selectOption('female');
    await category.selectOption('2');
    assert.equal(await category.inputValue(), '7', 'changing category cannot silently invalidate an existing cart');
    await category.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}${name}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `${name} must not overflow horizontally`);
    const saved = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/quick-sales');
    await save.click();
    const payload = (await saved).postDataJSON();
    assert.equal(payload.gender, 'female');
    assert.equal(payload.cafeCategoryId, 7);
    assert.equal(payload.items[0].cafeProductId, 7);

    await page.goto(`${base}/sales/new?draftId=42`);
    await page.waitForFunction(() => document.querySelector('#invoice-category')?.value === '7');
    assert.equal(await gender.inputValue(), 'male');
    await page.locator('[data-pos-cart]').getByText(bundle.name, { exact: true }).waitFor();
    const revised = page.waitForRequest(request => request.method() === 'PUT' && new URL(request.url()).pathname === '/api/quick-sales/42/draft');
    await save.click();
    const revision = (await revised).postDataJSON();
    assert.equal(revision.gender, 'male');
    assert.equal(revision.cafeCategoryId, 7);
    assert.equal(revision.items[0].bundleId, 3);
    assert.deepEqual(revision.items[0].bundleSelections, [{ groupId: 30, cafeProductId: 7 }]);
    console.log(`PASS ${name}: explicit classification, category lock, saved header and bundle-draft restoration`);
    await context.close();
  }
  assert.deepEqual(pageErrors, [], 'the real invoice UI must not throw browser errors');
} finally {
  await browser.close();
  await server.close();
}
