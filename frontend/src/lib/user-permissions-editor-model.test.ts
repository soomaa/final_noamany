import assert from 'node:assert/strict';
import test from 'node:test';
import { togglePermissionSet } from './user-permissions-editor-model.ts';

test('permission toggles stay local and immutable until the explicit atomic save', () => {
  const saved = new Set(['10', '20']);
  const enabled = togglePermissionSet(saved, '30', true);
  const disabled = togglePermissionSet(enabled, '10', false);

  assert.deepEqual([...saved], ['10', '20']);
  assert.deepEqual([...enabled], ['10', '20', '30']);
  assert.deepEqual([...disabled], ['20', '30']);
});
