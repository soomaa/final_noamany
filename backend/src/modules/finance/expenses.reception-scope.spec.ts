import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { ExpensesService } from './expenses.service';
import { ListExpensesDto } from './dto/finance.dto';

describe('reception daily expense scope', () => {
  const user = { sub: 17, level: 2, branch: 3, job_title: 'موظف ريسيبشن' } as JwtUser;
  const prisma = { fin_expenses: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() } };
  const service = new ExpensesService(prisma as never, {} as never, new BranchScopeService());
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.fin_expenses.findMany.mockResolvedValue([]);
    prisma.fin_expenses.count.mockResolvedValue(0);
    prisma.fin_expenses.aggregate.mockResolvedValue({ _sum: { total_amount: 0 } });
    prisma.fin_expenses.groupBy.mockResolvedValue([]);
  });

  it('filters rows and count to today and the employee branch even with forged filters', async () => {
    await service.list(Object.assign(new ListExpensesDto(), { branchId: 'all', dateFrom: '2000-01-01' }), user);
    const where = prisma.fin_expenses.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ branch_id: 3, expense_date: localDateString() });
    expect(prisma.fin_expenses.count).toHaveBeenCalledWith({ where });
  });

  it('uses the same scope for statistics', async () => {
    await service.statistics({ branchId: 'all' }, user);
    const where = prisma.fin_expenses.aggregate.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ branch_id: 3, expense_date: localDateString() });
    expect(prisma.fin_expenses.groupBy.mock.calls.every(([args]) => args.where === where)).toBe(true);
  });

  it.each([{ branch_id: 3, expense_date: '2000-01-01' }, { branch_id: 7, expense_date: localDateString() }])('rejects direct access to an old or foreign expense %j', async (row) => {
    prisma.fin_expenses.findFirst.mockResolvedValue(row);
    await expect(service.findOne(99, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([{ ...user, level: 1 }, { ...user, level: 3 }, { ...user, job_title: 'محاسب' }])('preserves date access for administrators, managers and accountants', async (account) => {
    await service.list(new ListExpensesDto(), account);
    const where = prisma.fin_expenses.findMany.mock.calls[0][0].where;
    expect(where.AND).not.toContainEqual({ branch_id: 3, expense_date: localDateString() });
  });
});
