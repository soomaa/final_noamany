import { BadRequestException } from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { SupplierPaymentsService } from './supplier-payments.service';

describe('SupplierPaymentsService.create', () => {
  const user = { sub: 50, branch: 3 } as never;
  const branchScope = { isBranchAllowed: () => true, resolveListFilter: () => null };

  it('refuses a paid payment without an invoice, since it would never reach the supplier balance', async () => {
    const service = new SupplierPaymentsService({} as never, {} as never, branchScope as never);
    await expect(service.create({ supplierId: 1, paymentAmount: 100, paymentMethod: 'cash' }, 50, user))
      .rejects.toThrow(BadRequestException);
  });

  it('records the payment as paid, posts it, settles the invoice and takes cash from the payer drawer', async () => {
    const invoice = { id: 9, supplier_id: 1, branch_id: 3, total_amount: 500, returned_amount: 0, stock_applied: true, status: 'مستلمة', is_deleted: false };
    const created: Record<string, unknown>[] = [];
    const tx = {
      prc_supplier_payments: {
        create: jest.fn(async ({ data }) => {
          const row = { id: 1, ...data, created_at: new Date(), updated_at: new Date() };
          created.push(row);
          return row;
        }),
        aggregate: jest.fn(async () => ({ _sum: { payment_amount: created.reduce((s, r) => s + Number(r.payment_amount), 0) } })),
      },
      prc_supplier_invoices: {
        findFirst: jest.fn(async () => invoice),
        findUnique: jest.fn(async () => invoice),
        update: jest.fn(async () => invoice),
      },
      inv_suppliers: { findUnique: jest.fn(async () => ({ name_ar: 'مورد' })) },
      sales_shift_sessions: {
        findFirst: jest.fn(async () => ({ id: 7, branch_id: 3 })),
        findUniqueOrThrow: jest.fn(async () => ({ opening_balance: 1000, total_cash: 0 })),
        update: jest.fn(),
      },
      sales_cash_drawer_transactions: { create: jest.fn(), findMany: jest.fn(async () => []) },
      $queryRaw: jest.fn(async () => [{ v: 0 }]),
    };
    const prisma = {
      ...tx,
      prc_supplier_payments: { ...tx.prc_supplier_payments, aggregate: jest.fn(async () => ({ _sum: { payment_amount: 0 } })) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const ledger = { postSupplierPayment: jest.fn(), paymentKeyFromString: (m: string) => (m === 'cash' ? 'cash' : 'bank') };
    const service = new SupplierPaymentsService(prisma as never, ledger as never, branchScope as never);

    const result = await service.create({ supplierId: 1, invoiceId: 9, paymentAmount: 200, paymentMethod: 'cash', paymentNumber: 'PAY-9' }, 50, user);

    expect(result.status).toBe('مدفوع');
    expect(ledger.postSupplierPayment).toHaveBeenCalledTimes(1);
    expect(tx.prc_supplier_invoices.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paid_amount: 200, remaining_amount: 300 }),
    }));
    expect(tx.sales_cash_drawer_transactions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reference: 'SUP-PAY-9', shift_session_id: 7, direction: 'out', movement_type: 'supplier_payment' }),
    });
  });
});

describe('GoodsReceiptsService double counting', () => {
  it('refuses a goods receipt for a purchase order whose invoice already put the goods in stock', async () => {
    const scope = { loadPurchaseOrder: jest.fn(async () => ({ id: 6, po_number: 'PO-000006', supplier_invoice_id: 3, branch_id: 3 })) };
    const service = new GoodsReceiptsService({} as never, {} as never, {} as never, {} as never, scope as never);
    await expect(service.create({ purchaseOrderId: 6, receiverName: 'x', items: [] } as never, { sub: 1 } as never))
      .rejects.toThrow('اتضاف للمخزن');
  });
});
