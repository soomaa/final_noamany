import './font.css';
import './main.css';
import { addToCart, api, escapeHtml, installGlobalCartLinks, money, productImageUrl, showToast, wireImageFallback } from './portal.js';
import { classifyPortalPreviewInteraction, getPortalPreviewContext, installPortalPreviewReceiver } from './portal-preview.js';

/* portal-preview-adapter:start */
function safeBadgePresentation(value) {
  if (!value) return null;
  const badgeTypes = ['featured', 'new', 'sale', 'custom'];
  const hex = /^#[0-9a-fA-F]{6}$/;
  const luminance = (color) => { const channels = color.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16) / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4); return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]; };
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
export function mergeProductPreviewBaseline(baseline, message) {
  if (!baseline || message.entityType !== 'products' || typeof message.entityId !== 'number' || Number(message.entityId) !== Number(baseline.id)) return baseline;
  return { ...baseline, ...(message.draft || {}), id: baseline.id, related: baseline.related };
}
function specificationEntries(value) {
  if (!value) return [];
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return [['التفاصيل', value]]; } }
  if (Array.isArray(value)) return value.map((item, index) => [String(index + 1), typeof item === 'object' ? JSON.stringify(item) : String(item)]);
  return typeof value === 'object' ? Object.entries(value) : [['التفاصيل', String(value)]];
}
export function productDetailPresentation(product = {}, preview = false) {
  const draftNew = preview && Number(product.id) < 0;
  const name = product.name || (draftNew ? 'منتج جديد — غير منشور' : 'منتج بدون اسم');
  const category = product.category || (draftNew ? 'أكمل اختيار القسم' : 'بدون قسم');
  const description = product.description || product.shortDescription || (draftNew ? 'أكمل الحقول المطلوبة لتظهر صفحة المنتج كما ستُنشر.' : 'لا يوجد وصف منشور لهذا المنتج.');
  const images = [...new Set([product.image, ...(Array.isArray(product.images) ? product.images : [])].filter(Boolean))];
  const mainImage = images[0] || null;
  const specs = specificationEntries(product.specifications);
  const available = product.stockStatus === 'in_stock' && product.stock > 0;
  return `<div class="product-breadcrumb"><a href="/shop.html">المتجر</a><span>←</span><b>${escapeHtml(category)}</b></div>
    <section class="product-detail-layout${draftNew ? ' is-draft-record' : ''}">
      <div class="product-gallery" data-image-frame>${productBadge(product.badge)}<img data-product-image data-placeholder="${mainImage ? 'false' : 'true'}" src="${escapeHtml(productImageUrl(mainImage))}" alt="${escapeHtml(name)}"><img class="watermark" src="/assets/noamany-logo.png" alt="">${images.length > 1 ? `<div class="product-thumbnails" aria-label="صور المنتج">${images.map((image, index) => `<button type="button" data-gallery-image="${escapeHtml(productImageUrl(image))}" aria-label="عرض صورة ${index + 1}"><img src="${escapeHtml(productImageUrl(image))}" alt=""></button>`).join('')}</div>` : ''}</div>
      <div class="product-copy">${draftNew ? '<span class="draft-record-label">منتج جديد — غير منشور</span>' : ''}<span class="product-category-label">${escapeHtml(category)}</span><h1>${escapeHtml(name)}</h1>${product.nameEn ? `<small lang="en">${escapeHtml(product.nameEn)}</small>` : ''}
        ${product.shortDescription && product.description ? `<p class="product-short-description">${escapeHtml(product.shortDescription)}</p>` : ''}<p>${escapeHtml(description)}</p>
        ${specs.length ? `<dl class="product-specifications">${specs.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
        <div class="detail-price"><strong>${money(product.price)}</strong>${product.oldPrice > product.price ? `<del>${money(product.oldPrice)}</del>` : ''}</div>
        <div class="stock-line ${available ? '' : 'out'}"><span>●</span>${available ? `متوفر — ${product.stock} قطعة` : 'نفد المخزون مؤقتًا'}</div>
        <div class="buy-row"><label>الكمية<input id="productQty" type="number" min="1" max="${product.stock}" value="1"></label><button id="addProduct" ${available ? '' : 'disabled'}>${available ? 'أضف إلى السلة ←' : 'غير متوفر'}</button></div>
        <div class="trust-row"><span>✓ سعر مؤكد من الإدارة</span><span>✓ دفع عند الاستلام</span><span>✓ متابعة حالة الطلب</span></div>
      </div>
    </section>
    ${product.related?.length ? `<section class="related-section"><div><span>مختارات مشابهة</span><h2>قد يعجبك أيضًا.</h2></div><div class="related-grid">${product.related.map(relatedCard).join('')}</div></section>` : ''}`;
}
export function isPreviewInteractionBlocked(kind) { return kind !== 'allow' && kind !== 'in-page'; }
/* portal-preview-adapter:end */

const root = document.getElementById('productPage');
const id = Number(new URLSearchParams(location.search).get('id'));
let product;
let publishedProduct = null;
let latestProductPreview = null;

function relatedCard(item) {
  return `<a class="related-card" href="/product.html?id=${item.id}"><div data-image-frame>${productBadge(item.badge)}<img data-product-image data-placeholder="${item.image ? 'false' : 'true'}" src="${escapeHtml(productImageUrl(item.image))}" alt="${escapeHtml(item.name)}"></div><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><b>${money(item.price)}</b></a>`;
}

function renderProductState(state) {
    product = state;
    document.title = `${product.name || 'منتج جديد'} | متجر النعماني`;
    root.innerHTML = productDetailPresentation(product, Boolean(getPortalPreviewContext(window.location, document.referrer)));
    document.getElementById('addProduct')?.addEventListener('click', () => {
      try { addToCart(product, Number(document.getElementById('productQty').value)); showToast('تمت إضافة المنتج إلى السلة'); }
      catch (error) { showToast(error.message, 'error'); }
    });
    wireImageFallback(root);
    root.querySelectorAll('[data-gallery-image]').forEach((button) => button.addEventListener('click', () => { const image = root.querySelector('[data-product-image]'); if (image) image.src = button.dataset.galleryImage; }));
}

function installPreviewSurfaceSafety() {
  if (!getPortalPreviewContext(window.location, document.referrer)) return false;
  document.body.classList.add('cms-preview-active');
  const badge = document.createElement('div'); badge.className = 'cms-preview-badge'; badge.setAttribute('role', 'status'); badge.textContent = 'معاينة خاصة — غير منشورة'; document.body.appendChild(badge);
  const block = (event) => { if (isPreviewInteractionBlocked(classifyPortalPreviewInteraction(event.target, window.location.href))) { event.preventDefault(); event.stopImmediatePropagation(); } };
  document.addEventListener('click', block, true);
  document.addEventListener('submit', block, true);
  return true;
}

installPreviewSurfaceSafety();
installPortalPreviewReceiver((snapshot) => {
  if (snapshot.surface !== 'product') return;
  latestProductPreview = snapshot;
  if (publishedProduct) renderProductState(mergeProductPreviewBaseline(publishedProduct, snapshot));
});

async function load() {
  if (!id) { root.innerHTML = '<div class="error-panel">رابط المنتج غير صحيح.<br><a href="/shop.html">العودة للمتجر</a></div>'; return; }
  try {
    publishedProduct = await api(`/products/${id}`);
    renderProductState(latestProductPreview ? mergeProductPreviewBaseline(publishedProduct, latestProductPreview) : publishedProduct);
  } catch (error) { root.innerHTML = `<div class="error-panel">${escapeHtml(error.message)}<br><a href="/shop.html">العودة للمتجر</a></div>`; }
}

installGlobalCartLinks(); load();
