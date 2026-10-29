import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryTransactionsService } from './inventory-transactions.service';
import { StockTakingService } from './stock-taking.service';
import { ProductsService } from './products.service';
import { StockService } from './stock.service';

/** Warehouses as seeded: 1009/1010 are the Tanta Up (5) / Tanta Down (6) cafe stores. */
const WAREHOUSES: Record<number, { id: number; branch_id: number; status: string; is_deleted: boolean }> = {
  1: { id: 1, branch_id: 1, status: 'active', is_deleted: false },
  20: { id: 20, branch_id: 2, status: 'active', is_deleted: false },
  1009: { id: 1009, branch_id: 5, status: 'active', is_deleted: false },
  1010: { id: 1010, branch_id: 6, status: 'active', is_deleted: false },
  77: { id: 77, branch_id: 3, status: 'inactive', is_deleted: false },
};

const fakePrisma = () => ({
  inv_warehouses: {
    findFirst: jest.fn(async ({ where }: { where: { id: number; status?: string; is_deleted?: boolean } }) => {
      const w = WAREHOUSES[where.id];
      if (!w || w.is_deleted || (where.status && w.status !== where.status)) return null;
      return w;
    }),
    findMany: jest.fn(async () => []),
  },
});

const tantaMain = { sub: 30, level: 2, branch: 2 } as never;
const tantaUp = { sub: 31, level: 2, branch: 5 } as never;
const branchOne = { sub: 11, level: 2, branch: 1 } as never;
const admin = { sub: 1, level: 1, branch: 0 } as never;

describe('Tanta main staff operate the Up/Down warehouses', () => {
  const location = new InventoryLocationService(fakePrisma() as never);

  it('lets a Tanta main user select warehouse 1009 (Tanta Up)', async () => {
    await expect(location.resolveSelection(tantaMain, 1009)).resolves.toEqual({ warehouseId: 1009, branchId: 5 });
    await expect(location.resolveSelection(tantaMain, 1010, 6)).resolves.toEqual({ warehouseId: 1010, branchId: 6 });
  });

  it('keeps a Tanta Up user out of Tanta Down and other branches', async () => {
    await expect(location.resolveSelection(tantaUp, 1010)).rejects.toThrow(ForbiddenException);
    await expect(location.resolveSelection(branchOne, 1009)).rejects.toThrow(ForbiddenException);
  });
});

describe('inventory transfers across branches', () => {
  const build = () => {
    const location = new InventoryLocationService(fakePrisma() as never);
    const service = new InventoryTransactionsService({} as never, {} as never, location, {} as never, new BranchScopeService());
    const validate = (user: never, kind: string, branchId: number, source?: number, target?: number) =>
      (service as unknown as {
        validateLocations: (u: never, k: string, b: number, s?: number, t?: number) => Promise<void>;
      }).validateLocations(user, kind, branchId, source, target);
    return { validate };
  };

  it('allows an in-scope source to send stock to another branch\'s active warehouse', async () => {
    const { validate } = build();
    await expect(validate(tantaMain, 'transfer', 5, 1009, 1)).resolves.toBeUndefined();
    await expect(validate(branchOne, 'transfer', 1, 1, 1010)).resolves.toBeUndefined();
  });

  it('still requires the source to be in scope and the target to exist and be active', async () => {
    const { validate } = build();
    await expect(validate(branchOne, 'transfer', 5, 1009, 1)).rejects.toThrow(ForbiddenException);
    await expect(validate(branchOne, 'transfer', 1, 1, 77)).rejects.toThrow(BadRequestException);
    await expect(validate(branchOne, 'transfer', 1, 1, 4040)).rejects.toThrow(BadRequestException);
  });

  it('does not relax non-transfer targets', async () => {
    const { validate } = build();
    await expect(validate(branchOne, 'issue', 1, 1, 1010)).rejects.toThrow(ForbiddenException);
  });
});

describe('PUT /stock-taking/:id location validation', () => {
  const build = () => {
    const update = jest.fn();
    const prisma = {
      ...fakePrisma(),
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ inv_count_sessions: { update } })),
    };
    const location = new InventoryLocationService(prisma as never);
    const service = new StockTakingService(prisma as never, {} as never, location, {} as never);
    jest.spyOn(service, 'findSession').mockResolvedValue({ id: 9, status: 'draft', warehouseId: 1009, branchId: 5, items: [] } as never);
    return { service, update };
  };

  it('rejects a foreign warehouse instead of writing it', async () => {
    const { service, update } = build();
    await expect(service.updateSession(9, { warehouseId: 1 }, tantaMain)).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects moving the session to another in-scope warehouse or a mismatched branch', async () => {
    const { service, update } = build();
    await expect(service.updateSession(9, { warehouseId: 1010 }, tantaMain)).rejects.toThrow(BadRequestException);
    await expect(service.updateSession(9, { branchId: 6 }, tantaMain)).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts the unchanged location and never writes location columns', async () => {
    const { service, update } = build();
    await service.updateSession(9, { warehouseId: 1009, branchId: 5, notes: 'ok' }, tantaMain);
    expect(update).toHaveBeenCalledWith({ where: { id: 9 }, data: { notes: 'ok' } });
  });
});

describe('POST /products opening stock branch', () => {
  const service = new ProductsService({} as never, {} as never, {} as never, {} as never, new BranchScopeService());
  const pick = (requested: number | undefined, own: number | undefined, user?: never) =>
    (service as unknown as {
      scopedOpeningBranchId: (r?: number, o?: number, u?: never) => number | undefined;
    }).scopedOpeningBranchId(requested, own, user);

  it('ignores the client branch for a scoped user outside their scope', () => {
    expect(() => pick(1, 2, tantaMain)).toThrow(ForbiddenException);
  });

  it('allows Tanta sub-branches for Tanta main and any branch for admins', () => {
    expect(pick(5, 2, tantaMain)).toBe(5);
    expect(pick(3, undefined, admin)).toBe(3);
    expect(pick(undefined, 2, tantaMain)).toBe(2);
  });

  it('never trusts a client branch without a caller', () => {
    expect(pick(4, 2)).toBe(2);
  });
});

describe('GET /stock warehouse scoping', () => {
  const prisma = { ...fakePrisma(), inv_stock_balances: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) } };
  const service = new StockService(prisma as never, {} as never, new BranchScopeService(), new InventoryLocationService(prisma as never));

  it('rejects levels of a foreign warehouse and allows a Tanta sub-branch store', async () => {
    await expect(service.levelsByWarehouse(1, tantaMain)).rejects.toThrow(ForbiddenException);
    await expect(service.levelsByWarehouse(1009, tantaMain)).resolves.toEqual([]);
  });

  it('defaults the balance list to the allowed branches', async () => {
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, tantaMain);
    expect(JSON.stringify(prisma.inv_stock_balances.findMany.mock.calls.at(-1))).toContain('"in":[2,5,6]');
  });
});
