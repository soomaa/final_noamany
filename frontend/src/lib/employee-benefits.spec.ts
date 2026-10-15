import assert from 'node:assert/strict';
import test from 'node:test';
import { employeeCartBenefits, type EmployeeBenefits } from './employee-benefits.ts';

const benefits: EmployeeBenefits = {
  date: '2026-09-07', enabled: true, limit: 3, used: 1, remaining: 2,
  eligibleProductIds: [10, 11], discountEnabled: false,
};

test('daily drinks follow cart order and apply independently of employee percentage discount', () => {
  const result = employeeCartBenefits([
    { cafeProductId: 99, quantity: 1, unitPrice: 90 },
    { cafeProductId: 10, quantity: 1, unitPrice: 25.5 },
    { cafeProductId: 11, quantity: 3, unitPrice: 30 },
  ], benefits);
  assert.deepEqual(result, { quantities: [0, 1, 1], count: 2, amount: 55.5 });
});

test('no free drinks are applied when benefits are unavailable or disabled', () => {
  const cart = [{ cafeProductId: 10, quantity: 2, unitPrice: 25.5 }];
  assert.deepEqual(employeeCartBenefits(cart), { quantities: [0], count: 0, amount: 0 });
  assert.deepEqual(employeeCartBenefits(cart, { ...benefits, enabled: false }), { quantities: [0], count: 0, amount: 0 });
});

test('fractional quantities do not consume a whole free drink', () => {
  assert.deepEqual(employeeCartBenefits([{ cafeProductId: 10, quantity: 0.5, unitPrice: 25.5 }], benefits), { quantities: [0], count: 0, amount: 0 });
});
