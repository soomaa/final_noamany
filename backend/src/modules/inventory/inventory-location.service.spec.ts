import { BadRequestException } from '@nestjs/common';
import { InventoryLocationService } from './inventory-location.service';

describe('InventoryLocationService', () => {
  const findFirst = jest.fn();
  const upsert = jest.fn();
  const service = new InventoryLocationService({
    inv_warehouses: { findFirst, upsert },
  } as never);

  beforeEach(() => {
    findFirst.mockReset();
    upsert.mockReset();
  });

  it('requires an authenticated user branch', () => {
    expect(() => service.requireUserBranch({ branch: 0 } as never)).toThrow(BadRequestException);
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
});
