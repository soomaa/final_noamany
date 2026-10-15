import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenCompletedInvoiceEditor } from './invoice-editor-access.ts';

const editorKeys = new Set(['gym-sales.sales.drafts:view', 'gym-sales.sales.drafts:update']);
const canEditInvoices = (key: string) => editorKeys.has(key);

test('invoice view and update grants let an editor open an existing invoice in POS', () => {
  assert.equal(canOpenCompletedInvoiceEditor('/sales/new', '?editId=42', canEditInvoices), true);
});

test('invoice edit access does not grant access to a fresh sale or a draft', () => {
  for (const search of ['', '?draftId=42', '?editId=42&draftId=3']) {
    assert.equal(canOpenCompletedInvoiceEditor('/sales/new', search, canEditInvoices), false);
  }
  assert.equal(canOpenCompletedInvoiceEditor('/sales/other', '?editId=42', canEditInvoices), false);
});

test('view-only and update-only grants cannot bypass the page guard', () => {
  for (const permission of ['gym-sales.sales.drafts:view', 'gym-sales.sales.drafts:update']) {
    assert.equal(canOpenCompletedInvoiceEditor('/sales/new', '?editId=42', (key) => key === permission), false);
  }
});

test('invalid or ambiguous invoice ids cannot turn the POS route into edit access', () => {
  for (const search of ['?editId=', '?editId=0', '?editId=-1', '?editId=1.5', '?editId=NaN', '?editId=Infinity', '?editId=1&editId=2', '?editId=9007199254740992']) {
    assert.equal(canOpenCompletedInvoiceEditor('/sales/new', search, canEditInvoices), false);
  }
});
