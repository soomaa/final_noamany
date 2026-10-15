import assert from 'node:assert/strict';
import test from 'node:test';

test('copies a PNG image using the clipboard image MIME supported by Chromium', async () => {
  const module = await import('./clipboard-image.ts').catch(() => ({
    writePngImageToClipboard: undefined,
  }));
  assert.equal(typeof module.writePngImageToClipboard, 'function');

  const written: Array<Record<string, Blob | PromiseLike<Blob>>> = [];
  class TestClipboardItem {
    readonly items: Record<string, Blob | PromiseLike<Blob>>;

    constructor(items: Record<string, Blob | PromiseLike<Blob>>) {
      this.items = items;
    }
  }
  const clipboard = {
    async write(items: TestClipboardItem[]) {
      written.push(items[0].items);
    },
  };
  const png = new Blob(['png-bytes'], { type: 'image/png' });

  await module.writePngImageToClipboard!(png, clipboard, TestClipboardItem);

  assert.equal(written.length, 1);
  assert.deepEqual(Object.keys(written[0]), ['image/png']);
  assert.equal(written[0]['image/png'], png);
});
