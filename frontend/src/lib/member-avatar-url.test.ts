import assert from 'node:assert/strict';
import test from 'node:test';
import { memberAvatarUrl } from './member-photo.ts';

test('legacy placeholder photos resolve to no photo', () => {
  // Legacy systems wrote a shared placeholder filename for members with no picture.
  // The file is not in the uploads tree, so returning a URL for it rendered a broken
  // image instead of the initials avatar.
  assert.equal(memberAvatarUrl('logo.png'), null);
  assert.equal(memberAvatarUrl(' logo.png '), null);
  assert.equal(memberAvatarUrl('user.png'), null);
  assert.equal(memberAvatarUrl('no-image.png'), null);
});

test('empty and legacy zero markers resolve to no photo', () => {
  assert.equal(memberAvatarUrl(null), null);
  assert.equal(memberAvatarUrl(undefined), null);
  assert.equal(memberAvatarUrl(''), null);
  assert.equal(memberAvatarUrl('   '), null);
  assert.equal(memberAvatarUrl('0'), null);
});

test('a real uploaded photo still resolves under /uploads', () => {
  assert.equal(
    memberAvatarUrl('dcd49ed9aa1fb6b8c960078599f8e21f.jpg'),
    '/uploads/dcd49ed9aa1fb6b8c960078599f8e21f.jpg',
  );
  // Already-prefixed and absolute paths are passed through untouched.
  assert.equal(memberAvatarUrl('uploads/club/abc.jpg'), '/uploads/club/abc.jpg');
  assert.equal(memberAvatarUrl('/uploads/abc.jpg'), '/uploads/abc.jpg');
  assert.equal(memberAvatarUrl('https://cdn.example/abc.jpg'), 'https://cdn.example/abc.jpg');
});

test('resolves opaque public upload references used by member profile photos', () => {
  assert.equal(
    memberAvatarUrl('public-file:9f350787-7246-4632-9e56-5f8393619ee8'),
    '/api/uploads/public/9f350787-7246-4632-9e56-5f8393619ee8',
  );
  assert.equal(
    memberAvatarUrl('/api/uploads/public/9f350787-7246-4632-9e56-5f8393619ee8'),
    '/api/uploads/public/9f350787-7246-4632-9e56-5f8393619ee8',
  );
});
