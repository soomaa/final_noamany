import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PayrollService } from './payroll.service';

describe('PayrollService salary controls', () => {
  it('blocks a payroll run while an active employee has no basic salary', async () => {
    const prisma = {
      employees: {
        findMany: jest.fn().mockResolvedValue([
          { id: 8, emp_code: 1008, employee: 'موظف بدون راتب', basic_salary: null },
        ]),
      },
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.createRun({ month: 7, year: 2026 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PayrollService pay components', () => {
  it('lists legacy deduction definitions as active deduction items', async () => {
    const prisma = {
      all_defined_setting: {
        findMany: jest.fn().mockResolvedValue([
          {
            defined_id: 17,
            defined_title: 'تأمينات',
            defined_type: 2,
            defined_type_title: 'deduction',
            in_order: '250',
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.listComponents({
      category: 'deduction',
      page: 1,
      pageSize: 25,
      skip: 0,
      take: 25,
    } as never);

    expect(prisma.all_defined_setting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ defined_type_title: 'deduction' }),
      }),
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 17,
        title: 'تأمينات',
        category: 'deduction',
        amount: 250,
        isActive: true,
      }),
    ]);
  });
});

describe('PayrollService salary increases', () => {
  it('stores the employee snapshot, date and publisher used by the legacy table', async () => {
    const created = {
      id: 9,
      emp_id_fk: 56,
      emp_code: 1056,
      emp_name: 'موظفة اختبار',
      value: 500,
      date_ar: '2026-08-12',
      date_s: '0',
      publisher: 128,
    };
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 56, emp_code: 1056, employee: 'موظفة اختبار' }),
      },
      tbl_zeyada_rateb: {
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.createSalaryIncrease(
      { employeeId: 56, value: 500, date: '2026-08-12' },
      128,
    );

    expect(prisma.tbl_zeyada_rateb.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emp_id_fk: 56,
        emp_code: 1056,
        emp_name: 'موظفة اختبار',
        value: 500,
        date_ar: '2026-08-12',
        publisher: 128,
      }),
    });
    expect(result).toEqual(expect.objectContaining({ employeeId: 56, value: 500 }));
  });
});

describe('PayrollService branch-scoped run access', () => {
  const branchUser = { sub: 50, level: 3, emp_code: 500, branch: 2, man_women_type: 3 } as never;
  const run = { id: 3, mosayer_rkm: 77, mosayer_month: 9, mosayer_year: 2026, egmali_safi: 99999 };

  function setup(line: { id: number; emp_id: number }) {
    const prisma = {
      hr_mosayer: { findUnique: jest.fn().mockResolvedValue(run) },
      hr_mosayer_details: {
        findFirst: jest.fn().mockResolvedValue(line),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _sum: { safi: 1200 } }),
        groupBy: jest.fn().mockResolvedValue([{ mosayer_rkm_fk: 77, _sum: { safi: 1200 } }]),
      },
      hr_mosayer_egraat: { findMany: jest.fn().mockResolvedValue([]) },
      // Employees of Tanta (2) and its sub-branches 5/6: ids 500 and 501.
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 500, emp_code: 1500 }, { id: 501, emp_code: 1501 }]) },
    };
    const engine = { computeOneById: jest.fn().mockResolvedValue(null) };
    const service = new PayrollService(prisma as never, engine as never, {} as never, new BranchScopeService());
    return { service, prisma };
  }

  it('forbids the slip of an employee outside the caller branches', async () => {
    const { service } = setup({ id: 40, emp_id: 900 });
    await expect(service.getSlip(3, 40, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns the slip of an in-scope employee', async () => {
    const { service } = setup({ id: 41, emp_id: 501 });
    await expect(service.getSlip(3, 41, branchUser)).resolves.toEqual(
      expect.objectContaining({ employee: expect.objectContaining({ id: 501 }) }),
    );
  });

  it('limits run lines and the run total to in-scope employees', async () => {
    const { service, prisma } = setup({ id: 41, emp_id: 501 });
    await service.listRunLines(3, { skip: 0, take: 20, page: 1, pageSize: 20 } as never, branchUser);
    expect(prisma.hr_mosayer_details.findMany.mock.calls[0][0].where).toEqual({
      mosayer_rkm_fk: 77,
      emp_id: { in: [500, 501] },
    });
    const found = await service.findRun(3, branchUser);
    expect(found.totalAmount).toBe(1200);
    expect(prisma.hr_mosayer_details.count).toHaveBeenLastCalledWith({
      where: { mosayer_rkm_fk: 77, emp_id: { in: [500, 501] } },
    });
  });
});
