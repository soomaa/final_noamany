import { LegacyMobileCompatService } from "./legacy-mobile-compat.service";

describe("LegacyMobileCompatService employee evaluations", () => {
  const employee = { id: 37, emp_code: 1037, branch_id_fk: 3 };
  const user = { sub: 39, emp_code: 37 } as never;

  it("lists only the authenticated employee evaluations with score totals", async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      employee_evaluations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 71,
            employee_id: 37,
            branch_id: 3,
            evaluation_date: new Date("2026-09-01"),
            evaluation_month: "2026-09",
            category: { name: "الانضباط" },
            details: [
              {
                max_score_snapshot: { toString: () => "10" },
                awarded_score: { toString: () => "8" },
              },
              {
                max_score_snapshot: { toString: () => "5" },
                awarded_score: { toString: () => "4" },
              },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      tbl_branches: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ branch_id: 3, branch_name: "الفرع الرئيسي" }]),
      },
    };
    const service = new LegacyMobileCompatService(prisma as never, {} as never);

    await expect(
      (service as any).myEvaluations(user, { page: 1, per_page: 20 }),
    ).resolves.toEqual({
      items: [
        {
          evaluation_id: "71",
          evaluation_date: "2026-09-01",
          evaluation_month: "2026-09",
          category_name: "الانضباط",
          branch_name: "الفرع الرئيسي",
          awarded_score: "12",
          max_score: "15",
        },
      ],
      page: 1,
      per_page: 20,
      total: 1,
    });
    expect(prisma.employee_evaluations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employee_id: 37 },
      }),
    );
  });

  it("loads evaluation details only when they belong to the authenticated employee", async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue(employee) },
      employee_evaluations: {
        findFirst: jest.fn().mockResolvedValue({
          id: 71,
          employee_id: 37,
          branch_id: 3,
          evaluation_date: new Date("2026-09-01"),
          evaluation_month: "2026-09",
          category: { name: "الانضباط" },
          details: [
            {
              id: 701,
              item_id: 11,
              item_name_snapshot: "الحضور",
              max_score_snapshot: { toString: () => "10" },
              awarded_score: { toString: () => "8" },
            },
          ],
        }),
      },
      tbl_branches: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ branch_name: "الفرع الرئيسي" }),
      },
    };
    const service = new LegacyMobileCompatService(prisma as never, {} as never);

    await expect(
      (service as any).myEvaluation(user, { evaluation_id: 71 }),
    ).resolves.toEqual({
      evaluation_id: "71",
      evaluation_date: "2026-09-01",
      evaluation_month: "2026-09",
      category_name: "الانضباط",
      branch_name: "الفرع الرئيسي",
      awarded_score: "8",
      max_score: "10",
      details: [
        {
          item_id: "11",
          item_name: "الحضور",
          max_score: "10",
          awarded_score: "8",
        },
      ],
    });
    expect(prisma.employee_evaluations.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 71, employee_id: 37 },
      }),
    );
  });
});
