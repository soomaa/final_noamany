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
      club_members: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
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

  it("finds a gym member by exact member code inside the cafe branch", async () => {
    const { service, prisma, branchScope } = buildService();
    prisma.club_members.findFirst.mockResolvedValue({
      id: 18,
      member_code: "ONE-0018",
      name: "مريم أحمد",
      phone: "01012345678",
      card_number: "998877",
      is_active: true,
    });

    const result = await service.customerMemberLookup(7, "  ONE-0018  ", {
      sub: 4,
      branch: 7,
    } as never);

    expect(branchScope.isBranchAllowed).toHaveBeenCalledWith(
      expect.anything(),
      7,
    );
    expect(prisma.club_members.findFirst).toHaveBeenCalledWith({
      where: {
        branch_id: 7,
        is_deleted: false,
        OR: [{ member_code: "ONE-0018" }, { card_number: "ONE-0018" }],
      },
      select: {
        id: true,
        member_code: true,
        name: true,
        phone: true,
        card_number: true,
        is_active: true,
      },
    });
    expect(result).toEqual({
      found: true,
      member: {
        id: 18,
        memberCode: "ONE-0018",
        name: "مريم أحمد",
        phone: "01012345678",
        cardNumber: "998877",
        isActive: true,
      },
    });
  });

  it("supports an exact membership card scan and returns a safe not-found result", async () => {
    const { service, prisma } = buildService();
    prisma.club_members.findFirst
      .mockResolvedValueOnce({
        id: 21,
        member_code: "ONE-0021",
        name: "سارة علي",
        phone: null,
        card_number: "CARD-21",
        is_active: false,
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.customerMemberLookup(7, "CARD-21", {
        sub: 4,
        branch: 7,
      } as never),
    ).resolves.toEqual({
      found: true,
      member: expect.objectContaining({
        memberCode: "ONE-0021",
        cardNumber: "CARD-21",
        isActive: false,
      }),
    });

    await expect(
      service.customerMemberLookup(7, "UNKNOWN", {
        sub: 4,
        branch: 7,
      } as never),
    ).resolves.toEqual({ found: false, member: null });
  });

  it("does not query membership data when the user cannot access the branch", async () => {
    const { service, prisma, branchScope } = buildService();
    branchScope.isBranchAllowed.mockReturnValue(false);

    await expect(
      service.customerMemberLookup(9, "ONE-0018", {
        sub: 4,
        branch: 7,
      } as never),
    ).rejects.toThrow("لا تملك صلاحية الوصول لبيانات هذا الفرع");
    expect(prisma.club_members.findFirst).not.toHaveBeenCalled();
  });

  it("returns only the three closest gym members with exact and prefix codes first", async () => {
    const { service, prisma } = buildService();
    prisma.club_members.findMany.mockResolvedValue([
      { id: 1, member_code: "X-120-X", name: "نتيجة جزئية", phone: null, card_number: null, is_active: true },
      { id: 2, member_code: "120", name: "نتيجة مطابقة", phone: "01000000002", card_number: null, is_active: true },
      { id: 3, member_code: "120-ABC", name: "بداية الكود", phone: "01000000003", card_number: null, is_active: true },
      { id: 4, member_code: "M-4", name: "مطابقة البطاقة", phone: null, card_number: "120", is_active: false },
      { id: 5, member_code: "M-5", name: "نتيجة رابعة", phone: null, card_number: "X-120", is_active: true },
    ]);

    const result = await service.customerMemberSearch(7, " 120 ", {
      sub: 4,
      branch: 7,
    } as never);

    expect(prisma.club_members.findMany).toHaveBeenCalledWith({
      where: {
        branch_id: 7,
        is_deleted: false,
        OR: [
          { member_code: { contains: "120" } },
          { card_number: { contains: "120" } },
          { name: { contains: "120" } },
          { phone: { contains: "120" } },
        ],
      },
      select: {
        id: true,
        member_code: true,
        name: true,
        phone: true,
        card_number: true,
        is_active: true,
      },
      take: 12,
    });
    expect(result.results).toHaveLength(3);
    expect(result.results.map((member) => member.memberCode)).toEqual([
      "120",
      "M-4",
      "120-ABC",
    ]);
  });

  it("does not search gym members for a one-character query or an inaccessible branch", async () => {
    const { service, prisma, branchScope } = buildService();

    await expect(
      service.customerMemberSearch(7, "1", { sub: 4, branch: 7 } as never),
    ).resolves.toEqual({ results: [] });
    expect(prisma.club_members.findMany).not.toHaveBeenCalled();

    branchScope.isBranchAllowed.mockReturnValue(false);
    await expect(
      service.customerMemberSearch(9, "120", { sub: 4, branch: 7 } as never),
    ).rejects.toThrow("لا تملك صلاحية الوصول لبيانات هذا الفرع");
    expect(prisma.club_members.findMany).not.toHaveBeenCalled();
  });
});

