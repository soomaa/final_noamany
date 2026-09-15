import { LoansService } from './loans.service';

describe('LoansService legacy add workflow', () => {
  const employee = {
    id: 7,
    emp_code: 1007,
    employee: 'موظف اختبار',
    edara_id: 2,
    edara_n: 'الإدارة',
    qsm_id: 3,
    qsm_n: 'القسم',
    mosma_wazefy_n: 'المسمى',
    branch_id_fk: 1,
  };

  function setup() {
    const tx = {
      hr_solaf: {
        aggregate: jest.fn().mockResolvedValue({ _max: { t_rkm: 9 } }),
        create: jest.fn().mockResolvedValue({ id: 42, t_rkm: 10 }),
      },
      hr_solaf_quest: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      hr_solaf: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        count: jest.fn().mockResolvedValue(0),
      },
      hr_solaf_main_setting: {
        findFirst: jest.fn().mockResolvedValue({
          aqsa_moda_sadad: 18,
          had_adna: 20,
          rateb_asasy: 1,
          bdl_sakn: 1,
          bdl_mowaslat: 1,
          bdl_jwal: 0,
          bdl_amal: 1,
          bdl_taklef: 1,
          bdl_ma3esha: 1,
        }),
      },
      hr_finance_employes: { groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const ledger = {
      ensureChart: jest.fn().mockResolvedValue(undefined),
      postEmployeeLoanDisbursement: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new LoansService(prisma as never, ledger as never), prisma, ledger, tx };
  }

  it('saves a one-time payroll deduction as approved with one generated installment', async () => {
    const { service, ledger, tx } = setup();

    const result = await service.create({
      empId: 7,
      amount: 900,
      installments: 12,
      sadadSolfa: 2,
      requestDate: '2026-08-11',
      deductionStartDate: '2026-09-01',
      reason: 'اختبار',
    }, 5);

    expect(result).toMatchObject({ id: 42, tRkm: 10, status: 'approved', installments: 1 });
    expect(tx.hr_solaf.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ suspend: 4, qst_num: 1, qemt_qst: 900, sadad_solfa: 2 }),
    }));
    expect(tx.hr_solaf_quest.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ t_rkm_fk: 10, value_of_qst: 900, paid: 'no' })],
    });
    expect(ledger.postEmployeeLoanDisbursement).toHaveBeenCalled();
  });

  it('creates the full monthly schedule in the same transaction', async () => {
    const { service, tx } = setup();

    await service.create({
      empId: 7,
      amount: 1000,
      installments: 6,
      sadadSolfa: 3,
      requestDate: '2026-08-11',
      deductionStartDate: '2026-08-11',
    }, 5);

    const payload = tx.hr_solaf_quest.createMany.mock.calls[0][0];
    expect(payload.data).toHaveLength(6);
    expect(payload.data.reduce((sum: number, row: { value_of_qst: number }) => sum + row.value_of_qst, 0)).toBe(1000);
  });

  it('submits an employee loan as pending for the direct manager without schedule or ledger', async () => {
    const pendingEmployee = { ...employee, manger: '8', emp_type: 1 };
    const manager = { ...employee, id: 8, emp_code: 1008, employee: 'المدير المباشر' };
    const tx = {
      hr_solaf: {
        aggregate: jest.fn().mockResolvedValue({ _max: { t_rkm: 20 } }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 55, ...data })),
      },
    };
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue(pendingEmployee),
        findFirst: jest.fn().mockResolvedValue(manager),
      },
      users: { findFirst: jest.fn().mockResolvedValue({ user_id: 88, emp_code: 8 }) },
      hr_solaf: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      hr_solaf_main_setting: {
        findFirst: jest.fn().mockResolvedValue({ aqsa_moda_sadad: 18, had_adna: 0 }),
      },
      hr_finance_employes: { groupBy: jest.fn().mockResolvedValue([]) },
      tbl_sys_notifications_settings: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_notifications: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const ledger = {
      ensureChart: jest.fn(),
      postEmployeeLoanDisbursement: jest.fn(),
    };
    const service = new LoansService(prisma as never, ledger as never);

    const result = await service.mobileCreate(
      { sub: 7, emp_code: 7, name: 'موظف اختبار' } as never,
      { amount: 1200, repaymentMethod: 3, installments: 4, reason: 'ظرف شخصي' },
    );

    expect(result).toMatchObject({ id: 55, status: 'pending', currentToUserId: 88 });
    expect(tx.hr_solaf.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        suspend: 0,
        current_to_user_id: 88,
        action_direct_manager: 0,
        qst_num: 4,
      }),
    }));
    expect(ledger.ensureChart).not.toHaveBeenCalled();
    expect(ledger.postEmployeeLoanDisbursement).not.toHaveBeenCalled();
    expect(prisma.employees.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 8 }, { emp_code: 8 }] },
      select: { id: true, emp_code: true, employee: true },
    });
  });

  it('routes an employee loan without a direct manager straight to the HR recipient', async () => {
    const employeeWithoutManager = { ...employee, manger: null, emp_type: 1 };
    const tx = {
      hr_solaf: {
        aggregate: jest.fn().mockResolvedValue({ _max: { t_rkm: 20 } }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 56, ...data })),
      },
    };
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue(employeeWithoutManager) },
      users: { findFirst: jest.fn().mockResolvedValue({ user_id: 244, emp_code: 44 }) },
      hr_egraat_emp_setting: {
        findFirst: jest.fn().mockResolvedValue({ person_id: 44, person_name: 'مسؤول الموارد البشرية' }),
      },
      hr_solaf: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      hr_solaf_main_setting: {
        findFirst: jest.fn().mockResolvedValue({ aqsa_moda_sadad: 18, had_adna: 0 }),
      },
      hr_finance_employes: { groupBy: jest.fn().mockResolvedValue([]) },
      tbl_sys_notifications_settings: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_notifications: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new LoansService(prisma as never, { ensureChart: jest.fn(), postEmployeeLoanDisbursement: jest.fn() } as never);

    await expect(service.mobileCreate(
      { sub: 7, emp_code: 7, name: 'موظف اختبار' } as never,
      { amount: 1200, repaymentMethod: 3, installments: 4, reason: 'ظرف شخصي' },
    )).resolves.toMatchObject({ id: 56, status: 'pending', currentToUserId: 244 });

    expect(tx.hr_solaf.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        current_to_user_id: 244,
        current_to_user_name: 'مسؤول الموارد البشرية',
        action_direct_manager: 1,
        action_mowazf_moktas: 1,
        action_moder_hr: 0,
        talab_in_title: 'مسؤول الموارد البشرية',
      }),
    }));
    expect(prisma.hr_egraat_emp_setting.findFirst).toHaveBeenCalledWith({
      where: { job_title_code_fk: 44, person_suspend: 1 },
    });
  });

  it('shows only actionable pending loans in the incoming tab', async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      hr_solaf: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new LoansService(prisma as never, {} as never);

    await service.mobileList({ sub: 77, emp_code: 7 } as never, { page: 1, perPage: 20, mode: 'wared' });

    expect(prisma.hr_solaf.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { current_to_user_id: 77, suspend: { in: [0, 1] } },
    }));
  });

  it('creates installments and the accounting entry only at final mobile approval', async () => {
    const loan = {
      id: 55,
      t_rkm: 21,
      t_rkm_date_m: '2026-08-12',
      emp_id_fk: 7,
      emp_code_fk: 1007,
      emp_name: 'موظف اختبار',
      qemt_solaf: 1200,
      qst_num: 4,
      khsm_form_date_m: '2026-09-01',
      suspend: 1,
      publisher: 7,
      current_to_user_id: 25,
      action_direct_manager: 1,
      action_mowazf_moktas: 1,
      action_moder_hr: 1,
      action_moder_final: 0,
    };
    const tx = {
      hr_solaf_quest: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
      hr_solaf: { update: jest.fn().mockResolvedValue({ ...loan, suspend: 4 }) },
    };
    const prisma = {
      hr_solaf: { findUnique: jest.fn().mockResolvedValue(loan) },
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      tbl_sys_notifications_settings: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_notifications: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const ledger = {
      ensureChart: jest.fn().mockResolvedValue(undefined),
      postEmployeeLoanDisbursement: jest.fn().mockResolvedValue(undefined),
    };
    const service = new LoansService(prisma as never, ledger as never);

    await expect(service.mobileAction(
      { sub: 25, emp_code: 25, name: 'المدير العام' } as never,
      55,
      { action: 'accept' },
    )).resolves.toMatchObject({ id: 55, status: 'approved', suspend: 4 });

    expect(tx.hr_solaf_quest.createMany.mock.calls[0][0].data).toHaveLength(4);
    expect(tx.hr_solaf.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action_moder_final: 1, suspend: 4 }),
    }));
    expect(ledger.postEmployeeLoanDisbursement).toHaveBeenCalledTimes(1);
  });
});
