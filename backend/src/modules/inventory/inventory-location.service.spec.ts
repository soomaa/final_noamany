import { BadRequestException } from '@nestjs/common';
import { InventoryLocationService } from './inventory-location.service';

describe('InventoryLocationService', () => {
  const findFirst = jest.fn();
  const upsert = jest.fn();
  const settingFindFirst = jest.fn();
  const service = new InventoryLocationService({
    inv_warehouses: { findFirst, upsert },
    sales_pos_settings: { findFirst: settingFindFirst },
  } as never);

  beforeEach(() => {
    findFirst.mockReset();
    upsert.mockReset();
    settingFindFirst.mockReset().mockResolvedValue(null);
  });

  it('requires an authenticated user branch', () => {
    expect(() => service.requireUserBranch({ branch: 0 } as never)).toThrow(BadRequestException);
  });

  it('rejects a selected warehouse from another branch', async () => {
    findFirst.mockResolvedValue({ id: 17, branch_id: 9 });
    await expect(service.resolveSelection({ branch: 4, level: 2 } as never, 17)).rejects.toThrow();
  });

  it('keeps the selected location and its branch together', async () => {
    findFirst.mockResolvedValue({ id: 17, branch_id: 4 });
    await expect(service.resolveSelection({ branch: 4, level: 2 } as never, 17, 4)).resolves.toEqual({ warehouseId: 17, branchId: 4 });
    await expect(service.resolveSelection({ branch: 4, level: 2 } as never, 17, 9)).rejects.toThrow(BadRequestException);
  });

  it('uses the internal stock location assigned to the user branch', async () => {
    findFirst.mockResolvedValue({ id: 17 });

    await expect(service.resolveBranchStockLocation(4)).resolves.toBe(17);
    expect(findFirst).toHaveBeenCalledWith({
      where: { branch_id: 4, status: 'active', is_deleted: false },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
  });

  it('creates the hidden branch inventory location on first use', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({ id: 23 });

    await expect(service.resolveBranchStockLocation(4)).resolves.toBe(23);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { warehouse_code: 'Noamany-STOCK-4' },
      create: expect.objectContaining({ branch_id: 4, name_ar: 'مخزون الفرع' }),
      update: { branch_id: 4, status: 'active', is_deleted: false },
    }));
  });

  it('uses the branch sale warehouse (its bar) from POS settings, whatever its id', async () => {
    settingFindFirst.mockResolvedValue({ setting_value: '2011' });
    findFirst.mockResolvedValue({ id: 2011 });

    await expect(service.resolveBranchStockLocation(2)).resolves.toBe(2011);
    expect(settingFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: 'stock', setting_key: 'sale_warehouse_id', branch_id: 2, is_active: true },
    }));
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 2011, branch_id: 2, status: 'active', is_deleted: false },
      select: { id: true },
    });
  });

  it('ignores a sale warehouse that is inactive or belongs to another branch', async () => {
    settingFindFirst.mockResolvedValue({ setting_value: '"2011"' });
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1004 });

    await expect(service.resolveBranchStockLocation(2)).resolves.toBe(1004);
    expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ type: 'asc' }, { id: 'asc' }] }));
  });
});
