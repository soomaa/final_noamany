import { ModuleLedgerService } from './module-ledger.service';

function ledger() {
  const postEntry = jest.fn();
  const service = new ModuleLedgerService({ postEntry } as never, { ensureSeeded: jest.fn() } as never);
  const lines = () => postEntry.mock.calls.at(-1)?.[0].lines as Array<{ accountCode: string; debit: number; credit: number }>;
  return { service, postEntry, lines };
}

function balanced(lines: Array<{ debit: number; credit: number }>) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  return Math.round(debit * 100) === Math.round(credit * 100);
}

describe('cafe postings to the ledger', () => {
  it('keeps purchase tax out of inventory and books the invoice discount as a purchase discount', async () => {
    const { service, lines } = ledger();
    await service.postPurchaseInvoiceApproved({
      invoiceNumber: 'SINV-7', invoiceDate: '2026-11-03', amount: 104, taxAmount: 14, discountAmount: 10, hasGrn: false,
    });
    expect(lines()).toEqual([
      { accountCode: 'inventory', debit: 100, credit: 0 },
      { accountCode: 'vat_input', debit: 14, credit: 0 },
      { accountCode: 'accounts_payable', debit: 0, credit: 104 },
      { accountCode: 'purchase_discount', debit: 0, credit: 10 },
    ]);
    expect(balanced(lines())).toBe(true);
  });

  it('posts an untaxed purchase exactly as before', async () => {
    const { service, lines } = ledger();
    await service.postPurchaseInvoiceApproved({ invoiceNumber: 'SINV-8', invoiceDate: '2026-11-03', amount: 250, hasGrn: false });
    expect(lines()).toEqual([
      { accountCode: 'inventory', debit: 250, credit: 0 },
      { accountCode: 'accounts_payable', debit: 0, credit: 250 },
    ]);
  });

  it('books a shift shortage as cash over/short against cash', async () => {
    const { service, postEntry, lines } = ledger();
    await service.postShiftCashDifference({ sessionId: 6, branchId: 3, date: '2026-11-03', difference: -2 });
    expect(postEntry.mock.calls[0][0]).toMatchObject({ sourceModule: 'sales', sourceDocType: 'shift_cash_difference', sourceDocId: 6 });
    expect(lines()).toEqual([
      { accountCode: 'cash_over_short', debit: 2, credit: 0 },
      { accountCode: 'cash', debit: 0, credit: 2 },
    ]);
  });

  it('books a shift surplus into cash and posts nothing when the count matches', async () => {
    const { service, postEntry, lines } = ledger();
    await service.postShiftCashDifference({ sessionId: 6, date: '2026-11-03', difference: 5.5 });
    expect(lines()).toEqual([
      { accountCode: 'cash', debit: 5.5, credit: 0 },
      { accountCode: 'cash_over_short', debit: 0, credit: 5.5 },
    ]);
    await service.postShiftCashDifference({ sessionId: 7, date: '2026-11-03', difference: 0.001 });
    expect(postEntry).toHaveBeenCalledTimes(1);
  });

  it('books management drawings at cost to hospitality, not general expenses', async () => {
    const { service, postEntry, lines } = ledger();
    await service.postInventoryConsumption({ transactionId: 12, reference: 'DRAW-1', date: '2026-11-03', amount: 10, kind: 'drawing' });
    expect(postEntry.mock.calls[0][0]).toMatchObject({ sourceDocType: 'management_withdrawal', description: 'مسحوبات الإدارة — DRAW-1' });
    expect(lines()).toEqual([
      { accountCode: 'hospitality_expense', debit: 10, credit: 0 },
      { accountCode: 'inventory', debit: 0, credit: 10 },
    ]);
    await service.postInventoryConsumption({ transactionId: 13, reference: 'DMG-1', date: '2026-11-03', amount: 4, kind: 'damage' });
    expect(lines()[0]).toEqual({ accountCode: 'operating_expense', debit: 4, credit: 0 });
  });
});
