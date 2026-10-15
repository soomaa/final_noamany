import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberAvatarUrl } from './member-photo';

test('reception resolves app uploads and legacy staff image references identically', () => {
  assert.equal(memberAvatarUrl('public-file:photo'), '/api/uploads/public/photo');
  assert.equal(memberAvatarUrl('file:photo'), '/api/uploads/public/photo');
  assert.equal(memberAvatarUrl('logo.png'), null);
  assert.equal(memberAvatarUrl('/uploads/user.png'), null);
  assert.equal(memberAvatarUrl('/api/uploads/files/photo'), '/api/uploads/public/photo');
  assert.equal(memberAvatarUrl('/uploads/member.jpg'), '/uploads/member.jpg');
});
