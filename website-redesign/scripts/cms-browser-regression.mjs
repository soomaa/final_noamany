import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await context.route('**/api/public/portal/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const home = {
      branches: [{ id: 1, name: 'فرع الاختبار' }], classes: [], sliders: [{ main_image: '/assets/hero-red.png' }],
      company: { logo: 'missing-review-logo.png', footer: 'نص الشركة الافتراضي' },
      trainers: [{ title: 'مدرب', image: '/assets/hero-red.png' }],
      heroVideos: [{ id: 17, title: 'جولة منشورة', branch: 'فرع الاختبار', date: '2026-09-10', videoLink: 'https://example.com/tour', image: '/assets/hero-red.png', mainPageVideo: true }],
      content: { 'section-settings': [
        { sectionKey: 'hero', details: 'وصف مُدار للاختبار', image: '/assets/hero.png' },
        { sectionKey: 'footer', details: 'تذييل مُدار للاختبار' },
        { sectionKey: 'coaches', image: '/assets/coach.png' },
      ] },
    };
    const products = { items: [{ id: 4, name: 'منتج الاختبار', nameEn: 'Test product', category: 'اختبار', categoryId: 1, stock: 2, stockStatus: 'in_stock', image: null, price: 100, badge: { id: 8, name: 'شارة منشورة', nameEn: 'Published', type: 'featured', backgroundColor: '#111111', textColor: '#ffffff' } }], categories: [{ id: 1, name: 'اختبار' }] };
    return route.fulfill({ json: path.endsWith('/home') ? home : path.endsWith('/products') ? products : [] });
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  const actual = {
    description: await page.locator('.hero-content > p').textContent(),
    background: await page.locator('.hero-bg').evaluate((node) => getComputedStyle(node).backgroundImage),
    logoLoaded: await page.locator('header .brand-mark img').evaluate((node) => node.complete && node.naturalWidth > 0),
    footer: await page.locator('footer .footer-grid > p').textContent(),
    coachImage: await page.locator('.coach-photo img').getAttribute('src'),
    heroVideo: await page.locator('#heroVideoRail .hero-video-copy strong').textContent(),
    homeBadge: await page.locator('.product-grid .product-badge').textContent(),
  };
  console.log(JSON.stringify(actual));
  assert.equal(actual.description, 'وصف مُدار للاختبار', 'CMS hero description must reach the public paragraph');
  assert.ok(actual.background.includes('/assets/hero.png'), 'section image must override the slider fallback');
  assert.equal(actual.logoLoaded, true, 'missing CMS logo must retain the shipped brand asset');
  assert.equal(actual.footer, 'تذييل مُدار للاختبار', 'section-specific copy must override company fallback');
  assert.equal(actual.coachImage, '/assets/coach.png', 'section-specific image must override trainer fallback');
  assert.equal(actual.heroVideo, 'جولة منشورة', 'published hero video must use the real rail');
  assert.match(actual.homeBadge, /شارة منشورة/, 'published badge must render on the homepage card');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#heroVideoRail').evaluate((node) => getComputedStyle(node).display !== 'none'), true, 'hero rail remains visible at 390px');
  assert.equal(await page.locator('.product-grid .product-badge').isVisible(), true, 'persisted badge remains visible at 390px');
} finally { await browser.close(); }
