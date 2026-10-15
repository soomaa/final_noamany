import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, Code128Reader, RGBLuminanceSource } from '@zxing/library';
import { BarcodeLabel, BarcodePreview, barcodeLabelPng, labelPrintHtml } from './barcode-label';

/** Rasterize the horizontal module runs emitted by qrcode.react for an independent decoder. */
function decodeQr(markup: string): string {
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(markup);
  assert.ok(viewBox, 'A QR SVG must be present');
  assert.equal(viewBox[1], viewBox[2], 'The QR must be square');
  const modules = Number(viewBox[1]);
  const scale = 8;
  const size = modules * scale;
  const pixels = new Uint8ClampedArray(size * size).fill(255);
  const blackPath = /<path fill="#000000" d="([^"]+)"/.exec(markup)?.[1];
  assert.ok(blackPath, 'QR foreground modules must be present');
  for (const run of blackPath.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) {
    const [, x, y, width] = run.map(Number);
    assert.ok(x >= 4 && y >= 4 && x + width <= modules - 4 && y < modules - 4, 'Four-module quiet zone');
    for (let row = y * scale; row < (y + 1) * scale; row++) {
      pixels.fill(0, row * size + x * scale, row * size + (x + width) * scale);
    }
  }
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, size, size)))).getText();
}

for (const Component of [BarcodePreview, BarcodeLabel]) {
  test(`${Component.name} encodes the gate credential and keeps the separate member code visible`, () => {
    const props = {
      code: 'A000019', scannerCode: '1234567', name: 'عضو اختبار', unavailableLabel: 'QR unavailable',
    };
    const markup = renderToStaticMarkup(Component === BarcodePreview
      ? createElement(BarcodePreview, props) : createElement(BarcodeLabel, props));
    assert.equal(decodeQr(markup), '1234567');
    assert.match(markup, /A000019/);
  });
}

test('printed labels encode the exact gate credential and escape member details', () => {
  const html = labelPrintHtml({ code: 'A000019', scannerCode: '16777215', name: '<script>Member</script>', branch: 'One & Two' });
  assert.equal(decodeQr(html), '16777215');
  assert.match(html, /A000019/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /One &amp; Two/);
});

for (const scannerCode of [null, '', 'A000019', '0123456', '0', '16777216', ' 1234567 ', '١٢٣٤٥٦٧']) {
  test(`does not issue a gate QR for unsupported scanner code ${JSON.stringify(scannerCode)}`, async () => {
    const data = { code: 'A000019', scannerCode, name: 'Test', unavailableLabel: 'QR unavailable' };
    assert.doesNotMatch(renderToStaticMarkup(createElement(BarcodePreview, data)), /<svg/);
    assert.throws(() => labelPrintHtml(data), /credential/i);
    await assert.rejects(barcodeLabelPng(data), /credential/i);
  });
}


test('legacy barcode labels remain Code128 member codes rather than gate QR', () => {
  const data = { code: 'A000019', scannerCode: '1234567', name: 'Member', format: 'barcode' as const };
  const html = labelPrintHtml(data);
  const dimensions = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(html);
  assert.ok(dimensions);
  const width = Math.ceil(Number(dimensions[1]));
  const height = Math.ceil(Number(dimensions[2]));
  const pixels = new Uint8ClampedArray(width * height).fill(255);
  for (const rect of html.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*fill="#000"/g)) {
    const [, x, y, w, h] = rect.map(Number);
    for (let row = Math.ceil(y); row < y + h; row++) {
      pixels.fill(0, row * width + Math.ceil(x), row * width + Math.ceil(x + w));
    }
  }
  const value = new Code128Reader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)))).getText();
  assert.equal(value, 'A000019');
});
