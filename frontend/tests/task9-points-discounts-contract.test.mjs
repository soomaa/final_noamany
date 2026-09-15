import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('discount administration keeps point history and manual adjustment in its consolidated workspace', async () => {
  const page = await readFile(new URL('../src/pages/club/discounts.tsx', import.meta.url), 'utf8');
  assert.match(page, /point-history/);
  assert.match(page, /point-adjustments/);
  assert.match(page, /سجل النقاط/);
  assert.match(page, /تعديل نقاط/);
});
