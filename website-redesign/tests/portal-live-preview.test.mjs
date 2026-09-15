import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  classifyPortalPreviewInteraction,
  installPortalPreviewReceiver,
  isPortalPreviewMessage,
} from '../src/portal-preview.js';

const sourceRoot = new URL('../src/', import.meta.url);
const readSource = (name) => readFile(new URL(name, sourceRoot), 'utf8');

function previewAdapter(source) {
  const body = source.match(/\/\* portal-preview-adapter:start \*\/([\s\S]*?)\/\* portal-preview-adapter:end \*\//)?.[1];
  assert.ok(body, 'page exposes its isolated preview adapter contract');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const context = vm.createContext({
    structuredClone,
    escapeHtml,
    assetUrl: (value) => `/uploads/${String(value ?? '').replace(/^\/+/, '')}`,
    productImageUrl: (value) => value ? `/uploads/${String(value).replace(/^\/+/, '')}` : '/assets/product-placeholder.png',
    safeLink: (value, fallback = '#') => /^(?:https?:\/\/|\/|#)/.test(String(value || '')) ? String(value) : fallback,
    money: (value) => `${Number(value || 0)} ج.م`,
  });
  const names = [...body.matchAll(/export\s+(?:function|const)\s+(\w+)/g)].map((match) => match[1]);
  vm.runInContext(`${body.replaceAll('export ', '')}\nglobalThis.__adapter = { ${names.join(', ')} };`, context);
  return context.__adapter;
}

const snapshot = (sequence = 1, nonce = 'nonce-123') => ({
  type: 'noamany:cms-preview',
  version: 1,
  nonce,
  sequence,
  surface: 'shop',
  entityType: 'products',
  entityId: 42,
  draft: { name: 'منتج تجريبي' },
});

function previewEnvironment(overrides = {}) {
  const listeners = new Map();
  const parent = {
    sent: [],
    postMessage(message, targetOrigin) { this.sent.push({ message, targetOrigin }); },
  };
  const window = {
    location: { href: 'http://127.0.0.1:5175/shop.html?cmsPreview=1&previewNonce=nonce-123' },
    parent,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
  };
  return {
    window,
    document: { referrer: 'http://127.0.0.1:5174/portal/products' },
    listeners,
    ...overrides,
  };
}

test('validates the exact versioned CMS preview message contract', () => {
  assert.equal(isPortalPreviewMessage(snapshot()), true);
  assert.equal(isPortalPreviewMessage({ ...snapshot(), version: 2 }), false);
  assert.equal(isPortalPreviewMessage({ ...snapshot(), type: 'cms-preview' }), false);
  assert.equal(isPortalPreviewMessage({ ...snapshot(), sequence: 1.5 }), false);
  assert.equal(isPortalPreviewMessage({ ...snapshot(), surface: 'checkout' }), false);
  assert.equal(isPortalPreviewMessage({ ...snapshot(), draft: '<b>raw html</b>' }), false);
});

test('receiver handshakes with an explicit referrer origin and accepts only bound events', () => {
  const environment = previewEnvironment();
  const received = [];
  const cleanup = installPortalPreviewReceiver((message) => received.push(message), environment);

  assert.deepEqual(environment.window.parent.sent, [{
    message: { type: 'noamany:preview-ready', version: 1, nonce: 'nonce-123' },
    targetOrigin: 'http://127.0.0.1:5174',
  }]);

  const dispatch = (event) => environment.listeners.get('message')?.(event);
  dispatch({ data: snapshot(), source: {}, origin: 'http://127.0.0.1:5174' });
  dispatch({ data: snapshot(), source: environment.window.parent, origin: 'https://evil.example' });
  dispatch({ data: snapshot(1, 'wrong'), source: environment.window.parent, origin: 'http://127.0.0.1:5174' });
  dispatch({ data: snapshot(), source: environment.window.parent, origin: 'http://127.0.0.1:5174' });

  assert.deepEqual(received, [snapshot()]);
  cleanup();
  assert.equal(environment.listeners.has('message'), false);
});

test('receiver ignores stale or repeated sequence values', () => {
  const environment = previewEnvironment();
  const received = [];
  installPortalPreviewReceiver((message) => received.push(message.sequence), environment);
  const dispatch = (sequence) => environment.listeners.get('message')?.({
    data: snapshot(sequence),
    source: environment.window.parent,
    origin: 'http://127.0.0.1:5174',
  });

  dispatch(4);
  dispatch(4);
  dispatch(3);
  dispatch(5);
  assert.deepEqual(received, [4, 5]);
});

test('receiver stays inert outside a nonce-bound preview URL', () => {
  const environment = previewEnvironment();
  environment.window.location.href = 'http://127.0.0.1:5175/shop.html';
  installPortalPreviewReceiver(() => assert.fail('must not receive'), environment);
  assert.equal(environment.listeners.has('message'), false);
  assert.deepEqual(environment.window.parent.sent, []);
});

test('interaction helper allows in-page anchors and identifies unsafe preview actions', () => {
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'A', href: 'http://127.0.0.1:5175/#membership' }, 'http://127.0.0.1:5175/'), 'in-page');
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'FORM' }, 'http://127.0.0.1:5175/'), 'transaction');
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'BUTTON', id: 'addProduct', className: '' }, 'http://127.0.0.1:5175/product.html?id=42'), 'transaction');
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'BUTTON', className: 'remove', dataset: { action: 'remove' } }, 'http://127.0.0.1:5175/shop.html'), 'transaction');
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'A', href: 'http://127.0.0.1:5175/checkout.html' }, 'http://127.0.0.1:5175/shop.html'), 'transaction');
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'A', href: 'https://external.example/path' }, 'http://127.0.0.1:5175/'), 'external-navigation');
  assert.equal(classifyPortalPreviewInteraction({ tagName: 'DIV' }, 'http://127.0.0.1:5175/'), 'allow');
});

test('homepage adapter immutably replaces every supported CMS entity family', async () => {
  const source = await readSource('main.js');
  const { mergeHomePreviewBaseline, HOME_PREVIEW_FAMILIES } = previewAdapter(source);
  const expectedFamilies = ['company', 'about', 'sliders', 'photos', 'videos', 'hero-videos', 'branches', 'trainers', 'classes', 'offers', 'stats', 'services', 'class-showcase', 'about-features', 'coach-features', 'section-settings'];
  assert.deepEqual([...HOME_PREVIEW_FAMILIES], expectedFamilies);

  const baseline = {
    company: { nameweb: 'منشور' }, about: { id: 1, title: 'منشور' },
    sliders: [{ id: 1, title: 'منشور' }], photos: [], videos: [], branches: [], trainers: [], classes: [], offers: [],
    content: { stats: [], services: [], 'class-showcase': [], 'about-features': [], 'coach-features': [], 'section-settings': [] },
  };
  const original = structuredClone(baseline);
  for (const entityType of expectedFamilies) {
    const result = mergeHomePreviewBaseline(baseline, { entityType, entityId: entityType === 'company' || entityType === 'about' ? 'settings' : 9, draft: { id: 9, title: `${entityType} draft`, mainImage: 'draft.webp' } });
    assert.deepEqual(baseline, original, `${entityType} preserves published baseline`);
    const family = entityType === 'hero-videos' ? result.heroVideos : entityType === 'company' || entityType === 'about' ? result[entityType] : result.content[entityType] ?? result[entityType];
    assert.ok(Array.isArray(family) ? family.some((item) => item.title === `${entityType} draft`) : family.title === `${entityType} draft`, entityType);
  }
  assert.doesNotMatch(source, /entityType === 'hero-videos' \? 'videos'/);
  assert.match(source, /installPortalPreviewReceiver\([\s\S]{0,500}renderHomeState/);
});

test('shop adapter previews categories, products, and assigned badges without inventing assignment', async () => {
  const source = await readSource('shop.js');
  const { mergeShopPreviewBaseline } = previewAdapter(source);
  const baseline = { items: [{ id: 1, name: 'منشور', categoryId: 7, category: 'قديم' }], categories: [{ id: 7, name: 'قديم' }] };
  const original = structuredClone(baseline);

  const category = mergeShopPreviewBaseline(baseline, { entityType: 'categories', entityId: 7, draft: { id: 7, title: 'جديد' } });
  assert.equal(category.categories[0].name, 'جديد');
  assert.equal(category.items[0].category, 'جديد');
  const product = mergeShopPreviewBaseline(baseline, { entityType: 'products', entityId: 'new', draft: { id: -1, name: 'مسودة', stock: 3, stockStatus: 'in_stock' } });
  assert.equal(product.items[0].id, -1);
  const assignedBaseline = { ...baseline, items: [{ ...baseline.items[0], badge: { id: 3, name: 'قديم' } }, { id: 2, name: 'آخر', badge: { id: 9, name: 'ثابت' } }] };
  const badge = mergeShopPreviewBaseline(assignedBaseline, { entityType: 'badges', entityId: 3, draft: { id: 3, title: 'الأفضل', type: 'featured', backgroundColor: '#111111', textColor: '#ffffff', isActive: true } });
  assert.equal(badge.items[0].badge.name, 'الأفضل');
  assert.equal(badge.items[1].badge.name, 'ثابت');
  const inactive = mergeShopPreviewBaseline(assignedBaseline, { entityType: 'badges', entityId: 3, draft: { id: 3, isActive: false } });
  assert.equal(inactive.items[0].badge, null);
  assert.equal(inactive.items[1].badge.id, 9);
  const unassigned = mergeShopPreviewBaseline(assignedBaseline, { entityType: 'badges', entityId: 'new', draft: { id: -1, title: 'جديدة', isActive: true } });
  assert.deepEqual(unassigned.items, assignedBaseline.items);
  assert.equal(unassigned.badgePreview.label, 'نموذج الشارة قبل التعيين');
  assert.equal(unassigned.badgePreview.message, 'لا توجد منتجات تستخدم هذه الشارة');
  assert.deepEqual(baseline, original);
  assert.doesNotMatch(source.match(/\/\* portal-preview-adapter:start \*\/[\s\S]*?\/\* portal-preview-adapter:end \*\//)?.[0] ?? '', /localStorage|addToCart|updateCartItem/);
  assert.match(source, /installPortalPreviewReceiver\([\s\S]{0,500}renderShopState/);
});

test('hero-video preview uses its distinct public collection and mirrors enabled state', async () => {
  const source = await readSource('main.js');
  const { mergeHomePreviewBaseline } = previewAdapter(source);
  const baseline = { videos: [{ id: 1, title: 'عادي' }], heroVideos: [{ id: 7, title: 'منشور', mainPageVideo: true }], content: {} };
  const original = structuredClone(baseline);
  const edited = mergeHomePreviewBaseline(baseline, { entityType: 'hero-videos', entityId: 7, draft: { id: 7, title: 'مسودة', mainPageVideo: true } });
  assert.equal(edited.heroVideos[0].title, 'مسودة');
  assert.deepEqual(edited.videos, baseline.videos);
  const removed = mergeHomePreviewBaseline(baseline, { entityType: 'hero-videos', entityId: 7, draft: { id: 7, mainPageVideo: false } });
  assert.deepEqual(removed.heroVideos, []);
  const inserted = mergeHomePreviewBaseline(baseline, { entityType: 'hero-videos', entityId: 'new', draft: { id: -1, title: 'جديد', mainPageVideo: true } });
  assert.equal(inserted.heroVideos[0].title, 'جديد');
  assert.deepEqual(baseline, original);
  assert.match(source, /renderHeroVideos\(data\.heroVideos\)/);
  assert.doesNotMatch(source, /entityType === 'hero-videos' \? 'videos'/);
});

test('persisted badge markup escapes names and rejects unsafe types and colors', async () => {
  for (const file of ['main.js', 'shop.js', 'product.js']) {
    const { productBadge } = previewAdapter(await readSource(file));
    const markup = productBadge({ name: '<img src=x>', nameEn: '<script>', type: 'evil" onclick="x', backgroundColor: 'red;position:fixed', textColor: 'url(x)' });
    assert.match(markup, /data-badge-type="custom"/);
    assert.match(markup, /--badge-bg:#b90e16;--badge-fg:#ffffff/);
    assert.doesNotMatch(markup, /<img|<script|onclick/);
    assert.match(markup, /&lt;img src=x&gt;/);
    assert.match(productBadge({ name: 'فاتحة', type: 'custom', backgroundColor: '#ffffff', textColor: '#ffffff' }), /--badge-fg:#111111/);
  }
});

test('product adapter replaces only its matching saved product', async () => {
  const source = await readSource('product.js');
  const { mergeProductPreviewBaseline } = previewAdapter(source);
  const baseline = { id: 42, name: 'منشور', related: [{ id: 2, name: 'آخر' }] };
  assert.equal(mergeProductPreviewBaseline(baseline, { entityType: 'products', entityId: 42, draft: { id: 42, name: 'مسودة' } }).name, 'مسودة');
  assert.equal(mergeProductPreviewBaseline(baseline, { entityType: 'products', entityId: 7, draft: { id: 7, name: 'خطأ' } }).name, 'منشور');
  assert.equal(mergeProductPreviewBaseline(baseline, { entityType: 'products', entityId: 'new', draft: { id: -1, name: 'جديد' } }).name, 'منشور');
  assert.equal(baseline.name, 'منشور');
  assert.match(source, /installPortalPreviewReceiver\([\s\S]{0,500}renderProductState/);
});

test('all public surfaces install one guarded preview channel, badge, and capture-phase safety', async () => {
  const [main, shop, product, css] = await Promise.all(['main.js', 'shop.js', 'product.js', 'main.css'].map(readSource));
  for (const [name, source] of [['main', main], ['shop', shop], ['product', product]]) {
    assert.equal((source.match(/installPortalPreviewReceiver\(/g) || []).length, 1, name);
    assert.match(source, /getPortalPreviewContext\(window\.location, document\.referrer\)/, name);
    assert.match(source, /classifyPortalPreviewInteraction/, name);
    assert.match(source, /addEventListener\('(?:click|submit)'[^\n]*true\)/, name);
    assert.match(source, /معاينة خاصة — غير منشورة/, name);
    assert.match(source, /import '\.\/main\.css'/, name);
  }
  assert.match(main, /closest\?\.\('\[data-modal="cart-modal"\]'\)/);
  assert.doesNotMatch(shop, /cms-product-preview-badge|previewBadge/);
  assert.match(css, /\.cms-preview-badge/);
  assert.match(css, /position:\s*fixed/);
  // The unified desktop commerce header is 90px tall. Keep the private badge
  // beyond it with a visible gap so it cannot cover header or logo content.
  assert.match(css, /inset-block-start:\s*max\((?:9[6-9]|[1-9]\d{2,})px/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)/);
  assert.match(css, /inset-block-start:\s*max\(82px/);
});

test('preview blocks an internal page escape while preserving same-page anchors', async () => {
  const main = previewAdapter(await readSource('main.js'));
  const internalKind = classifyPortalPreviewInteraction({ tagName: 'A', href: 'http://127.0.0.1:5175/product.html?id=42' }, 'http://127.0.0.1:5175/?cmsPreview=1&previewNonce=n');
  const anchorKind = classifyPortalPreviewInteraction({ tagName: 'A', href: 'http://127.0.0.1:5175/?cmsPreview=1&previewNonce=n#about' }, 'http://127.0.0.1:5175/?cmsPreview=1&previewNonce=n');
  let mutationRan = false; let prevented = false;
  if (main.isPreviewInteractionBlocked(internalKind)) prevented = true;
  else mutationRan = true;
  assert.equal(internalKind, 'navigation');
  assert.equal(prevented, true);
  assert.equal(mutationRan, false);
  assert.equal(main.isPreviewInteractionBlocked(anchorKind), false);
});

test('homepage preview renders one effective state so cleared fields equal a fresh cleared publication', async () => {
  const mainSource = await readSource('main.js');
  const { renderHomePreviewSnapshot, createPreviewGenerationGate, captureHomePreviewDom, restoreHomePreviewDom } = previewAdapter(mainSource);
  const published = { about: { title: 'العنوان المنشور' }, content: {} };
  const node = { textContent: '' };
  const states = [];
  const renderTruthyTitle = (state) => { states.push(structuredClone(state)); node.textContent = state.about.title || 'العنوان المصمم'; };
  renderHomePreviewSnapshot(published, { entityType: 'about', entityId: 'settings', draft: { title: 'مسودة أولى' } }, renderTruthyTitle);
  assert.equal(node.textContent, 'مسودة أولى');
  renderHomePreviewSnapshot(published, { entityType: 'about', entityId: 'settings', draft: { title: '' } }, renderTruthyTitle);
  assert.equal(node.textContent, 'العنوان المصمم');
  assert.equal(states.at(-1).about.title, '');

  const gate = createPreviewGenerationGate(); const image = { src: 'published.webp' };
  const first = gate.next(); const applyFirst = () => { if (gate.isCurrent(first)) image.src = 'slow-old.webp'; };
  const second = gate.next(); const applySecond = () => { if (gate.isCurrent(second)) image.src = 'new.webp'; };
  applySecond(); applyFirst();
  assert.equal(image.src, 'new.webp');

  let staleDynamicRemoved = false;
  const staleDynamic = { remove: () => { staleDynamicRemoved = true; } };
  const authoredDocument = { querySelectorAll: (selector) => selector.includes('.managed-slider-slot') ? [staleDynamic] : [] };
  const authoredNode = {
    innerHTML: 'العنوان المصمم', hidden: false,
    ownerDocument: authoredDocument,
    getAttribute: () => null, removeAttribute() {}, setAttribute() {},
  };
  const root = { querySelectorAll: () => [authoredNode] };
  const authoredBaseline = captureHomePreviewDom(root);
  const emptyPublished = { content: { 'section-settings': [] } };
  const renderSectionTitle = (state) => {
    const title = state.content['section-settings'][0]?.extraText;
    if (title) authoredNode.innerHTML = title;
  };
  renderHomePreviewSnapshot(emptyPublished, { entityType: 'section-settings', entityId: 'new', draft: { id: -1, sectionKey: 'hero', extraText: 'مسودة أولى' } }, renderSectionTitle);
  assert.equal(authoredNode.innerHTML, 'مسودة أولى');
  restoreHomePreviewDom(authoredBaseline);
  assert.equal(staleDynamicRemoved, true, 'authored restore removes preview-only nodes that did not exist before the API hydrated');
  renderHomePreviewSnapshot(emptyPublished, { entityType: 'section-settings', entityId: 'new', draft: { id: -1, sectionKey: 'hero', extraText: '' } }, renderSectionTitle);
  assert.equal(authoredNode.innerHTML, 'العنوان المصمم');
  assert.match(mainSource, /authoredHomeDomBaseline\s*=\s*captureHomePreviewDom\(document\)/);
  assert.match(mainSource, /installPortalPreviewReceiver\([\s\S]{0,400}restoreHomePreviewDom\(authoredHomeDomBaseline\)[\s\S]{0,300}renderHomePreviewSnapshot/);
});

test('homepage preview eligibility exactly removes disabled ordinary video, inactive content, and unavailable offers', async () => {
  const { mergeHomePreviewBaseline, cairoCalendarDay } = previewAdapter(await readSource('main.js'));
  const baseline = {
    videos: [{ id: 1, title: 'منشور', mainPageVideo: true }],
    offers: [{ id: 2, title: 'عرض', isActive: true, fromDate: '2026-01-01', toDate: '2026-12-31' }],
    content: { services: [{ id: 3, title: 'خدمة', isActive: true }] },
  };
  assert.equal(mergeHomePreviewBaseline(baseline, { entityType: 'videos', entityId: 1, draft: { id: 1, mainPageVideo: false } }).videos.length, 0);
  assert.equal(mergeHomePreviewBaseline(baseline, { entityType: 'services', entityId: 3, draft: { id: 3, isActive: false } }).content.services.length, 0);
  assert.equal(mergeHomePreviewBaseline(baseline, { entityType: 'offers', entityId: 2, draft: { id: 2, isActive: true, startDate: '2099-01-01', endDate: '2099-12-31' } }).offers.length, 0);
  assert.equal(mergeHomePreviewBaseline(baseline, { entityType: 'videos', entityId: 'new', draft: { id: -1, title: 'جديد', mainPageVideo: true, isActive: true } }).videos[0].title, 'جديد');
  const cairoMidnight = new Date('2026-09-09T22:30:00.000Z');
  assert.equal(cairoCalendarDay(cairoMidnight), '2026-09-10');
  const boundary = { offers: [{ id: 8, title: 'حد اليوم', isActive: true, fromDate: '2026-09-10', toDate: '2026-09-10' }], content: {} };
  assert.equal(mergeHomePreviewBaseline(boundary, { entityType: 'offers', entityId: 8, draft: boundary.offers[0] }, cairoMidnight).offers.length, 1);
});

test('production presentation helpers expose slider, every trainer, category media, and complete product detail fields', async () => {
  const main = previewAdapter(await readSource('main.js'));
  const slider = main.sliderPresentation({ title: 'قوة', subtitle: 'ابدأ', details: 'تفاصيل', date: '2026-09-10', main_image: 'hero.webp' });
  assert.match(slider, /قوة/); assert.match(slider, /ابدأ/); assert.match(slider, /تفاصيل/); assert.match(slider, /2026-09-10/); assert.match(slider, /hero\.webp/);
  const trainers = main.trainersPresentation([
    { id: 1, title: 'أحمد', jobTitle: 'مدرب قوة', branch: 'مدينة نصر', gender: 1, date: '2026-09-01', image: 'a.webp' },
    { id: 2, title: 'سارة', jobTitle: 'مدربة لياقة', branch: 'التجمع', gender: 2, date: '2026-09-02', image: 'b.webp' },
  ]);
  for (const value of ['أحمد', 'مدرب قوة', 'مدينة نصر', 'سارة', 'مدربة لياقة', 'التجمع', 'b.webp']) assert.match(trainers, new RegExp(value));
  const classCard = main.classShowcasePresentation({ id: -1, title: '', subtitle: 'مختصر', details: 'تفاصيل الكلاس', icon: 'قوة', linkText: 'اعرف أكثر', linkUrl: '#membership' });
  for (const value of ['كلاس جديد — غير منشور', 'مختصر', 'تفاصيل الكلاس', 'قوة', 'اعرف أكثر']) assert.match(classCard, new RegExp(value));
  const coachStep = main.coachFeaturePresentation({ id: -1, title: '', subtitle: 'ابدأ الآن', icon: '✓' }, 0);
  for (const value of ['خطوة جديدة — غير منشورة', 'ابدأ الآن', '✓']) assert.match(coachStep, new RegExp(value));
  assert.match(await readSource('main.js'), /if \(item\.icon\) return `<span class="service-managed-icon"/);

  const shop = previewAdapter(await readSource('shop.js'));
  const category = shop.categoryPresentation({ id: 7, name: 'مكملات', iconClass: 'dumbbell', image: 'cat.webp' }, true);
  assert.match(category, /مكملات/); assert.match(category, /dumbbell/); assert.match(category, /cat\.webp/); assert.match(category, /aria-pressed="true"/);
  const newCard = shop.shopProductPresentation({ id: -1, name: '', category: '', shortDescription: '', stock: 0, stockStatus: 'out_of_stock', price: 0 });
  assert.match(newCard, /منتج جديد — غير منشور/); assert.match(newCard, /أكمل البيانات المطلوبة/); assert.doesNotMatch(newCard, /منتج مختار لدعم أدائك/);

  const product = previewAdapter(await readSource('product.js'));
  const detail = product.productDetailPresentation({ id: -1, name: '', category: '', image: null, images: ['one.webp', 'two.webp'], specifications: { الوزن: '1 كجم' }, stock: 0, stockStatus: 'out_of_stock', price: 0, related: [] }, true);
  assert.match(detail, /منتج جديد — غير منشور/); assert.doesNotMatch(detail, /منتج مختار بعناية/);
  assert.match(detail, /one\.webp/); assert.match(detail, /two\.webp/); assert.match(detail, /الوزن/); assert.match(detail, /1 كجم/);
  const savedDetail = product.productDetailPresentation({ id: 44, name: 'منتج', category: 'قسم', shortDescription: 'وصف مختصر مستقل', description: 'وصف كامل', stock: 2, stockStatus: 'in_stock', price: 10, related: [] }, true);
  assert.match(savedDetail, /product-short-description[^>]*>وصف مختصر مستقل/);

  const catalog = shop.shopCatalogPresentation([
    { id: 2, name: 'الثاني', category: 'قسم', shortDescription: '', stock: 1, stockStatus: 'in_stock', price: 20, displayOrder: 2, featured: false, isNew: true },
    { id: 1, name: 'الأول', category: 'قسم', shortDescription: '', stock: 1, stockStatus: 'in_stock', price: 10, displayOrder: 1, featured: true, isNew: false },
  ]);
  assert.ok(catalog.indexOf('الأول') < catalog.indexOf('الثاني'));
  assert.match(catalog, /منتج مميز/);
  assert.match(catalog, /جديد/);
});

test('authored pre-API checkpoint makes clear preview equal a fresh cleared publication', async () => {
  const source = await readSource('main.js');
  assert.match(source, /authoredHomeDomBaseline\s*=\s*captureHomePreviewDom\(document\)[\s\S]*hydratePortal\(\)/);
  assert.doesNotMatch(source, /renderHomeState\(portalData, generation\);\s*publishedHomeDomBaseline\s*=\s*captureHomePreviewDom/);
  assert.match(source, /restoreHomePreviewDom\(authoredHomeDomBaseline\)/);
});

test('every previously disappearing new home family has an honest renderer state', async () => {
  const main = previewAdapter(await readSource('main.js'));
  const cases = [
    ['photo', main.photoDraftPresentation({ id: -1 })],
    ['hero video', main.heroVideoPresentation({ id: -1, mainPageVideo: true })],
    ['offer', main.offerPresentation({ id: -1 }, 0)],
    ['stat', main.statPresentation({ id: -1 })],
    ['service', main.servicePresentation({ id: -1 }, 0)],
    ['about feature', main.aboutFeaturePresentation({ id: -1 })],
    ['section setting', main.sectionSettingDraftPresentation({ id: -1 })],
  ];
  for (const [family, markup] of cases) assert.match(markup, /جديد|جديدة|غير منشور|غير منشورة/, family);
  const service = main.servicePresentation({ id: 1, title: 'الخدمة', subtitle: 'عنوان فرعي مستقل', details: 'تفاصيل مستقلة', linkText: 'اعرف الخدمة', linkUrl: '#contact' }, 0);
  for (const value of ['عنوان فرعي مستقل', 'تفاصيل مستقلة', 'اعرف الخدمة']) assert.match(service, new RegExp(value));
});

test('a brand-new section setting is honestly visible before a target section is selected', async () => {
  const main = previewAdapter(await readSource('main.js'));
  const baseline = { content: { 'section-settings': [] } };
  const merged = main.mergeHomePreviewBaseline(baseline, {
    entityType: 'section-settings', entityId: 'new', draft: { id: -1, sectionKey: '' },
  });
  const markup = main.unassignedSectionSettingPresentation(merged.content['section-settings']);
  assert.match(markup, /إعداد قسم جديد — غير منشور/);
  assert.match(markup, /اختر القسم/);
  assert.match(markup, /role="status"/);
});

test('preview ordering matches public displayOrder and draft section keys win', async () => {
  const { mergeHomePreviewBaseline } = previewAdapter(await readSource('main.js'));
  const home = { content: {
    services: [{ id: 1, title: 'أ', displayOrder: 1 }, { id: 2, title: 'ب', displayOrder: 2 }],
    'section-settings': [{ id: 1, sectionKey: 'hero', extraText: 'منشور', displayOrder: 2 }],
  } };
  const moved = mergeHomePreviewBaseline(home, { entityType: 'services', entityId: 1, draft: { id: 1, title: 'أ', displayOrder: 9 } });
  assert.deepEqual([...moved.content.services.map((item) => item.id)], [2, 1]);
  const inserted = mergeHomePreviewBaseline(home, { entityType: 'services', entityId: 'new', draft: { id: -1, title: 'جديد', displayOrder: 1 } });
  assert.equal(inserted.content.services[0].id, -1);
  const section = mergeHomePreviewBaseline(home, { entityType: 'section-settings', entityId: 'new', draft: { id: -1, sectionKey: 'hero', extraText: 'مسودة', displayOrder: 9 } });
  assert.equal(section.content['section-settings'].filter((item) => item.sectionKey === 'hero').length, 1);
  assert.equal(section.content['section-settings'].find((item) => item.sectionKey === 'hero').extraText, 'مسودة');

  const { mergeShopPreviewBaseline } = previewAdapter(await readSource('shop.js'));
  const shop = { categories: [{ id: 1, name: 'أ', displayOrder: 1 }, { id: 2, name: 'ب', displayOrder: 2 }], items: [{ id: 1, displayOrder: 1 }, { id: 2, displayOrder: 1 }] };
  const categories = mergeShopPreviewBaseline(shop, { entityType: 'categories', entityId: 1, draft: { id: 1, title: 'أ', displayOrder: 9 } });
  assert.deepEqual([...categories.categories.map((item) => item.id)], [2, 1]);
  const products = mergeShopPreviewBaseline(shop, { entityType: 'products', entityId: 1, draft: { id: 1, displayOrder: 1 } });
  assert.deepEqual([...products.items.map((item) => item.id)], [2, 1]);
});
