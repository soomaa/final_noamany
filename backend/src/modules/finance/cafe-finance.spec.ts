import { syncCafeSaleFinance } from './cafe-finance.util';

function store() {
  const revenues = new Map<string, any>();
  const expenses = new Map<string, any>();
  const upsert = (rows: Map<string, any>, key: string) => async ({ where, create, update }: any) => {
    const id = where[key];
    const row = rows.has(id) ? { ...rows.get(id), ...update } : create;
    rows.set(id, row);
    return row;
  };
  return { revenues, expenses, tx: {
    fin_revenues: { findFirst: async () => null, upsert: upsert(revenues, 'revenue_number') },
    fin_expenses: { upsert: upsert(expenses, 'expense_number') },
  } };
}
const sale = { id: 7, sale_number: 'QS-7', sale_date: '2026-08-31', status: 'completed',
  subtotal: 100, discount_amount: 10, tax_amount: 9, total_amount: 99,
  collected_amount: 99, cost_total: 35, inventory_posted: true, payment_method: 'cash',
  sale_type: 'customer', customer_name: 'عميل', branch_id: 2, created_by: 8 };

describe('POS finance register', () => {
  it('mirrors sales and cost without duplication when synchronization is repeated', async () => {
    const s = store();
    await syncCafeSaleFinance(s.tx as never, sale as never);
    await syncCafeSaleFinance(s.tx as never, sale as never);
    expect([...s.revenues.values()]).toEqual([expect.objectContaining({ net_amount: 99, tax_amount: 9, discount_amount: 10, branch_id: 2, created_by: 8 })]);
    expect([...s.expenses.values()]).toEqual([expect.objectContaining({ total_amount: 35, category: 'تكلفة مبيعات الكافيه' })]);
  });
  it('ignores held orders and cancelled drafts entirely', async () => {
    const s = store();
    await syncCafeSaleFinance(s.tx as never, { ...sale, status: 'draft' } as never);
    await syncCafeSaleFinance(s.tx as never, { ...sale, status: 'cancelled', sale_number: 'HOLD-7', daily_number: null } as never);
    expect(s.revenues.size).toBe(0);
    expect(s.expenses.size).toBe(0);
  });
  it('keeps the original period and reverses revenue and COGS on the refund date', async () => {
    const s = store();
    await syncCafeSaleFinance(s.tx as never, sale as never);
    const reversal = { date: '2026-09-07', createdBy: 12 };
    await syncCafeSaleFinance(s.tx as never, { ...sale, status: 'refunded' } as never, reversal);
    await syncCafeSaleFinance(s.tx as never, { ...sale, status: 'refunded' } as never, reversal);
    expect([...s.revenues.values()].map(r => [r.revenue_date, r.net_amount])).toEqual([['2026-08-31',99],['2026-09-07',-99]]);
    expect([...s.expenses.values()].map(r => r.total_amount)).toEqual([35,-35]);
  });
  it('keeps free employee drink cost and does not invent inventory cost for cashier-only orders', async () => {
    const s = store();
    await syncCafeSaleFinance(s.tx as never, { ...sale, total_amount: 0, discount_amount: 100, tax_amount: 0, sale_type: 'employee' } as never);
    expect([...s.expenses.values()][0].total_amount).toBe(35);
    const cash = store();
    await syncCafeSaleFinance(cash.tx as never, { ...sale, inventory_posted: false } as never);
    expect(cash.expenses.size).toBe(0);
  });
});


test('updates an existing legacy projection instead of duplicating it', async () => {
  const tx = { fin_revenues: { findFirst: jest.fn().mockResolvedValue({ id: 91 }), update: jest.fn(), upsert: jest.fn() }, fin_expenses: { upsert: jest.fn() } };
  await syncCafeSaleFinance(tx as never, sale as never);
  expect(tx.fin_revenues.upsert).not.toHaveBeenCalled();
  expect(tx.fin_revenues.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 91 }, data: expect.objectContaining({ source_module: 'quick_sale', net_amount: 99 }) }));
});
