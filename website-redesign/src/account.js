import './font.css';
import { api, escapeHtml, hasSession, installGlobalCartLinks, money, saveToken, showToast } from './portal.js';

const root = document.getElementById('accountPage');

function authView() {
  root.innerHTML = `<div class="auth-shell"><section class="auth-copy"><span>MEMBERS / STORE</span><h2>كل طلباتك.<br><em>في مكان واحد.</em></h2><p>حساب المتجر منفصل وآمن عن حسابات موظفي النظام.</p><div><b>✓ متابعة حالة الطلب</b><b>✓ تطبيق خصم حسابك تلقائيًا</b><b>✓ حفظ بيانات التوصيل</b></div></section><section class="auth-card"><div class="auth-tabs"><button class="active" data-auth-tab="login">تسجيل الدخول</button><button data-auth-tab="register">حساب جديد</button></div><div id="authForm"></div></section></div>`;
  root.querySelectorAll('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => { root.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === button)); renderAuthForm(button.dataset.authTab); }));
  renderAuthForm('login');
}

function renderAuthForm(type) {
  const wrap = document.getElementById('authForm');
  wrap.innerHTML = type === 'login' ? `<form id="loginForm"><label>رقم الهاتف أو البريد<input name="identity" required autocomplete="username"></label><label>كلمة المرور<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">دخول آمن ←</button></form>` : `<form id="registerForm"><label>الاسم بالكامل<input name="fullName" required minlength="3"></label><label>رقم الموبايل<input name="phone" required inputmode="tel" placeholder="01xxxxxxxxx"></label><label>البريد الإلكتروني<input name="email" type="email"></label><label>كلمة المرور<input name="password" type="password" required minlength="6" autocomplete="new-password"></label><button type="submit">إنشاء الحساب ←</button></form>`;
  wrap.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try {
      const result = await api(type === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
      saveToken(result.accessToken); showToast(type === 'login' ? 'مرحبًا بعودتك' : 'تم إنشاء حسابك بنجاح'); await dashboard();
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });
}

function statusLabel(status) { return ({ pending: 'جديد', processing: 'جارٍ التجهيز', completed: 'مكتمل', cancelled: 'ملغي' })[status] || status; }

async function dashboard() {
  root.innerHTML = '<div class="loading-panel">جارٍ تحميل حسابك…</div>';
  try {
    const [user, orders] = await Promise.all([api('/account'), api('/account/orders')]);
    root.innerHTML = `<div class="account-dashboard"><aside class="profile-card"><span class="profile-mark">${escapeHtml(user.fullName?.charAt(0) || 'ن')}</span><small>مرحبًا بك</small><h2>${escapeHtml(user.fullName)}</h2><p>${escapeHtml(user.phone)}</p>${user.email ? `<p>${escapeHtml(user.email)}</p>` : ''}${user.discountRate > 0 ? `<div class="account-discount"><span>خصمك الفعّال</span><b>${user.discountRate}%</b></div>` : ''}<button id="logout">تسجيل الخروج</button></aside><section class="orders-card"><div class="card-heading"><span>${String(orders.length).padStart(2, '0')}</span><div><h2>طلباتك</h2><p>آخر الطلبات المسجلة على حسابك</p></div></div><div class="orders-list">${orders.length ? orders.map((order) => `<article><div><span>طلب #${order.id}</span><small>${new Date(order.createdAt).toLocaleDateString('ar-EG')}</small></div><b>${money(order.total)}</b><em data-status="${order.status}">${statusLabel(order.status)}</em></article>`).join('') : '<div class="empty-orders">لا توجد طلبات على حسابك بعد.<br><a href="/shop.html">ابدأ التسوق ←</a></div>'}</div></section></div>`;
    document.getElementById('logout').addEventListener('click', () => { saveToken(null); authView(); });
  } catch (error) { saveToken(null); authView(); showToast(error.message, 'error'); }
}

installGlobalCartLinks(); hasSession() ? dashboard() : authView();
