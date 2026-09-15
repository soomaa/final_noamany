import { QuickSalesService } from './quick-sales.service';

describe('QuickSalesService shift drafts board', () => {
  it('surfaces a legacy held invoice that was saved without a shift session', async () => {
    const prisma = {
      sales_shift_sessions: {
        findMany: jest.fn().mockResolvedValue([{
          id: 7,
          shift_id: 2,
          status: 'open',
          session_date: '2026-08-28',
          start_time: new Date('2026-08-28T18:00:00Z'),
          end_time: null,
          shift: { shift_name: 'الليل', color: '#0A2342' },
        }]),
      },
      sales_quick_sales: {
        findMany: jest.fn().mockResolvedValue([{ id: 90 }]),
      },
      sales_billing_statements: {
        findMany: jest.fn().mockResolvedValue([{
          id: 12,
          statement_number: 'ST-12',
          shift_session_id: 7,
          account_type: 'employee',
          employee_id: 44,
          partner_id: null,
          total_amount: 150,
          settlement_method: 'direct_payment',
          payment_method: 'cash',
          settled_at: new Date('2026-08-28T20:00:00Z'),
        }]),
      },
      employees: {
        findMany: jest.fn().mockResolvedValue([{ id: 44, employee: 'كابتن تامر' }]),
      },
      cafe_partners: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new QuickSalesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { resolveListFilter: () => null } as never,
      {} as never,
    );
    jest.spyOn(service as never, 'map').mockReturnValue({
      id: 90,
      status: 'draft',
      shiftSessionId: null,
      totalAmount: 30,
    } as never);

    const board = await service.shiftBoard({ branchId: '1', limit: 2 }) as any;

    expect(board.sessions[0].drafts).toEqual([
      expect.objectContaining({ id: 90, status: 'draft' }),
    ]);
    expect(board.sessions[0].settlements).toEqual([
      expect.objectContaining({
        id: 12,
        statementNumber: 'ST-12',
        accountName: 'كابتن تامر',
        totalAmount: 150,
      }),
    ]);
    expect(board.sessions[0].settlementCount).toBe(1);
    expect(board.sessions[0].settlementValue).toBe(150);
    expect(board.totals.drafts).toBe(1);
    expect(board.totals.settlements).toBe(1);
    expect(board.totals.settlementValue).toBe(150);
  });
});

