import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentClient, swipeDirection } from './client-navigation.ts';

test('moves both ways across page boundaries and stops at the ends', () => {
  assert.deepEqual(adjacentClient([1, 2], 2, 1, 1, 2, 1), { page: 2, index: 0 });
  assert.deepEqual(adjacentClient([3, 4], 3, 0, 2, 2, -1), { page: 1, index: -1 });
  assert.equal(adjacentClient([1, 2], 1, 0, 1, 2, -1), null);
  assert.equal(adjacentClient([3, 4], 4, 1, 2, 2, 1), null);
});

test('keeps navigation stable when the selected lead disappears after saving', () => {
  assert.deepEqual(adjacentClient([1, 3], 2, 1, 1, 1, 1), { page: 1, index: 1 });
  assert.deepEqual(adjacentClient([1, 3], 2, 1, 1, 1, -1), { page: 1, index: 0 });
});

test('requires horizontal intent and mirrors swipe direction in RTL', () => {
  assert.equal(swipeDirection(80, 8, 'rtl'), 1);
  assert.equal(swipeDirection(-80, 8, 'rtl'), -1);
  assert.equal(swipeDirection(-80, 8, 'ltr'), 1);
  assert.equal(swipeDirection(90, 130, 'rtl'), null);
});
