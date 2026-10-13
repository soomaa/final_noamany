import './font.css';
import { addToCart, api, assetUrl, cartCount, cartTotal, escapeHtml, getCart, installGlobalCartLinks, money, productImageUrl, saveToken, showToast, updateCartItem, wireImageFallback } from './portal.js';

const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');
const progressBar = document.querySelector('.page-progress span');
const backToTop = document.querySelector('.back-to-top');
let portalData = null;

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 30);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) progressBar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  backToTop?.classList.toggle('show', window.scrollY > 520);
}, { passive: true });

backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

toggle?.addEventListener('click', () => {
  const open = mobileNav.classList.toggle('open'); toggle.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open));
});
mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { mobileNav.classList.remove('open'); toggle.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));

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
document.querySelector('.book-class')?.addEventListener('click', () => document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' }));

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
  return `<article class="product reveal"><a href="/product.html?id=${product.id}" class="home-product-link"><div class="product-visual" data-image-frame><img class="product-logo" src="/assets/noamany-logo.png" alt="Noamany">${product.oldPrice > product.price ? '<span class="sale-badge">خصم</span>' : ''}<img class="home-product-image" data-product-image data-placeholder="${product.image ? 'false' : 'true'}" src="${productImageUrl(product.image)}" alt="${escapeHtml(product.name)}"></div><div class="product-meta"><span>${escapeHtml(product.category)}</span><span class="stock">● ${available ? 'متوفر' : 'نفد'}</span></div><h3>${escapeHtml(product.name)}</h3><p class="product-detail">${escapeHtml(product.shortDescription || 'منتج مختار بعناية لدعم خطتك الرياضية.')}</p><div class="price"><b>${money(product.price)}</b>${product.oldPrice > product.price ? `<del>${money(product.oldPrice)}</del>` : ''}</div></a><button class="add-cart" data-product-id="${product.id}" ${available ? '' : 'disabled'}>${available ? 'إضافة إلى السلة' : 'غير متوفر'}</button></article>`;
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
  const fallback = ['/assets/hero-red.png', '/assets/class-women.png', '/assets/class-boxing.png'][index % 3];
  return `<article class="offer reveal"><div class="offer-image"><img src="${offer.image ? assetUrl(offer.image) : fallback}" alt="${escapeHtml(offer.title)}"><span class="offer-price">${money(offer.value)}</span></div><div class="offer-body"><span class="offer-subtitle">${escapeHtml(offer.subtitle || 'عرض لفترة محدودة')}</span><h3>${escapeHtml(offer.title)}</h3><p class="offer-detail">${escapeHtml(offer.details || '')}</p><div class="offer-footer"><small>${offer.toDate ? `ينتهي في: ${new Date(offer.toDate).toLocaleDateString('ar-EG')}` : 'لفترة محدودة'}</small><button class="offer-details">التفاصيل ←</button></div></div></article>`;
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
    document.querySelector('.schedule-table tbody').innerHTML = `<tr class="time-row"><td>الوقت</td>${days.map((day) => `<td>${byDay.get(day)?.map((item) => escapeHtml(item.time)).join('<br>') || '—'}</td>`).join('')}</tr><tr class="class-row"><td>الكلاس</td>${days.map((day) => `<td class="${byDay.get(day)?.length ? '' : 'off-day'}">${byDay.get(day)?.map((item) => `<b>${escapeHtml(item.title)}</b>`).join('') || 'راحة'}</td>`).join('')}</tr>`;
  };
  branchTabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { branchId = Number(button.dataset.scheduleBranch); branchTabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button)); paint(); }));
  categoryTabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { classType = Number(button.dataset.scheduleType); categoryTabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button)); paint(); })); paint();
}

function cleanCmsText(value) {
  if (!value) return '';
  const parsed = new DOMParser().parseFromString(String(value), 'text/html');
  return String(parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function renderAbout(about) {
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
    const candidate = assetUrl(about.image);
    const probe = new Image();
    probe.onload = () => { image.src = candidate; };
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
  const albums = (photos || []).map((album) => ({ ...album, allImages: [...new Set([album.image, ...(album.images || [])].filter(Boolean))] })).filter((album) => album.allImages.length);
  const grid = document.querySelector('.gallery-grid'); const tabs = document.querySelector('.gallery-tabs');
  const availableBranches = (branches || []).filter((branch) => albums.some((album) => Number(album.branchId) === Number(branch.id)));
  const paint = (branchId) => {
    const selected = branchId ? albums.filter((album) => Number(album.branchId) === Number(branchId)) : albums;
    const managed = selected.flatMap((album) => album.allImages.map((image) => ({ image: assetUrl(image), title: album.title })));
    const visible = managed.slice(0, 5);
    while (visible.length < 5) visible.push(fallbacks[visible.length]);
    grid.innerHTML = visible.map((item, index) => `<figure class="gallery-item" tabindex="0"><img src="${escapeHtml(item.image)}" data-gallery-fallback="${index}" alt="${escapeHtml(item.title || fallbacks[index].title)}" loading="lazy"><figcaption><span>${escapeHtml(item.title || fallbacks[index].title)}</span></figcaption></figure>`).join('');
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
          viewer.innerHTML = '<button type="button" aria-label="إغلاق">×</button><img alt=""><span></span>';
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
function renderHero(sliders) {
  const hero = document.querySelector('.luxe-hero');
  const background = hero?.querySelector('.hero-bg');
  if (!hero || !background) return;
  const heading = hero.querySelector('.hero-content h1');
  const description = hero.querySelector('.hero-content > p');

  const fallback = '/assets/hero-red.png';
  background.style.setProperty('background-image', `url('${fallback}')`, 'important');

  const slider = sliders?.[0];
  if (!slider) return;

  if (slider.title?.trim()) heading.innerHTML = luxuryHeading(slider.title);
  if (slider.details?.trim()) description.textContent = slider.details;

  if (slider.main_image) {
    const candidate = assetUrl(slider.main_image);
    const probe = new Image();
    probe.onload = () => background.style.setProperty('background-image', `url('${candidate}')`, 'important');
    probe.onerror = () => background.style.setProperty('background-image', `url('${fallback}')`, 'important');
    probe.src = candidate;
  }
}

function luxuryHeading(value) {
  const words = String(value || '').trim().split(/\s+/); const last = words.pop() || '';
  return `${escapeHtml(words.join(' '))}${words.length ? ' ' : ''}<em>${escapeHtml(last)}</em>`;
}

function renderSectionSettings(items) {
  const selectors = { products:'.products-section', offers:'.offers-section', services:'.services-section', classes:'.classes', coaches:'.coach', gallery:'.gallery-section', membership:'.membership', branches:'.branches', contact:'.contact-section' };
  items?.forEach((item) => {
    if (item.sectionKey === 'lead') {
      const section = document.querySelector('.cta-band');
      if (item.subtitle) section.querySelector('span').textContent = item.subtitle;
      if (item.extraText) section.querySelector('h2').innerHTML = luxuryHeading(item.extraText);
      if (item.linkText) section.querySelector('button').textContent = `${item.linkText} ←`;
      return;
    }
    const section = document.querySelector(selectors[item.sectionKey]); if (!section) return;
    const tag = section.querySelector('.section-tag'); const heading = section.querySelector('h2'); const description = heading?.closest('.section-heading')?.querySelector(':scope > p') || section.querySelector('.services-intro > p,.coach-copy > p');
    if (tag && item.subtitle) tag.textContent = item.subtitle;
    if (heading && item.extraText) heading.innerHTML = luxuryHeading(item.extraText);
    if (description && item.details) description.textContent = item.details;
    const link = section.querySelector('.show-all,.services-link,.coach-copy > .btn');
    if (link && item.linkText) link.textContent = `${item.linkText} ←`;
    if (link && item.linkUrl) link.href = item.linkUrl;
  });
}

function renderStats(items) {
  if (!items?.length) return;
  const wrap = document.querySelector('.hero-stats');
  wrap.innerHTML = items.map((item) => `<div><strong>${Number(item.numericValue || 0).toLocaleString('ar-EG')}${escapeHtml(item.suffix || '')}</strong><span>${escapeHtml(item.title)}</span></div>`).join('');
  const experience = document.querySelector('.experience'); const years = items.find((item) => /خبرة|عام|سنة/.test(item.title));
  if (experience && years) experience.innerHTML = `<strong>${Number(years.numericValue || 0).toLocaleString('ar-EG')}${escapeHtml(years.suffix || '')}</strong><span>${escapeHtml(years.title)}</span>`;
}

function serviceVisual(item, index) {
  if (item.image) return `<img src="${assetUrl(item.image)}" alt="">`;
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
  document.querySelector('.service-grid').innerHTML = items.map((item, index) => `<article class="service reveal"><div class="service-top"><span class="service-no">${String(index + 1).padStart(2, '0')}</span><div class="service-icon">${serviceVisual(item, index)}</div></div><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.details || item.subtitle || '')}</p></div><a href="${escapeHtml(item.linkUrl || '#contact')}" aria-label="${escapeHtml(item.linkText || item.title)}">←</a></article>`).join('');
  const count = document.querySelector('.services-stamp'); if (count) count.innerHTML = `<strong>${items.length}</strong><span>خدمات<br>متكاملة</span>`;
  reveal(document.querySelector('.service-grid'));
}

function renderClassShowcase(items) {
  if (!items?.length) return;
  document.querySelector('.class-grid').innerHTML = items.map((item) => `<article class="class-card ${item.featured ? 'large' : ''} ${item.image ? '' : 'tone'} reveal">${item.image ? `<img src="${assetUrl(item.image)}" alt="${escapeHtml(item.title)}">` : ''}<div class="card-shade"></div>${!item.image && item.icon ? `<div class="tone-icon">${escapeHtml(item.icon)}</div>` : ''}<div class="class-info"><small>${escapeHtml(item.subtitle || '')}</small><h3>${escapeHtml(item.title)}</h3><a href="${escapeHtml(item.linkUrl || '#membership')}">${escapeHtml(item.linkText || 'احجز مكانك')} ←</a></div></article>`).join('');
  reveal(document.querySelector('.class-grid'));
}

function renderAboutFeatures(items) { if (items?.length) document.querySelector('.about-copy .checks').innerHTML = items.map((item) => `<span>${escapeHtml(item.icon || '✓')} ${escapeHtml(item.title)}</span>`).join(''); }

function renderCoaches(trainers, features) {
  const trainer = trainers?.[0];
  if (trainer?.image) document.querySelector('.coach-photo img').src = assetUrl(trainer.image);
  if (trainer?.title) document.querySelector('.coach-photo .big-type').textContent = trainer.title;
  if (features?.length) document.querySelector('.coach-points').innerHTML = features.map((item, index) => `<div><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle || item.details || '')}</small></span></div>`).join('');
}

function renderMembership(items) {
  const plans = document.querySelector('.plans');
  if (!plans) return;
  if (!items?.length) { plans.innerHTML = '<p class="empty-state">لا توجد باقات اشتراك متاحة حاليًا.</p>'; return; }
  plans.innerHTML = items.filter((item) => item.subscriptionTypeId).map((item) => `<article class="plan ${item.featured ? 'featured' : ''} reveal">${item.featured ? '<div class="popular">الأكثر اختيارًا</div>' : ''}<span class="plan-name">${escapeHtml(item.subscriptionTypeName || item.title)}</span><h3>${escapeHtml(item.subtitle || '')}</h3><p>${escapeHtml(item.details || '')}</p><div class="plan-price">${money(item.subscriptionPrice)} <small>${Number(item.subscriptionDays)} يوم</small></div><ul>${String(item.extraText || '').split(/\r?\n/).filter(Boolean).map((feature) => `<li>✓ ${escapeHtml(feature)}</li>`).join('')}</ul><a href="subscribe.html?plan=${Number(item.subscriptionTypeId)}" class="btn ${item.featured ? 'primary' : 'ghost'}">اشترك الآن</a></article>`).join('');
  reveal(document.querySelector('.plans'));
}

function renderVideos(items) {
  const section = document.querySelector('.media-showcase');
  if (!items?.length) { section.hidden = true; return; }
  document.querySelector('.video-grid').innerHTML = items.map((item) => `<a class="video-card reveal" href="${escapeHtml(item.videoLink || '#')}" target="_blank" rel="noreferrer"><div>${item.image ? `<img src="${assetUrl(item.image)}" alt="${escapeHtml(item.title)}">` : ''}<span>▶</span></div><small>${escapeHtml(item.subtitle || 'NOAMANY VIDEO')}</small><h3>${escapeHtml(item.title)}</h3></a>`).join('');
  reveal(document.querySelector('.video-grid'));
}

function renderCompany(company) {
  if (!company) return;
  const logo = company.logo ? assetUrl(company.logo) : null;
  if (logo) document.querySelectorAll('.brand-mark img,.footer-brand img').forEach((image) => { image.src = logo; });
  const footerCopy = document.querySelector('footer .footer-grid > p'); if (footerCopy) footerCopy.textContent = company.footer || company.summary_company || footerCopy.textContent;
  const copyright = document.querySelector('footer .copyright span'); if (copyright) copyright.textContent = `© ${new Date().getFullYear()} ${company.nameweb || 'مركز النعماني للياقة البدنية'}`;
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

function renderManagedContent(data) {
  const content = data.content || {};
  renderSectionSettings(content['section-settings']); renderStats(content.stats); renderServices(content.services);
  renderClassShowcase(content['class-showcase']); renderAboutFeatures(content['about-features']); renderCoaches(data.trainers, content['coach-features']);
  renderMembership(content['membership-plans']); renderVideos(data.videos); renderCompany(data.company);
}

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
    portalData = homeResult.value;
    renderBranches(portalData.branches); renderSchedule(portalData.branches, portalData.classes); renderAbout(portalData.about); renderGallery(portalData.photos, portalData.branches); renderHero(portalData.sliders); renderManagedContent(portalData);
    if (portalData.offers?.length) { const grid = document.querySelector('.offer-grid'); grid.innerHTML = portalData.offers.map(offerCard).join(''); wireOfferModals(); reveal(grid); }
    else wireOfferModals();
  } else {
    console.warn('Portal content fallback is active:', homeResult.reason?.message);
    wireOfferModals();
  }
  try { renderMembership(await api('/membership-plans')); } catch (error) { console.warn('Membership plans could not be loaded:', error.message); }
}

hydratePortal();
