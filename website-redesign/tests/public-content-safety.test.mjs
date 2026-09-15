import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const portal = (await readFile(new URL('../src/portal.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
function renderingContext() {
  const context = vm.createContext({});
  vm.runInContext(portal, context);
  const service = main
    .slice(main.indexOf('export function servicePresentation('), main.indexOf('/* portal-preview-adapter:end */'))
    .replaceAll('export ', '');
  vm.runInContext(service, context);
  return context;
}

test('CMS image strings cannot escape the rendered image source attribute', () => {
  const context = renderingContext();
  const markup = vm.runInContext(`servicePresentation({image: 'https://example.com/x\" onerror=\"alert(1)', title: 'خدمة'}, 0)`, context);
  assert.doesNotMatch(markup, /src="[^"]*" onerror=/);
});

test('public asset paths cannot smuggle an executable or data protocol', () => {
  const context = renderingContext();
  for (const path of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'vbscript:msgbox(1)']) {
    context.path = path;
    assert.equal(vm.runInContext('assetUrl(path)', context), '');
  }
});

test('managed navigation allows site, web, phone and email links but rejects scripts', () => {
  const context = renderingContext();
  const grid = { innerHTML: '' };
  context.document = { querySelector: (selector) => selector === '.service-grid' ? grid : null };
  context.reveal = () => {};
  vm.runInContext(main.slice(main.indexOf('function renderServices('), main.indexOf('function renderClassShowcase(')), context);
  for (const path of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,x', '//evil.example/x']) {
    context.path = path;
    vm.runInContext('renderServices([{title: "خدمة", linkUrl: path}])', context);
    assert.match(grid.innerHTML, /href="#contact"/);
  }
  for (const path of ['#membership', '/shop.html', 'https://example.com', 'tel:01123456789', 'mailto:info@example.com']) {
    context.path = path;
    vm.runInContext('renderServices([{title: "خدمة", linkUrl: path}])', context);
    assert.ok(grid.innerHTML.includes(`href="${path}"`));
  }
});

test('hero-video and product badges use escaped, allowlisted public presentation helpers', async () => {
  const [shop, product, html] = await Promise.all([
    readFile(new URL('../src/shop.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/product.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="heroVideoRail"[^>]*hidden/);
  assert.match(main, /safeLink\(item\.videoLink\)/);
  assert.match(main, /assetUrl\(item\.image\)/);
  assert.match(main, /hero-video-link[\s\S]{0,500}aria-label/);
  for (const source of [main, shop, product]) {
    assert.match(source, /\['featured', 'new', 'sale', 'custom'\]/);
    assert.match(source, /const hex = \/\^#\[0-9a-fA-F\]\{6\}\$\//);
    assert.match(source, /product-badge/);
    assert.match(source, /escapeHtml\(badge\.name/);
  }
  assert.match(product, /function relatedCard[\s\S]{0,600}productBadge/);
});
