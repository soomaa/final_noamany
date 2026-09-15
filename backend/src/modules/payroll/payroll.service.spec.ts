import { BadRequestException } from '@nestjs/common';
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
