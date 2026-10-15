import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleAllCategoryIds } from './employee-benefit-category-selection.ts';

test('select all replaces a partial selection with every available category', () => {
  assert.deepEqual(toggleAllCategoryIds([11, 12, 13], [12]), [11, 12, 13]);
});

test('select all clears the selection when every available category is already selected', () => {
  assert.deepEqual(toggleAllCategoryIds([11, 12, 13], [13, 11, 12]), []);
});

test('select all stays empty when there are no available categories', () => {
  assert.deepEqual(toggleAllCategoryIds([], [99]), []);
});
