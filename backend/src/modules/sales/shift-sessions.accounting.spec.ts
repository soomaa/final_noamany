import { BadRequestException } from "@nestjs/common";
import {
  SalesPaymentMethod,
  ShiftSessionStatus,
} from "@prisma/client";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { ShiftSessionsService } from "./shift-sessions.service";

describe("shift session financial attribution", () => {
  it("uses explicit session links, collected POS money and signed booking payments", async () => {
    const quickFindMany = jest.fn().mockResolvedValue([
      {
        total_amount: 100,
        collected_amount: 0,
        discount_amount: 0,
        tax_amount: 0,
        payment_method: SalesPaymentMethod.cash,
        payments: [],
      },
      {
        total_amount: 80,
        collected_amount: 80,
        discount_amount: 5,
        tax_amount: 10,
        payment_method: SalesPaymentMethod.mixed,
        payments: [
          { method: SalesPaymentMethod.cash, amount: 50 },
          { method: SalesPaymentMethod.card, amount: 30 },
        ],
      },
    ]);
    const bookingFindMany = jest.fn().mockResolvedValue([
      { kind: "payment", amount: 20, method: SalesPaymentMethod.wallet },
      { kind: "refund", amount: 10, method: SalesPaymentMethod.cash },
    ]);
    const prisma = {
      sales_quick_sales: { findMany: quickFindMany },
      sales_booking_payments: { findMany: bookingFindMany },
      sales_shift_sale_adjustments: {
        findMany: jest.fn().mockResolvedValue([
          {
            total_amount: 80,
            cash_amount: 50,
            card_amount: 30,
            wallet_amount: 0,
            transfer_amount: 0,
            discount_amount: 5,
            tax_amount: 10,
          },
        ]),
      },
    };
    const service = new ShiftSessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new BranchScopeService(),
    );

    const result = await service.calculateSessionSales({
      id: 7,
      session_date: "2026-07-22",
      branch_id: 1,
      expected_start_time: "08:00:00",
      expected_end_time: "16:00:00",
    });

    expect(quickFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shift_session_id: 7,
          status: { in: ["completed", "refunded", "cancelled"] },
        },
      }),
    );
    expect(bookingFindMany).toHaveBeenCalledWith({
      where: { shift_session_id: 7, status: "posted" },
    });
    expect(result).toEqual({
      totalSales: 110,
      totalCash: -10,
      totalCard: 0,
      totalWallet: 20,
      totalTransfer: 0,
      totalDiscount: 0,
      totalTax: 0,
      transactionsCount: 5,
    });
  });

  it("keeps the open shift current after midnight", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      sales_shift_sessions: { findFirst },
    };
    const service = new ShiftSessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new BranchScopeService(),
    );

    await service.getCurrent({ branchId: 1, userId: 9 }, { sub: 9, level: 1 } as never);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        branch_id: { in: [1] },
        user_id: 9,
        status: "open",
      },
      include: { shift: true },
      orderBy: { start_time: "desc" },
    });
  });

  it("attributes post-midnight sales to the still-open shift", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 41 });
    const tx = {
      sales_shift_sessions: { findFirst },
    };
    const service = new ShiftSessionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new BranchScopeService(),
    );

    await expect(
      service.findBranchSessionForSale(tx as never, 1, 9),
    ).resolves.toEqual({ id: 41 });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        branch_id: 1,
        user_id: 9,
        status: "open",
      },
      orderBy: { id: "desc" },
    });
  });

  it("requires a reason when the counted drawer has a shortage", async () => {
    const prisma = {
      sales_shift_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 12,
          branch_id: 1,
          opening_balance: 100,
          status: ShiftSessionStatus.open,
          shift: { id: 2 },
        }),
      },
    };
    const service = new ShiftSessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new BranchScopeService(),
    );
    service.calculateSessionSales = jest.fn().mockResolvedValue({
      totalSales: 50,
      totalCash: 50,
      totalCard: 0,
      totalWallet: 0,
      totalTransfer: 0,
      totalDiscount: 0,
      totalTax: 0,
      transactionsCount: 1,
    });
    jest
      .spyOn(service as unknown as { drawerAdjustments: () => Promise<number> }, "drawerAdjustments")
      .mockResolvedValue(0);
    jest
      .spyOn(service as unknown as { supplierDrawerPayments: () => Promise<number> }, "supplierDrawerPayments")
      .mockResolvedValue(0);

    await expect(
      service.close(
        12,
        {
          closingBalance: 140,
          cashDropAmount: 40,
          retainedAmount: 100,
        },
        1,
      ),
    ).rejects.toEqual(
      new BadRequestException("اكتب سبب عجز النقدية قبل اعتماد الإغلاق"),
    );
  });

  it("posts the counted shortage to the ledger when the shift closes", async () => {
    const open = { id: 12, branch_id: 1, opening_balance: 100, total_cash: 50, status: ShiftSessionStatus.open, shift: { id: 2 } };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      sales_shift_sessions: {
        findUnique: jest.fn().mockResolvedValue(open),
        update: jest.fn().mockResolvedValue({ ...open, status: ShiftSessionStatus.closed }),
      },
      sales_cash_drawer_transactions: { create: jest.fn() },
    };
    const prisma = {
      sales_shift_sessions: { findUnique: jest.fn().mockResolvedValue(open) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const moduleLedger = { postShiftCashDifference: jest.fn() };
    const service = new ShiftSessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      moduleLedger as never,
      new BranchScopeService(),
    );
    service.calculateSessionSales = jest.fn().mockResolvedValue({
      totalSales: 50, totalCash: 50, totalCard: 0, totalWallet: 0, totalTransfer: 0,
      totalDiscount: 0, totalTax: 0, transactionsCount: 1,
    });
    jest
      .spyOn(service as unknown as { drawerAdjustments: () => Promise<number> }, "drawerAdjustments")
      .mockResolvedValue(0);
    jest
      .spyOn(service as unknown as { supplierDrawerPayments: () => Promise<number> }, "supplierDrawerPayments")
      .mockResolvedValue(0);
    jest.spyOn(service as unknown as { mapSession: (row: unknown) => unknown }, "mapSession").mockReturnValue({});

    await service.close(12, { closingBalance: 148, cashDropAmount: 48, retainedAmount: 100, shortageReason: "فكة" }, 1);

    expect(moduleLedger.postShiftCashDifference).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 12, branchId: 1, difference: -2, createdBy: 1 }),
      tx,
    );
  });
});
