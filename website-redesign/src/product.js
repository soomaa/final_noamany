import './font.css';
import { addToCart, api, escapeHtml, installGlobalCartLinks, money, productImageUrl, showToast, wireImageFallback } from './portal.js';

const root = document.getElementById('productPage');
const id = Number(new URLSearchParams(location.search).get('id'));
let product;

function relatedCard(item) {
  return `<a class="related-card" href="/product.html?id=${item.id}"><div data-image-frame><img data-product-image data-placeholder="${item.image ? 'false' : 'true'}" src="${productImageUrl(item.image)}" alt="${escapeHtml(item.name)}"></div><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><b>${money(item.price)}</b></a>`;
}

async function load() {
  if (!id) { root.innerHTML = '<div class="error-panel">رابط المنتج غير صحيح.<br><a href="/shop.html">العودة للمتجر</a></div>'; return; }
  try {
    product = await api(`/products/${id}`);
    document.title = `${product.name} | متجر النعماني`;
    const available = product.stockStatus === 'in_stock' && product.stock > 0;
    root.innerHTML = `<div class="product-breadcrumb"><a href="/shop.html">المتجر</a><span>←</span><b>${escapeHtml(product.category)}</b></div>
      <section class="product-detail-layout">
        <div class="product-gallery" data-image-frame><img data-product-image data-placeholder="${product.image ? 'false' : 'true'}" src="${productImageUrl(product.image)}" alt="${escapeHtml(product.name)}"><img class="watermark" src="/assets/noamany-logo.png" alt=""></div>
        <div class="product-copy"><span class="product-category-label">${escapeHtml(product.category)}</span><h1>${escapeHtml(product.name)}</h1>${product.nameEn ? `<small>${escapeHtml(product.nameEn)}</small>` : ''}
          <p>${escapeHtml(product.description || product.shortDescription || 'منتج مختار بعناية لدعم أدائك الرياضي.')}</p>
          <div class="detail-price"><strong>${money(product.price)}</strong>${product.oldPrice > product.price ? `<del>${money(product.oldPrice)}</del>` : ''}</div>
          <div class="stock-line ${available ? '' : 'out'}"><span>●</span>${available ? `متوفر — ${product.stock} قطعة` : 'نفد المخزون مؤقتًا'}</div>
          <div class="buy-row"><label>الكمية<input id="productQty" type="number" min="1" max="${product.stock}" value="1"></label><button id="addProduct" ${available ? '' : 'disabled'}>${available ? 'أضف إلى السلة ←' : 'غير متوفر'}</button></div>
          <div class="trust-row"><span>✓ سعر مؤكد من الإدارة</span><span>✓ دفع عند الاستلام</span><span>✓ متابعة حالة الطلب</span></div>
        </div>
      </section>
      ${product.related?.length ? `<section class="related-section"><div><span>مختارات مشابهة</span><h2>قد يعجبك أيضًا.</h2></div><div class="related-grid">${product.related.map(relatedCard).join('')}</div></section>` : ''}`;
    document.getElementById('addProduct')?.addEventListener('click', () => {
      try { addToCart(product, Number(document.getElementById('productQty').value)); showToast('تمت إضافة المنتج إلى السلة'); }
      catch (error) { showToast(error.message, 'error'); }
    });
    wireImageFallback(root);
  } catch (error) { root.innerHTML = `<div class="error-panel">${escapeHtml(error.message)}<br><a href="/shop.html">العودة للمتجر</a></div>`; }
}

installGlobalCartLinks(); load();
