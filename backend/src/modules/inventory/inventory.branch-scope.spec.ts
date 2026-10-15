import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { OpeningStocksService } from './opening-stocks.service';
import { ProductBranchesService } from './product-branches.service';

const RECEPTION = { sub: 12, level: 2, branch: 2 } as never;
const ADMIN = { sub: 1, level: 1, branch: 1 } as never;

function branchScope() {
  return new BranchScopeService(new ConfigService({}));
}

function makeProductBranches() {
  const prisma = {
    inv_product_branches: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ id: 7, branch_id: 3, product: {} }),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  return { service: new ProductBranchesService(prisma as never, branchScope()), prisma };
}

function makeOpeningStocks() {
  const prisma = {
    inv_opening_stocks: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue({ id: 9, branch_id: 3 }),
    },
    inv_warehouses: {
      findUnique: jest.fn().mockResolvedValue({ branch_id: 3 }),
    },
  };
  return {
    service: new OpeningStocksService(
      prisma as never, {} as never, {} as never, {} as never, branchScope(),
    ),
    prisma,
  };
}

describe('inventory branch isolation — path params bypass the global guard', () => {
  it('rejects a foreign branch on by-branch product stock', async () => {
    const { service } = makeProductBranches();
    await expect(service.byBranchProducts(3, RECEPTION)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a foreign branch on by-branch low stock', async () => {
    const { service } = makeProductBranches();
    await expect(service.byBranchLowStock(3, RECEPTION)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a foreign branch on by-branch opening stocks', async () => {
    const { service } = makeOpeningStocks();
    await expect(service.byBranch(3, RECEPTION)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an opening stock warehouse that belongs to another branch', async () => {
    const { service } = makeOpeningStocks();
    await expect(service.byWarehouse(50, RECEPTION)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the user own branch through', async () => {
    const { service, prisma } = makeProductBranches();
    await service.byBranchProducts(2, RECEPTION);
    expect(prisma.inv_product_branches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branch_id: 2 } }),
    );
  });

  it('lets a system admin read any branch', async () => {
    const { service } = makeOpeningStocks();
    await expect(service.byBranch(3, ADMIN)).resolves.toEqual([]);
  });
});

describe('inventory branch isolation — id-keyed writes', () => {
  it('blocks editing another branch product stock row by id', async () => {
    const { service } = makeProductBranches();
    await expect(
      service.updateStock(7, { stockQuantity: 999 } as never, RECEPTION),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks deleting another branch product stock row by id', async () => {
    const { service } = makeProductBranches();
    await expect(service.remove(7, RECEPTION)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks editing another branch opening stock by id', async () => {
    const { service } = makeOpeningStocks();
    await expect(service.update(9, { notes: 'x' }, RECEPTION)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('inventory branch isolation — list default scoping', () => {
  it('defaults a scoped user product-branch list to their own branch', async () => {
    const { service, prisma } = makeProductBranches();
    await service.list({ page: 1, pageSize: 20 } as never, RECEPTION);
    expect(prisma.inv_product_branches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ branch_id: { in: [2] } }] } }),
    );
  });

  it('leaves an admin product-branch list unrestricted', async () => {
    const { service, prisma } = makeProductBranches();
    await service.list({ page: 1, pageSize: 20 } as never, ADMIN);
    expect(prisma.inv_product_branches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('defaults a scoped user opening-stock list to their own branch', async () => {
    const { service, prisma } = makeOpeningStocks();
    await service.list({ page: 1, pageSize: 20 } as never, RECEPTION);
    expect(prisma.inv_opening_stocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [expect.anything(), { branch_id: { in: [2] } }] },
      }),
    );
  });

  it('narrows a scoped user who asks for a foreign branch back to their own', async () => {
    const { service, prisma } = makeOpeningStocks();
    await service.list({ page: 1, pageSize: 20, branchId: '3' } as never, RECEPTION);
    expect(prisma.inv_opening_stocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [expect.anything(), { branch_id: { in: [2] } }] },
      }),
    );
  });
});
