import { LeavesService } from "./leaves.service";

describe("LeavesService employee hydration", () => {
  it("loads only workflow-safe employee columns when creating a leave", async () => {
    const employeeFindUnique = jest.fn().mockResolvedValue({
      id: 25,
      emp_code: 25,
      employee: "موظف",
      manger: null,
      start_work_date_m: null,
    });
    const prisma: any = {
      holiday_setting: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, agaza_ttype: 2 }),
      },
      employees: { findUnique: employeeFindUnique, findFirst: jest.fn() },
      hr_all_agzat_orders: {
        findMany: jest
          .fn()
          .mockRejectedValue(new Error("stop after employee lookup")),
      },
    };
    const service = new LeavesService(prisma);

    await expect(
      service.create({
        empId: 25,
        leaveTypeId: 9,
        startDate: "2026-10-01",
        endDate: "2026-10-01",
      }),
    ).rejects.toThrow("stop after employee lookup");

    expect(employeeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 25 },
        select: expect.objectContaining({
          id: true,
          emp_code: true,
          employee: true,
          manger: true,
          start_work_date_m: true,
        }),
      }),
    );
  });

  it("loads only workflow-safe employee columns while acting on a leave", async () => {
    const employeeFindUnique = jest
      .fn()
      .mockResolvedValue({ id: 25, emp_type: null, edara_id: null });
    const prisma: any = {
      hr_all_agzat_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 18,
          current_to_user_id: 1,
          actions_sends: "approve_hr",
          publisher: 1,
          emp_id_fk: 25,
          agaza_rkm: 18,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      employees: { findUnique: employeeFindUnique },
      users: { findUnique: jest.fn().mockResolvedValue(null) },
      hr_all_agzat_history: {
        aggregate: jest.fn().mockResolvedValue({ _max: { id: 10 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new LeavesService(prisma);

    await expect(
      service.action(18, { action: "accept" }, 1, "مدير"),
    ).resolves.toMatchObject({ id: 18 });

    expect(employeeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 25 },
        select: expect.objectContaining({
          id: true,
          emp_type: true,
          edara_id: true,
        }),
      }),
    );
  });
});

describe("LeavesService update", () => {
  const prisma = {
    hr_all_agzat_orders: { findUnique: jest.fn(), update: jest.fn() },
  };
  const service = new LeavesService(prisma as never) as unknown as {
    update: (
      id: number,
      body: {
        startDate: string;
        endDate: string;
        returnToWorkDate: string;
        reason: string;
        addressSinceAgaza: string;
      },
      actor: { sub: number; level: number },
    ) => Promise<{ id: number }>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.hr_all_agzat_orders.findUnique.mockResolvedValue({
      id: 44,
      publisher: 17,
      suspend: 0,
      agaza_from_date_m: "2026-08-30",
      agaza_to_date_m: "2026-08-31",
      mobashret_amal_date_m: "2026-09-01",
    });
    prisma.hr_all_agzat_orders.update.mockResolvedValue({ id: 44 });
  });

  it("updates an unreviewed owner request and recalculates its inclusive day count", async () => {
    await expect(
      service.update(
        44,
        {
          startDate: "2026-09-02",
          endDate: "2026-09-04",
          returnToWorkDate: "2026-09-05",
          reason: "ظرف عائلي",
          addressSinceAgaza: "القاهرة",
        },
        { sub: 17, level: 2 },
      ),
    ).resolves.toEqual({ id: 44 });

    expect(prisma.hr_all_agzat_orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 44 },
        data: expect.objectContaining({
          agaza_from_date_m: "2026-09-02",
          agaza_to_date_m: "2026-09-04",
          mobashret_amal_date_m: "2026-09-05",
          num_days: 3,
          reason: "ظرف عائلي",
          address_since_agaza: "القاهرة",
        }),
      }),
    );
  });
});
