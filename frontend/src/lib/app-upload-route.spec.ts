import assert from 'node:assert/strict';
import test from 'node:test';
import { appUploadRoute } from './app-upload-route';

test('uses the owning upload category and defaults to app media', () => {
  assert.equal(appUploadRoute('trainers'), '/uploads/trainers');
  assert.equal(appUploadRoute(), '/uploads/app');
});
