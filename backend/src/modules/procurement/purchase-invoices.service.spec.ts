import { validate } from 'class-validator';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseInvoiceItemDto } from './dto/procurement-ext.dto';

describe('PurchaseInvoicesService', () => {
  it('requires and persists the real product ID for each purchase-invoice line', async () => {
    const missingProduct = new PurchaseInvoiceItemDto();
    missingProduct.name = 'بروتين';
    missingProduct.quantity = 2;
    missingProduct.price = 15;
    const validationErrors = await validate(missingProduct);
    expect(validationErrors.some((error) => error.property === 'productId')).toBe(true);

    const created = {
      id: 1,
      invoice_number: 'PINV-1',
      invoice_date: '2026-09-24',
      supplier_id: 2,
      purchase_order_id: null,
      goods_receipt_id: null,
      due_date: null,
      status: 'بانتظار مطابقة',
      matching_status: 'تحت المراجعة',
      notes: null,
      invoice_amount: 30,
      attachments: null,
      branch_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      items: [{ id: 1, product_id: 41, name: 'بروتين', quantity: 2, price: 15, total: 30, po_quantity: null, grn_quantity: null, variance: null }],
      payment_schedules: [],
    };
    const prisma = {
      inv_products: { findMany: jest.fn().mockResolvedValue([{ id: 41 }]) },
      prc_purchase_invoices: { create: jest.fn().mockResolvedValue(created) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ maxNum: 0 }]),
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    const service = new PurchaseInvoicesService(prisma as never, {} as never);

    await service.create({
      supplierId: 2,
      invoiceDate: '2026-09-24',
      items: [{ productId: 41, name: 'بروتين', quantity: 2, price: 15 }],
    });

    expect(prisma.prc_purchase_invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: { create: [expect.objectContaining({ product_id: 41 })] },
        }),
      }),
    );
  });
});
