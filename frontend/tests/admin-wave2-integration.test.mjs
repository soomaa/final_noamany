import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readBackend = (path) => readFile(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

test('registers the consolidated target, customer-service, evaluation and locker workspaces', async () => {
  const [router, lazyPages] = await Promise.all([
    readFrontend('../src/app/router.tsx'),
    readFrontend('../src/app/lazy-pages.ts'),
  ]);

  for (const exportName of [
    'ClubTargetsPage',
    'CustomerServicePage',
    'EvaluationWorkspacePage',
    'LockerInventoryPage',
  ]) {
    assert.match(lazyPages, new RegExp(`export const ${exportName}\\b`));
  }

  for (const route of [
    ['club/targets', 'ClubTargetsPage'],
    ['club/customer-service', 'CustomerServicePage'],
    ['hr/evaluations', 'EvaluationWorkspacePage'],
    ['club/lockers', 'LockerInventoryPage'],
  ]) {
    assert.match(
      router,
      new RegExp(`<Route path="${route[0]}" element=\\{<Lazy><${route[1]} \\/><\\/Lazy>\\} \\/>`),
    );
  }

  assert.equal((router.match(/path="hr\/evaluations"/g) ?? []).length, 1);
  assert.equal((router.match(/path="club\/lockers"/g) ?? []).length, 1);
});

test('registers backend target and customer-service modules once', async () => {
  const appModule = await readBackend('src/app.module.ts');

  for (const moduleName of ['TargetsModule', 'CustomerServiceModule']) {
    assert.match(appModule, new RegExp(`import \\{ ${moduleName} \\}`));
    assert.equal((appModule.match(new RegExp(`\\b${moduleName},`, 'g')) ?? []).length, 1);
  }
});

test('publishes familiar Arabic RBAC entries without reviving obsolete pages', async () => {
  const catalog = await readBackend('src/modules/rbac/catalog/rbac.catalog.ts');

  assert.match(catalog, /page\('club\.targets', 'تقرير التارجت', '\/club\/targets'/);
  assert.match(catalog, /page\('club\.customer_service', 'خدمة العملاء', '\/club\/customer-service'/);
  assert.match(catalog, /page\('club\.lockers\.inventory', 'جرد اللوكر', '\/club\/lockers\?tab=inventory'/);
  assert.match(catalog, /page\('affairs\.evaluations', 'التقييمات', '\/hr\/evaluations'/);
  assert.match(catalog, /page\('club\.subscriptions\.discounts', 'إدارة النقاط وأكواد الخصم', '\/club\/subscriptions\/discounts'/);
});
