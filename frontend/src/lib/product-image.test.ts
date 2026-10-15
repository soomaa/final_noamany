import assert from 'node:assert/strict';
import test from 'node:test';

import { validateProductImageInput } from './product-image-input.ts';

test('accepts secure remote product image links and stored upload paths', () => {
  assert.deepEqual(validateProductImageInput(' https://images.example.com/coffee.jpg '), {
    value: 'https://images.example.com/coffee.jpg',
    error: null,
  });
  assert.deepEqual(validateProductImageInput('/uploads/product-image/coffee.webp'), {
    value: '/uploads/product-image/coffee.webp',
    error: null,
  });
  assert.deepEqual(validateProductImageInput('gym-sales/products/prod-coffee.webp'), {
    value: 'gym-sales/products/prod-coffee.webp',
    error: null,
  });
});

test('rejects unsafe or malformed product image links', () => {
  assert.equal(validateProductImageInput('http://images.example.com/coffee.jpg').error, 'invalid');
  assert.equal(validateProductImageInput('coffee.jpg').error, 'invalid');
  assert.equal(validateProductImageInput('javascript:alert(1)').error, 'invalid');
});

test('allows clearing a product image link', () => {
  assert.deepEqual(validateProductImageInput('   '), { value: '', error: null });
});

// ONE80 stores uploaded product pictures as opaque public file references.
test('allows keeping an existing secure uploaded image when saving a product', () => {
  assert.deepEqual(validateProductImageInput('public-file:123e4567-e89b-42d3-a456-426614174000'), {
    value: 'public-file:123e4567-e89b-42d3-a456-426614174000', error: null,
  });
  assert.equal(validateProductImageInput('public-file:../../secret').error, 'invalid');
});
