import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('variant recipes open in a centered nested dialog instead of expanding the card', async () => {
  const source = await readFile(new URL('./product-variants-editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /<Dialog open=\{recipeDialogIndex != null\}/);
  assert.match(source, /className="justify-self-center/);
  assert.match(source, /<DialogTitle>\{ui\('تعديل وصفة الحجم'\)\}/);
  assert.doesNotMatch(source, /ChevronDown/);
  assert.doesNotMatch(source, /\{isOpen \? \(\s*<div className="border-t/);
});
