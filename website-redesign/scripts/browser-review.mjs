// DOM and interaction review only. No screenshots and no live API mutations.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ headless: true });
const report = { viewports: [], interactions: [] };
try {
  const page = await browser.newPage();
  // Third-party maps/media are outside this local DOM check and can keep loading indefinitely.
  await page.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const home = await (await page.request.get(`${base}/api/public/portal/home`)).json();
  const catalog = await (await page.request.get(`${base}/api/public/portal/products`)).json();
  const branchId = home.branches[0].id;
  const packages = await (await page.request.get(`${base}/api/public/portal/memberships?branchId=${branchId}`)).json();
  const packageId = packages[0].id;
  const product = catalog.items[0] || { id: 9999, name: 'منتج اختبار محلي', category: 'اختبار', categoryId: 1, price: 100, stock: 5, stockStatus: 'in_stock', image: null };
  report.catalog = { count: catalog.items.length, available: catalog.items.filter((item) => item.stockStatus === 'in_stock' && item.stock > 0).length };
  const paymentMethods = await (await page.request.get(`${base}/api/public/portal/payment-methods?branchId=${branchId}`)).json();
  // Reuse the read-only local snapshot so concurrent backend restarts cannot change a viewport comparison.
  await page.route('**/api/public/portal/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/home') ? home : path.endsWith('/products') ? catalog
      : path.includes('/products/') ? { ...product, related: [] }
      : path.endsWith('/memberships') ? packages : path.includes('/memberships/') ? packages[0]
      : path.endsWith('/payment-methods') ? paymentMethods : [];
    return route.fulfill({ json: data });
  });
  const routes = ['/', '/shop.html', `/product.html?id=${product.id}`, '/checkout.html', '/account.html', '/careers.html', `/memberships/${packageId}?branchId=${branchId}`, `/membership-checkout?packageId=${packageId}&branchId=${branchId}`];
  for (const width of process.env.INTERACTIONS_ONLY ? [] : [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const route of routes) {
      await page.goto(`${base}${route}`);
      await page.waitForLoadState('networkidle');
      const metrics = await page.evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const controls = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(visible);
        return {
          title: document.title, rtl: document.documentElement.dir,
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          exposedOverflow: document.documentElement.scrollWidth > innerWidth + 1 && !['hidden', 'clip'].includes(getComputedStyle(document.body).overflowX),
          unlabeledFields: controls.filter((el) => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map((el) => el.id || el.name),
          tickerCount: document.querySelectorAll('.ticker').length,
          logo: [...document.querySelectorAll('header img')].filter(visible).map((el) => ({ width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height), loaded: el.complete && el.naturalWidth > 0 })),
        };
      });
      assert.equal(metrics.rtl, 'rtl');
      assert.equal(metrics.tickerCount, 0);
      assert.equal(metrics.exposedOverflow, false, `${width}px ${route}: horizontal overflow`);
      assert.ok(metrics.logo.some((logo) => logo.loaded && logo.width > 0), `${route}: visible logo`);
      report.viewports.push({ route, ...metrics });
      console.log(JSON.stringify({ checked: route, width, unlabeledFields: metrics.unlabeledFields }));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/public/portal/products', (route) => route.fulfill({ json: { items: [{ id: 9999, name: 'منتج اختبار محلي', category: 'اختبار', categoryId: 1, price: 100, stock: 5, stockStatus: 'in_stock', image: null }], categories: [{ id: 1, name: 'اختبار' }] } }));
  await page.goto(`${base}/shop.html`);
  await page.locator('.shop-add:not([disabled])').first().waitFor();
  await page.locator('.shop-add:not([disabled])').first().click();
  assert.equal(await page.locator('.shop-toast').getAttribute('role'), 'status', 'cart feedback must be announced');
  await page.locator('#openCart').click();
  assert.equal(await page.locator('#cartDrawer').getAttribute('aria-hidden'), 'false');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#cartDrawer').getAttribute('aria-hidden'), 'true');
  report.interactions.push('fixture store product add to cart; accessible drawer open and Escape close');
  await page.goto(`${base}/checkout.html`);
  await page.locator('#checkoutForm').waitFor();
  assert.ok(await page.locator('#couponCode').evaluate((node) => node.labels.length || node.getAttribute('aria-label')), 'coupon field needs an accessible name');
  let orderBody;
  await page.route('**/api/public/portal/coupons/validate', (route) => route.fulfill({ json: { code: 'QA', rate: 10, discount: 10, total: 90 } }));
  await page.route('**/api/public/portal/orders', (route) => { orderBody = route.request().postDataJSON(); return route.fulfill({ json: { orderId: 123, total: 90 } }); });
  await page.locator('#couponCode').fill('QA');
  await page.locator('#applyCoupon').click();
  await page.locator('#couponNote').filter({ hasText: '10%' }).waitFor();
  for (const [name, value] of Object.entries({ fullName: 'عميل اختبار محلي', phone: '01012345678', governorate: 'الغربية', cityStreet: 'شارع الاختبار' })) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('.submit-order').click();
  await page.locator('.order-success').waitFor();
  assert.equal(orderBody.couponCode, 'QA');
  assert.ok(orderBody.items.length);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('noamany_store_cart_v2')).length), 0);
  report.interactions.push('coupon and guest order payload; success clears cart (API intercepted, no database write)');

  await page.route('**/api/public/portal/payment-methods?*', (route) => route.fulfill({ json: [{ id: 7, name: 'تحويل محلي', destination: '01012345678' }] }));
  await page.route('**/api/public/portal/online-memberships', (route) => route.fulfill({ status: 400, json: { message: 'تعذر قبول الإثبات — اختبار محلي' } }));
  await page.goto(`${base}/membership-checkout?packageId=${packageId}&branchId=${branchId}`);
  await page.locator('#membershipCheckoutForm').waitFor({ state: 'visible' });
  await page.locator('[name="fullName"]').fill('عميل اختبار محلي');
  await page.locator('[name="gender"]').selectOption('male');
  await page.locator('[name="phone"]').fill('01012345678');
  await page.locator('[name="proof"]').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from('local-test') });
  await page.locator('[type="submit"]').click();
  await page.locator('#checkoutState').filter({ hasText: 'تعذر قبول الإثبات' }).waitFor({ state: 'visible' });
  await page.unroute('**/api/public/portal/online-memberships');
  await page.route('**/api/public/portal/online-memberships', (route) => route.fulfill({ json: { id: 456, message: 'تم استلام الطلب' } }));
  await page.locator('[type="submit"]').click();
  await page.locator('#checkoutState').filter({ hasText: '456' }).waitFor();
  assert.equal(await page.locator('#membershipCheckoutForm').isVisible(), false);
  report.interactions.push('membership payment destination, proof rejection visible, corrected retry and success (API intercepted)');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
