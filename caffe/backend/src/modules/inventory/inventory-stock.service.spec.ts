import { BadRequestException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { InventoryStockService } from './inventory-stock.service';

describe('InventoryStockService stock safety', () => {
  it('rejects an outbound movement that would make stock negative before writing the ledger', async () => {
    const movementCreate = jest.fn();
    const tx = {
      inv_products: {
        findUnique: jest.fn().mockResolvedValue({
          min_stock: new Prisma.Decimal(0),
          max_stock: new Prisma.Decimal(1000),
          reorder_point: new Prisma.Decimal(1),
        }),
      },
      inv_stock_balances: {
        upsert: jest.fn().mockResolvedValue({ id: 10, current_stock: new Prisma.Decimal(1) }),
        update: jest.fn().mockResolvedValue({ id: 10, current_stock: new Prisma.Decimal(-1) }),
      },
      inv_movements: { create: movementCreate },
      inv_product_branches: { upsert: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: unknown) => unknown) => callback(tx)) };
    const service = new InventoryStockService(prisma as never);

    await expect(service.applyMovement({
      productId: 4,
      warehouseId: 2,
      direction: MovementDirection.out,
      quantity: 2,
      txnType: InventoryTxnType.issue,
      docType: 'cafe_sale',
      docRef: 'QS-1',
      branchId: 1,
      allowNegative: false,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(movementCreate).not.toHaveBeenCalled();
  });

  it('rejects setting an absolute negative stock balance', async () => {
    const update = jest.fn();
    const tx = {
      inv_products: {
        findUnique: jest.fn().mockResolvedValue({
          min_stock: new Prisma.Decimal(0),
          max_stock: new Prisma.Decimal(1000),
          reorder_point: new Prisma.Decimal(1),
        }),
      },
      inv_stock_balances: {
        upsert: jest.fn().mockResolvedValue({ id: 10, current_stock: new Prisma.Decimal(1) }),
        update,
      },
      inv_movements: { create: jest.fn() },
      inv_product_branches: { upsert: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: unknown) => unknown) => callback(tx)) };
    const service = new InventoryStockService(prisma as never);

    await expect(service.applyMovement({
      productId: 4,
      warehouseId: 2,
      direction: MovementDirection.out,
      quantity: -1,
      operation: 'set',
      txnType: InventoryTxnType.adjustment,
      docType: 'stock_count',
      allowNegative: false,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });
});
