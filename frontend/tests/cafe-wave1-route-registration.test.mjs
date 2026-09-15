import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routerUrl = new URL('../src/app/router.tsx', import.meta.url);
const lazyPagesUrl = new URL('../src/app/lazy-pages.ts', import.meta.url);

function registeredPaths(routerSource) {
  return [...routerSource.matchAll(/<Route\s+path="([^"]+)"/g)].map(([, path]) => `/${path}`);
}

test('registers the reconciled cafe operational leaves without replacing POS', async () => {
  const paths = registeredPaths(await readFile(routerUrl, 'utf8'));

  for (const path of [
    '/club/cafe/dashboard',
    '/club/cafe/waste',
    '/club/cafe/customers',
    '/club/cafe/stock-taking/:id',
  ]) {
    assert.ok(paths.includes(path), `expected reconciled cafe route ${path}`);
  }
  assert.ok(paths.includes('/sales/new'), 'expected the existing Noamany cafe POS route to remain');
});

test('lazy page registry exposes every reconciled cafe operational leaf', async () => {
  const source = await readFile(lazyPagesUrl, 'utf8');

  for (const exportName of [
    'CafeDashboardPage',
    'CafeWastePage',
    'CafeCustomersPage',
    'InventoryStockTakingWorkspacePage',
  ]) {
    assert.match(source, new RegExp(`export const ${exportName}\\b`));
  }
});
