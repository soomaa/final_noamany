import { QuickSalesService } from './quick-sales.service';
describe('shift invoice payments', () => {
  it('keeps payment totals separate for each shift and excludes reversals', async () => {
    const sessions = [7, 8].map(id => ({ id, shift_id: id, status: 'open', session_date: '2026-09-08', start_time: new Date(), shift: { shift_name: 'مسائي' } }));
    const rows = [
      { id: 1, shiftSessionId: 7, status: 'completed', paymentMethod: 'mixed', totalAmount: 100, collectedAmount: 100, payments: [{ method: 'cash', amount: 30 }, { method: 'card', amount: 70 }] },
      { id: 2, shiftSessionId: 7, status: 'refunded', paymentMethod: 'cash', totalAmount: 500, collectedAmount: 500 },
      { id: 3, shiftSessionId: 8, status: 'completed', paymentMethod: 'cash', totalAmount: 50, collectedAmount: 50 },
    ];
    const service = new QuickSalesService({ sales_shift_sessions: { findMany: jest.fn().mockResolvedValue(sessions) },
      sales_billing_statements: { findMany: jest.fn().mockResolvedValue([]) }, sales_quick_sales: { findMany: jest.fn().mockResolvedValue(rows) } } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, { resolveListFilter: () => null } as never, {} as never);
    jest.spyOn(service as never, 'mapSales').mockResolvedValue(rows as never);
    const board = await service.shiftBoard({ branchId: '1' });
    expect(board.sessions[0].paymentSummary).toMatchObject({ collected: 100, total: 100,
      payments: [{ method: 'cash', amount: 30 }, { method: 'card', amount: 70 }] });
    expect(board.sessions[1].paymentSummary).toMatchObject({ collected: 50, payments: [{ method: 'cash', amount: 50 }] });
  });

});
