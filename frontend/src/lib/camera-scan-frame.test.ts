import assert from 'node:assert/strict';
import test from 'node:test';
import { detectBarcodeFrame, releaseLateCameraStream } from './camera-scan-frame.ts';

test('returns the first trimmed barcode from a detector frame', async () => {
  const result = await detectBarcodeFrame(
    { detect: async () => [{ rawValue: '  CARD-42  ' }] },
    {} as ImageBitmapSource,
  );

  assert.deepEqual(result, { code: 'CARD-42', error: null });
});

test('converts an asynchronous detector rejection into recoverable state', async () => {
  const failure = new Error('camera frame failed');
  const result = await detectBarcodeFrame(
    { detect: async () => { throw failure; } },
    {} as ImageBitmapSource,
  );

  assert.equal(result.code, null);
  assert.equal(result.error, failure);
});

test('stops every track when camera permission resolves after the panel closed', () => {
  const first = { stop: () => undefined };
  const second = { stop: () => undefined };
  let stopped = 0;
  const stream = {
    getTracks: () => [first, second].map((track) => ({
      ...track,
      stop: () => { stopped += 1; },
    })),
  };

  assert.equal(releaseLateCameraStream(stream, true), true);
  assert.equal(stopped, 2);
  assert.equal(releaseLateCameraStream(stream, false), false);
  assert.equal(stopped, 2);
});
