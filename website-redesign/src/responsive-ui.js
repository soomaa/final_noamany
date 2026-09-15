// Shared interaction behavior for the public pages and their existing overlays.
const compactNavigation = window.matchMedia('(max-width: 1100px)');
const header = document.querySelector('.site-header, .shop-header, .commerce-header');
// `querySelector('.mobile-nav, nav')` follows DOM order and selected the desktop
// `<nav>` on the homepage. Prefer the dedicated mobile panel when it exists.
const navigation = header?.querySelector('.mobile-nav') || header?.querySelector('nav');
let menuButton = header?.querySelector('.menu-toggle, .shop-menu');
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
const visibleControls = (root) => [...root.querySelectorAll(focusableSelector)].filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');

if (header?.classList.contains('commerce-header')) {
  menuButton = document.createElement('button');
  menuButton.className = 'commerce-menu';
  menuButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  header.appendChild(menuButton);
}
if (menuButton && navigation) {
  menuButton.type = 'button';
  if (menuButton.classList.contains('shop-menu')) menuButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  navigation.id ||= 'public-navigation';
  navigation.setAttribute('aria-label', 'القائمة الرئيسية');
  if (navigation.tagName !== 'NAV') navigation.setAttribute('role', 'navigation');
  menuButton.setAttribute('aria-controls', navigation.id);
}

function setMenu(open, restoreFocus = false) {
  if (!navigation || !menuButton) return;
  const expanded = open && compactNavigation.matches;
  navigation.classList.toggle('open', expanded);
  menuButton.classList.toggle('open', expanded);
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'إغلاق القائمة' : 'فتح القائمة');
  navigation.inert = compactNavigation.matches ? !expanded : navigation.classList.contains('mobile-nav');
  document.body.classList.toggle('navigation-open', expanded);
  if (restoreFocus) menuButton.focus({ preventScroll: true });
}

menuButton?.addEventListener('click', () => setMenu(!navigation.classList.contains('open')));
navigation?.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('click', (event) => {
  if (navigation?.classList.contains('open') && !header.contains(event.target)) setMenu(false);
});
compactNavigation.addEventListener('change', () => setMenu(false));
setMenu(false);

const overlaySelector = '.modal, .cart-drawer, .gallery-viewer, .branch-map-viewer';
let activeOverlay = null;
let returnFocus = null;
function syncOverlays() {
  const overlays = [...document.querySelectorAll(overlaySelector)];
  const open = overlays.findLast((element) => element.classList.contains('open')) || null;
  for (const overlay of overlays) {
    const isOpen = overlay === open;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', String(!isOpen));
    overlay.inert = !isOpen;
    const heading = overlay.querySelector('h2, h3');
    if (heading) {
      heading.id ||= `${overlay.id || overlay.classList[0]}-title`;
      overlay.setAttribute('aria-labelledby', heading.id);
    } else overlay.setAttribute('aria-label', 'عرض الصورة');
  }
  if (open === activeOverlay) return;
  if (open) {
    returnFocus = document.activeElement;
    setMenu(false);
    activeOverlay = open;
    document.body.classList.add('public-overlay-open');
    const target = open.querySelector('.modal-close, .drawer-close, .branch-map-close, button') || open;
    if (target === open) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  } else {
    activeOverlay = null;
    document.body.classList.remove('public-overlay-open');
    if (returnFocus?.isConnected) {
      const target = returnFocus.closest('.mobile-nav') && compactNavigation.matches ? menuButton : returnFocus;
      target?.focus({ preventScroll: true });
    }
    returnFocus = null;
  }
}

function closeOverlay() {
  if (!activeOverlay) return;
  activeOverlay.classList.remove('open');
  document.querySelector('#drawerBackdrop')?.classList.remove('open');
  document.body.classList.remove('drawer-open');
  syncOverlays();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (activeOverlay) { event.preventDefault(); closeOverlay(); }
    else if (navigation?.classList.contains('open')) { event.preventDefault(); setMenu(false, true); }
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = activeOverlay ? visibleControls(activeOverlay) : navigation?.classList.contains('open') ? [menuButton, ...visibleControls(navigation)] : null;
  if (!controls?.length) return;
  const first = controls[0]; const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
});
new MutationObserver((records) => {
  if (records.some((record) => record.target.matches?.(overlaySelector) || [...record.addedNodes].some((node) => node.matches?.(overlaySelector)))) syncOverlays();
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
syncOverlays();

// Keep horizontally scrolling timetables usable with a keyboard as well as touch.
document.querySelectorAll('.schedule-wrap').forEach((wrap) => {
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', 'جدول الكلاسات — مرر أفقيًا لعرض جميع الأيام');
});
document.querySelector('#productSearch')?.setAttribute('aria-label', 'البحث في المنتجات');
document.querySelectorAll('.account-form input').forEach((input) => input.setAttribute('aria-label', input.placeholder));
