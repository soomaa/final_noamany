# Portal Live Preview Design

Date: 2026-09-09

## Outcome

The Noamany portal administration shows the real public website or store beside the editor while an administrator changes content. Draft changes render immediately in the preview, remain private to the current browser, and do not reach the existing publish APIs until the administrator explicitly publishes.

## Scope

- Visual CMS settings and records use the preview: company, about, sliders, photos, videos, hero videos, branches, trainers, classes, offers, stats, services, class showcase, about features, coach features, section settings, categories, products, and badges.
- Operational records—orders, customers, job applications, payment methods, captain discounts, and reports—keep their current workflow and do not pretend to have a public visual preview.
- “Full control” means every visual field already supported by the Noamany CMS is visible in the real renderer while editing. It does not add arbitrary CSS editing or a free-form drag-and-drop page builder.

## Editor experience

- Desktop uses a 42/58 split: scrollable form on the left and a sticky browser preview on the right.
- Mobile uses two explicit tabs, “التعديل” and “المعاينة”, rather than squeezing both panes.
- Preview toolbar provides Desktop and Mobile widths, refresh, fullscreen, and a clear “معاينة خاصة — غير منشورة” status.
- Existing “حفظ” becomes “نشر التعديلات”. “حفظ كمسودة” stores the current form locally on this device and survives refresh. “إلغاء المسودة” restores the last published values.
- Closing an editor with unsaved changes does not publish them.

## Architecture

### Admin sender

`PortalLivePreview` owns the iframe and a versioned message channel. It maps each CMS screen to `/`, `/shop.html`, or `/product.html?id=…`, waits for `noamany:preview-ready`, then sends the latest snapshot with a monotonically increasing sequence number.

Message shape:

```ts
type PortalPreviewMessage = {
  type: 'noamany:cms-preview';
  version: 1;
  nonce: string;
  sequence: number;
  surface: 'home' | 'shop' | 'product';
  entityType: string;
  entityId: number | 'new' | 'settings';
  draft: Record<string, unknown>;
};
```

The sender uses an explicit `targetOrigin`, never `*`. The public base is same-origin in the unified production build and `http://127.0.0.1:5175` during local development.

### Public receiver

The iframe URL includes `cmsPreview=1` and a random nonce. The website accepts messages only when preview mode is active, the nonce matches, `event.source === window.parent`, and `event.origin` equals the origin derived from `document.referrer`. It ignores stale sequence numbers.

`website-redesign/src/portal-preview.js` contains only protocol validation and registration. Page modules keep ownership of rendering:

- `main.js` merges settings or records into the already loaded home payload, then calls the existing renderers.
- `shop.js` normalizes product/category/badge drafts and re-renders catalog filters/cards.
- `product.js` re-renders a matching saved product. A new unsaved product stays in shop-card preview because no public detail ID exists.

All draft text, links, and assets continue through the existing `escapeHtml`, `safeLink`, `assetUrl`, and renderer functions. No raw draft HTML is injected.

### Preview safety

Preview mode disables transactional navigation, cart mutation, checkout, forms, and external links inside the iframe. Scrolling and in-page anchors remain usable. A visible preview badge prevents confusing draft content with published content.

## Draft storage

Drafts are local browser data keyed by screen and record identity. They store field values only, never authentication tokens or file bodies. Publishing uses the existing authenticated POST/PUT endpoint and clears the matching local draft after success. The UI says “محفوظ على هذا الجهاز” so it does not imply shared drafts.

## States and accessibility

- Loading skeleton while the iframe loads.
- Retry state if the preview does not complete its handshake.
- Empty/new record preview with honest placeholders.
- Keyboard-operable toolbar, visible focus, labelled viewport controls, and an iframe title naming the selected surface.
- No horizontal document overflow at 390px. The preview viewport itself scrolls within its frame.

## Acceptance

- Typing a visual field updates the iframe without POST/PUT.
- “حفظ كمسودة” survives reload and remains private.
- “نشر التعديلات” is the only content publish action and clears the local draft on success.
- Invalid origin/source/nonce and stale messages are ignored.
- Home, shop, saved-product, new-product, desktop, mobile, loading, retry, and cancelled-draft states are tested.
- Production builds, existing portal/website tests, Impeccable detector, and desktop/mobile screenshot review pass.

## Constraints

- Preserve the Noamany red/dark visual identity and current public renderers.
- Do not add a database migration or public draft endpoint.
- Do not duplicate CMS pages or change café/sales route ownership.
- The repository root is not a Git repository, so the design cannot be committed here; the document remains the auditable source of truth.
