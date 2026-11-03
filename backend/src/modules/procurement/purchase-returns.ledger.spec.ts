import { PurchaseReturnsService } from './purchase-returns.service';

type Line = { accountCode: string; debit: number; credit: number };

function fixture(invoice: { total_amount: number; tax_amount: number; discount_amount: number } | null) {
  const postEntry = jest.fn();
  const applyMovement = jest.fn();
  const tx = { prc_supplier_invoices: { findUnique: jest.fn().mockResolvedValue(invoice) } };
  const service = new PurchaseReturnsService({} as never, { applyMovement } as never, { postEntry } as never, {} as never);
  const ret = (over: Record<string, unknown>) => ({
    id: 1, return_number: 'PR-1', supplier_id: 3, branch_id: 4, warehouse_id: 5, status: 'معتمد',
    return_date: null, created_at: new Date('2026-11-02T23:30:00Z'), items: [], ...over,
  });
  return { service: service as any, postEntry, applyMovement, tx, ret };
}

describe('purchase return ledger', () => {
  it('debits the supplier (AP), not GRN clearing, for a return with no invoice', async () => {
    const { service, postEntry, tx, ret } = fixture(null);
    await service.postReturnLedger(ret({
      supplier_invoice_id: null, total_amount: 10,
      items: [{ product_id: 7, quantity: 1, unit_price: 10 }],
    }), 1, tx);
    const entry = postEntry.mock.calls[0][0];
    expect(entry.lines).toEqual([
      { accountCode: 'accounts_payable', debit: 10, credit: 0 },
      { accountCode: 'inventory', debit: 0, credit: 10 },
    ]);
    // Dated on the Cairo calendar day the return was made (01:30 on 3 Nov), not UTC.
    expect(entry.date).toBe('2026-11-03');
  });

  it('unwinds its share of the invoice tax and discount so inventory leaves at stock value', async () => {
    // Invoice: goods 100 + tax 14 − discount 10 = 104. Returning a quarter of it.
    const { service, postEntry, applyMovement, tx, ret } = fixture({ total_amount: 104, tax_amount: 14, discount_amount: 10 });
    const row = ret({
      supplier_invoice_id: 8, total_amount: 26, return_date: '2026-11-03',
      items: [{ product_id: 7, quantity: 2, unit_price: 13 }],
    });
    await service.postReturnLedger(row, 1, tx);
    const lines: Line[] = postEntry.mock.calls[0][0].lines;
    expect(lines).toEqual([
      { accountCode: 'accounts_payable', debit: 26, credit: 0 },
      { accountCode: 'purchase_discount', debit: 2.5, credit: 0 },
      { accountCode: 'inventory', debit: 0, credit: 25 },
      { accountCode: 'vat_input', debit: 0, credit: 3.5 },
    ]);
    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
    expect(debit).toBeCloseTo(credit, 10);

    await service.postStockOut(row, 1, tx);
    // 13 a unit on the invoice's net; 12.50 a unit in stock (100 / 8 units).
    expect(applyMovement.mock.calls[0][0]).toMatchObject({ unitCost: 12.5, quantity: 2 });
  });
});
