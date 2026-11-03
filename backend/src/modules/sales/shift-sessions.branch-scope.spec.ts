import { ForbiddenException } from "@nestjs/common";
import { ShiftSessionStatus } from "@prisma/client";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { InventoryLocationService } from "../inventory/inventory-location.service";
import { PosDevicesService } from "./pos-admin/pos-devices.service";
import { ShiftSessionsService } from "./shift-sessions.service";
import { ShiftsService } from "./shifts.service";

const SHORTAGE = "اكتب سبب عجز النقدية قبل اعتماد الإغلاق";

function makeService(session: { user_id: number; branch_id: number }) {
  const prisma = {
    sales_shift_sessions: {
      findUnique: jest.fn().mockResolvedValue({
        id: 12,
        opening_balance: 100,
        status: ShiftSessionStatus.open,
        shift: { id: 2 },
        ...session,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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
  service.calculateSessionSales = jest.fn().mockResolvedValue({ totalCash: 50 });
  jest
    .spyOn(service as unknown as { drawerAdjustments: () => Promise<number> }, "drawerAdjustments")
    .mockResolvedValue(0);
  jest
    .spyOn(service as unknown as { supplierDrawerPayments: () => Promise<number> }, "supplierDrawerPayments")
    .mockResolvedValue(0);
  return { service, prisma };
}

// A counted shortage without a reason fails right after the access check, so reaching
// that error proves the caller passed branch authorization without touching the DB.
const shortClose = { closingBalance: 140, cashDropAmount: 40, retainedAmount: 100 };

describe("shift session branch isolation", () => {
  it("lets a cashier close their own session", async () => {
    const { service } = makeService({ user_id: 30, branch_id: 3 });
    await expect(
      service.close(12, shortClose, 30, false, { sub: 30, level: 2, branch: 3 } as never),
    ).rejects.toThrow(SHORTAGE);
  });

  it("rejects closing another user's session in a foreign branch", async () => {
    const { service } = makeService({ user_id: 31, branch_id: 3 });
    await expect(
      service.close(12, shortClose, 40, false, { sub: 40, level: 2, branch: 4 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets Tanta main staff close a Tanta Up (branch 5) session", async () => {
    const { service } = makeService({ user_id: 31, branch_id: 5 });
    await expect(
      service.close(12, shortClose, 40, false, { sub: 40, level: 2, branch: 2 } as never),
    ).rejects.toThrow(SHORTAGE);
  });

  it("rejects findOne for a foreign-branch session", async () => {
    const { service } = makeService({ user_id: 31, branch_id: 3 });
    await expect(
      service.findOne(12, { sub: 40, level: 2, branch: 4 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("defaults the session list to the caller's allowed branches", async () => {
    const { service, prisma } = makeService({ user_id: 31, branch_id: 2 });
    await service.list({ page: 1, pageSize: 10 } as never, { sub: 40, level: 2, branch: 2 } as never);
    expect(prisma.sales_shift_sessions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ branch_id: { in: [2, 5, 6] } }] } }),
    );
  });
});

describe("shift template branch isolation", () => {
  const make = (branchId: number | null) => {
    const prisma = {
      sales_shifts: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, branch_id: branchId, start_time: "08:00:00", end_time: "16:00:00" }),
        update: jest.fn().mockResolvedValue({ id: 4, branch_id: branchId }),
      },
    };
    return { prisma, service: new ShiftsService(prisma as never, {} as never, new BranchScopeService()) };
  };

  it("rejects deleting a foreign-branch shift", async () => {
    const { service, prisma } = make(3);
    await expect(service.remove(4, { sub: 40, level: 2, branch: 4 } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sales_shifts.update).not.toHaveBeenCalled();
  });

  it("lets Tanta main staff deactivate a Tanta Down (branch 6) shift", async () => {
    const { service, prisma } = make(6);
    await service.remove(4, { sub: 40, level: 2, branch: 2 } as never);
    expect(prisma.sales_shifts.update).toHaveBeenCalled();
  });
});

describe("POS device warehouse scope", () => {
  const warehouses: Record<number, { id: number; branch_id: number }> = {
    1009: { id: 1009, branch_id: 5 },
    77: { id: 77, branch_id: 9 },
  };
  const make = () => {
    const prisma = {
      inv_warehouses: { findFirst: jest.fn(async ({ where }: { where: { id: number } }) => warehouses[where.id] ?? null) },
      sales_pos_devices: { create: jest.fn(async ({ data }: { data: object }) => ({ id: 1, name: "POS", ...data })) },
    };
    return { prisma, service: new PosDevicesService(prisma as never, new BranchScopeService(), new InventoryLocationService(prisma as never)) };
  };

  it("lets Tanta main staff assign the Tanta Up warehouse 1009", async () => {
    const { service, prisma } = make();
    await service.create({ name: "POS", warehouseId: 1009 } as never, 40, { sub: 40, level: 2, branch: 2 } as never);
    expect(prisma.sales_pos_devices.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branch_id: 5, warehouse_id: 1009 }) }),
    );
  });

  it("rejects a warehouse of a foreign branch", async () => {
    const { service, prisma } = make();
    await expect(
      service.create({ name: "POS", warehouseId: 77 } as never, 40, { sub: 40, level: 2, branch: 2 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sales_pos_devices.create).not.toHaveBeenCalled();
  });
});
