import { buildShiftCloseReport } from './shift-close-report';

describe('buildShiftCloseReport', () => {
  it('keeps configured payment methods separate even when they share one accounting base', () => {
    const report = buildShiftCloseReport({
      sales: [
        {
          invoiceNumber: 'INV-0042',
          saleDate: '2026-08-27',
          saleTime: '14:35:00',
          customerName: 'سارة أحمد',
          status: 'completed',
          subtotalAmount: 95,
          totalAmount: 100,
          collectedAmount: 100,
          discountAmount: 0,
          taxAmount: 0,
          saleType: 'customer',
          paymentMethod: 'mixed',
          payments: [
            { baseMethod: 'cash', amount: 50, methodCode: 'cash', methodName: 'كاش' },
            { baseMethod: 'transfer', amount: 30, methodCode: 'instapay', methodName: 'InstaPay' },
            { baseMethod: 'transfer', amount: 20, methodCode: 'snap-pay', methodName: 'SnapPay' },
          ],
        },
      ],
      adjustments: [],
    });

    expect(report.paymentMethods).toEqual([
      expect.objectContaining({ code: 'cash', name: 'كاش', saleCount: 1, netAmount: 50 }),
      expect.objectContaining({ code: 'instapay', name: 'InstaPay', saleCount: 1, netAmount: 30 }),
      expect.objectContaining({ code: 'snap-pay', name: 'SnapPay', saleCount: 1, netAmount: 20 }),
    ]);
    expect(report.totals.collected).toBe(100);
    expect(report.invoices).toEqual([
      expect.objectContaining({
        invoiceNumber: 'INV-0042',
        saleTime: '14:35:00',
        customerName: 'سارة أحمد',
        status: 'completed',
        totalAmount: 100,
        payments: [
          { code: 'cash', name: 'كاش', baseMethod: 'cash', amount: 50 },
          { code: 'instapay', name: 'InstaPay', baseMethod: 'transfer', amount: 30 },
          { code: 'snap-pay', name: 'SnapPay', baseMethod: 'transfer', amount: 20 },
        ],
      }),
    ]);
  });

  it('falls back to the legacy base method when an old sale has no payment snapshots', () => {
    const report = buildShiftCloseReport({
      sales: [{
        totalAmount: 75,
        collectedAmount: 75,
        discountAmount: 0,
        taxAmount: 0,
        saleType: 'customer',
        paymentMethod: 'card',
        payments: [],
      }],
      adjustments: [],
    });

    expect(report.paymentMethods).toEqual([
      expect.objectContaining({ code: 'card', name: 'بطاقة / فيزا', netAmount: 75 }),
    ]);
  });

  it('separates refunds and cancellations from gross and net sales', () => {
    const report = buildShiftCloseReport({
      sales: [{
        totalAmount: 200,
        collectedAmount: 200,
        discountAmount: 10,
        taxAmount: 20,
        saleType: 'customer',
        paymentMethod: 'cash',
        payments: [{ baseMethod: 'cash', amount: 200, methodCode: 'cash', methodName: 'كاش' }],
      }],
      adjustments: [
        {
          eventType: 'refund',
          totalAmount: 50,
          discountAmount: 2,
          taxAmount: 5,
          paymentLines: [{ baseMethod: 'cash', amount: 50, methodCode: 'cash', methodName: 'كاش' }],
          internalAccountAmount: 0,
        },
        {
          eventType: 'cancel',
          totalAmount: 25,
          discountAmount: 1,
          taxAmount: 2,
          paymentLines: [{ baseMethod: 'cash', amount: 25, methodCode: 'cash', methodName: 'كاش' }],
          internalAccountAmount: 0,
        },
      ],
    });

    expect(report.counts).toEqual({ invoices: 1, refunds: 1, cancellations: 1 });
    expect(report.totals).toEqual(expect.objectContaining({
      grossSales: 200,
      refunds: 50,
      cancellations: 25,
      netSales: 125,
      collected: 125,
      discount: 7,
      tax: 13,
    }));
  });

  it('reports employee and partner credit as CL without treating it as collected cash', () => {
    const report = buildShiftCloseReport({
      sales: [
        { totalAmount: 80, collectedAmount: 0, discountAmount: 0, taxAmount: 0, saleType: 'employee', paymentMethod: 'cash', payments: [] },
        { totalAmount: 120, collectedAmount: 0, discountAmount: 0, taxAmount: 0, saleType: 'partner', paymentMethod: 'cash', payments: [] },
      ],
      adjustments: [],
    });

    expect(report.internalAccounts).toEqual({ name: 'CL — حساب موظف/شريك', saleCount: 2, refundCount: 0, netAmount: 200 });
    expect(report.totals.collected).toBe(0);
    expect(report.totals.internalAccounts).toBe(200);
    expect(report.totals.netSales).toBe(200);
  });

  it('shows account settlements without counting the original employee sale twice', () => {
    const report = buildShiftCloseReport({
      sales: [{
        totalAmount: 230,
        collectedAmount: 0,
        discountAmount: 0,
        taxAmount: 0,
        saleType: 'employee',
        paymentMethod: 'cash',
        payments: [],
      }],
      adjustments: [],
      accountSettlements: [
        {
          statementNumber: 'ST-CASH-1',
          settledAt: new Date('2026-09-01T10:30:00Z'),
          accountType: 'employee',
          accountName: 'أحمد',
          totalAmount: 150,
          settlementMethod: 'direct_payment',
          paymentMethod: 'cash',
        },
        {
          statementNumber: 'ST-PAYROLL-1',
          settledAt: new Date('2026-09-01T11:00:00Z'),
          accountType: 'employee',
          accountName: 'محمود',
          totalAmount: 80,
          settlementMethod: 'payroll_deduction',
        },
      ],
    } as never) as ReturnType<typeof buildShiftCloseReport> & {
      accountSettlements: {
        count: number;
        totalAmount: number;
        directAmount: number;
        nonCashAmount: number;
      };
    };

    expect(report.totals.grossSales).toBe(230);
    expect(report.totals.netSales).toBe(230);
    expect(report.totals.collected).toBe(150);
    expect(report.paymentMethods).toEqual([
      expect.objectContaining({ code: 'cash', netAmount: 150 }),
    ]);
    expect(report.accountSettlements).toEqual(expect.objectContaining({
      count: 2,
      totalAmount: 230,
      directAmount: 150,
      nonCashAmount: 80,
    }));
  });

  it('includes the unpaid employee balance in that invoice payment summary', () => {
    const report = buildShiftCloseReport({
      sales: [{
        invoiceNumber: 'INV-CL-1',
        saleDate: '2026-08-27',
        saleTime: '18:05:00',
        customerName: 'موظف تجريبي',
        status: 'completed',
        subtotalAmount: 120,
        totalAmount: 120,
        collectedAmount: 20,
        discountAmount: 0,
        taxAmount: 0,
        saleType: 'employee',
        paymentMethod: 'cash',
        payments: [{ baseMethod: 'cash', amount: 20, methodCode: 'cash', methodName: 'كاش' }],
      }],
      adjustments: [],
    });

    expect(report.invoices[0].payments).toEqual([
      { code: 'cash', name: 'كاش', baseMethod: 'cash', amount: 20 },
      { code: 'cl', name: 'CL — حساب موظف/شريك', baseMethod: 'internal', amount: 100 },
    ]);
  });

  it('summarizes sold products by order and quantity without exposing raw materials', () => {
    const report = buildShiftCloseReport({
      sales: [
        {
          totalAmount: 60,
          collectedAmount: 60,
          discountAmount: 0,
          taxAmount: 0,
          saleType: 'customer',
          paymentMethod: 'cash',
          payments: [],
          items: [
            { key: 'cafe:1', itemType: 'cafe', name: 'مياه', quantity: 2, unitPrice: 10, lineTotal: 20 },
            { key: 'cafe:2:v1', itemType: 'cafe', name: 'قهوة', variantName: 'وسط', quantity: 1, unitPrice: 25, lineTotal: 25 },
            { key: 'raw:9', itemType: 'ingredient', name: 'بن خام', quantity: 18, unitPrice: 1, lineTotal: 18 },
          ],
        },
        {
          totalAmount: 45,
          collectedAmount: 45,
          discountAmount: 0,
          taxAmount: 0,
          saleType: 'customer',
          paymentMethod: 'cash',
          payments: [],
          items: [
            { key: 'cafe:1', itemType: 'cafe', name: 'مياه', quantity: 3, unitPrice: 10, lineTotal: 30 },
          ],
        },
      ],
      adjustments: [
        {
          eventType: 'refund',
          totalAmount: 30,
          discountAmount: 0,
          taxAmount: 0,
          paymentLines: [],
          internalAccountAmount: 0,
          items: [
            { key: 'cafe:1', itemType: 'cafe', name: 'مياه', quantity: 1, unitPrice: 10, lineTotal: 10 },
          ],
        },
      ],
    } as never) as ReturnType<typeof buildShiftCloseReport> & {
      products?: Array<Record<string, unknown>>;
    };

    expect(report.products).toEqual([
      {
        key: 'cafe:1',
        name: 'مياه',
        variantName: null,
        orderCount: 2,
        soldQuantity: 5,
        refundQuantity: 1,
        cancellationQuantity: 0,
        netQuantity: 4,
        unitPrice: 10,
        grossAmount: 50,
        refundAmount: 10,
        cancellationAmount: 0,
        netAmount: 40,
      },
      {
        key: 'cafe:2:v1',
        name: 'قهوة',
        variantName: 'وسط',
        orderCount: 1,
        soldQuantity: 1,
        refundQuantity: 0,
        cancellationQuantity: 0,
        netQuantity: 1,
        unitPrice: 25,
        grossAmount: 25,
        refundAmount: 0,
        cancellationAmount: 0,
        netAmount: 25,
      },
    ]);
  });
});

