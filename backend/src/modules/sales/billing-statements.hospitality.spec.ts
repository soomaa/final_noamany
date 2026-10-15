import { Prisma } from '@prisma/client';
import { BillingStatementsService } from './billing-statements.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';

function setup(partnerId: number | null = null) {
  const sale = { id: 91, branch_id: 1, sale_number: 'QS-H-91', sale_type: 'hospitality', status: 'completed', billing_status: 'in_statement', daily_number: 1, sale_date: '2026-09-12', items: [] };
  let statement: any = { id: 12, statement_number: 'ST-H-12', account_type: 'hospitality', partner_id: partnerId, employee_id: null, branch_id: 1, status: 'issued', total_amount: new Prisma.Decimal(150), paid_amount: new Prisma.Decimal(0), items: [{ quick_sale_id: 91, amount: new Prisma.Decimal(150), sale }] };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    payroll_cafe_allocations: { count: jest.fn().mockResolvedValue(0) },
    cafe_partners: { findUnique: jest.fn().mockResolvedValue({ id: 3, name: 'شريك اختبار', is_active: true }) },
    fin_revenues: { upsert: jest.fn(), updateMany: jest.fn() },
    sales_quick_sales: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([sale]) },
    sales_invoice_events: { createMany: jest.fn() },
    sales_cash_drawer_transactions: { create: jest.fn() },
    sales_billing_statements: {
      findUnique: jest.fn(async () => statement),
      update: jest.fn(async ({ data }: any) => (statement = { ...statement, ...data })),
    },
  };
  const prisma: any = { ...tx, $transaction: (fn: any) => fn(tx) };
  const entries: any[] = [];
  const ledger = new ModuleLedgerService({ postEntry: async (entry: any) => { entries.push(entry); } } as never, { ensureSeeded: async () => {} } as never);
  const sessions = { findBranchSessionForSale: jest.fn().mockResolvedValue({ id: 7 }), applyStatementSettlementToSession: jest.fn() };
  return { service: new BillingStatementsService(prisma, ledger, sessions as never), tx, sessions, entries };
}

describe('hospitality settlement lifecycle', () => {
  it('collects hospitality as revenue once, without crediting a nonexistent debt or moving inventory', async () => {
    const { service, tx, entries, sessions } = setup();
    const result = await service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: 'cash' }, 9);
    expect(result.status).toBe('settled');
    expect(entries.flatMap(e => e.lines)).toEqual([
      { accountCode: 'cash', debit: 150, credit: 0 },
      { accountCode: 'sales_revenue', debit: 0, credit: 150 },
    ]);
    expect(sessions.applyStatementSettlementToSession).toHaveBeenCalledTimes(1);
    expect(tx.fin_revenues.upsert).toHaveBeenCalledTimes(1);
    await expect(service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: 'cash' }, 9)).rejects.toThrow('بالفعل');
    expect(entries).toHaveLength(1);
  });

  it('loads a partner account without collecting money, then clears that debt on later payment', async () => {
    const { service, tx, entries, sessions } = setup();
    const result = await service.settle(12, { settlementMethod: 'partner_account', partnerId: 3 } as any, 9);
    expect(result.status).toBe('issued');
    expect(result.partnerId).toBe(3);
    expect(result.paidAmount).toBe(0);
    expect(entries[0].lines).toEqual([
      { accountCode: 'accounts_receivable', debit: 150, credit: 0 },
      { accountCode: 'sales_revenue', debit: 0, credit: 150 },
    ]);
    expect(sessions.applyStatementSettlementToSession).not.toHaveBeenCalled();
    expect(tx.sales_cash_drawer_transactions.create).not.toHaveBeenCalled();
    expect(tx.sales_quick_sales.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ partner_id: 3, billing_status: 'in_statement' }) }));
    await expect(service.settle(12, { settlementMethod: 'partner_account', partnerId: 4 } as any, 9)).rejects.toThrow();
    await service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: 'card' }, 9);
    expect(entries).toHaveLength(2);
    expect(entries[1].lines).toEqual([
      { accountCode: 'card', debit: 150, credit: 0 },
      { accountCode: 'accounts_receivable', debit: 0, credit: 150 },
    ]);
    expect(tx.fin_revenues.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive partners before any accounting change', async () => {
    const { service, tx, entries } = setup();
    tx.cafe_partners.findUnique.mockResolvedValue({ id: 3, is_active: false });
    await expect(service.settle(12, { settlementMethod: 'partner_account', partnerId: 3 } as any, 9)).rejects.toThrow();
    expect(entries).toHaveLength(0);
  });

  it('requires a collecting shift for direct payment', async () => {
    const { service, sessions, entries } = setup();
    sessions.findBranchSessionForSale.mockResolvedValue(null as never);
    await expect(service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: 'cash' }, 9)).rejects.toThrow('وردية');
    expect(entries).toHaveLength(0);
  });

  it('rejects profit deduction until a partner has accepted the debt', async () => {
    const { service, entries } = setup();
    await expect(service.settle(12, { settlementMethod: 'profit_share_deduction' }, 9)).rejects.toThrow();
    expect(entries).toHaveLength(0);
  });

  it('posts invoice tax separately and keeps the original inventory expense untouched', async () => {
    const { service, tx, entries } = setup();
    const sales = await tx.sales_quick_sales.findMany();
    tx.sales_quick_sales.findMany.mockResolvedValue([{ ...sales[0], tax_amount: 15 }]);
    await service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: 'wallet' }, 9);
    expect(entries[0].lines).toEqual([
      { accountCode: 'online', debit: 150, credit: 0 },
      { accountCode: 'sales_revenue', debit: 0, credit: 135 },
      { accountCode: 'vat_output', debit: 0, credit: 15 },
    ]);
  });

  it('rejects mixed-branch statements without posting anything', async () => {
    const { service, tx, entries } = setup();
    const statement = await tx.sales_billing_statements.findUnique();
    statement.items.push({ quick_sale_id: 92, amount: 0, sale: { ...statement.items[0].sale, id: 92, branch_id: 2 } });
    tx.sales_quick_sales.findMany.mockResolvedValue(statement.items.map((i: any) => i.sale));
    await expect(service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: 'cash' }, 9)).rejects.toThrow('فرع');
    expect(entries).toHaveLength(0);
  });
});
