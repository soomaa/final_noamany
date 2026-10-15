import { BillingStatementsService } from './billing-statements.service';

describe('BillingStatementsService statement order evidence', () => {
  it('keeps every linked invoice item in the listed statement response', async () => {
    const row = {
      id: 12,
      statement_number: 'ST-12',
      account_type: 'employee',
      employee_id: 44,
      partner_id: null,
      billing_cycle: 'daily',
      period_start: '2026-09-01',
      period_end: '2026-09-01',
      total_amount: 55,
      paid_amount: 0,
      settlement_method: null,
      payment_method: null,
      status: 'issued',
      notes: null,
      branch_id: 1,
      shift_session_id: null,
      created_by: 9,
      settled_by: null,
      settled_at: null,
      created_at: new Date('2026-09-01T12:00:00Z'),
      updated_at: new Date('2026-09-01T12:00:00Z'),
      items: [{
        amount: 55,
        sale: {
          id: 91,
          sale_number: 'QS-91',
          daily_number: 7,
          sale_date: '2026-09-01',
          sale_time: '10:45:00',
          items: [
            { id: 1, name: 'مياه صغيرة', quantity: 2, line_total: 30 },
            { id: 2, name: 'لاتيه', quantity: 1, line_total: 25 },
          ],
        },
      }],
    };
    const prisma = {
      sales_billing_statements: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 44, employee: 'أحمد' }]) },
      cafe_partners: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BillingStatementsService(prisma as never, {} as never, {} as never);

    const result = await service.list({ accountType: 'employee', accountId: 44, page: 1, pageSize: 20 } as never);

    expect(result.data[0].sales[0]).toMatchObject({
      id: 91,
      saleTime: '10:45:00',
      items: [
        { id: 1, name: 'مياه صغيرة', quantity: 2, amount: 30 },
        { id: 2, name: 'لاتيه', quantity: 1, amount: 25 },
      ],
    });
  });
});

