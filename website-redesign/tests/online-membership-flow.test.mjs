import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('membership detail and checkout routes use only authoritative public APIs', async () => {
  const [detail, checkout, detailJs, checkoutJs, main] = await Promise.all([read('membership.html'), read('membership-checkout.html'), read('src/membership.js'), read('src/membership-checkout.js'), read('src/main.js')]);
  assert.match(detailJs, /api\(`\/memberships\/\$\{id\}/);
  assert.match(checkoutJs, /api\(`\/payment-methods/);
  assert.match(checkoutJs, /api\('\/online-memberships/);
  assert.match(checkout, /name="proof"[^>]*required/);
  assert.match(checkout, /<select name="gender" required>/);
  assert.match(checkout, /<option value="male">رجال<\/option>/);
  assert.match(checkout, /<option value="female">سيدات<\/option>/);
  assert.match(main, /\/memberships\/\$\{item\.id\}/);
  assert.match(main, />اشترك الآن</);
});

test('the production clean detail route derives its package id from the pathname', async () => {
  const source = (await read('src/membership.js')).replace(/^import[^\n]*\n/, '');
  let requested = null;
  const state = { classList: { add() {} }, textContent: '', hidden: false };
  vm.runInNewContext(source, {
    location: { pathname: '/memberships/42', search: '?branchId=3' },
    URLSearchParams,
    document: { querySelector: () => state },
    api: (path) => { requested = path; return new Promise(() => {}); },
    money: () => '',
    escapeHtml: String,
  });

  assert.equal(requested, '/memberships/42?branchId=3');
});

test('membership checkout preserves the store checkout and has mobile-friendly controls', async () => {
  const [checkout, css, storeCheckout] = await Promise.all([read('membership-checkout.html'), read('src/membership.css'), read('checkout.html')]);
  assert.match(checkout, /<main class="membership-flow"/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(storeCheckout, /إتمام الطلب/);
  assert.doesNotMatch(checkout, /<form[^>]*\bnovalidate\b/);
});

test('the authored membership fallback never sends an online member back to the contact form', async () => {
  const html = await read('index.html');
  const section = html.match(/<section class="section membership"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.ok(section, 'membership section exists');
  assert.doesNotMatch(section, /href="#contact"/);
});
