import './font.css';
import { api, cartTotal, clearCart, escapeHtml, getCart, hasSession, installGlobalCartLinks, money, productImageUrl, showToast, updateCartItem, wireImageFallback } from './portal.js';

const root = document.getElementById('checkoutPage');
let coupon = null;

function cartMarkup(cart) {
  return cart.map((item) => `<div class="checkout-item" data-cart-id="${item.productId}"><div class="checkout-thumb" data-image-frame><img data-product-image data-placeholder="${item.image ? 'false' : 'true'}" src="${escapeHtml(productImageUrl(item.image))}" alt=""></div><div><b>${escapeHtml(item.name)}</b><small>${money(item.price)} × ${item.quantity}</small></div><strong>${money(item.price * item.quantity)}</strong><button aria-label="حذف المنتج">×</button></div>`).join('');
}

async function prefill() {
  if (!hasSession()) return;
  try {
    const user = await api('/account');
    const form = document.getElementById('checkoutForm');
    ['fullName', 'phone', 'email', 'governorate', 'cityStreet'].forEach((key) => { if (user[key] && form.elements[key]) form.elements[key].value = user[key]; });
    const note = document.getElementById('customerDiscount');
    if (user.discountRate > 0) note.textContent = `خصم حسابك ${user.discountRate}% سيُطبّق تلقائيًا.`;
  } catch { /* Expired token is handled when the user opens account. */ }
}

function render() {
  const cart = getCart();
  if (!cart.length) {
    root.innerHTML = '<div class="empty-checkout"><span>01</span><h2>سلة المشتريات فارغة.</h2><p>استكشف منتجات النعماني وأضف ما يناسب هدفك.</p><a href="/shop.html">الذهاب إلى المتجر ←</a></div>'; return;
  }
  root.innerHTML = `<section class="checkout-form-card"><div class="card-heading"><span>01</span><div><h2>بيانات التوصيل</h2><p>${hasSession() ? 'تم التعرف على حسابك، يمكنك تعديل بيانات الطلب.' : 'يمكنك إتمام الطلب كزائر أو تسجيل الدخول أولاً.'}</p></div></div>
    <form id="checkoutForm"><label>الاسم الثلاثي<input name="fullName" required minlength="3"></label><label>رقم الموبايل<input name="phone" required inputmode="tel" placeholder="01xxxxxxxxx"></label><label>رقم احتياطي<input name="backupPhone" inputmode="tel" placeholder="اختياري"></label><label>البريد الإلكتروني<input name="email" type="email" placeholder="اختياري"></label><label>الدولة<input name="country" value="مصر" required></label><label>المحافظة<input name="governorate" required></label><label class="wide">المدينة / الشارع<textarea name="cityStreet" required></textarea></label><label class="wide">ملاحظات الطلب<textarea name="notes" placeholder="اختياري"></textarea></label><input name="paymentMethod" type="hidden" value="cod"><div class="payment-choice wide"><span>◉</span><div><b>الدفع عند الاستلام</b><small>وسيلة الدفع المتاحة حاليًا كما في النظام القديم.</small></div></div><p id="customerDiscount" class="discount-note wide"></p><button class="submit-order wide" type="submit">تأكيد الطلب بأمان ←</button></form>
  </section><aside class="order-summary"><div class="card-heading"><span>02</span><div><h2>ملخص الطلب</h2><p>${cart.length} منتجات مختلفة</p></div></div><div id="checkoutItems">${cartMarkup(cart)}</div><div class="coupon-row"><input id="couponCode" aria-label="كود خصم الكابتن" placeholder="كود خصم الكابتن"><button id="applyCoupon" type="button">تطبيق</button></div><p id="couponNote" class="discount-note"></p><div class="summary-totals"><div><span>الإجمالي المبدئي</span><b>${money(cartTotal(cart))}</b></div><div><span>الشحن</span><b>مجاني</b></div><strong><span>الإجمالي</span><b id="finalTotal">${money(cartTotal(cart))}</b></strong></div><small class="server-note">السيرفر يعيد حساب السعر والمخزون والخصومات عند التأكيد.</small></aside>`;
  root.querySelectorAll('[data-cart-id] > button').forEach((button) => button.addEventListener('click', () => { updateCartItem(Number(button.closest('[data-cart-id]').dataset.cartId), 0); coupon = null; render(); }));
  document.getElementById('applyCoupon').addEventListener('click', applyCoupon);
  document.getElementById('checkoutForm').addEventListener('submit', submitOrder);
  wireImageFallback(root); prefill();
}

async function applyCoupon() {
  const button = document.getElementById('applyCoupon'); const code = document.getElementById('couponCode').value.trim();
  button.disabled = true;
  try {
    coupon = await api('/coupons/validate', { method: 'POST', body: { code, items: getCart().map(({ productId, quantity }) => ({ productId, quantity })) } });
    document.getElementById('couponNote').textContent = `تم تطبيق خصم ${coupon.rate}% — وفّرت ${money(coupon.discount)}`;
    document.getElementById('finalTotal').textContent = money(coupon.total);
  } catch (error) { coupon = null; document.getElementById('couponNote').textContent = error.message; document.getElementById('finalTotal').textContent = money(cartTotal()); }
  finally { button.disabled = false; }
}

async function submitOrder(event) {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'جارٍ تأكيد الطلب…';
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api('/orders', { method: 'POST', body: { ...data, couponCode: coupon?.code || '', items: getCart().map(({ productId, quantity }) => ({ productId, quantity })) } });
    clearCart(); root.innerHTML = `<div class="order-success"><span>✓</span><small>NOAMANY ORDER CONFIRMED</small><h2>تم استلام طلبك بنجاح.</h2><p>رقم الطلب <b>#${result.orderId}</b></p><div><span>الإجمالي</span><strong>${money(result.total)}</strong></div>${result.duplicate ? '<em>اكتشفنا ضغطًا مكررًا، لذلك لم ننشئ طلبًا ثانيًا.</em>' : ''}<a href="/account.html">متابعة الطلب من حسابي ←</a><a class="muted-link" href="/shop.html">العودة للمتجر</a></div>`;
  } catch (error) { showToast(error.message, 'error'); button.disabled = false; button.textContent = 'تأكيد الطلب بأمان ←'; }
}

installGlobalCartLinks(); render();
