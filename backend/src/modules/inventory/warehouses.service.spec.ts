import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

describe('flat warehouse settings', () => {
  const prisma = { $queryRaw: jest.fn(), tbl_branches: {findUnique: jest.fn()}, inv_warehouses: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() }, inv_stock_balances: { findFirst: jest.fn() } };
  const service = new WarehousesService(prisma as never, new BranchScopeService());
  const user = { sub: 2, branch: 4, level: 2 } as never;
  beforeEach(() => jest.resetAllMocks());
  it('creates the next warehouse when MySQL returns the numeric maximum as bigint', async () => {
    prisma.tbl_branches.findUnique.mockResolvedValue({branch_id:4});
    prisma.$queryRaw.mockResolvedValue([{maxNum:100000n}]);
    prisma.inv_warehouses.create.mockImplementation(async ({data}) => ({id:1,...data}));
    await service.create({nameAr:'مخزن',branchId:4},user);
    expect(prisma.inv_warehouses.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({warehouse_code:'WH100001'})}));
  });
  it('does not expose a foreign warehouse', async () => {
    prisma.inv_warehouses.findFirst.mockResolvedValue({ id: 1, branch_id: 5 });
    await expect(service.findOne(1, user)).rejects.toThrow(ForbiddenException);
  });
  it('does not hide stock by deleting a warehouse with a balance', async () => {
    prisma.inv_warehouses.findFirst.mockResolvedValue({ id: 1, branch_id: 4 });
    prisma.inv_stock_balances.findFirst.mockResolvedValue({ current_stock: 12 });
    await expect(service.remove(1, user)).rejects.toThrow(BadRequestException);
    expect(prisma.inv_warehouses.update).not.toHaveBeenCalled();
  });
  it('does not reassign historical warehouse movements to another branch', async () => {
    prisma.inv_warehouses.findFirst.mockResolvedValue({ id: 1, branch_id: 4 });
    await expect(service.update(1, { branchId: 5 }, user)).rejects.toThrow(BadRequestException);
  });
});
