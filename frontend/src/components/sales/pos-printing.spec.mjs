import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
});
const { buildPosPrintDocumentHtml, DEFAULT_CUSTOMER_RECEIPT_TEMPLATE } = await server.ssrLoadModule(
  '/src/components/sales/pos-printing.tsx',
);

test.after(async () => {
  await server.close();
});

test('prints the sale time on its own row directly after the date', () => {
  const html = buildPosPrintDocumentHtml(
    {
      saleNumber: 'QS-20260909-1-0030',
      dailyNumber: 30,
      saleDate: '2026-09-09',
      saleTime: '14:35:00',
      customerName: 'عميل نقدي',
      paymentMethod: 'cash',
      subtotal: 20,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 20,
      items: [{ name: 'مياه صغيرة', quantity: 2, unitPrice: 10, lineTotal: 20 }],
    },
    DEFAULT_CUSTOMER_RECEIPT_TEMPLATE,
  );

  assert.match(
    html,
    /<span>التاريخ<\/span><b>2026-09-09<\/b><span>الوقت<\/span><b class="receipt-time nums" dir="ltr">02:35 م<\/b>/,
  );
});
