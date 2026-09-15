import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('WEB-02 removes the public ticker from markup and CMS hydration', async () => {
  const [html, main, cssFiles] = await Promise.all([
    read('index.html'),
    read('src/main.js'),
    readdir(new URL('src/', root)),
  ]);
  const cssPaths = cssFiles.filter((file) => file.endsWith('.css')).map((file) => `src/${file}`);
  const styles = await Promise.all(cssPaths.map(read));

  assert.doesNotMatch(html, /class=["'][^"']*\bticker\b/);
  assert.doesNotMatch(main, /renderTicker|content\.ticker/);
  styles.forEach((source, index) => {
    assert.doesNotMatch(source, /(?:\.ticker\b|@keyframes\s+ticker\b)/, cssPaths[index]);
  });
});

test('the primary public CTA says اشترك الآن and leads to the membership plans', async () => {
  const [html, main] = await Promise.all([read('index.html'), read('src/main.js')]);

  assert.match(html, /class="btn primary membership-cta" href="#membership">اشترك الآن/);
  assert.doesNotMatch(html, /اطلب السعر/);
  assert.doesNotMatch(main, /اطلب السعر/);
  assert.match(
    main,
    /<a href="\/memberships\/\$\{item\.id\}\?branchId=\$\{item\.branchId\}" class="btn \$\{index === 1 \? 'primary' : 'ghost'\}">اشترك الآن<\/a>/,
  );
});

test('the main header uses the current Noamany asset on a dark edge-treated surface', async () => {
  const [html, css, catalog] = await Promise.all([
    read('index.html'),
    read('src/content-dynamic.css'),
    read('src/catalog.css'),
  ]);

  assert.match(html, /class="brand-mark"[^>]*>\s*<img src="\/assets\/noamany-logo\.png"/);
  assert.doesNotMatch(catalog, /\.brand>span:last-child\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.site-header \.brand-mark\s*\{[^}]*background:\s*linear-gradient\([^}]*rgba\(48,20,24/);
  assert.doesNotMatch(css, /\.site-header \.brand-mark\s*\{[^}]*background:[^;}]*#(?:fff|f7f4ef|fffdfa)/);
  assert.match(css, /\.site-header \.brand-mark img\s*\{[^}]*filter:[^}]*drop-shadow/);
});

test('all public entry points opt into safe-area mobile rendering', async () => {
  const pages = ['index.html', 'shop.html', 'product.html', 'checkout.html', 'account.html', 'careers.html'];
  const [html, nav] = await Promise.all([Promise.all(pages.map(read)), read('src/nav-unified.css')]);

  html.forEach((source, index) => {
    assert.match(source, /<html[^>]*lang="ar"[^>]*dir="rtl"/, pages[index]);
    assert.match(source, /name="viewport" content="[^"]*viewport-fit=cover/, pages[index]);
  });
  assert.match(nav, /padding-top:\s*env\(safe-area-inset-top\)/);
});

test('390px navigation and checkout controls retain accessible touch targets', async () => {
  const nav = await read('src/nav-unified.css');

  assert.match(nav, /@media\s*\(max-width:\s*420px\)[\s\S]*?\.mobile-nav a\s*\{[^}]*min-height:\s*48px/);
  assert.match(nav, /@media\s*\(max-width:\s*420px\)[\s\S]*?\.commerce-cart\s*\{[^}]*min-height:\s*44px/);
  assert.match(nav, /@media\s*\(max-width:\s*420px\)[\s\S]*?\.submit-order\s*\{[^}]*min-height:\s*52px/);
  assert.match(nav, /\.commerce-menu\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(nav, /\.commerce-header nav\.open\s*\{[^}]*display:\s*flex/);
  assert.match(nav, /:focus-visible\s*\{[^}]*outline:/);
});

test('WEB-01 keeps every public homepage section wired to managed content', async () => {
  const main = await read('src/main.js');

  ['products', 'offers', 'services', 'classes', 'coaches', 'gallery', 'membership', 'branches', 'contact']
    .forEach((key) => assert.match(main, new RegExp(`${key}:['"]\\.[^'"]+`), key));
  assert.match(main, /renderSectionSettings\(content\['section-settings'\]\)/);
});

test('WEB-04 preserves the top cart and compact responsive product grid', async () => {
  const [shop, css] = await Promise.all([read('shop.html'), read('src/shop.css')]);

  assert.match(shop, /<header[\s\S]*?<button class="shop-cart-button" id="openCart">السلة/);
  assert.match(shop, /class="shop-logo"[^>]*>\s*<img src="\/assets\/noamany-logo\.png"/);
  assert.doesNotMatch(css, /\.shop-header \.shop-logo\s*\{[^}]*background:[^}]*rgba\(255,\s*250,\s*246/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.shop-grid\{grid-template-columns:repeat\(2,1fr\)/);
  assert.match(css, /@media\(max-width:400px\)\{\.shop-grid\{grid-template-columns:1fr/);
});

test('WEB-04 closed cart drawer cannot widen narrow full-page captures', async () => {
  const css = await read('src/shop.css');
  assert.match(css, /\.cart-drawer:not\(\.open\)\{display:none;visibility:hidden;pointer-events:none\}/);
  assert.match(css, /\.cart-drawer\.open\{display:block;visibility:visible\}/);
  assert.match(css, /@media\(max-width:420px\)\{\.shop-header::after\{right:0;width:100%\}\}/);
});
