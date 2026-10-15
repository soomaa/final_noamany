import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./package-settings.tsx', import.meta.url), 'utf8');

test('the page-level create action follows the active catalog tab', () => {
  assert.match(source, /tab === 'packages'[\s\S]*إضافة اشتراك أو حصة/);
  assert.match(source, /tab === 'private'[\s\S]*إضافة اشتراك برايفت/);
  assert.match(source, /tab === 'classes'[\s\S]*إضافة حصة مجدولة/);
  assert.match(source, /tab === 'categories'[\s\S]*إضافة فئة/);
  assert.match(source, /actions=\{headerAction\}/);
});

test('categories are the final tab after trainer reports', () => {
  assert.match(
    source,
    /value="reports"[\s\S]*تقارير المدربين[\s\S]*value="categories"[\s\S]*الفئات/,
  );
  assert.match(
    source,
    /const CATALOG_TABS: CatalogTab\[\] = \['packages', 'private', 'classes', 'scheduling', 'reports', 'categories'\]/,
  );
});

test('catalog section headers no longer render duplicate create actions', () => {
  const catalogBody = source.slice(source.indexOf('<TabsContent value="packages"'), source.indexOf('<TabsContent value="scheduling"'));
  assert.doesNotMatch(catalogBody, /action=\{/);
});
