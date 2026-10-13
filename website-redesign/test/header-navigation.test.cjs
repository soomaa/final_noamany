const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

function renderedHomepage() {
  return readFileSync(resolve(__dirname, '..', 'dist', 'index.html'), 'utf8');
}

test('does not render the red ticker beneath the hero', () => {
  assert.doesNotMatch(renderedHomepage(), /class="ticker"/);
});

test('places the cart link after the contact link in the top navigation', () => {
  const homepage = renderedHomepage();
  const contactIndex = homepage.indexOf('>تواصل معنا</a>');
  const cartIndex = homepage.indexOf('class="nav-cart"');

  assert.ok(contactIndex >= 0, 'contact link should be rendered');
  assert.ok(cartIndex > contactIndex, 'cart link should follow the contact link');
});

test('places the cart link after contact in the mobile navigation', () => {
  const mobileNavigation = renderedHomepage().split('class="mobile-nav"')[1];

  assert.ok(mobileNavigation.indexOf('>تواصل معنا</a>') < mobileNavigation.indexOf('>سلة المشتريات</a>'));
});
