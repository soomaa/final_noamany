import { SalesPaymentMethod } from '@prisma/client';
import { ModuleLedgerService } from './module-ledger.service';
import { LedgerPostInput } from './ledger.service';

describe('completed invoice accounting corrections', () => {
  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    subtotal: 100, discountAmount: 0, taxAmount: 0, totalAmount: 100,
    collectedAmount: 100, paymentMethod: SalesPaymentMethod.cash,
    payments: [], cogsAmount: 40, ...overrides,
  });
  function setup() {
    const entries: LedgerPostInput[] = [];
    const ledger = { postEntry: jest.fn(async (entry: LedgerPostInput) => { entries.push(entry); }) };
    const service = new ModuleLedgerService(ledger as never, { ensureSeeded: jest.fn() } as never);
    const input = { saleNumber: 'QS-20260908-1-0002', revision: 1, branchId: 1,
      saleDate: '2026-09-08', createdBy: 9 };
    return { service, entries, ledger, input };
  }
  const accountBalances = (entries: LedgerPostInput[]) => {
    const balances: Record<string, number> = {};
    for (const entry of entries) for (const line of entry.lines) {
      balances[line.accountCode] = Math.round(((balances[line.accountCode] ?? 0) + line.debit - line.credit) * 100) / 100;
    }
    return Object.fromEntries(Object.entries(balances).filter(([, amount]) => amount !== 0));
  };

  it('posts only the added sale and consumption with a stable per-revision source', async () => {
    const { service, input, entries } = setup();
    await service.postQuickSaleEdit({ ...input, before: snapshot(), after: snapshot({
      subtotal: 150, totalAmount: 150, collectedAmount: 150, cogsAmount: 60,
    }) } as never);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({ sourceModule: 'sales',
      sourceDocType: 'quick_sale_edit', sourceDocId: 'QS-20260908-1-0002:edit:1',
      branchId: 1, date: '2026-09-08', createdBy: 9 }));
    expect(accountBalances(entries)).toEqual({ cash: 50, sales_revenue: -50,
      cost_of_goods_sold: 20, inventory: -20 });
  });

  it('corrects mixed payment channels without recording the sale twice', async () => {
    const { service, input, entries } = setup();
    await service.postQuickSaleEdit({ ...input, before: snapshot({ paymentMethod: SalesPaymentMethod.mixed,
      payments: [{ method: SalesPaymentMethod.cash, amount: 60 }, { method: SalesPaymentMethod.card, amount: 40 }] }),
    after: snapshot({ paymentMethod: SalesPaymentMethod.mixed,
      payments: [{ method: SalesPaymentMethod.cash, amount: 20 }, { method: SalesPaymentMethod.transfer, amount: 80 }] }) } as never);
    expect(accountBalances(entries)).toEqual({ cash: -40, card: -40, bank: 80 });
  });

  it('reduces deferred debt and cost without inventing collected money', async () => {
    const { service, input, entries } = setup();
    await service.postQuickSaleEdit({ ...input, before: snapshot({ collectedAmount: 0 }),
      after: snapshot({ subtotal: 60, totalAmount: 60, collectedAmount: 0, cogsAmount: 24 }) } as never);
    expect(accountBalances(entries)).toEqual({ accounts_receivable: -40, sales_revenue: 40,
      cost_of_goods_sold: -16, inventory: 16 });
  });

  it('balances discount and tax corrections and fully reverses the edited invoice', async () => {
    const { service, input, entries } = setup();
    const before = snapshot({ discountAmount: 10, taxAmount: 12.6, totalAmount: 102.6, collectedAmount: 102.6 });
    const after = snapshot({ subtotal: 60, discountAmount: 6, taxAmount: 7.56,
      totalAmount: 61.56, collectedAmount: 61.56, cogsAmount: 24 });
    await service.postQuickSale({ ...input, ...before } as never);
    await service.postQuickSaleEdit({ ...input, before, after } as never);
    expect(accountBalances(entries)).toEqual({ cash: 61.56, sales_discount: 6,
      sales_revenue: -60, vat_output: -7.56, cost_of_goods_sold: 24, inventory: -24 });
    await service.postQuickSaleRefund({ ...input, ...after, returnedCogsAmount: 24, operationType: 'cancel' } as never);
    expect(accountBalances(entries)).toEqual({});
    for (const entry of entries) {
      expect(Math.abs(entry.lines.reduce((sum, line) => sum + line.debit - line.credit, 0))).toBeLessThan(0.001);
      expect(entry.lines.every((line) => (line.debit > 0) !== (line.credit > 0))).toBe(true);
    }
  });

  it('keeps free-drink consumption even when no cash or revenue is charged', async () => {
    const { service, input, entries } = setup();
    await service.postQuickSaleEdit({ ...input,
      before: snapshot({ discountAmount: 100, totalAmount: 0, collectedAmount: 0 }),
      after: snapshot({ subtotal: 150, discountAmount: 150, totalAmount: 0, collectedAmount: 0, cogsAmount: 60 }),
    } as never);
    expect(accountBalances(entries)).toEqual({ sales_discount: 50, sales_revenue: -50,
      cost_of_goods_sold: 20, inventory: -20 });
  });

  it('does not create zero-value journals for unchanged amounts or notes-only edits', async () => {
    const { service, input, entries } = setup();
    await service.postQuickSaleEdit({ ...input, before: snapshot(), after: snapshot() } as never);
    expect(entries).toEqual([]);
  });
});

