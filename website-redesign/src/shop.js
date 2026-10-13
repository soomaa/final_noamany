import './font.css';
import { addToCart, cartCount, cartTotal, escapeHtml, getCart, installGlobalCartLinks, money, productImageUrl, showToast, updateCartItem, wireImageFallback } from './portal.js';
import { api } from './portal.js';

const grid = document.getElementById('shopGrid');
const search = document.getElementById('productSearch');
const sort = document.getElementById('sortFilter');
const filters = document.getElementById('categoryFilter');
const progress = document.querySelector('.shop-progress span');
let products = [];
let categories = [];
let activeCategory = 'all';

window.addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (progress) progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
}, { passive: true });

function productCard(product) {
  const oldPrice = Number(product.oldPrice || 0);
  const discount = oldPrice > product.price ? Math.round((1 - product.price / oldPrice) * 100) : 0;
  const available = product.stockStatus === 'in_stock' && product.stock > 0;
  return `<article class="shop-product" data-name="${escapeHtml(product.name)}">
    <a class="product-link" href="/product.html?id=${product.id}">
      <div class="shop-product-image" data-image-frame>
        <div class="image-grid"></div><img class="corner-logo" src="/assets/noamany-logo.png" alt="Noamany">
        ${discount ? `<span class="discount-mark">-${discount}%</span>` : ''}
        <img class="real-product" data-product-image data-placeholder="${product.image ? 'false' : 'true'}" src="${productImageUrl(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
        <span class="view-product"><b>شاهد المنتج</b><i>↗</i></span>
      </div>
      <div class="shop-product-info"><div class="product-category"><span>${escapeHtml(product.category || 'مكملات رياضية')}</span><i>${available ? 'متوفر' : 'نفد المخزون'}</i></div>
        <h2>${escapeHtml(product.name)}</h2><p class="product-summary">${escapeHtml(product.shortDescription || 'منتج مختار لدعم أدائك وخطتك الرياضية.')}</p>
        <div class="availability"><span class="quantity">المخزون <b>${product.stock}</b></span><span class="${available ? 'available' : 'unavailable'}">● ${available ? 'جاهز للطلب' : 'غير متوفر'}</span></div>
        <div class="shop-price"><div><small>السعر الحالي</small><b>${money(product.price)}</b></div>${oldPrice > product.price ? `<del>${money(oldPrice)}</del>` : ''}</div>
      </div>
    </a>
    <button class="shop-add" data-id="${product.id}" ${available ? '' : 'disabled'}><span>${available ? 'أضف إلى السلة' : 'غير متوفر'}</span><b>＋</b></button>
  </article>`;
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
  grid.innerHTML = list.map(productCard).join('');
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
  filters.innerHTML = all.map((category) => `<button class="${String(category.id) === activeCategory ? 'active' : ''}" data-category="${category.id}">${escapeHtml(category.name)}</button>`).join('');
  filters.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    renderCategories(); renderProducts();
  }));
}

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
    products = data.items || []; categories = data.categories || [];
    renderCategories(); renderProducts(); renderCart();
  } catch (error) {
    grid.innerHTML = `<div class="catalog-error"><b>تعذر تحميل المنتجات</b><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">إعادة المحاولة</button></div>`;
  }
}

search.addEventListener('input', renderProducts);
sort.addEventListener('change', renderProducts);
document.getElementById('openCart').addEventListener('click', () => drawer(true));
document.querySelector('.drawer-close').addEventListener('click', () => drawer(false));
document.getElementById('drawerBackdrop').addEventListener('click', () => drawer(false));
document.querySelector('.shop-menu').addEventListener('click', () => document.querySelector('.shop-header nav').classList.toggle('open'));
window.addEventListener('noamany:cart', renderCart);
installGlobalCartLinks();
loadCatalog();
