import assert from 'node:assert/strict';
import test from 'node:test';
import { canPrintViewedInvoice, isInvoicePrintBlocked } from './invoice-print-access.ts';

test('a user who can view today invoices can print the opened invoice', () => {
  const permissions = new Set(['gym-sales.sales.drafts:view']);
  assert.equal(canPrintViewedInvoice((key) => permissions.has(key)), true);
});

test('a user without invoice access cannot print an invoice', () => {
  assert.equal(canPrintViewedInvoice(() => false), false);
});

test('manual invoice printing stays available while remote print preferences are loading or unavailable', () => {
  assert.equal(isInvoicePrintBlocked({
    printing: false,
    settingsReady: false,
    templatesReady: false,
  }), false);
  assert.equal(isInvoicePrintBlocked({
    printing: true,
    settingsReady: true,
    templatesReady: true,
  }), true);
});
