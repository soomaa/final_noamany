import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePhysicalBaseQuantity,
  compatibleStockUnits,
  convertStockQuantity,
} from './stock-taking-units.ts';

test('converts compatible weight and volume units to the configured base unit', () => {
  assert.equal(convertStockQuantity(1.5, 'kg', 'g'), 1500);
  assert.equal(convertStockQuantity(2.25, 'L', 'ml'), 2250);
  assert.equal(convertStockQuantity(750, 'ml', 'L'), 0.75);
});

test('offers only units that belong to the product measurement family', () => {
  assert.deepEqual(compatibleStockUnits('g'), ['g', 'kg', 'oz']);
  assert.deepEqual(compatibleStockUnits('L'), ['ml', 'L', 'fl_oz']);
  assert.deepEqual(compatibleStockUnits('piece'), ['piece']);
});

test('calculates package counts in the base unit', () => {
  assert.equal(calculatePhysicalBaseQuantity({
    baseUnit: 'ml',
    mode: 'package',
    quantity: 3,
    packageBaseQuantity: 1000,
  }), 3000);
});

test('adds a loose remainder to packaged stock', () => {
  assert.equal(calculatePhysicalBaseQuantity({
    baseUnit: 'ml',
    mode: 'package',
    quantity: 2,
    packageBaseQuantity: 1000,
    remainderQuantity: 250,
    remainderUnit: 'ml',
  }), 2250);
});

test('returns null for incompatible or invalid measurements', () => {
  assert.equal(convertStockQuantity(1, 'kg', 'ml'), null);
  assert.equal(calculatePhysicalBaseQuantity({
    baseUnit: 'g',
    mode: 'unit',
    quantity: -1,
    unit: 'g',
  }), null);
  assert.equal(calculatePhysicalBaseQuantity({
    baseUnit: 'piece',
    mode: 'package',
    quantity: 2,
  }), null);
});
