import { Prisma } from '@prisma/client';
import { BillingStatementsService } from './billing-statements.service';
import { CreateBillingStatementDto } from './dto/billing-statements.dto';

describe('billing statement creation during invoice edits', () => {
  const dto: CreateBillingStatementDto = { accountType: 'employee', accountId: 4,
    branchId: 1, billingCycle: 'daily', periodStart: '2026-09-08', periodEnd: '2026-09-08', saleIds: [91] };

  function setup(options: { freshAmount?: number; eligible?: boolean; claimedCount?: number } = {}) {
    const sale = { id: 91, sale_number: 'QS-91', daily_number: 2, sale_date: '2026-09-08',
      sale_time: '10:30:00', total_amount: new Prisma.Decimal(100), billing_cycle: 'daily',
      items: [{ name: 'Coffee', quantity: 2, line_total: 100 }] };
    let locked = false;
    const captured: any[] = [];
    const tx = {
      payroll_cafe_allocations: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn(async () => { locked = true; return [{ id: 91 }]; }),
      sales_quick_sales: {
        findMany: jest.fn(async () => {
          expect(locked).toBe(true);
          return options.eligible === false ? [] : [{ id: 91, total_amount: new Prisma.Decimal(options.freshAmount ?? 60) }];
        }),
        updateMany: jest.fn().mockResolvedValue({ count: options.claimedCount ?? 1 }),
      },
      sales_billing_statements: { create: jest.fn(async ({ data }: any) => {
        captured.push(data);
        return { id: 8, ...data, paid_amount: 0, items: data.items.create.map((item: any) => ({ ...item, sale })) };
      }) },
      sales_invoice_events: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      sales_quick_sales: { findMany: jest.fn().mockResolvedValue([sale]) },
      employees: { findUnique: jest.fn().mockResolvedValue({ employee: 'Employee', emp_code: 'E4' }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new BillingStatementsService(prisma as never, {} as never, {} as never);
    return { service, tx, captured };
  }

  it('uses the latest committed amount after acquiring the invoice lock', async () => {
    const { service, tx, captured } = setup({ freshAmount: 60 });
    const result = await service.create(dto, 9);
    expect(Number(captured[0].total_amount)).toBe(60);
    expect(Number(captured[0].items.create[0].amount)).toBe(60);
    expect(result.totalAmount).toBe(60);
    expect(tx.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: { in: [91] }, sale_type: 'employee', employee_id: 4, status: 'completed',
      billing_status: 'unbilled', billing_cycle: { in: ['daily', 'monthly'] }, sale_date: { gte: '2026-09-08', lte: '2026-09-08' },
      branch_id: 1, billing_statement_item: null,
    } }));
  });

  it('rejects invoices refunded, settled or added to another statement while waiting', async () => {
    const { service, tx, captured } = setup({ eligible: false });
    await expect(service.create(dto, 9)).rejects.toThrow('الفواتير');
    expect(captured).toEqual([]);
    expect(tx.sales_quick_sales.updateMany).not.toHaveBeenCalled();
  });

  it('aborts if the protected invoice state cannot be claimed before creating the statement', async () => {
    const { service, captured } = setup({ claimedCount: 0 });
    await expect(service.create(dto, 9)).rejects.toThrow('الفواتير');
    expect(captured).toEqual([]);
  });

  it('a monthly statement collects legacy daily invoices too and is stored as monthly', async () => {
    const { service, captured } = setup({ freshAmount: 100 });
    const prismaWhere = (service as any).prisma.sales_quick_sales.findMany;
    await service.create({ ...dto, billingCycle: 'monthly', periodStart: '2026-09-01', periodEnd: '2026-09-30' }, 9);
    expect(prismaWhere).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ billing_cycle: { in: ['daily', 'monthly'] } }) }));
    expect(captured[0].billing_cycle).toBe('monthly');
  });
});
