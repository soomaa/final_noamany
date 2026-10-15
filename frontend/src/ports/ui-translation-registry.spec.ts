import assert from 'node:assert/strict';
import test from 'node:test';
import { registerUiTranslationMap, uiTranslationMap } from './ui-translation-registry';

test('reuses merged dictionaries across labels while preserving overlay precedence and late registration', () => {
  const base = { baseOnly: 'Base', shared: 'Base shared' };
  const initial = uiTranslationMap(base);
  registerUiTranslationMap({ shared: 'ONE80', overlayOnly: 'Overlay' });
  const merged = uiTranslationMap(base);
  assert.notEqual(merged, initial);
  assert.equal(merged.baseOnly, 'Base');
  assert.equal(merged.shared, 'ONE80');
  assert.equal(merged.overlayOnly, 'Overlay');
  for (let label = 0; label < 1000; label++) {
    assert.equal(uiTranslationMap(base), merged, 'rendering labels must not rebuild the entire dictionary');
  }
  const otherBase = { baseOnly: 'Other base' };
  assert.equal(uiTranslationMap(otherBase).baseOnly, 'Other base');
  registerUiTranslationMap({ shared: 'Late override' });
  assert.equal(uiTranslationMap(base).shared, 'Late override');
  assert.equal(uiTranslationMap(otherBase).shared, 'Late override');
  assert.equal(merged.shared, 'ONE80', 'previous snapshots remain unchanged');
  assert.deepEqual(base, { baseOnly: 'Base', shared: 'Base shared' });
});
