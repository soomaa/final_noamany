import { BadRequestException } from "@nestjs/common";
import {
  SalesPaymentMethod,
  ShiftSessionStatus,
} from "@prisma/client";
import { ShiftSessionsService } from "./shift-sessions.service";

describe("shift session financial attribution", () => {
  it("builds a printable close report from exact payment snapshots and internal accounts", async () => {
    const prisma = {
      sales_shift_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          shift_id: 3,
          branch_id: 1,
            session_date: "2026-08-26",
          start_time: new Date("2026-08-26T08:00:00Z"),
          end_time: null,
          status: ShiftSessionStatus.open,
          opening_balance: 100,
          expected_closing_balance: 250,
          closing_balance: null,
          cash_difference: null,
          cash_drop_amount: 0,
          retained_amount: 0,
          shift: { shift_name: "الصباحية" },
        }),
      },
      sales_quick_sales: {
        findMany: jest.fn().mockResolvedValue([
          {
            sale_number: "INV-0021",
            sale_date: "2026-08-26",
            sale_time: "11:25:00",
            customer_name: "أحمد علي",
            status: "completed",
            subtotal: 145,
            total_amount: 150,
            collected_amount: 100,
            discount_amount: 10,
            tax_amount: 15,
            sale_type: "employee",
            payment_method: SalesPaymentMethod.mixed,
            items: [
              {
                item_type: "cafe",
                product_id: 11,
                cafe_product_id: 7,
                cafe_variant_id: null,
                variant_name: null,
                inventory_product_id: 11,
                name: "مياه",
                unit_price: 75,
                quantity: 2,
                line_total: 150,
              },
            ],
            payments: [
              {
                method: SalesPaymentMethod.cash,
                amount: 40,
                method_code: "cash",
                method_name: "كاش",
              },
              {
                method: SalesPaymentMethod.transfer,
                amount: 60,
                method_code: "instapay",
                method_name: "InstaPay",
              },
            ],
          },
        ]),
      },
      sales_shift_sale_adjustments: { findMany: jest.fn().mockResolvedValue([]) },
      sales_cash_drawer_transactions: { findMany: jest.fn().mockResolvedValue([]) },
      sales_billing_statements: { findMany: jest.fn().mockResolvedValue([]) },
      users: { findUnique: jest.fn().mockResolvedValue({ name: "أحمد" }) },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_name: "GC Gym" }) },
    };
    const service = new ShiftSessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.closeReport(21);

    expect(result.session).toEqual(expect.objectContaining({
      id: 21,
      shiftName: "الصباحية",
      branchName: "GC Gym",
      cashierName: "أحمد",
    }));
    expect(result.paymentMethods).toEqual([
      expect.objectContaining({ code: "cash", netAmount: 40 }),
      expect.objectContaining({ code: "instapay", netAmount: 60 }),
    ]);
    expect(result.totals).toEqual(expect.objectContaining({
      grossSales: 150,
      collected: 100,
      internalAccounts: 50,
    }));
    expect(result.invoices).toEqual([
      expect.objectContaining({
        invoiceNumber: "INV-0021",
        saleTime: "11:25:00",
        customerName: "أحمد علي",
        totalAmount: 150,
      }),
    ]);
    expect((result as typeof result & { products?: Array<Record<string, unknown>> }).products).toEqual([
      expect.objectContaining({
        name: "مياه",
        orderCount: 1,
        soldQuantity: 2,
        netQuantity: 2,
        unitPrice: 75,
        netAmount: 150,
      }),
    ]);
    expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { payments: true, items: true } }),
    );
  });

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
      sales_billing_statements: {
        findMany: jest.fn().mockResolvedValue([
          {
            total_amount: 125,
            settlement_method: 'direct_payment',
            payment_method: SalesPaymentMethod.cash,
          },
          {
            total_amount: 50,
            settlement_method: 'payroll_deduction',
            payment_method: null,
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
      totalCash: 115,
      totalCard: 0,
      totalWallet: 20,
      totalTransfer: 0,
      totalDiscount: 0,
      totalTax: 0,
      transactionsCount: 7,
    });
  });

  it("looks up the branch open shift during handover instead of requiring its owner to stay logged in", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      sales_shifts: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          branch_id: 1,
          shift_name: "المسائية",
          start_time: "16:00:00",
          end_time: "00:00:00",
          is_active: true,
        }),
      },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({ sales_shift_sessions: { findFirst } }),
      ),
    };
    const service = new ShiftSessionsService(
      prisma as never,
      {} as never,
      {
        verifyStaffCredentials: jest.fn().mockResolvedValue({ sub: 12, level: 2, branch: 1 }),
      } as never,
      { eligibleUsers: jest.fn().mockResolvedValue([{ id: 12 }]) } as never,
      {} as never,
    );

    await expect(
      service.switchShift(
        {
          targetShiftId: 2,
          branchId: 1,
          username: "next",
          password: "secret",
          closingBalance: 0,
          transferAmount: 0,
          cashDropAmount: 0,
        },
        99,
      ),
    ).rejects.toThrow("لا توجد وردية مفتوحة");

    expect(findFirst).toHaveBeenCalledWith({
      where: { branch_id: 1, status: "open" },
      include: { shift: true },
      orderBy: { id: "desc" },
    });
  });

  it("keeps the branch open shift current after midnight", async () => {
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
    );

    await service.getCurrent({ branchId: 1 });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        branch_id: 1,
        status: "open",
      },
      include: { shift: true },
      orderBy: { start_time: "desc" },
    });
  });

  it("attributes an authorized staff sale to the branch open shift even when another user opened it", async () => {
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
    );

    await expect(
      service.findBranchSessionForSale(tx as never, 1),
    ).resolves.toEqual({ id: 41 });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        branch_id: 1,
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
});
