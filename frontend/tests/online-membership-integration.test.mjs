import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readBackend = (path) => readFile(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

test('registers online subscription and payment-method workspaces with familiar Arabic RBAC names', async () => {
  const [router, lazy, catalog, routes] = await Promise.all([
    readFrontend('../src/app/router.tsx'), readFrontend('../src/app/lazy-pages.ts'), readBackend('src/modules/rbac/catalog/rbac.catalog.ts'), readFrontend('../src/lib/club-routes.ts'),
  ]);
  assert.match(lazy, /export const OnlineSubscriptionsPage\b/);
  assert.match(lazy, /export const PaymentMethodsPage\b/);
  assert.match(router, /<Route path="club\/subscriptions\/online" element=\{<Lazy><OnlineSubscriptionsPage \/><\/Lazy>\} \/>/);
  assert.match(router, /<Route path="portal\/payment-methods" element=\{<Lazy><PaymentMethodsPage \/><\/Lazy>\} \/>/);
  assert.match(routes, /online: '\/club\/subscriptions\/online'/);
  assert.match(catalog, /page\('club\.subscriptions\.online', 'الاشتراكات الأونلاين', '\/club\/subscriptions\/online'/);
  assert.match(catalog, /page\('portal\.payment-methods', 'طرق الدفع الأونلاين', '\/portal\/payment-methods'/);
});

test('serves exact public membership routes before the management SPA fallback', async () => {
  const main = await readBackend('src/main.ts');
  assert.match(main, /requestPath\.match\(\/\^\\\/memberships\\\/\\d\+\$\//);
  assert.match(main, /membership-checkout\.html/);
});

test('the admin queue retrieves protected proofs through the authenticated API client', async () => {
  const page = await readFrontend('../src/pages/club/online-subscriptions.tsx');
  assert.match(page, /api\.get\([^\n]*proofUrl[^\n]*responseType:\s*'blob'/);
  assert.doesNotMatch(page, /href=\{selected\.proofUrl\}/);
});

test('retires duplicate CMS membership prices and routes editors to canonical club packages', async () => {
  const [router, nav, routes, editor, service] = await Promise.all([
    readFrontend('../src/app/router.tsx'), readFrontend('../src/lib/nav.ts'), readFrontend('../src/lib/portal-routes.ts'),
    readFrontend('../src/pages/portal-management/index.tsx'), readBackend('src/modules/portal-management/portal-management.service.ts'),
  ]);
  assert.match(router, /path="portal\/membership-plans"[\s\S]*?Navigate to="\/club\/packages\/settings"/);
  assert.doesNotMatch(nav, /membershipPlans/);
  assert.doesNotMatch(routes, /membershipPlans/);
  assert.doesNotMatch(editor, /'membership-plans':\{/);
  assert.doesNotMatch(service.match(/const TYPES =[\s\S]*?\];/)?.[0] ?? '', /membership-plans/);
});
