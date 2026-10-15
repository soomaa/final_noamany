import assert from 'node:assert/strict';
import test from 'node:test';
import type { CafeBundleDetail } from '../types/cafe';
import { cafeInvoiceCategoryIds, cafeInvoiceLineMatchesCategory, cafeBundleForInvoiceCategory, cafeBundleInvoiceCategoryIds } from './cafe-invoice-classification.ts';

const bundle: CafeBundleDetail = {
  id: 1, bundleCode: 'B1', name: 'عرض', description: null, imageUrl: null,
  pricingMode: 'fixed', fixedPrice: 50, discountPercentage: 0, isActive: true,
  groups: [{ id: 10, name: 'المشروب', minSelect: 1, maxSelect: 1, sortOrder: 0, options: [
    { id: 1, cafeProductId: 7, productName: 'لاتيه', productCode: null, cafeVariantId: null, variantName: null,
      categoryId: 1, categoryIds: [3], sellPrice: 40, priceDelta: 0, sortOrder: 0, isActive: true },
    { id: 2, cafeProductId: 8, productName: 'مياه', productCode: null, cafeVariantId: 4, variantName: 'كبير',
      categoryId: 2, categoryIds: [2], sellPrice: 10, priceDelta: 0, sortOrder: 1, isActive: true },
  ] }],
};

test('requires an explicit valid category and accepts both primary and secondary assignments', () => {
  const product = { categoryId: 1, categoryIds: [3, 3] };
  assert.deepEqual(cafeInvoiceCategoryIds(product), [3, 1]);
  assert.equal(cafeInvoiceLineMatchesCategory(product, '3'), true);
  assert.equal(cafeInvoiceLineMatchesCategory(product, '1'), true);
  for (const category of ['', 'all', '0', '1.5', '2']) assert.equal(cafeInvoiceLineMatchesCategory(product, category), false);
  assert.equal(cafeInvoiceLineMatchesCategory({ categoryId: null }, '1'), false);
});

test('bundle picker removes incompatible choices and blocks combos that cannot satisfy a required group', () => {
  assert.deepEqual(cafeBundleForInvoiceCategory(bundle, '3')?.groups[0].options.map(option => option.cafeProductId), [7]);
  assert.equal(cafeBundleForInvoiceCategory(bundle, '5'), null);
  assert.equal(bundle.groups[0].options.length, 2);
  assert.equal(cafeBundleForInvoiceCategory({ ...bundle, groups: [{ ...bundle.groups[0], minSelect: 2 }] }, '3'), null);
});

test('saved bundle choices retain their common categories; mixed and stale choices are invalid', () => {
  assert.deepEqual(cafeBundleInvoiceCategoryIds(bundle, [{ groupId: 10, cafeProductId: 7 }]), [3, 1]);
  assert.deepEqual(cafeBundleInvoiceCategoryIds(bundle, [{ groupId: 10, cafeProductId: 7 }, { groupId: 10, cafeProductId: 8, cafeVariantId: 4 }]), []);
  assert.deepEqual(cafeBundleInvoiceCategoryIds(bundle, [{ groupId: 10, cafeProductId: 8, cafeVariantId: 99 }]), []);
  assert.deepEqual(cafeBundleInvoiceCategoryIds(bundle, []), []);
});
