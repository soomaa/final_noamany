import { ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';

describe('ReportsService HR scope and sensitivity', () => {
  const user = { sub: 7, level: 2, employeeId: 17, employeeCode: 4401 } as never;
  const query = { page: 1, pageSize: 25, skip: 0, take: 25 } as never;

  function makeService(canViewPayroll = false) {
    const prisma = {
      employees: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 17, emp_code: 4401 }])
          .mockResolvedValueOnce([
            { id: 17, employee: 'ذاتي', emp_code: 4401, edara_n: 'HR' },
          ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const scope = { employeeWhere: jest.fn().mockResolvedValue({ id: 17 }) };
    const permissions = { canAny: jest.fn().mockResolvedValue(canViewPayroll) };
    return {
      service: new ReportsService(prisma as never, scope as never, permissions as never),
      prisma,
    };
  }

  it('adds the caller employee predicate before loading report rows', async () => {
    const { service, prisma } = makeService();

    await service.run('employees-list', query, user);

    expect(prisma.employees.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          AND: [{ OR: [{ leave_emp: null }, { leave_emp: 0 }] }, { id: 17 }],
        },
      }),
    );
    expect(prisma.employees.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 0, take: 25 }),
    );
    expect(prisma.employees.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ OR: [{ leave_emp: null }, { leave_emp: 0 }] }, { id: 17 }],
        },
      }),
    );
  });

  it('requires payroll permission in addition to reports hub permission', async () => {
    const { service } = makeService(false);

    await expect(service.run('payroll-sheet', query, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
