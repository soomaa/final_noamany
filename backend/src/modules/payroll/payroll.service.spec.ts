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
    const service = new PayrollService(prisma as never, {} as never, {} as never);

    await expect(service.createRun({ month: 7, year: 2026 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('excludes show_in_mosayer=no employees from the salary assertion', async () => {
    const prisma = {
      employees: {
        findMany: jest.fn().mockImplementation((args: { where?: { NOT?: unknown } }) => {
          expect(args.where?.NOT).toEqual({ show_in_mosayer: 'no' });
          return Promise.resolve([
            { id: 1, emp_code: 1001, employee: 'نشط', basic_salary: 4000 },
          ]);
        }),
      },
      hr_mosayer: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never);
    await expect(service.createRun({ month: 8, year: 2026 })).rejects.toThrow('مسيرة هذا الشهر موجودة مسبقًا');
  });

  it('creates header, tax snapshot, and details in one transaction', async () => {
    const tx = {
      hr_mosayer: {
        aggregate: jest.fn().mockResolvedValue({ _max: { mosayer_rkm: 4 } }),
        create: jest.fn().mockResolvedValue({ id: 51, mosayer_rkm: 5 }),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      hr_mosayer_details: { create: jest.fn() },
      document_number_series: {
        upsert: jest.fn().mockResolvedValue({ next_value: BigInt(6) }),
      },
      payroll_period_controls: { upsert: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const prisma = {
      employees: {
        findMany: jest.fn().mockResolvedValue([
          { id: 8, emp_code: 1008, employee: 'موظف', basic_salary: 5000 },
        ]),
      },
      hr_mosayer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 51, mosayer_rkm: 5, mosayer_month: 8, mosayer_year: 2026 }),
      },
      hr_mosayer_details: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const computed = {
      empId: 8,
      empCode: 1008,
      empName: 'موظف',
      taxPolicyId: 7,
      taxPolicyVersion: 'EG@2',
      taxPolicySnapshot: { id: 7, code: 'EG', version: 2 },
      taxBreakdown: { result: { periodicTax: 300 } },
      taxableEarnings: 5000,
      incomeTax: 300,
      breakdown: {},
    };
    const engine = { computeAll: jest.fn().mockResolvedValue([computed]) };
    const service = new PayrollService(prisma as never, engine as never, {} as never);

    await service.createRun({ month: 8, year: 2026 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.hr_mosayer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mosayer_month: 8,
        mosayer_year: 2026,
        tax_policy_id: 7,
        tax_policy_version: 'EG@2',
        tax_policy_snapshot: computed.taxPolicySnapshot,
        egmali_income_tax: 300,
      }),
    });
    expect(tx.hr_mosayer_details.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        income_tax: 300,
        tax_policy_version: 'EG@2',
        calculation_snapshot: expect.objectContaining({
          schemaVersion: 1,
          employeeId: 8,
          result: expect.objectContaining({ incomeTax: 300 }),
        }),
      }),
    });
  });

  it('renders historical slips only from the immutable stored snapshot', async () => {
    const prisma = {
      hr_mosayer: { findUnique: jest.fn().mockResolvedValue({ id: 1, mosayer_rkm: 10, mosayer_month: 8, mosayer_year: 2026 }) },
      hr_mosayer_details: { findFirst: jest.fn().mockResolvedValue({
        id: 3, mosayer_rkm_fk: 10, emp_id: 8, emp_code: 1008, emp_name: 'موظف',
        mosma_wazefy_n: 'محاسب', safi: 900, khasm_takher: 30,
        calculation_snapshot: { schemaVersion: 1, breakdown: { khasmTakherAmount: 20, khasmEznAmount: 10 } },
      }) },
    };
    const engine = { computeOneById: jest.fn() };
    const service = new PayrollService(prisma as never, engine as never, {} as never);

    const slip = await service.getSlip(1, 3);

    expect(engine.computeOneById).not.toHaveBeenCalled();
    expect(slip.deductions.lateness).toBe(20);
    expect(slip.deductions.permitLateness).toBe(10);
  });

  it('reconciles against the bank adapter settlement, never a GL-derived payment', async () => {
    const prisma = {
      hr_mosayer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          mosayer_rkm: 10,
          halet_sarf: 'yes',
          file_downloded: 'bank.csv',
          tanfez_ezn_sarf: 'yes',
        }),
      },
      hr_mosayer_details: {
        findMany: jest.fn().mockResolvedValue([
          {
            emp_id: 8,
            total_esthkak: 1000,
            total_khsomat: 100,
            safi: 900,
            khasm_tamen: 0,
            income_tax: 100,
            tamin_hesa_oner: 0,
            khasm_solaf: 0,
          },
        ]),
      },
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 8, branch_id_fk: 2 }]) },
    };
    const ledger = {
      getPayrollReconciliation: jest.fn().mockResolvedValue({
        payrollGlPayable: 900,
        bankPayment: 900,
        salaryExpense: 1000,
      }),
    };
    const bank = {
      getPayrollSettlement: jest.fn().mockResolvedValue({
        status: 'partially_settled',
        settledAmount: 700,
        reference: 'BANK-7',
      }),
    };
    const service = new PayrollService(prisma as never, {} as never, ledger as never, undefined, bank as never);
    const result = await service.reconciliation(1);
    expect(ledger.getPayrollReconciliation).toHaveBeenCalledWith({ payrollNumber: 10 });
    expect('acc_default_accounts' in prisma).toBe(false);
    expect('acc_journal_entries' in prisma).toBe(false);
    expect(result.bankPayment).toBe(700);
    expect(result.bankSettlement).toEqual(expect.objectContaining({ status: 'partially_settled', reference: 'BANK-7' }));
    expect(result.differences.netVsBank).toBe(200);
    expect(result.balanced).toBe(false);
  });

  it('prepares a bank file without claiming payment or posting a payment journal', async () => {
    const tx = {
      hr_mosayer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      hr_mosayer: { findUnique: jest.fn().mockResolvedValue({ id: 1, mosayer_rkm: 10, halet_sarf: 'yes', tanfez_ezn_sarf: 'no', file_downloded: null }) },
      hr_mosayer_details: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const ledger = { postPayrollPayment: jest.fn(), ensureReady: jest.fn() };
    const service = new PayrollService(prisma as never, {} as never, ledger as never);
    const result = await service.runAction(1, 'bank');

    expect('bankFile' in result && result.bankFile).toBeDefined();
    expect(tx.hr_mosayer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ file_downloded: expect.any(String) }),
    }));
    expect(tx.hr_mosayer.updateMany.mock.calls[0][0].data.tanfez_ezn_sarf).toBeUndefined();
    expect(ledger.postPayrollPayment).not.toHaveBeenCalled();
    expect(ledger.ensureReady).not.toHaveBeenCalled();
  });

  it('neutralizes spreadsheet formulas in the bank CSV', async () => {
    const prisma = {
      hr_mosayer_details: {
        findMany: jest.fn().mockResolvedValue([
          {
            emp_code: 1,
            emp_name: '=HYPERLINK("https://bad")',
            emp_name_in_bank: null,
            bank_code: '+CMD',
            emp_bank_id_fk: null,
            emp_bank_account_num: '@SUM(1,1)',
            safi: 100,
          },
        ]),
      },
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never);
    const file = await (service as unknown as { buildBankCsv(run: unknown): Promise<{ content: string }> }).buildBankCsv({
      id: 1,
      mosayer_rkm: 9,
    });
    expect(file.content).toContain("'=HYPERLINK");
    expect(file.content).toContain("'+CMD");
    expect(file.content).toContain("'@SUM");
  });

  it.each([
    { finish_sarf_date: null, tanfez_ezn_sarf: 'no' },
    { finish_sarf_date: '2026-08-26', tanfez_ezn_sarf: 'yes' },
    { finish_sarf_date: null, tanfez_ezn_sarf: 'yes' },
  ])('refuses to unpost a bank-prepared or settled run without a bank reversal contract', async (bankState) => {
    const prisma = {
      hr_mosayer: { findUnique: jest.fn().mockResolvedValue({
        id: 1, mosayer_rkm: 10, mosayer_month: 8, mosayer_year: 2026,
        approved: 1, halet_sarf: 'yes', file_downloded: 'bank.csv', ...bankState,
      }) },
      $transaction: jest.fn(),
    };
    const ledger = { reversePayrollRun: jest.fn(), reversePayrollExpense: jest.fn() };
    const service = new PayrollService(prisma as never, {} as never, ledger as never);
    await expect(service.runAction(1, 'unpost')).rejects.toThrow('تسويتها بنكيًا');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ledger.reversePayrollRun).not.toHaveBeenCalled();
  });

  it('updates the immutable calculation snapshot atomically with slip overrides', async () => {
    const recomputed = {
      empId: 8, empCode: 1008, totalEsthkak: 1200, totalKhsomat: 200, safi: 1000,
      otherAllowances: 100, otherDeductions: 50, taxableEarnings: 1100, incomeTax: 100,
      taxPolicyId: 3, taxPolicyVersion: 'EG@3', taxPolicySnapshot: { version: 3 },
      taxBreakdown: { result: { periodicTax: 100 } }, breakdown: { workDays: 30 },
    };
    const tx = {
      hr_mosayer_details: {
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      },
      hr_mosayer: { update: jest.fn() },
    };
    const prisma = {
      hr_mosayer: { findUnique: jest.fn().mockResolvedValue({ id: 1, mosayer_rkm: 9, mosayer_month: 8, mosayer_year: 2026, taghez: 'yes' }) },
      hr_mosayer_details: { findFirst: jest.fn().mockResolvedValue({ id: 4, emp_id: 8 }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const engine = { computeOneById: jest.fn().mockResolvedValue(recomputed) };
    const service = new PayrollService(prisma as never, engine as never, {} as never);
    jest.spyOn(service, 'getSlip').mockResolvedValue({} as never);

    await service.applySlipOverrides(1, 4, { privateBonus: 100 });

    expect(tx.hr_mosayer_details.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        calculation_snapshot: expect.objectContaining({
          overrides: { privateBonus: 100 },
          result: expect.objectContaining({ netSalary: 1000, incomeTax: 100 }),
        }),
      }),
    }));
  });

  it('paginates payroll runs in the database', async () => {
    const prisma = {
      hr_mosayer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new PayrollService(prisma as never, {} as never, {} as never);
    await service.listRuns({ page: 2, pageSize: 10, skip: 10, take: 10, status: 'posted' } as never);
    expect(prisma.hr_mosayer.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(prisma.hr_mosayer.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
  });
});
