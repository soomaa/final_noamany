import { BadRequestException } from '@nestjs/common';
import { LeavesService } from './leaves.service';

describe('LeavesService create integrity', () => {
  function makeService() {
    const tx = {
      document_number_series: {
        upsert: jest.fn()
          .mockResolvedValueOnce({ next_value: 2n })
          .mockResolvedValueOnce({ next_value: 101n }),
      },
      contract_employe: { findFirst: jest.fn().mockResolvedValue({
        year_vacation_num: '24',
        vacation_previous_balance: 0,
        vacation_start_m: '2026-01-01',
      }) },
      hr_all_agzat_orders: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn()
          .mockResolvedValueOnce({ _sum: { num_days: 0 } })
          .mockResolvedValueOnce({ _max: { agaza_rkm: 99 } }),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 81, ...data })),
      },
      hr_all_agzat_history: { create: jest.fn() },
    };
    const employee = {
      id: 17,
      emp_code: 4401,
      employee: 'موظف',
      start_work_date_m: '2020-01-01',
      edara_id: 3,
      edara_n: 'إدارة',
      qsm_id: 4,
      qsm_n: 'قسم',
      manger: '5500',
    };
    const prisma = {
      holiday_setting: { findUnique: jest.fn().mockResolvedValue({ id: 1, min_days: 1, max_days: 30 }) },
      employees: {
        findUnique: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.id === 17 ? employee : null)),
        findFirst: jest.fn().mockResolvedValue({ id: 22, emp_code: 5500, employee: 'مدير' }),
      },
      contract_employe: tx.contract_employe,
      hr_all_agzat_orders: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { num_days: 0 } }),
      },
      users: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({ user_id: where.emp_code === 22 ? 9 : 7 })),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return { service: new LeavesService(prisma as never), prisma, tx };
  }

  it('rejects a client day total that disagrees with the selected dates', async () => {
    const { service } = makeService();
    await expect(service.create({
      leaveTypeId: 1,
      empId: 17,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      numDays: 2,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses start-date period, real department data, and employee-id based user links', async () => {
    const { service, prisma, tx } = makeService();
    await service.create({
      leaveTypeId: 1,
      empId: 17,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
    }, 7, 'موظف');

    expect(prisma.users.findFirst).toHaveBeenCalledWith({ where: { emp_code: 22 } });
    expect(prisma.users.findFirst).toHaveBeenCalledWith({ where: { emp_code: 17 } });
    expect(tx.hr_all_agzat_orders.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agaza_rkm: 100,
        num_days: 3,
        qsm_id_fk: 4,
        qsm_n: 'قسم',
        month: 8,
        year: 2026,
      }),
    });
    expect(tx.hr_all_agzat_history.create).toHaveBeenCalledTimes(1);
  });
});
