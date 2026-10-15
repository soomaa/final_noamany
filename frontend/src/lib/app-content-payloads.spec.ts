import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdPayload,
  buildExerciseCategoryPayload,
  buildExercisePayload,
  buildNewsPayload,
} from './app-content-payloads';

test('normalizes exercise category and exercise API payloads', () => {
  assert.deepEqual(buildExerciseCategoryPayload({ name: '  Cardio  ', description: ' ', isActive: 1 }), {
    name: 'Cardio',
    description: undefined,
    isActive: true,
  });
  assert.deepEqual(buildExercisePayload({
    name: ' Run ', categoryId: '4', description: '', instructions: ' Fast ', duration: '30',
    difficulty: 'medium', isActive: true, imageUrl: '/uploads/run.png',
  }), {
    name: 'Run', categoryId: 4, description: undefined, instructions: 'Fast', duration: 30,
    difficulty: 'medium', isActive: true, imageUrl: '/uploads/run.png',
  });
});

test('normalizes news and ad API payloads without inventing optional values', () => {
  assert.deepEqual(buildNewsPayload({ title: ' Update ', content: ' Body ', publishDate: '', isPublished: true, imageUrl: '' }), {
    title: 'Update', content: 'Body', publishDate: undefined, isPublished: true, imageUrl: undefined,
  });
  assert.deepEqual(buildAdPayload({ title: ' Offer ', description: '', linkUrl: ' https://one80.test ', startDate: '', endDate: '', isActive: false, imageUrl: '' }), {
    title: 'Offer', description: undefined, linkUrl: 'https://one80.test', startDate: undefined,
    endDate: undefined, isActive: false, imageUrl: undefined,
  });
});

test('rejects an exercise without a category', () => {
  assert.throws(() => buildExercisePayload({ name: 'Run', categoryId: '' }), /category/i);
});
