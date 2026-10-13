const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const root = resolve(__dirname, '..');
const html = () => readFileSync(resolve(root, 'subscribe.html'), 'utf8');
const script = () => readFileSync(resolve(root, 'src', 'subscribe.js'), 'utf8');

test('keeps the selected plan and verifies the member before opening payment', () => {
  assert.match(html(), /name="memberCode"/);
  assert.match(html(), /name="customerName"/);
  assert.match(html(), /data-step="member"/);
  assert.match(html(), /data-step="payment"/);
  assert.match(script(), /online-subscription-options/);
  assert.match(script(), /plans\.find/);
  assert.match(script(), /paymentMethods/);
});

test('uses the selected plan id for the online subscription request', () => {
  assert.match(script(), /subscriptionTypeId/);
  assert.match(script(), /online-subscriptions/);
  assert.match(html(), /name="paymentProof"/);
  assert.match(html(), /name="notes"/);
});

test('does not leave a price-request CTA in the membership cards', () => {
  const homepage = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.doesNotMatch(homepage, />اطلب السعر</);
});

test('includes the subscription page in the production Vite build', () => {
  const viteConfig = readFileSync(resolve(root, 'vite.config.js'), 'utf8');
  assert.match(viteConfig, /subscribe:\s*resolve\(import\.meta\.dirname, 'subscribe\.html'\)/);
});

test('loads the site design system from the Vite source stylesheet', () => {
  assert.match(html(), /href="\/src\/styles\.css"/);
});
