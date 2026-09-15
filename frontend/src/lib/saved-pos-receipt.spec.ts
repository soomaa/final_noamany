import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptDiscountRows, savedPosReceipt } from './saved-pos-receipt.ts';
import { employeeCartBenefits } from './employee-benefits.ts';

test('reprinting retains historical amounts and identifies free drinks without creating a sale', () => {
  const sale = { saleNumber: 'OLD-12', dailyNumber: 12, saleDate: '2026-08-01', paymentMethod: 'cash', subtotal: 150, discountAmount: 70, taxAmount: 8, totalAmount: 88,
    items: [{ name: 'لاتيه', variantName: 'Large', quantity: 3, freeQuantity: 1, unitPrice: 50, lineTotal: 150 }] };
  const receipt = savedPosReceipt(sale as any, { totalAmount: 999, businessName: 'NOAMANY · CAFE' });
  assert.equal(receipt.totalAmount, 88);
  assert.equal(receipt.saleDate, '2026-08-01');
  assert.equal(receipt.items[0].freeQuantity, 1);
  assert.equal(receipt.items[0].variantName, 'Large');
  assert.equal(sale.items[0].unitPrice, 50);
});
test('a free employee receipt identifies its owner and separates free drinks from additional discounts', () => {
  const sale = { saleType: 'employee', customerName: 'كريم', employeeName: 'كريم', employeeId: 7,
    subtotal: 75, discountAmount: 75, taxAmount: 0, totalAmount: 0,
    items: [{ name: 'كورتادو', quantity: 1, freeQuantity: 1, unitPrice: 75, lineTotal: 75 }] };
  const receipt = savedPosReceipt(sale as any);
  assert.equal(receipt.saleType, 'employee');
  assert.equal(receipt.employeeName, 'كريم');
  assert.equal(receipt.employeeFreeAmount, 75);
  assert.equal(receipt.items[0].freeQuantity, 1);
  assert.equal(receipt.totalAmount, 0);
  const mixed = savedPosReceipt({ ...sale, subtotal: 150, discountAmount: 90, totalAmount: 60,
    items: [{ ...sale.items[0], quantity: 2, lineTotal: 150 }] } as any);
  assert.equal(mixed.employeeFreeAmount, 75);
  assert.equal(mixed.discountAmount - mixed.employeeFreeAmount!, 15);
  assert.equal(mixed.totalAmount, 60);
  assert.deepEqual(receiptDiscountRows(mixed), [
    { label: 'مشروبات الموظف المجانية (خصم ١٠٠٪)', amount: 75 }, { label: 'خصم إضافي', amount: 15 },
  ]);
});
test('cart previews the same whole-drink allocation and never frees food', () => {
  const benefits = { date: '2026-09-07', enabled: true, limit: 1, used: 0, remaining: 1, eligibleProductIds: [7], discountEnabled: true };
  const cart = [{ cafeProductId: 6, quantity: 1, unitPrice: 90 }, { cafeProductId: 7, quantity: 3, unitPrice: 50 }];
  assert.deepEqual(employeeCartBenefits(cart, benefits), { quantities: [0, 1], count: 1, amount: 50 });
  assert.equal(employeeCartBenefits(cart, { ...benefits, remaining: 0 }).amount, 0);
});
