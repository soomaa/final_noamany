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

  it('rounds the balance delta and the movement row to the same 6-decimal figure (7.5 g of a kg item)', async () => {
    let balance = new Prisma.Decimal(1);
    const movementCreate = jest.fn(async ({ data }: any) => data);
    const tx = {
      inv_products: { findUnique: jest.fn().mockResolvedValue({ min_stock: new Prisma.Decimal(0), max_stock: new Prisma.Decimal(1000), reorder_point: new Prisma.Decimal(0) }) },
      inv_stock_balances: {
        upsert: jest.fn(async () => ({ id: 10, current_stock: balance })),
        update: jest.fn(async ({ data }: any) => { balance = balance.plus(data.current_stock.increment); return { id: 10, current_stock: balance }; }),
      },
      inv_movements: { create: movementCreate },
      inv_product_branches: { upsert: jest.fn() },
    };
    const service = new InventoryStockService({} as never);
    const move = (quantity: number, direction: MovementDirection) => service.applyMovement({ productId: 4, warehouseId: 2, direction, quantity, txnType: InventoryTxnType.issue, docType: 'cafe_sale' }, tx as never);
    await move(0.0075, MovementDirection.out);
    expect(Number(balance)).toBe(0.9925);
    expect(Number(movementCreate.mock.calls[0][0].data.quantity)).toBe(-0.0075);
    expect(Number(movementCreate.mock.calls[0][0].data.balance_after)).toBe(0.9925);
    // Cancelling the sale returns exactly what was taken: the balance is back to 1, not 1.001.
    await move(Math.abs(Number(movementCreate.mock.calls[0][0].data.quantity)), MovementDirection.in);
    expect(Number(balance)).toBe(1);
    // Sub-scale noise (1e-9) is rounded away rather than persisted as a phantom quantity.
    await move(0.0004, MovementDirection.out);
    expect(Number(movementCreate.mock.calls[2][0].data.quantity)).toBe(-0.0004);
  });
});
