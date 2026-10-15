import { InventoryDashboardService } from './inventory-dashboard.service';

describe('InventoryDashboardService purchase alerts', () => {
  it('returns low and zero-stock products as actionable purchase notifications', async () => {
    const prisma = {
      inv_stock_balances: {
        findMany: jest.fn().mockResolvedValue([
          {
            product_id: 38,
            warehouse_id: 1,
            current_stock: 90,
            product: {
              name_ar: 'لبن',
              size: null,
              cost_price: 2,
              is_deleted: false,
              status: 'active',
              inventory_kind: 'raw_material',
            },
          },
          {
            product_id: 40,
            warehouse_id: 1,
            current_stock: 1,
            product: {
              name_ar: 'لاتيه',
              size: null,
              cost_price: 5,
              is_deleted: false,
              status: 'active',
              inventory_kind: 'ready_product',
            },
          },
          {
            product_id: 41,
            warehouse_id: 1,
            current_stock: 500,
            product: {
              name_ar: 'قهوة محذوفة',
              size: null,
              cost_price: 20,
              is_deleted: true,
              status: 'active',
              inventory_kind: 'raw_material',
            },
          },
        ]),
      },
      inv_products: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 38,
            product_code: 'RAW-38',
            name_ar: 'لبن',
            size: null,
            unit_of_measure: 'kg',
            reorder_point: 30,
            supplier: { name_ar: 'مورد اللبن' },
          },
          {
            id: 39,
            product_code: 'RAW-39',
            name_ar: 'سكر',
            size: null,
            unit_of_measure: 'kg',
            reorder_point: 0,
            supplier: null,
          },
          {
            id: 40,
            product_code: 'READY-40',
            name_ar: 'لاتيه',
            size: null,
            unit_of_measure: 'piece',
            reorder_point: 1,
            supplier: { name_ar: 'مورد الكافيه' },
          },
        ]),
        count: jest.fn().mockResolvedValue(3),
      },
      inv_warehouses: { count: jest.fn().mockResolvedValue(1) },
      inv_movements: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      },
    };
    const service = new InventoryDashboardService(prisma as never, { resolveListFilter: () => null } as never);

    const result = await service.summary({ branchId: 'all' });

    expect(result.lowStockCount).toBe(2);
    expect(result.lowStockItems).toEqual([
      {
        productId: 39,
        productCode: 'RAW-39',
        name: 'سكر',
        size: null,
        unit: 'kg',
        currentStock: 0,
        alertQuantity: 0,
        supplierName: null,
      },
      {
        productId: 40,
        productCode: 'READY-40',
        name: 'لاتيه',
        size: null,
        unit: 'piece',
        currentStock: 1,
        alertQuantity: 1,
        supplierName: 'مورد الكافيه',
      },
    ]);
    expect(prisma.inv_products.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ is_deleted: false, status: 'active' }),
    }));
    expect(prisma.inv_stock_balances.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        product: expect.objectContaining({ is_deleted: false, status: 'active' }),
      }),
    }));
    expect(result.topItems.map((item) => item.productName)).not.toContain('قهوة محذوفة');
    expect(result.totalStockValue).toBe(185);
  });
});
