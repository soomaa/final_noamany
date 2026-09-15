import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { getPortalPreviewTarget, normalizePortalPreviewDraft } from './portal-preview-model.ts';

test('maps visual CMS records to their real public preview surfaces', () => {
  for (const configType of ['company', 'about', 'sliders', 'photos', 'videos', 'hero-videos', 'branches', 'trainers', 'classes', 'offers', 'stats', 'services', 'class-showcase', 'about-features', 'coach-features', 'section-settings']) {
    assert.deepEqual(getPortalPreviewTarget(configType, configType === 'company' ? 'settings' : 12), {
      surface: 'home',
      path: '/',
    }, configType);
  }

  assert.deepEqual(getPortalPreviewTarget('categories', 4), { surface: 'shop', path: '/shop.html' });
  assert.deepEqual(getPortalPreviewTarget('badges', 7), { surface: 'shop', path: '/shop.html' });
  assert.deepEqual(getPortalPreviewTarget('products', 'new'), { surface: 'shop', path: '/shop.html' });
  assert.deepEqual(getPortalPreviewTarget('products', 42), { surface: 'product', path: '/product.html?id=42' });
  assert.deepEqual(getPortalPreviewTarget('products', 42, 'shop'), { surface: 'shop', path: '/shop.html' });
  assert.deepEqual(getPortalPreviewTarget('products', 42, 'product'), { surface: 'product', path: '/product.html?id=42' });
});

test('does not invent a visual preview for operational portal screens', () => {
  for (const configType of ['orders', 'customers', 'job-applications', 'payment-methods', 'captain-discounts', 'captain-sales-report']) {
    assert.equal(getPortalPreviewTarget(configType, 1), null, configType);
  }
});

test('normalizes an edited product into the public renderer shape', () => {
  assert.deepEqual(normalizePortalPreviewDraft('products', 42, {
    title: 'واي بروتين',
    nameEn: 'Whey Protein',
    categoryId: '7',
    categoryName: 'مكملات غذائية',
    currentStock: '12',
    stockStatus: 'in_stock',
    price: '1250.50',
    oldPrice: '1400',
    isFeatured: true,
    isNew: false,
    image: 'products/whey.webp',
    images: ['products/whey-side.webp'],
    shortDescription: 'بروتين عالي الجودة',
    description: 'وصف المنتج',
    specifications: '{"weight":"1kg"}',
  }), {
    id: 42,
    categoryId: 7,
    category: 'مكملات غذائية',
    name: 'واي بروتين',
    nameEn: 'Whey Protein',
    stock: 12,
    stockStatus: 'in_stock',
    image: 'products/whey-side.webp',
    images: ['products/whey-side.webp'],
    description: 'وصف المنتج',
    shortDescription: 'بروتين عالي الجودة',
    specifications: '{"weight":"1kg"}',
    price: 1250.5,
    oldPrice: 1400,
    displayOrder: 1,
    featured: true,
    isNew: false,
    badge: null,
  });
});

test('normalizes product display order for the same ordering contract used by the public catalog', () => {
  const product = normalizePortalPreviewDraft('products', 7, { title: 'منتج', displayOrder: '13' });
  assert.equal(product.displayOrder, 13);
});

test('gives a new product a synthetic id and derives category and availability safely', () => {
  const product = normalizePortalPreviewDraft('products', 'new', {
    title: 'منتج جديد',
    categoryId: '9',
    currentStock: '-4',
    price: 'not-a-number',
    oldPrice: '',
    isFeatured: false,
  }, {
    categories: [{ id: 9, name: 'إكسسوارات' }],
  });

  assert.equal(typeof product.id, 'number');
  assert.ok(product.id < 0);
  assert.equal(product.category, 'إكسسوارات');
  assert.equal(product.price, 0);
  assert.equal(product.oldPrice, null);
  assert.equal(product.stock, 0);
  assert.equal(product.stockStatus, 'out_of_stock');
});

test('derives availability from edited stock instead of a stale loaded stock status', () => {
  const product = normalizePortalPreviewDraft('products', 42, {
    title: 'منتج عاد للمخزون',
    currentStock: '5',
    stockStatus: 'out_of_stock',
  });

  assert.equal(product.stock, 5);
  assert.equal(product.stockStatus, 'in_stock');
});

test('uses the first gallery image as the public primary image and preserves gallery order', () => {
  const product = normalizePortalPreviewDraft('products', 42, {
    title: 'منتج بصور',
    image: 'legacy-main.webp',
    images: ['gallery-main.webp', 'gallery-side.webp', 'gallery-main.webp'],
  });

  assert.equal(product.image, 'gallery-main.webp');
  assert.deepEqual(product.images, ['gallery-main.webp', 'gallery-side.webp']);
});

test('carries the selected persisted badge in the complete public product shape', () => {
  const product = normalizePortalPreviewDraft('products', 42, {
    title: 'منتج بشارة', selectedBadge: '8', currentStock: 1,
  }, {
    badges: [{ id: 8, name: 'الأقوى', nameEn: 'Strongest', type: 'featured', backgroundColor: '#111111', textColor: '#ffffff' }],
  });
  assert.deepEqual(product.badge, { id: 8, name: 'الأقوى', nameEn: 'Strongest', type: 'featured', backgroundColor: '#111111', textColor: '#ffffff' });
});

test('badge-settings normalization preserves routing while the shop renders badgeType', async () => {
  const draft = normalizePortalPreviewDraft('badges', 8, {
    title: 'خصم خاص', badgeType: 'sale', backgroundColor: '#b90e16', textColor: '#ffffff', isActive: true,
  });
  assert.equal(draft.type, 'badges', 'generic entity type remains available for message routing');
  assert.equal(draft.badgeType, 'sale', 'visual badge type remains a distinct field');

  const source = await readFile(new URL('../../../website-redesign/src/shop.js', import.meta.url), 'utf8');
  const body = source.match(/\/\* portal-preview-adapter:start \*\/([\s\S]*?)\/\* portal-preview-adapter:end \*\//)?.[1];
  assert.ok(body);
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
  const context = vm.createContext({ structuredClone, escapeHtml });
  const names = [...body.matchAll(/export\s+(?:function|const)\s+(\w+)/g)].map((match) => match[1]);
  vm.runInContext(`${body.split('export ').join('')}\nglobalThis.__adapter = { ${names.join(', ')} };`, context);
  const baseline = { items: [{ id: 4, badge: { id: 8, name: 'قديم', type: 'custom' } }], categories: [] };
  const merged = context.__adapter.mergeShopPreviewBaseline(baseline, { entityType: 'badges', entityId: 8, draft });
  const markup = context.__adapter.productBadge(merged.items[0].badge);
  assert.match(markup, /data-badge-type="sale"/);
});
