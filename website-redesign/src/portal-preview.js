export const PORTAL_PREVIEW_MESSAGE_TYPE = 'noamany:cms-preview';
export const PORTAL_PREVIEW_READY_TYPE = 'noamany:preview-ready';
export const PORTAL_PREVIEW_VERSION = 1;

const SURFACES = new Set(['home', 'shop', 'product']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isPortalPreviewMessage(value) {
  if (!isRecord(value) || value.type !== PORTAL_PREVIEW_MESSAGE_TYPE || value.version !== PORTAL_PREVIEW_VERSION) return false;
  if (typeof value.nonce !== 'string' || value.nonce.length === 0) return false;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) return false;
  if (!SURFACES.has(value.surface) || typeof value.entityType !== 'string' || value.entityType.length === 0) return false;
  if (!(value.entityId === 'new' || value.entityId === 'settings' || (Number.isSafeInteger(value.entityId) && value.entityId > 0))) return false;
  return isRecord(value.draft);
}

export function getPortalPreviewContext(locationLike, referrer) {
  let pageUrl;
  let parentUrl;
  try {
    pageUrl = new URL(locationLike?.href ?? String(locationLike));
    parentUrl = new URL(referrer);
  } catch {
    return null;
  }
  const nonce = pageUrl.searchParams.get('previewNonce');
  if (pageUrl.searchParams.get('cmsPreview') !== '1' || !nonce || !/^https?:$/.test(parentUrl.protocol)) return null;
  return { nonce, parentOrigin: parentUrl.origin };
}

export function isAcceptedPortalPreviewEvent(event, context, parentWindow, lastSequence = -1) {
  const message = event?.data;
  return Boolean(
    context
    && event?.source === parentWindow
    && event?.origin === context.parentOrigin
    && isPortalPreviewMessage(message)
    && message.nonce === context.nonce
    && message.sequence > lastSequence,
  );
}

export function installPortalPreviewReceiver(onSnapshot, environment = {}) {
  const hostWindow = environment.window ?? globalThis.window;
  const hostDocument = environment.document ?? globalThis.document;
  if (!hostWindow || !hostDocument || typeof onSnapshot !== 'function') return () => {};

  const context = getPortalPreviewContext(hostWindow.location, hostDocument.referrer);
  if (!context || !hostWindow.parent || hostWindow.parent === hostWindow) return () => {};

  let lastSequence = -1;
  const receive = (event) => {
    if (!isAcceptedPortalPreviewEvent(event, context, hostWindow.parent, lastSequence)) return;
    lastSequence = event.data.sequence;
    onSnapshot(event.data);
  };

  hostWindow.addEventListener('message', receive);
  hostWindow.parent.postMessage({
    type: PORTAL_PREVIEW_READY_TYPE,
    version: PORTAL_PREVIEW_VERSION,
    nonce: context.nonce,
  }, context.parentOrigin);

  return () => hostWindow.removeEventListener('message', receive);
}

function classTokens(element) {
  if (typeof element?.className === 'string') return element.className.split(/\s+/).filter(Boolean);
  if (element?.classList && typeof element.classList.contains === 'function') {
    return ['add-cart', 'shop-add', 'submit-order'].filter((name) => element.classList.contains(name));
  }
  return [];
}

export function classifyPortalPreviewInteraction(target, currentHref) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  if (!element) return 'allow';
  const tagName = String(element.tagName ?? '').toUpperCase();
  const form = tagName === 'FORM' || element.closest?.('form');
  const actionElement = element.closest?.('[data-product-id], [data-cart-id], [data-action], [data-id], #addProduct, #openCart, .add-cart, .shop-add, .submit-order, .home-cart-actions, .drawer-quantity, .commerce-cart');
  const tokens = classTokens(element);
  const cartAction = ['plus', 'minus', 'remove'].includes(element.dataset?.action);
  if (form || actionElement || cartAction || element.id === 'addProduct' || tokens.some((name) => ['add-cart', 'shop-add', 'submit-order'].includes(name))) return 'transaction';

  const anchor = tagName === 'A' ? element : element.closest?.('a[href]');
  if (!anchor) return 'allow';
  const rawHref = anchor.getAttribute?.('href') ?? anchor.href ?? '';
  if (!rawHref) return 'allow';
  if (String(rawHref).startsWith('#')) return 'in-page';

  try {
    const currentUrl = new URL(currentHref);
    const destination = new URL(rawHref, currentUrl);
    if (destination.pathname === '/checkout.html' || destination.pathname.startsWith('/checkout/')) return 'transaction';
    if (destination.origin !== currentUrl.origin) return 'external-navigation';
    if (destination.pathname === currentUrl.pathname && destination.search === currentUrl.search && destination.hash) return 'in-page';
    return 'navigation';
  } catch {
    return 'external-navigation';
  }
}

export function shouldBlockPortalPreviewInteraction(target, currentHref) {
  const kind = classifyPortalPreviewInteraction(target, currentHref);
  return kind === 'transaction' || kind === 'external-navigation';
}
