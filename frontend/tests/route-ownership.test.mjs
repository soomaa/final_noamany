import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routerUrl = new URL('../src/app/router.tsx', import.meta.url);
const mainUrl = new URL('../src/main.tsx', import.meta.url);
const currentPosPaths = [
  '/sales',
  '/sales/new',
  '/sales/drafts',
  '/sales/shifts',
  '/sales/treasury',
  '/sales/settlements',
  '/sales/pos-admin',
];

function registeredPaths(routerSource) {
  return [...routerSource.matchAll(/<Route\s+path="([^"]+)"/g)].map(([, path]) => `/${path}`);
}

test('keeps every existing cafe POS route registered', async () => {
  const paths = registeredPaths(await readFile(routerUrl, 'utf8'));

  for (const path of currentPosPaths) {
    assert.ok(paths.includes(path), `expected existing cafe POS route ${path} to remain registered`);
  }
});

test('registers the personal sales workspace outside the cafe POS namespace', async () => {
  const paths = registeredPaths(await readFile(routerUrl, 'utf8'));

  assert.ok(
    paths.includes('/sales-portal'),
    'expected the future personal salesperson workspace to register /sales-portal separately from the cafe POS',
  );
});

test('mounts the persistent scanner exactly around the protected app shell', async () => {
  const [routerSource, mainSource] = await Promise.all([
    readFile(routerUrl, 'utf8'),
    readFile(mainUrl, 'utf8'),
  ]);

  assert.match(
    routerSource,
    /<ProtectedRoute>\s*<PersistentScannerProvider>\s*<AppShell\s*\/>\s*<\/PersistentScannerProvider>\s*<\/ProtectedRoute>/,
  );
  assert.doesNotMatch(mainSource, /PersistentScannerProvider/);
});
