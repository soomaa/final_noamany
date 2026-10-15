import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('POS product browser lets products flow with the page without a bounded frame', async () => {
  let frameModule = null;
  try {
    frameModule = await import('./pos-product-browser-frame.ts');
  } catch {
    // The assertion below reports the missing layout contract during TDD.
  }

  assert.ok(frameModule, 'the POS product browser frame must exist');

  const markup = renderToStaticMarkup(
    createElement(frameModule.PosProductBrowserFrame, {
      categories: createElement('div', null, 'الفئات'),
      products: createElement('div', null, 'المنتجات'),
      frameLabel: 'اختيار المنتجات',
      categoriesLabel: 'فئات المنتجات',
      productsLabel: 'قائمة المنتجات القابلة للتمرير',
    }),
  );

  assert.match(markup, /aria-label="اختيار المنتجات"/);
  assert.match(markup, /aria-label="فئات المنتجات"/);
  assert.match(markup, /aria-label="قائمة المنتجات القابلة للتمرير"/);
  assert.doesNotMatch(markup, /h-\[clamp|grid-rows-|overflow-hidden|rounded-2xl|bg-card/);
  const productRegion = markup.split('aria-label="قائمة المنتجات القابلة للتمرير"')[1];
  assert.doesNotMatch(productRegion, /overflow-y-auto|max-h-|tabindex/);
  assert.match(markup, />الفئات</);
  assert.match(markup, />المنتجات</);
});
