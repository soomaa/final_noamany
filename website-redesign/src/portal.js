export const API_ROOT = '/api/public/portal';
export const PRODUCT_PLACEHOLDER = '/assets/product-placeholder-premium.png';
const CART_KEY = 'noamany_store_cart_v2';
const TOKEN_KEY = 'noamany_customer_token';

export async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'تعذر الاتصال بالنظام، حاول مرة أخرى');
  return payload;
}

export function assetUrl(path) {
  if (!path) return '';
  path = String(path).trim();
  if (/[\u0000-\u001f\u007f]/.test(path) || (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^https?:\/\//i.test(path))) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const cleaned = String(path).replace(/^\/+/, '');
  if (cleaned.startsWith('assets/')) return `/${cleaned}`;
  return cleaned.startsWith('uploads/') ? `/${cleaned}` : `/uploads/${cleaned}`;
}

export function safeLink(value, fallback = '#') {
  const path = String(value || '').trim();
  if (!path || /[\u0000-\u001f\u007f\\]/.test(path) || path.startsWith('//')) return fallback;
  if (/^(https?:\/\/|tel:|mailto:)/i.test(path)) return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return fallback;
  return path;
}

export function productImageUrl(path) {
  return path ? assetUrl(path) : PRODUCT_PLACEHOLDER;
}

export function money(value) {
  return `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

export function getCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item.productId && item.quantity > 0) : [];
  } catch { return []; }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('noamany:cart', { detail: cart }));
}

export function addToCart(product, quantity = 1) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('اختر كمية صحيحة لا تقل عن قطعة واحدة');
  if (!product || product.stockStatus === 'out_of_stock' || Number(product.stock) < 1) throw new Error('المنتج غير متوفر حاليًا');
  const cart = getCart();
  const existing = cart.find((item) => item.productId === Number(product.id));
  const nextQuantity = (existing?.quantity || 0) + quantity;
  if (nextQuantity > Number(product.stock)) throw new Error(`المتاح من المنتج ${product.stock} فقط`);
  const snapshot = { productId: Number(product.id), quantity: nextQuantity, name: product.name, price: Number(product.price), image: product.image, stock: Number(product.stock) };
  if (existing) Object.assign(existing, snapshot); else cart.push(snapshot);
  saveCart(cart);
  return cart;
}

export function updateCartItem(productId, quantity) {
  let cart = getCart();
  const item = cart.find((entry) => entry.productId === Number(productId));
  if (!item) return cart;
  if (quantity <= 0) cart = cart.filter((entry) => entry.productId !== Number(productId));
  else item.quantity = Math.min(Number(item.stock || 99), quantity);
  saveCart(cart);
  return cart;
}

export function cartCount(cart = getCart()) { return cart.reduce((sum, item) => sum + Number(item.quantity), 0); }
export function cartTotal(cart = getCart()) { return cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0); }
export function clearCart() { saveCart([]); }
export function saveToken(token) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }
export function hasSession() { return Boolean(localStorage.getItem(TOKEN_KEY)); }

export function wireImageFallback(root = document) {
  root.querySelectorAll('img[data-product-image]').forEach((image) => image.addEventListener('error', () => {
    if (!image.dataset.fallbackApplied) {
      image.dataset.fallbackApplied = 'true';
      image.dataset.placeholder = 'true';
      image.src = PRODUCT_PLACEHOLDER;
      return;
    }
    image.hidden = true;
    image.closest('[data-image-frame]')?.classList.add('image-missing');
  }));
}

export function showToast(message, kind = 'success') {
  let toast = document.querySelector('.toast, .shop-toast, .site-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'site-toast';
    document.body.appendChild(toast);
  }
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

export function installGlobalCartLinks() {
  const paint = (cart = getCart()) => document.querySelectorAll('.cart-count, #shopCartCount').forEach((node) => { node.textContent = String(cartCount(cart)); });
  paint();
  window.addEventListener('noamany:cart', (event) => paint(event.detail));
}
import './responsive-ui.js';
