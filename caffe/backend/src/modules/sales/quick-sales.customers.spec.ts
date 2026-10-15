import { QuickSalesService } from "./quick-sales.service";
import { ListCafeCustomersDto } from "./dto/quick-sales.dto";

describe("QuickSalesService customer management", () => {
  function buildService() {
    const prisma = {
      sales_quick_sales: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      employees: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    const service = new QuickSalesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      branchScope as never,
      {} as never,
    );
    return { service, prisma, branchScope };
  }

  it("ranks customers by spending inside the requested branch", async () => {
    const { service, prisma, branchScope } = buildService();
    prisma.sales_quick_sales.groupBy.mockResolvedValue([
      {
        customer_phone: "01000000001",
        _count: { _all: 2 },
        _sum: { total_amount: 120 },
        _min: { sale_date: "2026-08-01" },
        _max: { sale_date: "2026-08-10" },
      },
      {
        customer_phone: "01000000002",
        _count: { _all: 1 },
        _sum: { total_amount: 250 },
        _min: { sale_date: "2026-08-12" },
        _max: { sale_date: "2026-08-12" },
      },
    ]);
    prisma.sales_quick_sales.findMany.mockResolvedValue([
      { customer_phone: "01000000001", customer_name: "سارة" },
      { customer_phone: "01000000002", customer_name: "منى" },
    ]);

    const result = await service.customers(
      Object.assign(new ListCafeCustomersDto(), {
        branchId: 7,
        kind: "customer",
        sortBy: "spend",
      }),
      { sub: 4, branch: 7 } as never,
    );

    expect(branchScope.isBranchAllowed).toHaveBeenCalledWith(
      expect.anything(),
      7,
    );
    expect(prisma.sales_quick_sales.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branch_id: 7, sale_type: "customer" }),
      }),
    );
    expect(result.data.map((row) => row.name)).toEqual(["منى", "سارة"]);
    expect(result.data[1]).toEqual(
      expect.objectContaining({ orders: 2, averageOrder: 60 }),
    );
  });

  it("supports the employees filter and ordering by number of orders", async () => {
    const { service, prisma } = buildService();
    prisma.sales_quick_sales.groupBy.mockResolvedValue([
      {
        employee_id: 10,
        _count: { _all: 4 },
        _sum: { total_amount: 80 },
        _min: { sale_date: "2026-08-01" },
        _max: { sale_date: "2026-08-14" },
      },
    ]);
    prisma.employees.findMany.mockResolvedValue([
      { id: 10, employee: "أحمد", phone: "01000000003", emp_code: 25 },
    ]);

    const result = await service.customers(
      Object.assign(new ListCafeCustomersDto(), {
        branchId: 7,
        kind: "employee",
        sortBy: "orders",
      }),
      { sub: 4, branch: 7 } as never,
    );

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        kind: "employee",
        name: "أحمد",
        employeeCode: 25,
        orders: 4,
      }),
    );
  });

  it("finds a saved customer name by normalized phone in the same branch", async () => {
    const { service, prisma } = buildService();
    prisma.sales_quick_sales.findFirst.mockResolvedValue({
      customer_name: "ليلى",
      customer_phone: "01012345678",
    });

    const result = await service.customerLookup(7, "010 1234-5678", {
      sub: 4,
      branch: 7,
    } as never);

    expect(prisma.sales_quick_sales.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branch_id: 7,
          customer_phone: "01012345678",
        }),
      }),
    );
    expect(result).toEqual({ found: true, name: "ليلى", phone: "01012345678" });
  });
});
