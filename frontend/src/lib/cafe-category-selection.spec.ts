import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cafeProductMatchesCategory,
  filterCafeCategories,
  summarizeCafeCategories,
  toggleCafeCategory,
} from './cafe-category-selection';

const options = [
  { value: '2', label: 'قهوة ساخنة' },
  { value: '5', label: 'Tea' },
  { value: '9', label: 'Cloud موهيتو' },
];

test('toggles category ids without duplicates and preserves order', () => {
  assert.deepEqual(toggleCafeCategory(['2'], '5', true), ['2', '5']);
  assert.deepEqual(toggleCafeCategory(['2', '5'], '2', false), ['5']);
  assert.deepEqual(toggleCafeCategory(['2', '5'], '5', true), ['2', '5']);
});

test('searches category labels in Arabic and English', () => {
  assert.deepEqual(filterCafeCategories(options, 'موهيتو').map((row) => row.value), ['9']);
  assert.deepEqual(filterCafeCategories(options, 'tea').map((row) => row.value), ['5']);
});

test('summarizes selected categories compactly', () => {
  assert.equal(summarizeCafeCategories(options, [], 'بدون فئة'), 'بدون فئة');
  assert.equal(summarizeCafeCategories(options, ['2'], 'بدون فئة'), 'قهوة ساخنة');
  assert.equal(summarizeCafeCategories(options, ['2', '5'], 'بدون فئة'), 'قهوة ساخنة، Tea');
  assert.equal(summarizeCafeCategories(options, ['2', '5', '9'], 'بدون فئة'), '3 فئات');
});

test('matches every assigned category and supports legacy products', () => {
  assert.equal(cafeProductMatchesCategory({ categoryIds: [2, 5], categoryId: 3 }, 2), true);
  assert.equal(cafeProductMatchesCategory({ categoryIds: [2, 5], categoryId: 3 }, 5), true);
  assert.equal(cafeProductMatchesCategory({ categoryIds: [2, 5], categoryId: 3 }, 7), false);
  assert.equal(cafeProductMatchesCategory({ categoryId: 3 }, 3), true);
});
