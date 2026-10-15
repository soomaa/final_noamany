import { BadRequestException } from '@nestjs/common';
import { RequestEffectService } from './request-effect.service';

describe('RequestEffectService mandatory handlers', () => {
  const employee = {
    id: 17,
    emp_code: 4401,
    employee: 'موظف',
    leave_emp: 0,
    employee_type: 1,
    branch_id_fk: 2,
    edara_id: 3,
    edara_n: 'الإدارة',
    qsm_id: 4,
    qsm_n: 'القسم',
    mosma_wazefy_code: 5,
    mosma_wazefy_n: 'محاسب',
    basic_salary: 9000,
    manger: null,
    phone: '01000000000',
    email: 'old@example.com',
    adress: 'عنوان',
    another_phone: null,
  };

  function baseTx() {
    return {
      employees: {
        findUnique: jest.fn().mockResolvedValue(employee),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      global_settings: {
        findFirst: jest.fn().mockResolvedValue({
          institute_name: 'HR Host',
          currency: 'EGP',
          currency_symbol: 'ج.م',
        }),
      },
      hr_finance_employes: {
        findMany: jest.fn().mockResolvedValue([
          { badl_type: 1, value: 500, insurance_affect: 0 },
          { badl_type: 2, value: 100, insurance_affect: 0 },
        ]),
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 31 }),
      },
      all_defined_setting: {
        findUnique: jest.fn().mockResolvedValue({
          defined_id: 3,
          defined_type: 1,
          defined_title: 'بدل انتقال',
        }),
      },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 8 }) },
      hr_edarat_aqsam: { findUnique: jest.fn().mockResolvedValue({ id: 9, title: 'إدارة جديدة' }) },
      employees_branches: { create: jest.fn().mockResolvedValue({ id: 55 }) },
    };
  }

  const ledger = {
    ensureChart: jest.fn(),
    postEmployeeLoanDisbursement: jest.fn(),
  };
  const leaves = {
    assertLeaveAvailable: jest.fn(),
  };

  it('stores a complete immutable salary certificate snapshot', async () => {
    const tx = baseTx();
    const service = new RequestEffectService(ledger as never, leaves as never);

    const result = await service.apply(
      tx as never,
      'salary-certificate',
      1,
      17,
      4401,
      { purpose: 'جهة تمويل', directed_to: 'البنك' },
      7,
    );

    expect(result.snapshot).toMatchObject({
      employeeId: 17,
      employeeName: 'موظف',
      basicSalary: 9000,
      allowances: 500,
      deductions: 100,
      grossSalary: 9500,
      directedTo: 'البنك',
    });
    expect(result.result).toEqual({ domain: 'salary_certificate_snapshot', immutable: true });
  });

  it('creates an allowance and recomputes employee finance totals', async () => {
    const tx = baseTx();
    const service = new RequestEffectService(ledger as never, leaves as never);

    const result = await service.apply(
      tx as never,
      'allowance',
      1,
      17,
      4401,
      { allowance_type_id: 3, amount: 700, reason: 'تكليف' },
      7,
    );

    expect(tx.hr_finance_employes.updateMany).toHaveBeenCalledWith({
      where: { emp_id: 17 },
      data: expect.objectContaining({ having_all_value: 1200, discut_all_value: 100 }),
    });
    expect(result.result).toEqual({ domain: 'hr_finance_employes', id: 31 });
  });

  it('applies a validated branch/department transfer with history', async () => {
    const tx = baseTx();
    const service = new RequestEffectService(ledger as never, leaves as never);

    const result = await service.apply(
      tx as never,
      'transfer',
      1,
      17,
      4401,
      { target_branch_id: 8, target_department_id: 9, reason: 'احتياج عمل' },
      7,
    );

    expect(tx.employees.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { branch_id_fk: 8, edara_id: 9, edara_n: 'إدارة جديدة' },
    });
    expect(result.result).toMatchObject({ domain: 'employees', historyId: 55 });
  });

  it('allows only explicitly safe employee data fields', async () => {
    const tx = baseTx();
    const service = new RequestEffectService(ledger as never, leaves as never);

    await expect(
      service.apply(
        tx as never,
        'data-change',
        1,
        17,
        4401,
        { field_name: 'basic_salary', new_value: '50000' },
        7,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.employees.update).not.toHaveBeenCalled();
  });

  it('fails closed for any advertised type without an implementation', async () => {
    const service = new RequestEffectService(ledger as never, leaves as never);
    await expect(
      service.apply(baseTx() as never, 'unknown', 1, 17, 4401, {}, 7),
    ).rejects.toThrow('لا يوجد منفذ معتمد');
  });

  it('uses the canonical leave availability policy and persists derived duration fields', async () => {
    const tx = {
      ...baseTx(),
      holiday_setting: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      hr_all_agzat_orders: {
        aggregate: jest.fn().mockResolvedValue({ _max: { agaza_rkm: 12 } }),
        create: jest.fn().mockResolvedValue({ id: 88 }),
      },
      document_number_series: {
        upsert: jest.fn().mockResolvedValue({ next_value: BigInt(14) }),
      },
    };
    const service = new RequestEffectService(ledger as never, leaves as never);

    await service.apply(
      tx as never,
      'leave',
      1,
      17,
      4401,
      { date_from: '2026-08-30', date_to: '2026-09-02', leave_type_id: 1 },
      7,
    );

    expect(leaves.assertLeaveAvailable).toHaveBeenCalledWith(
      tx,
      employee,
      1,
      '2026-08-30',
      '2026-09-02',
      4,
    );
    expect(tx.hr_all_agzat_orders.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ num_days: 4, month: 8, year: 2026 }),
    });
  });
});
