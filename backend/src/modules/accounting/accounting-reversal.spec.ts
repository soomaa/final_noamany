import { BadRequestException } from "@nestjs/common";
import { AccountingReportsService } from "./accounting-reports.service";
import { LedgerService } from "./ledger.service";
import { ModuleLedgerService } from "./module-ledger.service";
import { RevenuesService } from "../finance/revenues.service";

describe("accounting reversal integrity", () => {
  it("fully reverses partner revenue, receivable and stock cost", async () => {
    const ledger = { postEntry: jest.fn().mockResolvedValue({}) };
    const service = new ModuleLedgerService(
      ledger as never,
      { ensureSeeded: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.postQuickSaleRefund({
      saleNumber: "QS-PARTNER-1",
      branchId: 1,
      saleDate: "2026-07-22",
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
      collectedAmount: 0,
      paymentMethod: "cash" as never,
      payments: [],
      returnedCogsAmount: 10,
      wasteCogsAmount: 5,
      operationType: "refund",
      saleType: "partner",
      createdBy: 1,
    });

    const entry = ledger.postEntry.mock.calls[0][0];
    expect(entry.sourceDocType).toBe("quick_sale_refund");
    expect(entry.lines).toEqual(
      expect.arrayContaining([
        { accountCode: "sales_revenue", debit: 100, credit: 0 },
        { accountCode: "accounts_receivable", debit: 0, credit: 100 },
        { accountCode: "inventory", debit: 10, credit: 0 },
        { accountCode: "operating_expense", debit: 5, credit: 0 },
      ]),
    );
    expect(
      entry.lines.reduce(
        (sum: number, line: { debit: number }) => sum + line.debit,
        0,
      ),
    ).toBe(
      entry.lines.reduce(
        (sum: number, line: { credit: number }) => sum + line.credit,
        0,
      ),
    );
  });

  it("keeps reversed originals and reversing entries in report totals", async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { debit: 100, credit: 100 },
    });
    const prisma = {
      acc_accounts: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            code: "1.01",
            name: "الصندوق",
            account_type: "asset",
            normal_balance: "debit",
          },
        ]),
      },
      acc_journal_entry_lines: { aggregate },
    };
    const service = new AccountingReportsService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
    );

    const result = await service.trialBalance({});

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entry: expect.objectContaining({
            status: { in: ["posted", "reversed"] },
          }),
        }),
      }),
    );
    expect(result.summary).toEqual({
      totalDebit: 100,
      totalCredit: 100,
      difference: 0,
      isBalanced: true,
    });
  });

  it("classifies cash flow from the non-cash counterpart account", async () => {
    const prisma = {
      acc_default_accounts: {
        findMany: jest.fn().mockResolvedValue([{ account_code: "1.01.001" }]),
      },
      acc_accounts: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, code: "1.01.001" }]),
      },
      acc_journal_entries: {
        findMany: jest.fn().mockResolvedValue([
          {
            lines: [
              {
                account_id: 1,
                debit: 0,
                credit: 100,
                account: { code: "1.01.001" },
              },
              {
                account_id: 2,
                debit: 100,
                credit: 0,
                account: { code: "1.02.003" },
              },
            ],
          },
        ]),
      },
    };
    const service = new AccountingReportsService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
    );

    const result = await service.cashFlow({});

    expect(result.investing).toEqual({ inflow: 0, outflow: 100, net: -100 });
    expect(result.operating.net).toBe(0);
    expect(result.netChange).toBe(-100);
  });

  it("limits income statement totals to the requested period", async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { debit: 0, credit: 80 },
    });
    const prisma = {
      acc_accounts: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          where.account_type.in.includes("revenue")
            ? [
                {
                  id: 4,
                  code: "4.01",
                  name: "إيرادات",
                  account_type: "revenue",
                  normal_balance: "credit",
                },
              ]
            : [],
        ),
      },
      acc_journal_entry_lines: { aggregate },
    };
    const service = new AccountingReportsService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
    );

    const result = await service.incomeStatement({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entry: expect.objectContaining({
            date: { gte: "2026-01-01", lte: "2026-12-31" },
          }),
        }),
      }),
    );
    expect(result.revenue.total).toBe(80);
  });

  it("does not count reversal journal rows as extra finance documents", async () => {
    const prisma = {
      acc_journal_entry_lines: {
        findMany: jest.fn().mockResolvedValue([
          {
            debit: 0,
            credit: 20,
            account: {
              id: 4,
              code: "4.02",
              name: "مبيعات",
              account_type: "revenue",
            },
            entry: {
              id: 1,
              date: "2026-07-01",
              status: "reversed",
              reverses_id: null,
            },
          },
          {
            debit: 20,
            credit: 0,
            account: {
              id: 4,
              code: "4.02",
              name: "مبيعات",
              account_type: "revenue",
            },
            entry: {
              id: 2,
              date: "2026-07-01",
              status: "posted",
              reverses_id: 1,
            },
          },
          {
            debit: 0,
            credit: 50,
            account: {
              id: 4,
              code: "4.02",
              name: "مبيعات",
              account_type: "revenue",
            },
            entry: {
              id: 3,
              date: "2026-07-02",
              status: "posted",
              reverses_id: null,
            },
          },
        ]),
      },
    };
    const service = new AccountingReportsService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue(null) } as never,
    );

    const result = await service.profitLossActivity({});

    expect(result.totalRevenue).toBe(50);
    expect(result.revenueCount).toBe(1);
    expect(result.revenueByAccount[0]?.count).toBe(1);
  });

  it("creates a new source version after the prior entry was reversed", async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      id: 2,
      entry_no: data.entry_no,
      date: data.date,
      status: data.status,
      total_debit: data.total_debit,
      total_credit: data.total_credit,
    }));
    const prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      acc_journal_entries: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { source_version: 1 } }),
        count: jest.fn().mockResolvedValue(1),
        create,
      },
      acc_accounting_periods: {
        findMany: jest.fn().mockResolvedValue([{ status: "open" }]),
      },
      acc_default_accounts: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ account_code: "1.01" })
          .mockResolvedValueOnce({ account_code: "4.01" }),
      },
      acc_accounts: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 11 })
          .mockResolvedValueOnce({ id: 41 }),
      },
    };
    const service = new LedgerService(prisma as never);

    await service.postEntry({
      sourceModule: "finance",
      sourceDocType: "revenue",
      sourceDocId: "REV-1",
      date: "2026-07-21",
      description: "corrected revenue",
      lines: [
        { accountCode: "cash", debit: 50, credit: 0 },
        { accountCode: "other_revenue", debit: 0, credit: 50 },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source_version: 2 }),
      }),
    );
  });

  it("posts paid bookings under a stable sales-ledger source key", async () => {
    const ledger = { postEntry: jest.fn().mockResolvedValue({}) };
    const service = new ModuleLedgerService(
      ledger as never,
      { ensureSeeded: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.postBookingRevenue({
      bookingNumber: "BK-2026-000001",
      branchId: 1,
      bookingDate: "2026-07-21",
      amount: 125,
      createdBy: 3,
      paymentMethod: "نقدي",
    });

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceModule: "sales",
        sourceDocType: "booking",
        sourceDocId: "BK-2026-000001",
        lines: [
          expect.objectContaining({ debit: 125, credit: 0 }),
          expect.objectContaining({ debit: 0, credit: 125 }),
        ],
      }),
      undefined,
    );
  });

  it("posts balanced payroll accrual and bank settlement entries", async () => {
    const ledger = { postEntry: jest.fn().mockResolvedValue({}) };
    const service = new ModuleLedgerService(
      ledger as never,
      { ensureSeeded: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.postPayrollAccrual({
      payrollNumber: 12,
      branchId: 2,
      date: "2026-07-21",
      grossEarnings: 1000,
      netPay: 800,
      employeeInsurance: 100,
      employerInsurance: 50,
      loanDeductions: 50,
      nonLiabilityDeductions: 50,
      createdBy: 3,
    });
    await service.postPayrollPayment({
      payrollNumber: 12,
      branchId: 2,
      date: "2026-07-21",
      netPay: 800,
      createdBy: 3,
    });

    expect(ledger.postEntry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sourceModule: "payroll",
        sourceDocType: "payroll_accrual",
        sourceDocId: "12:branch:2",
        lines: [
          { accountCode: "salary_expense", debit: 1050, credit: 0 },
          { accountCode: "salary_expense", debit: 0, credit: 50 },
          { accountCode: "social_insurance_payable", debit: 0, credit: 150 },
          { accountCode: "employee_advances", debit: 0, credit: 50 },
          { accountCode: "salaries_payable", debit: 0, credit: 800 },
        ],
      }),
      undefined,
    );
    expect(ledger.postEntry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceModule: "payroll",
        sourceDocType: "payroll_payment",
        sourceDocId: "12:branch:2",
        lines: [
          { accountCode: "salaries_payable", debit: 800, credit: 0 },
          { accountCode: "bank", debit: 0, credit: 800 },
        ],
      }),
      undefined,
    );
  });

  it("posts opening stock to equity and internal consumption to expense", async () => {
    const ledger = { postEntry: jest.fn().mockResolvedValue({}) };
    const service = new ModuleLedgerService(
      ledger as never,
      { ensureSeeded: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.postOpeningStock({
      openingStockId: 4,
      branchId: 1,
      date: "2026-07-21",
      amount: 300,
      itemName: "مياه",
      createdBy: 3,
    });
    await service.postInventoryConsumption({
      transactionId: 8,
      reference: "GYM-ISSUE-8",
      branchId: 1,
      date: "2026-07-21",
      amount: 40,
      kind: "issue",
      createdBy: 3,
    });

    expect(ledger.postEntry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sourceModule: "inventory",
        sourceDocType: "opening_stock",
        lines: [
          { accountCode: "inventory", debit: 300, credit: 0 },
          { accountCode: "opening_balance_equity", debit: 0, credit: 300 },
        ],
      }),
      undefined,
    );
    expect(ledger.postEntry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceModule: "inventory",
        sourceDocType: "internal_issue",
        lines: [
          { accountCode: "operating_expense", debit: 40, credit: 0 },
          { accountCode: "inventory", debit: 0, credit: 40 },
        ],
      }),
      undefined,
    );
  });

  it("returns ready stock and reclassifies prepared cost as waste on a refund", async () => {
    const ledger = { postEntry: jest.fn().mockResolvedValue({}) };
    const service = new ModuleLedgerService(
      ledger as never,
      { ensureSeeded: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.postQuickSaleRefund({
      saleNumber: "QS-20260722-1-0001",
      branchId: 1,
      saleDate: "2026-07-22",
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
      collectedAmount: 100,
      paymentMethod: "cash" as never,
      payments: [{ method: "cash" as never, amount: 100 }],
      returnedCogsAmount: 12,
      wasteCogsAmount: 8,
      operationType: "refund",
      saleType: "customer",
      createdBy: 3,
    });

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDocType: "quick_sale_refund",
        lines: expect.arrayContaining([
          { accountCode: "inventory", debit: 12, credit: 0 },
          { accountCode: "cost_of_goods_sold", debit: 0, credit: 12 },
          { accountCode: "operating_expense", debit: 8, credit: 0 },
          { accountCode: "cost_of_goods_sold", debit: 0, credit: 8 },
        ]),
      }),
      undefined,
    );
  });

  it("fully returns cost on cancellation without creating waste", async () => {
    const ledger = { postEntry: jest.fn().mockResolvedValue({}) };
    const service = new ModuleLedgerService(
      ledger as never,
      { ensureSeeded: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.postQuickSaleRefund({
      saleNumber: "QS-20260722-1-0002",
      branchId: 1,
      saleDate: "2026-07-22",
      subtotal: 50,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 50,
      collectedAmount: 50,
      paymentMethod: "cash" as never,
      payments: [{ method: "cash" as never, amount: 50 }],
      returnedCogsAmount: 20,
      wasteCogsAmount: 0,
      operationType: "cancel",
      saleType: "customer",
      createdBy: 3,
    });

    const entry = ledger.postEntry.mock.calls[0][0];
    expect(entry.sourceDocType).toBe("quick_sale_cancel");
    expect(entry.lines).toContainEqual({
      accountCode: "inventory",
      debit: 20,
      credit: 0,
    });
    expect(entry.lines).not.toContainEqual(
      expect.objectContaining({
        accountCode: "operating_expense",
        debit: expect.any(Number),
      }),
    );
  });

  it("reverses a manual paid revenue before soft deletion", async () => {
    const revenue = {
      id: 7,
      revenue_number: "REV-7",
      revenue_date: "2026-07-21",
      net_amount: 75,
      payment_method: "نقدي",
      description: null,
      branch_id: 1,
      created_by: 3,
      source_module: null,
    };
    const tx = {
      acc_journal_entries: {
        findFirst: jest.fn().mockResolvedValue({ id: 9 }),
      },
      fin_revenues: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      fin_revenues: { findFirst: jest.fn().mockResolvedValue(revenue) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const moduleLedger = {
      syncOtherRevenue: jest.fn().mockResolvedValue(undefined),
    };
    const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    const service = new RevenuesService(
      prisma as never,
      moduleLedger as never,
      branchScope as never,
    );

    await service.remove(7, 3, { sub: 3 } as never);

    expect(moduleLedger.syncOtherRevenue).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: "REV-7",
        createdBy: 3,
        post: false,
      }),
      tx,
    );
    expect(tx.fin_revenues.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { is_deleted: true, deleted_at: expect.any(Date) },
    });
  });

  it("blocks deletion of synchronized operational revenue", async () => {
    const prisma = {
      fin_revenues: {
        findFirst: jest.fn().mockResolvedValue({
          id: 8,
          branch_id: 1,
          created_by: 3,
          source_module: "club_receipt",
        }),
      },
    };
    const service = new RevenuesService(
      prisma as never,
      {} as never,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as never,
    );

    await expect(
      service.remove(8, 3, { sub: 3 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
