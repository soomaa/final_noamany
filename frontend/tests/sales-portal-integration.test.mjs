import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('registers the personal sales portal without changing cafe POS routes', async () => {
  const [router, lazyPages] = await Promise.all([
    read('../src/app/router.tsx'),
    read('../src/app/lazy-pages.ts'),
  ]);

  assert.match(lazyPages, /export const SalesPortalPage\b/);
  assert.match(router, /<Route path="sales-portal" element=\{<Lazy><SalesPortalPage \/><\/Lazy>\} \/>/);
  assert.match(router, /<Route path="sales\/new"/);
});

test('mounts one persistent scanner provider and exposes its topbar toggle', async () => {
  const [main, router, topbar] = await Promise.all([
    read('../src/main.tsx'),
    read('../src/app/router.tsx'),
    read('../src/components/layout/topbar.tsx'),
  ]);

  assert.equal(
    (main.match(/<PersistentScannerProvider>/g) ?? []).length
      + (router.match(/<PersistentScannerProvider>/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(main, /PersistentScannerProvider/);
  assert.match(topbar, /usePersistentScanner\(\)/);
  assert.match(topbar, /scanner\.open \? 'إغلاق السكانر المستمر' : 'فتح السكانر المستمر'/);
});

test('keeps renewal dates and the complete contact history visible in the client file', async () => {
  const portal = await read('../src/pages/sales-portal/index.tsx');

  assert.match(portal, /تاريخ البدء/);
  assert.match(portal, /تاريخ الانتهاء/);
  assert.match(portal, /سجل نشاط العميل/);
  assert.match(portal, /currentLead\.followUps/);
});
