import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

test('employee receipt HTML shows the owner and exact free-drink discount on both paper sizes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'employee-receipt-'));
  try {
    const bundled = await build({ entryPoints: [resolve('src/components/sales/pos-printing.tsx')],
      bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', alias: { '@': resolve('src') } });
    const file = join(dir, 'printing.cjs');
    await writeFile(file, bundled.outputFiles[0].text);
    const { buildPosPrintDocumentHtml, DEFAULT_CUSTOMER_RECEIPT_TEMPLATE, DEFAULT_KITCHEN_TICKET_TEMPLATE } = createRequire(import.meta.url)(file);
    const receipt = { saleNumber: 'QS-1', saleDate: '2026-09-07', paymentMethod: 'cash', saleType: 'employee',
      employeeName: 'كريم <script>alert(1)</script>', subtotal: 75, discountAmount: 75, employeeFreeAmount: 75, taxAmount: 0, totalAmount: 0,
      items: [{ name: 'كورتادو', unitPrice: 75, quantity: 1, freeQuantity: 1, lineTotal: 75 }] };
    for (const paperSize of ['58mm', '80mm']) {
      const html = buildPosPrintDocumentHtml(receipt, { ...DEFAULT_CUSTOMER_RECEIPT_TEMPLATE, paperSize });
      assert.match(html, /فاتورة موظف/);
      assert.match(html, /كريم &lt;script&gt;/);
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /من الرصيد اليومي المجاني: 1 · خصم 100%/);
      assert.match(html, /قبل الخصم/);
      assert.match(html, /−75/);
      assert.match(html, /0 EGP/);
    }
    const mixed = buildPosPrintDocumentHtml({ ...receipt, subtotal: 150, discountAmount: 90, totalAmount: 60,
      items: [{ ...receipt.items[0], quantity: 2, lineTotal: 150 }] }, DEFAULT_CUSTOMER_RECEIPT_TEMPLATE);
    assert.match(mixed, /خصم إضافي/);
    assert.match(mixed, /−15/);
    assert.match(mixed, /60 EGP/);
    const normal = buildPosPrintDocumentHtml({ ...receipt, saleType: 'customer', employeeName: undefined, employeeFreeAmount: 0,
      discountAmount: 0, totalAmount: 75, items: [{ ...receipt.items[0], freeQuantity: 0 }] }, DEFAULT_CUSTOMER_RECEIPT_TEMPLATE);
    assert.doesNotMatch(normal, /فاتورة موظف|خصم ١٠٠٪/);
    const kitchen = buildPosPrintDocumentHtml(receipt, DEFAULT_KITCHEN_TICKET_TEMPLATE);
    assert.match(kitchen, /فاتورة موظف/);
    assert.match(kitchen, /من الرصيد اليومي المجاني/);
    assert.doesNotMatch(kitchen, /75\.00|خصم ١٠٠٪/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('printing preserves ONE80 native bridge compatibility and never opens automatic browser tabs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'one80-print-flow-'));
  const previousWindow = globalThis.window;
  try {
    const bundled = await build({ entryPoints: [resolve('src/components/sales/pos-printing.tsx')],
      bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', alias: { '@': resolve('src') } });
    const file = join(dir, 'printing.cjs');
    await writeFile(file, bundled.outputFiles[0].text);
    const { dispatchPosPrintJobs, printSinglePosDocument, buildPosPrintDocumentHtml, DEFAULT_CUSTOMER_RECEIPT_TEMPLATE, DEFAULT_KITCHEN_TICKET_TEMPLATE } = createRequire(import.meta.url)(file);
    const receipt = { saleNumber: 'QS-987654321', dailyNumber: 12345, saleDate: '2026-09-07', paymentMethod: 'cash',
      subtotal: 125, discountAmount: 0, taxAmount: 0, totalAmount: 125,
      items: [{ name: 'لاتيه', unitPrice: 125, quantity: 1, lineTotal: 125 }] };
    const templates = [DEFAULT_CUSTOMER_RECEIPT_TEMPLATE, DEFAULT_KITCHEN_TICKET_TEMPLATE];
    let opened = 0;
    globalThis.window = { open() { opened++; return null; } };
    assert.deepEqual(await dispatchPosPrintJobs(receipt, templates), { mode: 'preview', jobs: 2 });
    assert.equal(opened, 0);
    assert.equal(await printSinglePosDocument(receipt, templates[0]), false);
    assert.equal(opened, 1);
    const jobs = [];
    globalThis.window.ONE80_PRINT_BRIDGE = { print(job) { jobs.push(job); } };
    assert.deepEqual(await dispatchPosPrintJobs(receipt, templates), { mode: 'bridge', jobs: 2 });
    assert.equal(await printSinglePosDocument(receipt, templates[0]), true);
    assert.equal(opened, 1);
    assert.equal(jobs.length, 3);
    assert.equal(jobs[0].jobId, 'QS-987654321:customer_receipt');
    assert.match(jobs[2].jobId, /:reprint:/);
    globalThis.window.ONE80_PRINT_BRIDGE = { print() { return { ok: false, error: 'Printer offline' }; } };
    await assert.rejects(printSinglePosDocument(receipt, templates[0]), /Printer offline/);
    const html = buildPosPrintDocumentHtml(receipt, templates[0]);
    assert.match(html, /src="\/one-logo.png"/);
    assert.match(html, /width:22mm;max-width:100%;height:auto/);
    assert.match(html, /background:transparent;filter:brightness\(0\)/);
    assert.doesNotMatch(html, /ONE MILLION|ORDERA_PRINT_BRIDGE/);
  } finally { globalThis.window = previousWindow; await rm(dir, { recursive: true, force: true }); }
});
