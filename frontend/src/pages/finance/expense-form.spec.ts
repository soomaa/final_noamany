import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpensePayload } from './expense-form.ts';

test('drawer deduction is sent only for a new cash-paid expense', () => {
  const payload = buildExpensePayload({
    expenseDate: '2026-09-07',
    category: 'مرافق',
    subCategory: '',
    amount: '90',
    paymentMethod: 'نقدي',
    paymentStatus: 'مدفوع',
    description: 'فاتورة مياه',
    vendor: '',
    invoiceNumber: '',
    receiptNumber: '',
    taxAmount: '10',
    notes: '',
    branchId: '1',
    deductFromDrawer: true,
  }, true);

  assert.equal(payload.deductFromDrawer, true);
  assert.equal(payload.amount, 90);
  assert.equal(payload.taxAmount, 10);
});

test('editing an expense cannot request a second drawer deduction', () => {
  const payload = buildExpensePayload({
    expenseDate: '2026-09-07',
    category: 'مرافق',
    subCategory: '',
    amount: '90',
    paymentMethod: 'نقدي',
    paymentStatus: 'مدفوع',
    description: '',
    vendor: '',
    invoiceNumber: '',
    receiptNumber: '',
    taxAmount: '',
    notes: '',
    branchId: '1',
    deductFromDrawer: true,
  }, false);

  assert.equal(payload.deductFromDrawer, false);
});
