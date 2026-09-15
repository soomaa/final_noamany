import assert from 'node:assert/strict';
import test from 'node:test';

import { applyProductImageFallback, DEFAULT_PRODUCT_IMAGE } from './product-image-fallback.ts';
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
  assert.equal(validateProductImageInput('//images.example.com/coffee.jpg').error, 'invalid');
  assert.equal(validateProductImageInput('/etc/passwd').error, 'invalid');
  assert.equal(validateProductImageInput('uploads//coffee.jpg').error, 'invalid');
  assert.equal(validateProductImageInput('https://user:secret@images.example.com/coffee.jpg').error, 'invalid');
  assert.equal(validateProductImageInput('javascript:alert(1)').error, 'invalid');
});

test('allows clearing a product image link', () => {
  assert.deepEqual(validateProductImageInput('   '), { value: '', error: null });
});

test('replaces a broken product image once with the safe placeholder', () => {
  const image = { src: 'https://images.example.com/missing.jpg', onerror: () => undefined };
  applyProductImageFallback(image);
  assert.equal(image.src, DEFAULT_PRODUCT_IMAGE);
  assert.equal(image.onerror, null);
});
