import './font.css';
import './main.css';
import { addToCart, api, assetUrl, cartCount, cartTotal, escapeHtml, getCart, installGlobalCartLinks, money, productImageUrl, safeLink, saveToken, showToast, updateCartItem, wireImageFallback } from './portal.js';
import { classifyPortalPreviewInteraction, getPortalPreviewContext, installPortalPreviewReceiver } from './portal-preview.js';

/* portal-preview-adapter:start */
export const HOME_PREVIEW_FAMILIES = Object.freeze(['company', 'about', 'sliders', 'photos', 'videos', 'hero-videos', 'branches', 'trainers', 'classes', 'offers', 'stats', 'services', 'class-showcase', 'about-features', 'coach-features', 'section-settings']);

function safeBadgePresentation(value) {
  if (!value) return null;
  const badgeTypes = ['featured', 'new', 'sale', 'custom'];
  const hex = /^#[0-9a-fA-F]{6}$/;
  const luminance = (color) => {
    const channels = color.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16) / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const backgroundColor = hex.test(String(value.backgroundColor || '')) ? value.backgroundColor : '#b90e16';
  const requestedText = hex.test(String(value.textColor || '')) ? value.textColor : '#ffffff';
  const contrast = (left, right) => (Math.max(luminance(left), luminance(right)) + .05) / (Math.min(luminance(left), luminance(right)) + .05);
  const textColor = contrast(backgroundColor, requestedText) >= 4.5 ? requestedText : (contrast(backgroundColor, '#111111') >= contrast(backgroundColor, '#ffffff') ? '#111111' : '#ffffff');
  return {
    ...value,
    type: badgeTypes.includes(value.type) ? value.type : 'custom',
    backgroundColor,
    textColor,
  };
}

export function productBadge(value) {
  const badge = safeBadgePresentation(value);
  if (!badge || !badge.name) return '';
  return `<span class="product-badge" data-badge-type="${badge.type}" style="--badge-bg:${badge.backgroundColor};--badge-fg:${badge.textColor}">${escapeHtml(badge.name)}${badge.nameEn ? `<small lang="en">${escapeHtml(badge.nameEn)}</small>` : ''}</span>`;
}

function previewEntityId(entityId, draft) {
  return typeof entityId === 'number' ? entityId : (typeof draft.id === 'number' ? draft.id : -1);
}

function replacePreviewRecord(items = [], entityId, draft) {
  const id = previewEntityId(entityId, draft);
  const next = { ...draft, id };
  const index = items.findIndex((item) => Number(item.id) === Number(id));
  if (index < 0) return [next, ...items];
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item);
}

function orderPreviewRecords(items, descendingId = false) {
  return [...items].sort((left, right) => {
    const leftOrder = Number.isFinite(Number(left.displayOrder)) ? Number(left.displayOrder) : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(Number(right.displayOrder)) ? Number(right.displayOrder) : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || (descendingId ? Number(right.id) - Number(left.id) : Number(left.id) - Number(right.id));
  });
}

function normalizeHomePreviewRecord(entityType, entityId, draft) {
  const id = previewEntityId(entityId, draft);
  const record = { ...draft, id };
  if ('mainImage' in draft) { record.image = draft.mainImage; record.main_image = draft.mainImage; }
  if ('slugTitle' in draft) record.subtitle = draft.slugTitle;
  if ('latMap' in draft) record.lat = draft.latMap;
  if ('lngMap' in draft) record.lng = draft.lngMap;
  if (entityType === 'branches' && draft.branchId != null) record.id = Number(draft.branchId);
  if (entityType === 'offers') { record.fromDate = draft.startDate; record.toDate = draft.endDate; }
  return record;
}

export function cairoCalendarDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function mergeHomePreviewBaseline(baseline, message, now = new Date()) {
  if (!baseline || !HOME_PREVIEW_FAMILIES.includes(message.entityType)) return baseline;
  const { entityType, entityId } = message;
  const draft = normalizeHomePreviewRecord(entityType, entityId, message.draft || {});
  const eligible = (type, item) => {
    if (item.isActive === false) return false;
    if ((type === 'videos' || type === 'hero-videos') && item.mainPageVideo === false) return false;
    if (type === 'offers') {
      const today = cairoCalendarDay(now);
      if (item.fromDate && String(item.fromDate).slice(0, 10) > today) return false;
      if (item.toDate && String(item.toDate).slice(0, 10) < today) return false;
    }
    return true;
  };
  const mergeEligible = (items, type) => {
    const withoutDraft = (items || []).filter((item) => Number(item.id) !== Number(draft.id));
    return eligible(type, draft) ? replacePreviewRecord(items, entityId, draft) : withoutDraft;
  };
  if (entityType === 'hero-videos') return { ...baseline, heroVideos: mergeEligible(baseline.heroVideos, entityType) };
  if (entityType === 'company' || entityType === 'about') return { ...baseline, [entityType]: { ...(baseline[entityType] || {}), ...draft } };
  const family = entityType;
  if (['stats', 'services', 'class-showcase', 'about-features', 'coach-features', 'section-settings'].includes(family)) {
    let publishedFamily = baseline.content?.[family] || [];
    if (family === 'section-settings' && draft.sectionKey) publishedFamily = publishedFamily.filter((item) => item.sectionKey !== draft.sectionKey || Number(item.id) === Number(draft.id));
    const nextFamily = orderPreviewRecords(mergeEligible(publishedFamily, family));
    return { ...baseline, content: { ...(baseline.content || {}), [family]: nextFamily } };
  }
  return { ...baseline, [family]: mergeEligible(baseline[family], family) };
}

export function isPreviewInteractionBlocked(kind) { return kind !== 'allow' && kind !== 'in-page'; }

export function createPreviewGenerationGate() {
  let generation = 0;
  return { next: () => ++generation, isCurrent: (candidate) => candidate === generation };
}

// The public renderers intentionally leave the hand-crafted fallback alone when a
// CMS family is empty. Keep one snapshot of just the nodes those renderers own so
// a later, cleared preview cannot leave markup behind from an earlier draft.
const HOME_PREVIEW_DOM_SELECTOR = [
  '.hero-stats', '.experience', '.branch-grid', '.map-cards', '.lead-form select',
  '.schedule-panel .branch-tabs', '.schedule-panel .category-tabs', '.selected-schedule', '.schedule-table tbody',
  '.about-copy h2', '.about-copy > p', '.about-copy .checks', '.about-visual > img',
  '.gallery-grid', '.gallery-tabs', '.hero-bg', '.managed-slider-slot', '#heroVideoRail', '.offer-grid', '.service-grid', '.services-stamp', '.class-grid',
  '.coach-photo img', '.coach-photo .big-type', '.coach-points', '.coach-roster', '.video-grid',
  '.brand-mark img', '.footer-brand img', 'footer .footer-grid > p', 'footer .copyright span', '.footer-social', '.company-public-details',
  '.hero .eyebrow', '.hero h5', '.hero h1', '.hero-content > p', '.membership-cta',
  '.about .section-tag', '.about h2', '.about .text-link',
  '.products-section .section-tag', '.products-section h2', '.products-head p', '.products-section .show-all',
  '.offers-section .section-tag', '.offers-section h2', '.offers-section .section-heading > p',
  '.schedule-section .section-tag', '.schedule-section h2', '.schedule-sidebar > p', '.book-class',
  '.services-section .section-tag', '.services-section h2', '.services-intro > p', '.services-link',
  '.classes .section-tag', '.classes h2', '.classes .section-heading > p',
  '.coach .section-tag', '.coach h2', '.coach-copy > p', '.coach-copy > .btn',
  '.media-showcase .section-tag', '.media-showcase h2', '.media-showcase .section-heading > p',
  '.gallery-section .section-tag', '.gallery-section h2', '.gallery-section .section-heading > p',
  '.membership .section-tag', '.membership h2', '.membership .section-heading > p',
  '.branches .section-tag', '.branches h2', '.branches .section-heading > p',
  '.contact-section .section-tag', '.contact-section h2', '.contact-section .section-heading > p',
  '.cta-band > span', '.cta-band h2', '.cta-band button',
].join(',');

export function captureHomePreviewDom(root) {
  const nodes = Array.from(root?.querySelectorAll?.(HOME_PREVIEW_DOM_SELECTOR) || []);
  const snapshot = nodes.map((node) => ({
    node,
    innerHTML: node.innerHTML,
    hidden: Boolean(node.hidden),
    value: 'value' in node ? node.value : undefined,
    attributes: Object.fromEntries(['href', 'src', 'style'].map((name) => [name, node.getAttribute?.(name) ?? null])),
  }));
  const media = root?.querySelector?.('.media-showcase');
  if (media && !nodes.includes(media)) snapshot.push({ node: media, hidden: Boolean(media.hidden), attributes: {} });
  return snapshot;
}

export function restoreHomePreviewDom(snapshot = []) {
  const root = snapshot.find(({ node }) => node?.ownerDocument)?.node.ownerDocument
    || (typeof document === 'undefined' ? null : document);
  root?.querySelectorAll?.('.managed-slider-slot,.coach-roster,.company-public-details,.section-setting-draft')
    ?.forEach?.((node) => node.remove?.());
  snapshot.forEach(({ node, innerHTML, hidden, value, attributes = {} }) => {
    if (!node) return;
    if (innerHTML !== undefined) node.innerHTML = innerHTML;
    node.hidden = hidden;
    if (value !== undefined && 'value' in node) node.value = value;
    Object.entries(attributes).forEach(([name, attributeValue]) => {
      if (attributeValue == null) node.removeAttribute?.(name);
      else node.setAttribute?.(name, attributeValue);
    });
  });
}

export function renderHomePreviewSnapshot(published, message, renderState) {
  const preview = mergeHomePreviewBaseline(published, message);
  renderState(preview, 'effective');
  return preview;
}

export function sliderPresentation(slider = {}) {
  const isNew = Number(slider.id) < 0;
  const meta = [slider.subtitle, slider.date].filter(Boolean).map((value) => `<small>${escapeHtml(value)}</small>`).join('');
  return `<aside class="managed-slider-copy" data-image="${escapeHtml(slider.main_image || slider.image || '')}">${isNew ? '<b>سلايدر جديد — غير منشور</b>' : ''}<strong>${escapeHtml(slider.title || (isNew ? 'أضف عنوان السلايدر' : ''))}</strong>${meta}<p>${escapeHtml(slider.details || '')}</p></aside>`;
}

export function trainersPresentation(items = []) {
  return items.map((trainer) => `<article class="coach-profile${Number(trainer.id) < 0 ? ' is-draft' : ''}">${trainer.image ? `<img src="${escapeHtml(assetUrl(trainer.image))}" alt="${escapeHtml(trainer.title || 'مدرب النعماني')}">` : '<span class="coach-profile-placeholder" aria-hidden="true">N</span>'}<div>${Number(trainer.id) < 0 ? '<small>مدرب جديد — غير منشور</small>' : ''}<h3>${escapeHtml(trainer.title || 'أضف اسم المدرب')}</h3><p>${escapeHtml(trainer.jobTitle || 'المسمى الوظيفي غير مضاف')}</p><small>${[trainer.branch, trainer.gender === 1 ? 'رجال' : trainer.gender === 2 ? 'سيدات' : '', trainer.date].filter(Boolean).map(escapeHtml).join(' · ')}</small></div></article>`).join('');
}

export function classShowcasePresentation(item = {}) {
  const draftNew = Number(item.id) < 0;
  const title = item.title || (draftNew ? 'كلاس جديد — غير منشور' : '');
  return `<article class="class-card ${item.featured ? 'large' : ''} ${item.image ? '' : 'tone'} reveal">${item.image ? `<img src="${escapeHtml(assetUrl(item.image))}" alt="${escapeHtml(title)}">` : ''}<div class="card-shade"></div>${!item.image && item.icon ? `<div class="tone-icon">${escapeHtml(item.icon)}</div>` : ''}<div class="class-info">${draftNew ? '<b class="draft-record-label">كلاس جديد — غير منشور</b>' : ''}<small>${escapeHtml(item.subtitle || '')}</small><h3>${escapeHtml(title)}</h3>${item.details ? `<p>${escapeHtml(item.details)}</p>` : ''}<a href="${escapeHtml(safeLink(item.linkUrl, '#membership'))}">${escapeHtml(item.linkText || (draftNew ? 'أكمل بيانات الكلاس' : 'احجز مكانك'))} ←</a></div></article>`;
}

export function coachFeaturePresentation(item = {}, index = 0) {
  const draftNew = Number(item.id) < 0;
  const title = item.title || (draftNew ? 'خطوة جديدة — غير منشورة' : '');
  return `<div>${item.icon ? `<i aria-hidden="true">${escapeHtml(item.icon)}</i>` : `<b>${String(index + 1).padStart(2, '0')}</b>`}<span>${draftNew ? '<small>خطوة جديدة — غير منشورة</small>' : ''}<strong>${escapeHtml(title)}</strong><small>${escapeHtml(item.subtitle || item.details || '')}</small></span></div>`;
}

export function photoDraftPresentation(album = {}) {
  if (Number(album.id) >= 0) return '';
  return '<figure class="gallery-item is-draft-record" tabindex="0"><div class="gallery-draft-placeholder" aria-hidden="true">N</div><figcaption><span>ألبوم صور جديد — غير منشور</span><small>أضف صورة واحدة على الأقل لإكمال المعاينة</small></figcaption></figure>';
}

export function heroVideoPresentation(item = {}) {
  const draftNew = Number(item.id) < 0;
  const title = item.title || (draftNew ? 'فيديو رئيسي جديد — غير منشور' : 'فيديو من النعماني');
  const poster = item.image ? assetUrl(item.image) : '/assets/hero-red.png';
  const meta = [item.branch, item.date].filter(Boolean).map(escapeHtml).join(' · ');
  return `<a class="hero-video-link${draftNew ? ' is-draft-record' : ''}" href="${escapeHtml(safeLink(item.videoLink))}" target="_blank" rel="noreferrer" aria-label="شاهد ${escapeHtml(title)}"><img data-hero-poster src="${escapeHtml(poster)}" alt=""><span class="hero-video-play" aria-hidden="true">▶</span><span class="hero-video-copy"><strong>${escapeHtml(title)}</strong>${draftNew ? '<small>مسودة غير منشورة</small>' : ''}${meta ? `<small>${meta}</small>` : ''}</span></a>`;
}

export function statPresentation(item = {}) {
  const draftNew = Number(item.id) < 0;
  return `<div class="${draftNew ? 'is-draft-record' : ''}"><strong>${Number(item.numericValue || 0).toLocaleString('ar-EG')}${escapeHtml(item.suffix || '')}</strong><span>${escapeHtml(item.title || (draftNew ? 'إحصائية جديدة — غير منشورة' : ''))}</span></div>`;
}

export function aboutFeaturePresentation(item = {}) {
  const draftNew = Number(item.id) < 0;
  return `<span class="${draftNew ? 'is-draft-record' : ''}">${escapeHtml(item.icon || '✓')} ${escapeHtml(item.title || (draftNew ? 'ميزة جديدة — غير منشورة' : ''))}</span>`;
}

export function sectionSettingDraftPresentation(item = {}) {
  return Number(item.id) < 0 ? '<span class="section-setting-draft" role="status">إعداد قسم جديد — غير منشور</span>' : '';
}

export function unassignedSectionSettingPresentation(items = []) {
  const pending = items.some((item) => Number(item.id) < 0 && !item.sectionKey);
  return pending
    ? '<aside class="section-setting-draft section-setting-draft--unassigned" role="status"><strong>إعداد قسم جديد — غير منشور</strong><span>اختر القسم لتظهر المعاينة في مكانها الصحيح.</span></aside>'
    : '';
}

export function offerPresentation(offer = {}, index = 0) {
  const draftNew = Number(offer.id) < 0;
  const fallback = ['/assets/hero-red.png', '/assets/class-women.png', '/assets/class-boxing.png'][index % 3];
  const title = offer.title || (draftNew ? 'عرض جديد — غير منشور' : '');
  const subtitle = offer.subtitle || (draftNew ? 'أكمل بيانات العرض قبل النشر' : 'عرض لفترة محدودة');
  const deadline = offer.toDate ? `ينتهي في: ${new Date(offer.toDate).toLocaleDateString('ar-EG')}` : (draftNew ? 'موعد الانتهاء غير محدد' : 'لفترة محدودة');
  return `<article class="offer reveal${draftNew ? ' is-draft-record' : ''}"><div class="offer-image"><img src="${escapeHtml(offer.image ? assetUrl(offer.image) : fallback)}" alt="${escapeHtml(title)}"><span class="offer-price">${money(offer.value)}</span></div><div class="offer-body">${draftNew ? '<b class="draft-record-label">عرض جديد — غير منشور</b>' : ''}<span class="offer-subtitle">${escapeHtml(subtitle)}</span><h3>${escapeHtml(title)}</h3><p class="offer-detail">${escapeHtml(offer.details || '')}</p><div class="offer-footer"><small>${escapeHtml(deadline)}</small><button class="offer-details">التفاصيل ←</button></div></div></article>`;
}

export function servicePresentation(item = {}, index = 0) {
  const draftNew = Number(item.id) < 0;
  const title = item.title || (draftNew ? 'خدمة جديدة — غير منشورة' : '');
  const visual = item.image ? `<img src="${escapeHtml(assetUrl(item.image))}" alt="${escapeHtml(title)}">` : item.icon ? `<span class="service-managed-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>` : '<span class="service-draft-placeholder" aria-hidden="true">N</span>';
  return `<article class="service reveal${draftNew ? ' is-draft-record' : ''}"><div class="service-top"><span class="service-no">${String(index + 1).padStart(2, '0')}</span><div class="service-icon">${visual}</div></div><div>${draftNew ? '<b class="draft-record-label">خدمة جديدة — غير منشورة</b>' : ''}<h3>${escapeHtml(title)}</h3>${item.subtitle ? `<p class="service-subtitle">${escapeHtml(item.subtitle)}</p>` : ''}<p>${escapeHtml(item.details || '')}</p></div><a href="${escapeHtml(safeLink(item.linkUrl, '#contact'))}">${escapeHtml(item.linkText || 'عرض التفاصيل')} <span aria-hidden="true">←</span></a></article>`;
}
/* portal-preview-adapter:end */

const header = document.querySelector('.site-header');
const progressBar = document.querySelector('.page-progress span');
const backToTop = document.querySelector('.back-to-top');
let portalData = null;
let publishedPortalData = null;
let authoredHomeDomBaseline = null;
let latestHomePreview = null;
const homePreviewGeneration = createPreviewGenerationGate();
let aboutImageRequest = 0;
let heroImageRequest = 0;

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 30);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) progressBar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  backToTop?.classList.toggle('show', window.scrollY > 520);
}, { passive: true });

backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: 0.1 });
function reveal(root = document) { root.querySelectorAll('.reveal:not(.visible)').forEach((element) => observer.observe(element)); }
reveal();

const stats = document.querySelector('.hero-stats');
if (stats) new IntersectionObserver(([entry], instance) => {
  if (!entry.isIntersecting) return; instance.disconnect();
  stats.querySelectorAll('[data-count]').forEach((element) => {
    const target = Number(element.dataset.count); const start = performance.now();
    const tick = (now) => { const ratio = Math.min((now - start) / 1300, 1); element.textContent = `${Math.floor(target * (1 - Math.pow(1 - ratio, 3))).toLocaleString('ar-EG')}+`; if (ratio < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}).observe(stats);

document.querySelectorAll('[data-modal]').forEach((trigger) => trigger.addEventListener('click', (event) => { event.preventDefault(); document.getElementById(trigger.dataset.modal)?.classList.add('open'); }));
document.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', () => button.closest('.modal').classList.remove('open')));
document.querySelectorAll('.modal').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('open'); }));

function renderCart() {
  const cart = getCart();
  document.querySelectorAll('.cart-count').forEach((node) => { node.textContent = String(cartCount(cart)); });
  const wrap = document.querySelector('.cart-items'); if (!wrap) return;
  wrap.innerHTML = cart.length ? cart.map((item) => `<div class="cart-row" data-cart-id="${item.productId}"><div><b>${escapeHtml(item.name)}</b><span>${money(item.price * item.quantity)}</span></div><div class="home-cart-actions"><button data-action="minus">−</button><strong>${item.quantity}</strong><button data-action="plus">+</button><button data-action="remove">حذف</button></div></div>`).join('') : '<p class="empty-cart">السلة فارغة حاليًا.</p>';
  document.querySelector('.cart-total').innerHTML = cart.length ? `<h3>الإجمالي المبدئي: ${money(cartTotal(cart))}</h3><a class="btn primary" href="/checkout.html">إتمام الطلب</a>` : '';
  wrap.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { const id = Number(button.closest('[data-cart-id]').dataset.cartId); const item = getCart().find((entry) => entry.productId === id); updateCartItem(id, button.dataset.action === 'remove' ? 0 : item.quantity + (button.dataset.action === 'plus' ? 1 : -1)); renderCart(); }));
}
window.addEventListener('noamany:cart', renderCart); installGlobalCartLinks(); renderCart();

document.querySelector('.account-form')?.addEventListener('submit', async (event) => {
  event.preventDefault(); const inputs = event.currentTarget.querySelectorAll('input'); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const result = await api('/auth/login', { method: 'POST', body: { identity: inputs[0].value, password: inputs[1].value } }); saveToken(result.accessToken); location.href = '/account.html';
  } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
});

async function submitSimpleForm(form, endpoint, payload) {
  const button = form.querySelector('[type="submit"]'); const note = form.querySelector('.form-note'); button.disabled = true;
  try { const result = await api(endpoint, { method: 'POST', body: payload }); note.textContent = result.message; form.reset(); }
  catch (error) { note.textContent = error.message; }
  finally { button.disabled = false; }
}
document.querySelector('.contact-form')?.addEventListener('submit', (event) => { event.preventDefault(); submitSimpleForm(event.currentTarget, '/contact', Object.fromEntries(new FormData(event.currentTarget))); });
document.querySelector('.lead-form')?.addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); submitSimpleForm(event.currentTarget, '/membership-leads', { ...data, branchId: Number(data.branchId) }); });

function productCard(product) {
  const available = product.stockStatus === 'in_stock' && product.stock > 0;
  return `<article class="product reveal"><a href="/product.html?id=${product.id}" class="home-product-link"><div class="product-visual" data-image-frame><img class="product-logo" src="/assets/noamany-logo.png" alt="Noamany">${productBadge(product.badge)}${product.oldPrice > product.price && !product.badge ? '<span class="sale-badge">خصم</span>' : ''}<img class="home-product-image" data-product-image data-placeholder="${product.image ? 'false' : 'true'}" src="${escapeHtml(productImageUrl(product.image))}" alt="${escapeHtml(product.name)}"></div><div class="product-meta"><span>${escapeHtml(product.category)}</span><span class="stock">● ${available ? 'متوفر' : 'نفد'}</span></div><h3>${escapeHtml(product.name)}</h3><p class="product-detail">${escapeHtml(product.shortDescription || 'منتج مختار بعناية لدعم خطتك الرياضية.')}</p><div class="price"><b>${money(product.price)}</b>${product.oldPrice > product.price ? `<del>${money(product.oldPrice)}</del>` : ''}</div></a><button class="add-cart" data-product-id="${product.id}" ${available ? '' : 'disabled'}>${available ? 'إضافة إلى السلة' : 'غير متوفر'}</button></article>`;
}

function renderProducts(products) {
  const grid = document.querySelector('.product-grid');
  if (!products?.length) {
    grid.innerHTML = '<div class="home-products-empty"><b>لا توجد منتجات منشورة حاليًا</b><span>ستظهر منتجات المتجر هنا تلقائيًا فور إضافتها من لوحة الإدارة.</span><a href="/shop.html">فتح المتجر ←</a></div>';
    return;
  }
  grid.innerHTML = products.slice(0, 8).map(productCard).join('');
  grid.querySelectorAll('[data-product-id]').forEach((button) => button.addEventListener('click', () => { const product = products.find((item) => item.id === Number(button.dataset.productId)); try { addToCart(product); renderCart(); showToast(`تمت إضافة ${product.name} إلى السلة`); } catch (error) { showToast(error.message, 'error'); } }));
  wireImageFallback(grid); reveal(grid);
}

function offerCard(offer, index) {
  return offerPresentation(offer, index);
}

function wireOfferModals() {
  document.querySelectorAll('.offer-details').forEach((button) => button.addEventListener('click', () => {
    const offer = button.closest('.offer'); const modal = document.getElementById('offer-modal'); const image = offer.querySelector('.offer-image img');
    modal.querySelector('.offer-modal-media').src = image.src; modal.querySelector('.offer-modal-media').alt = image.alt; modal.querySelector('.offer-modal-subtitle').textContent = offer.querySelector('.offer-subtitle').textContent; modal.querySelector('.offer-modal-title').textContent = offer.querySelector('h3').textContent; modal.querySelector('.offer-modal-detail').textContent = offer.querySelector('.offer-detail').textContent; modal.querySelector('.offer-modal-price').textContent = `القيمة: ${offer.querySelector('.offer-price').textContent.trim()}`; modal.querySelector('.offer-modal-meta').textContent = offer.querySelector('.offer-footer small').textContent; modal.classList.add('open');
  }));
}

function renderBranches(branches) {
  if (!branches?.length) return;
  const coordinates = (branch) => {
    const lat = Number(branch.lat); const lng = Number(branch.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
  };
  document.querySelector('.branch-grid').innerHTML = branches.map((branch) => {
    const point = coordinates(branch); const phones = [branch.mob1, branch.mob2].map((value) => String(value || '').trim()).filter((value, index, all) => value && all.indexOf(value) === index);
    const embed = point ? `https://maps.google.com/maps?q=${point.lat},${point.lng}&z=15&output=embed` : '';
    const addressIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 10 8 7.8 10c1.3 2.7 3.5 4.9 6.2 6.2l2-2.2 4.5 2.8c.4.2.6.7.5 1.2-.4 1.8-2 3-3.8 3C9.4 21 3 14.6 3 6.8 3 5 4.2 3.4 6 3c.5-.1 1 .1 1.2.5Z"/></svg>';
    const phoneLinks = phones.length ? phones.map((phone) => `<a href="tel:${escapeHtml(phone)}" dir="ltr">${escapeHtml(phone)}</a>`).join('<span class="phone-separator">•</span>') : '<span class="branch-phone-missing">غير مسجل بعد</span>';
    return `<article class="branch branch-map-card reveal"><div class="branch-map-preview">${point ? `<iframe src="${embed}" title="خريطة ${escapeHtml(branch.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" tabindex="-1"></iframe><button type="button" class="branch-map-zoom" data-map-url="${embed}" data-map-name="${escapeHtml(branch.name)}" data-map-lat="${point.lat}" data-map-lng="${point.lng}" aria-label="تكبير خريطة ${escapeHtml(branch.name)}"><span>⌕</span> تكبير الخريطة</button>` : '<div class="branch-map-unavailable"><span>⌖</span><b>أضف خط العرض والطول</b><small>ستظهر خريطة الفرع هنا تلقائيًا</small></div>'}</div><div class="branch-card-body"><h3>${escapeHtml(branch.name)}</h3><div class="branch-card-details"><div class="branch-detail-line"><i>${addressIcon}</i><p>${escapeHtml(branch.address || 'العنوان غير مسجل بعد')}</p></div><div class="branch-detail-line branch-phone-list"><i>${phoneIcon}</i><span>${phoneLinks}</span></div></div><button data-branch-id="${branch.id}">اختيار الفرع ←</button></div></article>`;
  }).join('');
  document.querySelector('.map-cards').innerHTML = branches.map((branch) => {
    const phones = [branch.mob1, branch.mob2].map((value) => String(value || '').trim()).filter((value, index, all) => value && all.indexOf(value) === index);
    const phoneLinks = phones.length ? phones.map((phone) => `<a href="tel:${escapeHtml(phone)}" dir="ltr">${escapeHtml(phone)}</a>`).join('<span class="phone-separator">•</span>') : '<span class="branch-phone-missing">غير مسجل بعد</span>';
    return `<article class="map-card"><div class="map-card-heading"><h3>${escapeHtml(branch.name)}</h3>${branch.lat && branch.lng ? `<a class="branch-map-link" target="_blank" rel="noreferrer" href="https://maps.google.com/?q=${encodeURIComponent(`${branch.lat},${branch.lng}`)}"><span aria-hidden="true">⌖</span> عرض على الخريطة ←</a>` : ''}</div><div class="branch-contact-grid"><div class="branch-contact-row"><i aria-hidden="true">⌖</i><strong>${escapeHtml(branch.address || 'العنوان غير مسجل بعد')}</strong></div><div class="branch-contact-row branch-phone"><i aria-hidden="true">☎</i><span class="compact-phone-list">${phoneLinks}</span></div></div></article>`;
  }).join('');
  const select = document.querySelector('.lead-form select'); select.name = 'branchId'; select.innerHTML = '<option value="">اختر الفرع</option>' + branches.map((branch) => `<option value="${branch.id}">${escapeHtml(branch.name)}</option>`).join('');
  document.querySelectorAll('[data-branch-id]').forEach((button) => button.addEventListener('click', () => { select.value = button.dataset.branchId; document.querySelector('.cta-band').scrollIntoView({ behavior: 'smooth' }); }));
  document.querySelectorAll('.branch-map-zoom').forEach((button) => button.addEventListener('click', () => {
    let viewer = document.querySelector('.branch-map-viewer');
    if (!viewer) {
      viewer = document.createElement('div'); viewer.className = 'branch-map-viewer';
      viewer.innerHTML = '<div class="branch-map-dialog"><button type="button" class="branch-map-close" aria-label="إغلاق">×</button><div><h3></h3><a target="_blank" rel="noreferrer">فتح في Google Maps ↗</a></div><iframe title="خريطة الفرع المكبرة" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>';
      document.body.appendChild(viewer);
      viewer.addEventListener('click', (event) => { if (event.target === viewer || event.target.closest('.branch-map-close')) viewer.classList.remove('open'); });
    }
    viewer.querySelector('h3').textContent = button.dataset.mapName;
    viewer.querySelector('iframe').src = button.dataset.mapUrl.replace('z=15', 'z=18');
    viewer.querySelector('a').href = `https://www.google.com/maps?q=${button.dataset.mapLat},${button.dataset.mapLng}`;
    viewer.classList.add('open');
  }));
  reveal(document.querySelector('.branch-grid'));
}

const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
function renderSchedule(branches, classes) {
  if (!branches?.length || !classes?.length) return;
  let branchId = branches[0].id; let classType = 1;
  const branchTabs = document.querySelector('.schedule-panel .branch-tabs'); const categoryTabs = document.querySelector('.schedule-panel .category-tabs');
  branchTabs.innerHTML = branches.map((branch, index) => `<button class="tab-btn ${index === 0 ? 'active' : ''}" data-schedule-branch="${branch.id}">${escapeHtml(branch.name)}</button>`).join('');
  categoryTabs.innerHTML = [{ id: 1, name: 'Men' }, { id: 2, name: 'Women' }, { id: 3, name: 'Kids' }].map((item, index) => `<button class="tab-btn ${index === 0 ? 'active' : ''}" data-schedule-type="${item.id}">${item.name}</button>`).join('');
  const paint = () => {
    const list = classes.filter((item) => item.branchId === Number(branchId) && (item.classType === Number(classType) || item.classType === 0));
    const byDay = new Map(days.map((day) => [day, list.filter((item) => String(item.day).trim() === day)]));
    document.querySelector('.selected-schedule').textContent = `${branches.find((branch) => branch.id === Number(branchId))?.name || ''} · ${['All', 'Men', 'Women', 'Kids'][classType]}`;
    document.querySelector('.schedule-table tbody').innerHTML = `<tr class="time-row"><td>الوقت</td>${days.map((day) => `<td>${byDay.get(day)?.map((item) => escapeHtml(item.time)).join('<br>') || '—'}</td>`).join('')}</tr><tr class="class-row"><td>الكلاس</td>${days.map((day) => `<td class="${byDay.get(day)?.length ? '' : 'off-day'}">${byDay.get(day)?.map((item) => `<b>${escapeHtml(item.title)}</b>${item.date ? `<small>${escapeHtml(item.date)}</small>` : ''}`).join('') || 'راحة'}</td>`).join('')}</tr>`;
  };
  branchTabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { branchId = Number(button.dataset.scheduleBranch); branchTabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button)); paint(); }));
  categoryTabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { classType = Number(button.dataset.scheduleType); categoryTabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button)); paint(); })); paint();
}

function cleanCmsText(value) {
  if (!value) return '';
  const parsed = new DOMParser().parseFromString(String(value), 'text/html');
  return String(parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function renderAbout(about, generation) {
  if (!about) return;
  const copy = document.querySelector('.about-copy');
  const title = cleanCmsText(about.title);
  const details = cleanCmsText(about.details);

  // The legacy record uses the numeric value "1" as an internal identifier,
  // not as a public heading. Keep the designed heading in that case.
  if (title && !/^\d+$/.test(title)) copy.querySelector('h2').innerHTML = luxuryHeading(title);
  if (details) copy.querySelector('p').textContent = details;

  const image = document.querySelector('.about-visual>img');
  if (about.image) {
    const request = ++aboutImageRequest;
    const candidate = assetUrl(about.image);
    const probe = new Image();
    probe.onload = () => { if (request === aboutImageRequest && homePreviewGeneration.isCurrent(generation)) image.src = candidate; };
    probe.src = candidate;
  }
}
function renderGallery(photos, branches) {
  const fallbacks = [
    { image: '/assets/hero-red.png', title: 'تدريب احترافي' },
    { image: '/assets/class-women.png', title: 'كلاسات السيدات' },
    { image: '/assets/class-boxing.png', title: 'كلاسات القوة' },
    { image: '/assets/coach.png', title: 'فريق المدربين' },
    { image: '/assets/hero.png', title: 'أجواء النعماني' },
  ];
  const albums = (photos || []).map((album) => ({ ...album, allImages: [...new Set([album.image, ...(album.images || [])].filter(Boolean))] })).filter((album) => album.allImages.length || Number(album.id) < 0);
  const grid = document.querySelector('.gallery-grid'); const tabs = document.querySelector('.gallery-tabs');
  const availableBranches = (branches || []).filter((branch) => albums.some((album) => Number(album.branchId) === Number(branch.id)));
  const paint = (branchId) => {
    const selected = branchId ? albums.filter((album) => Number(album.branchId) === Number(branchId)) : albums;
    const managed = selected.flatMap((album) => album.allImages.map((image) => ({ image: assetUrl(image), title: album.title, details: album.details, date: album.date, branch: album.branch })));
    const visible = managed.slice(0, 5);
    while (visible.length < 5) visible.push(fallbacks[visible.length]);
    const draftPlaceholder = selected.find((album) => Number(album.id) < 0 && !album.allImages.length);
    grid.innerHTML = (draftPlaceholder ? photoDraftPresentation(draftPlaceholder) : '') + visible.map((item, index) => `<figure class="gallery-item" tabindex="0"><img src="${escapeHtml(item.image)}" data-gallery-fallback="${index}" alt="${escapeHtml(item.title || fallbacks[index].title)}" loading="lazy"><figcaption><span>${escapeHtml(item.title || fallbacks[index].title)}</span>${item.details || item.date || item.branch ? `<small>${[item.details, item.branch, item.date].filter(Boolean).map(escapeHtml).join(' · ')}</small>` : ''}</figcaption></figure>`).join('');
    grid.querySelectorAll('img').forEach((image, index) => image.addEventListener('error', () => {
      image.src = fallbacks[index].image;
      image.alt = fallbacks[index].title;
      image.closest('.gallery-item').querySelector('figcaption span').textContent = fallbacks[index].title;
    }, { once: true }));
    grid.querySelectorAll('.gallery-item').forEach((item) => {
      const open = () => {
        let viewer = document.querySelector('.gallery-viewer');
        if (!viewer) {
          viewer = document.createElement('div'); viewer.className = 'gallery-viewer';
          viewer.innerHTML = '<button type="button" aria-label="إغلاق">×</button><img src="/assets/hero-red.png" alt="صورة من معرض النعماني"><span></span>';
          document.body.appendChild(viewer);
          viewer.addEventListener('click', (event) => { if (event.target === viewer || event.target.tagName === 'BUTTON') viewer.classList.remove('open'); });
        }
        viewer.querySelector('img').src = item.querySelector('img').src;
        viewer.querySelector('img').alt = item.querySelector('img').alt;
        viewer.querySelector('span').textContent = item.querySelector('figcaption span').textContent;
        viewer.classList.add('open');
      };
      item.addEventListener('click', open);
      item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
  };
  tabs.innerHTML = `<button class="tab-btn active" data-gallery-branch="">الكل</button>${availableBranches.map((branch) => `<button class="tab-btn" data-gallery-branch="${branch.id}">${escapeHtml(branch.name)}</button>`).join('')}`;
  tabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { tabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button)); paint(button.dataset.galleryBranch); }));
  paint('');
}
function renderHero(sliders, managedImage, generation, previewOverlay = false) {
  const hero = document.querySelector('.luxe-hero');
  const background = hero?.querySelector('.hero-bg');
  if (!hero || !background) return;

  const slider = managedImage ? { main_image: managedImage } : sliders?.[0];
  if (previewOverlay && !slider?.main_image) return;
  const fallback = '/assets/hero-red.png';
  background.style.setProperty('background-image', `url('${fallback}')`, 'important');
  if (!slider) return;
  let managedCopy = hero.querySelector('.managed-slider-slot');
  if (!managedCopy) { managedCopy = document.createElement('div'); managedCopy.className = 'managed-slider-slot'; hero.querySelector('.hero-content')?.appendChild(managedCopy); }
  managedCopy.innerHTML = sliderPresentation(slider || {});

  if (slider.main_image) {
    const request = ++heroImageRequest;
    const candidate = assetUrl(slider.main_image);
    const probe = new Image();
    probe.onload = () => { if (request === heroImageRequest && homePreviewGeneration.isCurrent(generation)) background.style.setProperty('background-image', `url('${candidate}')`, 'important'); };
    probe.onerror = () => { if (request === heroImageRequest && homePreviewGeneration.isCurrent(generation)) background.style.setProperty('background-image', `url('${fallback}')`, 'important'); };
    probe.src = candidate;
  }
}

function luxuryHeading(value) {
  const words = String(value || '').trim().split(/\s+/); const last = words.pop() || '';
  return `${escapeHtml(words.join(' '))}${words.length ? ' ' : ''}<em>${escapeHtml(last)}</em>`;
}

// Stable DOM↔CMS contract. A missing record leaves the curated page fallback untouched.
// This is deliberately one manifest so adding a public section cannot silently escape management.
export const SECTION_SETTINGS_MANIFEST = Object.freeze({
  hero:{root:'.hero',tag:'.eyebrow,h5',heading:'h1',description:'.hero-content > p',link:'.membership-cta',image:'.hero-bg'},
  about:{root:'.about',tag:'.section-tag',heading:'h2',description:'.about-copy > p',link:'.text-link',image:'.about-visual img'},
  products:{root:'.products-section',tag:'.section-tag',heading:'h2',description:'.products-head p',link:'.show-all'},
  offers:{root:'.offers-section',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  schedule:{root:'.schedule-section',tag:'.section-tag',heading:'h2',description:'.schedule-sidebar > p',link:'.book-class'},
  services:{root:'.services-section',tag:'.section-tag',heading:'h2',description:'.services-intro > p',link:'.services-link'},
  classes:{root:'.classes',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  coaches:{root:'.coach',tag:'.section-tag',heading:'h2',description:'.coach-copy > p',link:'.coach-copy > .btn',image:'.coach-photo img'},
  videos:{root:'.media-showcase',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  gallery:{root:'.gallery-section',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  membership:{root:'.membership',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  branches:{root:'.branches',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  contact:{root:'.contact-section',tag:'.section-tag',heading:'h2',description:'.section-heading > p'},
  lead:{root:'.cta-band',tag:'span',heading:'h2',link:'button'},
  footer:{root:'footer',description:'.footer-grid > p'},
});

function renderSectionSettings(items) {
  // Kept explicitly for the legacy contract tests and public CMS migration audit.
  const selectors = { products:'.products-section', offers:'.offers-section', services:'.services-section', classes:'.classes', coaches:'.coach', gallery:'.gallery-section', membership:'.membership', branches:'.branches', contact:'.contact-section' };
  document.querySelectorAll('.section-setting-draft').forEach((node) => node.remove());
  const unassigned = unassignedSectionSettingPresentation(items);
  if (unassigned) (document.querySelector('main') || document.body)?.insertAdjacentHTML('beforeend', unassigned);
  items?.forEach((item) => {
    const config = SECTION_SETTINGS_MANIFEST[item.sectionKey] || (selectors[item.sectionKey] ? { root: selectors[item.sectionKey] } : null);
    const section = config && document.querySelector(config.root); if (!section) return;
    if (Number(item.id) < 0) section.insertAdjacentHTML('afterbegin', sectionSettingDraftPresentation(item));
    const find = (key) => config[key] ? section.querySelector(config[key]) : null;
    const tag = find('tag'); const heading = find('heading'); const description = find('description'); const link = find('link'); const image = find('image');
    if (tag && item.subtitle) tag.textContent = item.subtitle;
    if (heading && item.extraText) heading.innerHTML = luxuryHeading(item.extraText);
    if (description && item.details) description.textContent = item.details;
    if (link && item.linkText) link.textContent = `${item.linkText} ←`;
    if (link && item.linkUrl) link.href = safeLink(item.linkUrl);
    if (image && item.image) { if (image.tagName === 'IMG') image.src = assetUrl(item.image); else image.style.backgroundImage = `url(${JSON.stringify(assetUrl(item.image))})`; }
  });
}

function renderStats(items) {
  if (!items?.length) return;
  const wrap = document.querySelector('.hero-stats');
  wrap.innerHTML = items.map(statPresentation).join('');
  const experience = document.querySelector('.experience'); const years = items.find((item) => /خبرة|عام|سنة/.test(item.title));
  if (experience && years) experience.innerHTML = `<strong>${Number(years.numericValue || 0).toLocaleString('ar-EG')}${escapeHtml(years.suffix || '')}</strong><span>${escapeHtml(years.title)}</span>`;
}

function serviceVisual(item, index) {
  if (item.image) return `<img src="${escapeHtml(assetUrl(item.image))}" alt="${escapeHtml(item.title || 'خدمة من النعماني')}">`;
  if (item.icon) return `<span class="service-managed-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>`;
  const icons = [
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 20v8m5-12v16m24-12v8m-5-12v16M12 24h24M19 16v16m10-16v16"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="17" r="6"/><circle cx="33" cy="19" r="5"/><path d="M7 37c1-7 5-11 11-11s10 4 11 11M28 29c7-2 12 2 13 8"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 39S8 30 8 18c0-9 11-12 16-4 5-8 16-5 16 4 0 12-16 21-16 21Z"/><path d="M12 25h7l3-6 4 11 3-5h7"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 9h14v7l4 5v18H13V21l4-5V9Z"/><path d="M17 16h14M18 27h12M24 21v12M18 9V6h12v3"/></svg>',
  ];
  return icons[index % icons.length];
}

function renderServices(items) {
  if (!items?.length) return;
  document.querySelector('.service-grid').innerHTML = items.map(servicePresentation).join('');
  const count = document.querySelector('.services-stamp'); if (count) count.innerHTML = `<strong>${items.length}</strong><span>خدمات<br>متكاملة</span>`;
  reveal(document.querySelector('.service-grid'));
}

function renderClassShowcase(items) {
  if (!items?.length) return;
  document.querySelector('.class-grid').innerHTML = items.map(classShowcasePresentation).join('');
  reveal(document.querySelector('.class-grid'));
}

function renderAboutFeatures(items) { if (items?.length) document.querySelector('.about-copy .checks').innerHTML = items.map(aboutFeaturePresentation).join(''); }

function renderCoaches(trainers, features) {
  const trainer = trainers?.[0];
  if (trainer?.image) document.querySelector('.coach-photo img').src = assetUrl(trainer.image);
  if (trainer?.title) document.querySelector('.coach-photo .big-type').textContent = trainer.title;
  if (features?.length) document.querySelector('.coach-points').innerHTML = features.map(coachFeaturePresentation).join('');
  const host = document.querySelector('.coach-copy');
  if (host) {
    let roster = host.querySelector('.coach-roster');
    if (!roster) { roster = document.createElement('div'); roster.className = 'coach-roster'; host.appendChild(roster); }
    roster.innerHTML = trainersPresentation(trainers || []);
  }
}

function renderMembership(items) {
  const plans = document.querySelector('.plans');
  if (!items?.length) { plans.innerHTML = '<div class="membership-packages-state"><b>لا توجد باقات منشورة لهذا الفرع حاليًا.</b><span>يمكنك التواصل معنا لمعرفة موعد إتاحة الباقات.</span></div>'; return; }
  plans.innerHTML = items.slice(0, 3).map((item, index) => `<article class="plan ${index === 1 ? 'featured' : ''} reveal">${index === 1 ? '<div class="popular">الأكثر اختيارًا</div>' : ''}<span class="plan-name">${escapeHtml(item.name)}</span><h3>${escapeHtml(`${item.days} يوم`)}</h3><p>${escapeHtml(item.description || 'عضوية مرنة من النعماني.')}</p><div class="plan-price">${money(item.price)}</div><ul>${[['دعوات',item.invitationsCount],['قياسات InBody',item.inbodyCount],['جلسات',item.sessionsCount],['أيام تجميد',item.freezeDays]].filter(([,value])=>value).map(([label,value])=>`<li>✓ ${escapeHtml(label)}: ${escapeHtml(value)}</li>`).join('')}</ul><a href="/memberships/${item.id}?branchId=${item.branchId}" class="btn ${index === 1 ? 'primary' : 'ghost'}">اشترك الآن</a></article>`).join('');
  reveal(document.querySelector('.plans'));
}

function renderMembershipError() {
  document.querySelector('.plans').innerHTML = '<div class="membership-packages-state error"><b>تعذر تحميل الباقات الآن.</b><span>أعد تحميل الصفحة أو تواصل معنا إذا استمرت المشكلة.</span></div>';
}

function renderVideos(items) {
  const section = document.querySelector('.media-showcase');
  if (!items?.length) { section.hidden = true; return; }
  section.hidden = false;
  document.querySelector('.video-grid').innerHTML = items.map((item) => `<a class="video-card reveal" href="${escapeHtml(safeLink(item.videoLink))}" target="_blank" rel="noreferrer"><div>${item.image ? `<img src="${escapeHtml(assetUrl(item.image))}" alt="${escapeHtml(item.title)}">` : ''}<span>▶</span></div><small>${escapeHtml([item.subtitle, item.date].filter(Boolean).join(' · ') || 'NOAMANY VIDEO')}</small><h3>${escapeHtml(item.title || (Number(item.id) < 0 ? 'فيديو جديد — غير منشور' : ''))}</h3></a>`).join('');
  reveal(document.querySelector('.video-grid'));
}

function renderCompany(company) {
  if (!company) return;
  const logo = company.logo ? assetUrl(company.logo) : null;
  if (logo) document.querySelectorAll('.brand-mark img,.footer-brand img').forEach((image) => {
    image.addEventListener('error', () => { image.src = '/assets/noamany-logo.png'; }, { once: true });
    image.src = logo;
  });
  const footerCopy = document.querySelector('footer .footer-grid > p'); if (footerCopy) footerCopy.textContent = company.footer || company.summary_company || footerCopy.textContent;
  const copyright = document.querySelector('footer .copyright span'); if (copyright) copyright.textContent = `© ${new Date().getFullYear()} ${company.nameweb || 'مركز النعماني للياقة البدنية'}`;
  const footer = document.querySelector('footer .footer-grid');
  if (footer) {
    let contact = footer.querySelector('.company-public-details');
    if (!contact) { contact = document.createElement('address'); contact.className = 'company-public-details'; footer.appendChild(contact); }
    const phones = [company.telepon, company.hp, company.fax].filter(Boolean).map(escapeHtml).join(' · ');
    contact.innerHTML = [company.slogan || company.abbreviation_name, company.address, phones, company.email, company.email_cadangan, company.website].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join('');
  }
  renderFooterSocial(company);
}

function renderFooterSocial(company = {}) {
  const host = document.querySelector('.footer-social');
  if (!host) return;
  const safeUrl = (value) => {
    const url = String(value || '').trim();
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  };
  const channels = [
    { key: 'facebook', label: 'فيسبوك', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v6h4v-6h3.5l.5-4h-4V9c0-.7.3-1 1-1Z"/></svg>' },
    { key: 'instagram', label: 'إنستجرام', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1" class="social-fill"/></svg>' },
    { key: 'twitter', label: 'إكس', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l14 16M19 4 5 20"/></svg>' },
    { key: 'google_plus', label: 'يوتيوب', icon: '<svg class="social-youtube" viewBox="0 0 24 24" aria-hidden="true"><path class="social-fill" d="M21.4 6.3c-.2-.9-.9-1.6-1.8-1.8C18 4 12 4 12 4s-6 0-7.6.5c-.9.2-1.6.9-1.8 1.8C2.1 7.9 2.1 12 2.1 12s0 4.1.5 5.7c.2.9.9 1.6 1.8 1.8C6 20 12 20 12 20s6 0 7.6-.5c.9-.2 1.6-.9 1.8-1.8.5-1.6.5-5.7.5-5.7s0-4.1-.5-5.7Z"/><path d="m10 8.7 5.2 3.3-5.2 3.3Z" fill="#fff" stroke="none"/></svg>' },
  ];
  host.innerHTML = `<span>تابعنا</span><div>${channels.map((channel) => {
    const url = safeUrl(company[channel.key]);
    return url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="${channel.label}" title="${channel.label}">${channel.icon}</a>`
      : `<span class="social-disabled" aria-label="${channel.label} — الرابط غير مضاف" title="أضف رابط ${channel.label} من إدارة البوابة">${channel.icon}</span>`;
  }).join('')}</div>`;
}

function renderHeroVideos(items) {
  const rail = document.getElementById('heroVideoRail');
  if (!rail) return;
  const visible = (items || []).filter((item) => item.mainPageVideo !== false && item.isActive !== false);
  rail.innerHTML = '';
  rail.hidden = !visible.length;
  if (!visible.length) return;
  rail.innerHTML = `<div class="container"><div class="hero-video-heading"><span>شاهد التجربة</span><strong>من داخل فروع النعماني</strong></div><div class="hero-video-track">${visible.map(heroVideoPresentation).join('')}</div></div>`;
  rail.querySelectorAll('[data-hero-poster]').forEach((image) => image.addEventListener('error', () => { image.src = '/assets/hero-red.png'; }, { once: true }));
}

function renderManagedContent(data) {
  const content = data.content || {};
  renderStats(content.stats); renderServices(content.services);
  renderClassShowcase(content['class-showcase']); renderAboutFeatures(content['about-features']); renderCoaches(data.trainers, content['coach-features']);
  renderVideos(data.videos); renderHeroVideos(data.heroVideos); renderCompany(data.company); renderSectionSettings(content['section-settings']);
}

function renderHomeState(data, generation) {
  const sectionSettings = data.content?.['section-settings'] || [];
  const heroSetting = sectionSettings.find((item) => item.sectionKey === 'hero');
  const aboutSetting = sectionSettings.find((item) => item.sectionKey === 'about');
  const heroImage = heroSetting?.image;
  const aboutImage = aboutSetting?.image;
  renderBranches(data.branches); renderSchedule(data.branches, data.classes);
  renderAbout(aboutImage ? { ...data.about, image: aboutImage } : data.about, generation);
  renderGallery(data.photos, data.branches);
  renderHero(data.sliders, heroImage, generation);
  renderManagedContent(data);
  if (data.offers?.length) {
    const grid = document.querySelector('.offer-grid'); grid.innerHTML = data.offers.map(offerCard).join(''); wireOfferModals(); reveal(grid);
  } else wireOfferModals();
}

function installPreviewSurfaceSafety() {
  if (!getPortalPreviewContext(window.location, document.referrer)) return false;
  document.body.classList.add('cms-preview-active');
  const badge = document.createElement('div'); badge.className = 'cms-preview-badge'; badge.setAttribute('role', 'status'); badge.textContent = 'معاينة خاصة — غير منشورة'; document.body.appendChild(badge);
  const block = (event) => { const kind = classifyPortalPreviewInteraction(event.target, window.location.href); if (event.target.closest?.('[data-modal="cart-modal"]') || isPreviewInteractionBlocked(kind)) { event.preventDefault(); event.stopImmediatePropagation(); } };
  document.addEventListener('click', block, true);
  document.addEventListener('submit', block, true);
  return true;
}

installPreviewSurfaceSafety();
installPortalPreviewReceiver((snapshot) => {
  if (snapshot.surface !== 'home') return;
  latestHomePreview = snapshot;
  if (!publishedPortalData) return;
  restoreHomePreviewDom(authoredHomeDomBaseline);
  const generation = homePreviewGeneration.next();
  portalData = renderHomePreviewSnapshot(publishedPortalData, snapshot, (state) => renderHomeState(state, generation));
});

async function hydratePortal() {
  const [homeResult, productsResult] = await Promise.allSettled([api('/home'), api('/products')]);

  if (productsResult.status === 'fulfilled') {
    const storeProducts = productsResult.value.items || [];
    const featuredProducts = storeProducts.filter((product) => product.featured || product.isNew);
    renderProducts(featuredProducts.length ? featuredProducts : storeProducts);
  } else {
    renderProducts([]);
    console.warn('Store products could not be loaded:', productsResult.reason?.message);
  }

  if (homeResult.status === 'fulfilled') {
    publishedPortalData = homeResult.value;
    portalData = publishedPortalData;
    const generation = homePreviewGeneration.next();
    renderHomeState(portalData, generation);
    if (latestHomePreview) {
      restoreHomePreviewDom(authoredHomeDomBaseline);
      const previewGeneration = homePreviewGeneration.next();
      portalData = renderHomePreviewSnapshot(publishedPortalData, latestHomePreview, (state) => renderHomeState(state, previewGeneration));
    }
    const defaultBranchId = Number(portalData.branches?.[0]?.id);
    if (Number.isInteger(defaultBranchId) && defaultBranchId > 0) api(`/memberships?branchId=${defaultBranchId}`).then(renderMembership).catch(renderMembershipError);
    else renderMembershipError();
  } else {
    renderMembershipError(); console.warn('Portal content fallback is active:', homeResult.reason?.message);
    wireOfferModals();
  }
}

authoredHomeDomBaseline = captureHomePreviewDom(document);
hydratePortal();
