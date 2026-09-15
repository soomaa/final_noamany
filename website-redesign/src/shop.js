import './font.css';
import './main.css';
import { addToCart, cartCount, cartTotal, escapeHtml, getCart, installGlobalCartLinks, money, productImageUrl, showToast, updateCartItem, wireImageFallback } from './portal.js';
import { api } from './portal.js';
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
    name: value.name ?? value.title ?? '',
    type: badgeTypes.includes(value.badgeType ?? value.type) ? (value.badgeType ?? value.type) : 'custom',
    backgroundColor,
    textColor,
  };
}

export function productBadge(value) {
  const badge = safeBadgePresentation(value);
  if (!badge || !badge.name) return '';
  return `<span class="product-badge" data-badge-type="${badge.type}" style="--badge-bg:${badge.backgroundColor};--badge-fg:${badge.textColor}">${escapeHtml(badge.name)}${badge.nameEn ? `<small lang="en">${escapeHtml(badge.nameEn)}</small>` : ''}</span>`;
}

function replaceShopRecord(items = [], entityId, draft) {
  const id = typeof entityId === 'number' ? entityId : (typeof draft.id === 'number' ? draft.id : -1);
  const next = { ...draft, id, ...(id < 0 && !Number.isFinite(Number(draft.displayOrder)) ? { displayOrder: 0 } : {}) };
  const exists = items.some((item) => Number(item.id) === Number(id));
  return exists ? items.map((item) => Number(item.id) === Number(id) ? { ...item, ...next } : item) : [next, ...items];
}

function orderShopRecords(items, descendingId = false) {
  return [...items].sort((left, right) => {
    const leftOrder = Number.isFinite(Number(left.displayOrder)) ? Number(left.displayOrder) : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(Number(right.displayOrder)) ? Number(right.displayOrder) : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || (descendingId ? Number(right.id) - Number(left.id) : Number(left.id) - Number(right.id));
  });
}

export function mergeShopPreviewBaseline(baseline, message) {
  if (!baseline) return baseline;
  const { entityType, entityId } = message; const draft = message.draft || {};
  if (entityType === 'products') return { ...baseline, items: orderShopRecords(replaceShopRecord(baseline.items, entityId, draft), true) };
  if (entityType === 'categories') {
    const category = { ...draft, id: typeof entityId === 'number' ? entityId : (draft.id ?? -1), name: draft.name ?? draft.title ?? '' };
    return {
      ...baseline,
      categories: orderShopRecords(replaceShopRecord(baseline.categories, entityId, category)),
      items: (baseline.items || []).map((item) => Number(item.categoryId) === Number(category.id) ? { ...item, category: category.name } : item),
    };
  }
  if (entityType === 'badges') {
    const badge = safeBadgePresentation({ ...draft, id: typeof entityId === 'number' ? entityId : -1 });
    const hasPersistedIdentity = typeof entityId === 'number' && entityId > 0;
    const assigned = hasPersistedIdentity && (baseline.items || []).some((item) => Number(item.badge?.id) === Number(entityId));
    if (!assigned) return {
      ...baseline,
      badgePreview: {
        label: 'نموذج الشارة قبل التعيين',
        message: 'لا توجد منتجات تستخدم هذه الشارة',
        badge: draft.isActive === false ? null : badge,
      },
    };
    return {
      ...baseline,
      badgePreview: null,
      items: (baseline.items || []).map((item) => Number(item.badge?.id) === Number(entityId)
        ? { ...item, badge: draft.isActive === false ? null : badge }
        : item),
    };
  }
  return baseline;
}
export function categoryPresentation(category = {}, active = false) {
  const name = category.name || (Number(category.id) < 0 ? 'قسم جديد — غير منشور' : 'قسم بدون اسم');
  const icon = category.image
    ? `<img src="${escapeHtml(assetUrl(category.image))}" alt="">`
    : category.iconClass ? `<span class="category-managed-icon" title="${escapeHtml(category.iconClass)}" aria-hidden="true">${escapeHtml(category.iconClass)}</span>` : '';
  return `<button class="${active ? 'active' : ''}" data-category="${escapeHtml(category.id)}" data-icon="${escapeHtml(category.iconClass || '')}" aria-pressed="${active}">${icon}<span>${escapeHtml(name)}</span></button>`;
}
export function shopProductPresentation(product = {}) {
  const draftNew = Number(product.id) < 0;
  const displayName = product.name || (draftNew ? 'منتج جديد — غير منشور' : 'منتج بدون اسم');
  const displayCategory = product.category || (draftNew ? 'أكمل اختيار القسم' : 'مكملات رياضية');
  const displaySummary = product.shortDescription || (draftNew ? 'أكمل البيانات المطلوبة لمعاينة بطاقة المنتج.' : 'منتج مختار لدعم أدائك وخطتك الرياضية.');
  const oldPrice = Number(product.oldPrice || 0);
  const discount = oldPrice > product.price ? Math.round((1 - product.price / oldPrice) * 100) : 0;
  const available = product.stockStatus === 'in_stock' && product.stock > 0;
  const productStates = [product.featured ? 'منتج مميز' : '', product.isNew ? 'جديد' : ''].filter(Boolean);
  return `<article class="shop-product${draftNew ? ' is-draft-record' : ''}" data-name="${escapeHtml(displayName)}" data-display-order="${escapeHtml(product.displayOrder ?? '')}">
    <a class="product-link" href="/product.html?id=${product.id}">
      <div class="shop-product-image" data-image-frame>
        <div class="image-grid"></div><img class="corner-logo" src="/assets/noamany-logo.png" alt="Noamany">
        ${productBadge(product.badge)}${discount && !product.badge ? `<span class="discount-mark">-${discount}%</span>` : ''}
        <img class="real-product" data-product-image data-placeholder="${product.image ? 'false' : 'true'}" src="${escapeHtml(productImageUrl(product.image))}" alt="${escapeHtml(displayName)}" loading="lazy">
        <span class="view-product"><b>شاهد المنتج</b><i>↗</i></span>
      </div>
      <div class="shop-product-info"><div class="product-category"><span>${escapeHtml(displayCategory)}</span><i>${draftNew ? 'مسودة خاصة' : available ? 'متوفر' : 'نفد المخزون'}</i></div>
        ${productStates.length ? `<div class="product-state-badges" aria-label="حالة المنتج">${productStates.map((state) => `<span>${escapeHtml(state)}</span>`).join('')}</div>` : ''}<h2>${escapeHtml(displayName)}</h2><p class="product-summary">${escapeHtml(displaySummary)}</p>
        <div class="availability"><span class="quantity">المخزون <b>${product.stock}</b></span><span class="${available ? 'available' : 'unavailable'}">● ${available ? 'جاهز للطلب' : 'غير متوفر'}</span></div>
        <div class="shop-price"><div><small>السعر الحالي</small><b>${money(product.price)}</b></div>${oldPrice > product.price ? `<del>${money(oldPrice)}</del>` : ''}</div>
      </div>
    </a>
    <button class="shop-add" data-id="${product.id}" ${available ? '' : 'disabled'}><span>${available ? 'أضف إلى السلة' : 'غير متوفر'}</span><b>＋</b></button>
  </article>`;
}
export function shopCatalogPresentation(items = []) {
  return orderShopRecords(items, true).map(shopProductPresentation).join('');
}
export function isPreviewInteractionBlocked(kind) { return kind !== 'allow' && kind !== 'in-page'; }
/* portal-preview-adapter:end */

const grid = document.getElementById('shopGrid');
const search = document.getElementById('productSearch');
const sort = document.getElementById('sortFilter');
const filters = document.getElementById('categoryFilter');
const progress = document.querySelector('.shop-progress span');
let products = [];
let categories = [];
let activeCategory = 'all';
let publishedCatalog = null;
let latestShopPreview = null;

window.addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (progress) progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
}, { passive: true });

function productCard(product) {
  return shopProductPresentation(product);
}

function shownProducts() {
  const query = search.value.trim().toLocaleLowerCase('ar');
  const list = products.filter((product) => {
    const matchesQuery = `${product.name} ${product.nameEn || ''} ${product.category || ''}`.toLocaleLowerCase('ar').includes(query);
    return matchesQuery && (activeCategory === 'all' || String(product.categoryId) === activeCategory);
  });
  const value = sort.value;
  if (value === 'price-low') list.sort((a, b) => a.price - b.price);
  if (value === 'price-high') list.sort((a, b) => b.price - a.price);
  if (value === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  if (value === 'name-desc') list.sort((a, b) => b.name.localeCompare(a.name, 'ar'));
  if (value === 'newest') list.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.id - a.id);
  return list;
}

function renderProducts() {
  const list = shownProducts();
  grid.innerHTML = sort.value === 'default' ? shopCatalogPresentation(list) : list.map(productCard).join('');
  document.getElementById('visibleCount').textContent = String(list.length);
  document.getElementById('catalogStatus').textContent = activeCategory === 'all' ? 'كل المنتجات' : (categories.find((category) => String(category.id) === activeCategory)?.name || 'المنتجات');
  document.querySelector('.catalog-line b').textContent = `${list.length} ITEM`;
  document.getElementById('noResults').classList.toggle('show', !list.length);
  grid.querySelectorAll('.shop-add').forEach((button) => button.addEventListener('click', () => {
    const product = products.find((item) => item.id === Number(button.dataset.id));
    try { addToCart(product); renderCart(); showToast(`تمت إضافة ${product.name} إلى السلة`); }
    catch (error) { showToast(error.message, 'error'); }
  }));
  wireImageFallback(grid);
}

function renderCategories() {
  const all = [{ id: 'all', name: 'الكل' }, ...categories];
  filters.innerHTML = all.map((category) => categoryPresentation(category, String(category.id) === activeCategory)).join('');
  filters.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    renderCategories(); renderProducts();
  }));
}

function renderShopState(state) {
  products = state.items || []; categories = state.categories || [];
  renderCategories(); renderProducts(); renderBadgePreview(state.badgePreview); renderCart();
}

function renderBadgePreview(preview) {
  let host = document.getElementById('badgePreviewSpecimen');
  if (!host) {
    host = document.createElement('aside');
    host.id = 'badgePreviewSpecimen';
    host.className = 'badge-preview-specimen';
    host.setAttribute('aria-live', 'polite');
    grid.insertAdjacentElement('afterend', host);
  }
  host.hidden = !preview;
  host.innerHTML = preview ? `<span>${escapeHtml(preview.label)}</span><div>${productBadge(preview.badge)}</div><p>${escapeHtml(preview.message)}</p>` : '';
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
  if (snapshot.surface !== 'shop') return;
  latestShopPreview = snapshot;
  if (publishedCatalog) renderShopState(mergeShopPreviewBaseline(publishedCatalog, snapshot));
});

function renderCart() {
  const cart = getCart();
  document.getElementById('shopCartCount').textContent = String(cartCount(cart));
  document.getElementById('drawerItems').innerHTML = cart.length ? cart.map((item) => `<div class="drawer-item" data-cart-id="${item.productId}">
    <div><b>${escapeHtml(item.name)}</b><span>${money(item.price * item.quantity)}</span></div>
    <div class="drawer-quantity"><button data-action="minus" aria-label="تقليل">−</button><strong>${item.quantity}</strong><button data-action="plus" aria-label="زيادة">+</button><button class="remove" data-action="remove">حذف</button></div>
  </div>`).join('') : '<p class="drawer-empty">السلة فارغة حاليًا.</p>';
  document.getElementById('drawerTotal').innerHTML = cart.length ? `<strong>الإجمالي المبدئي: ${money(cartTotal(cart))}</strong><small>السعر النهائي والخصم يُحسبان بأمان عند إتمام الطلب.</small><a href="/checkout.html">إتمام الطلب ←</a>` : '';
  document.querySelectorAll('[data-cart-id] button').forEach((button) => button.addEventListener('click', () => {
    const row = button.closest('[data-cart-id]'); const id = Number(row.dataset.cartId); const item = getCart().find((entry) => entry.productId === id);
    const action = button.dataset.action;
    updateCartItem(id, action === 'remove' ? 0 : item.quantity + (action === 'plus' ? 1 : -1)); renderCart();
  }));
}

function drawer(open) {
  document.getElementById('cartDrawer').classList.toggle('open', open);
  document.getElementById('drawerBackdrop').classList.toggle('open', open);
  document.body.classList.toggle('drawer-open', open);
}

async function loadCatalog() {
  grid.innerHTML = '<div class="catalog-loading"><span></span><b>جارٍ تجهيز متجر النعماني…</b></div>';
  try {
    const data = await api('/products');
    publishedCatalog = { items: data.items || [], categories: data.categories || [] };
    renderShopState(latestShopPreview ? mergeShopPreviewBaseline(publishedCatalog, latestShopPreview) : publishedCatalog);
  } catch (error) {
    grid.innerHTML = `<div class="catalog-error"><b>تعذر تحميل المنتجات</b><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">إعادة المحاولة</button></div>`;
  }
}

search.addEventListener('input', renderProducts);
sort.addEventListener('change', renderProducts);
document.getElementById('openCart').addEventListener('click', () => drawer(true));
document.querySelector('.drawer-close').addEventListener('click', () => drawer(false));
document.getElementById('drawerBackdrop').addEventListener('click', () => drawer(false));
window.addEventListener('noamany:cart', renderCart);
installGlobalCartLinks();
loadCatalog();
