import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { StockTakingService } from './stock-taking.service';
import { InventoryLocationService } from './inventory-location.service';
import type { JwtUser } from '../../common/types/jwt-user';

const adminWithoutBranch = {
  sub: 1,
  level: 1,
  employeeId: null,
  employeeCode: null,
  emp_code: null,
  branch: 0,
  branch_name: null,
  man_women_type: 0,
  name: 'مدير النظام',
  image: null,
  job_title: null,
  is_trainer: false,
  trainer_id: null,
} satisfies JwtUser;

describe('StockTakingService reconciliation safety', () => {
  it('generates the next session number when MySQL returns MAX as bigint', async () => {
    const createSession = jest.fn().mockImplementation(({ data }) => Promise.resolve({
      id: 32,
      session_number: data.session_number,
      warehouse_id: data.warehouse_id,
      branch_id: data.branch_id,
      status: 'draft',
      notes: data.notes,
      created_by: data.created_by,
      items: [],
      created_at: new Date('2026-08-27T10:00:00Z'),
      updated_at: new Date('2026-08-27T10:00:00Z'),
    }));
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ maxNum: 31n }]),
      inv_warehouses: { findFirst: jest.fn().mockResolvedValue({ id: 14 }) },
      inv_count_sessions: { create: createSession },
    };
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      new InventoryLocationService(prisma as never),
      {} as never,
    );

    const result = await service.createSession({ branchId: 7 }, adminWithoutBranch);

    expect(result.sessionNumber).toBe('CNT000032');
  });

  it('creates a stock-taking session in the branch selected by a branchless system admin', async () => {
    const createSession = jest.fn().mockImplementation(({ data }) => Promise.resolve({
      id: 31,
      session_number: data.session_number,
      warehouse_id: data.warehouse_id,
      branch_id: data.branch_id,
      status: 'draft',
      notes: data.notes,
      created_by: data.created_by,
      items: [],
      created_at: new Date('2026-08-27T10:00:00Z'),
      updated_at: new Date('2026-08-27T10:00:00Z'),
    }));
    const prisma = {
      inv_warehouses: {
        findFirst: jest.fn().mockResolvedValue({ id: 14 }),
      },
      inv_count_sessions: { create: createSession },
    };
    const location = new InventoryLocationService(prisma as never);
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      location,
      {} as never,
    );

    const result = await service.createSession({
      sessionNumber: 'CNT000031',
      branchId: 7,
      notes: 'جرد فرع GC',
    }, adminWithoutBranch);

    expect(result).toEqual(expect.objectContaining({ branchId: 7, warehouseId: 14 }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ branch_id: 7, warehouse_id: 14, created_by: 1 }),
    }));
  });

  it('does not let a branch-scoped user create a count for another branch', async () => {
    const prisma = {
      inv_warehouses: { findFirst: jest.fn() },
      inv_count_sessions: { create: jest.fn() },
    };
    const location = new InventoryLocationService(prisma as never);
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      location,
      {} as never,
    );
    const branchUser = { ...adminWithoutBranch, sub: 9, level: 3, branch: 2 };

    await expect(service.createSession({ branchId: 7 }, branchUser))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inv_count_sessions.create).not.toHaveBeenCalled();
  });

  it('stores the explanation with a non-zero variance for later review', async () => {
    const createItem = jest.fn().mockResolvedValue({
      id: 10,
      product_id: 4,
      system_quantity: new Prisma.Decimal(10),
      counted_quantity: new Prisma.Decimal(8),
      variance: new Prisma.Decimal(-2),
    });
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_stock_balances: {
        findUnique: jest.fn().mockResolvedValue({ current_stock: new Prisma.Decimal(10) }),
      },
      inv_count_items: { create: createItem },
    };
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.addCountItem(3, {
      productId: 4,
      itemName: 'مياه',
      countedQuantity: 8,
      varianceReason: '  كسر أثناء التشغيل  ',
    });

    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ variance_reason: 'كسر أثناء التشغيل' }),
    }));
  });

  it('requires an explanation when the physical count has a variance', async () => {
    const createItem = jest.fn();
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_stock_balances: {
        findUnique: jest.fn().mockResolvedValue({ current_stock: new Prisma.Decimal(10) }),
      },
      inv_count_items: {
        create: createItem.mockResolvedValue({
          id: 10,
          product_id: 4,
          system_quantity: new Prisma.Decimal(10),
          counted_quantity: new Prisma.Decimal(8),
          variance: new Prisma.Decimal(-2),
        }),
      },
    };
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.addCountItem(3, {
      productId: 4,
      itemName: 'مياه',
      countedQuantity: 8,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(createItem).not.toHaveBeenCalled();
  });

  it('rejects counting the same product twice in one session', async () => {
    const createItem = jest.fn();
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [{
            id: 8,
            product_id: 4,
            item_code: 'W-1',
            item_name: 'مياه',
            category: null,
            system_quantity: new Prisma.Decimal(10),
            counted_quantity: new Prisma.Decimal(8),
            variance: new Prisma.Decimal(-2),
            status: null,
          }],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_stock_balances: {
        findUnique: jest.fn().mockResolvedValue({ current_stock: new Prisma.Decimal(10) }),
      },
      inv_count_items: {
        create: createItem.mockResolvedValue({
          id: 10,
          product_id: 4,
          system_quantity: new Prisma.Decimal(10),
          counted_quantity: new Prisma.Decimal(8),
          variance: new Prisma.Decimal(-2),
        }),
      },
    };
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.addCountItem(3, {
      productId: 4,
      itemName: 'مياه',
      countedQuantity: 8,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(createItem).not.toHaveBeenCalled();
  });

  it('rejects a negative physical count before storing the item', async () => {
    const createItem = jest.fn();
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_stock_balances: { findUnique: jest.fn().mockResolvedValue(null) },
      inv_count_items: {
        create: createItem.mockResolvedValue({
          id: 10,
          product_id: 4,
          system_quantity: new Prisma.Decimal(0),
          counted_quantity: new Prisma.Decimal(-1),
          variance: new Prisma.Decimal(-1),
        }),
      },
    };
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.addCountItem(3, {
      productId: 4,
      itemName: 'مياه',
      countedQuantity: -1,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(createItem).not.toHaveBeenCalled();
  });

  it('updates a draft item using its saved system snapshot and trims the reason', async () => {
    const updateItem = jest.fn().mockResolvedValue({
      id: 10,
      product_id: 4,
      item_name: 'مياه',
      system_quantity: new Prisma.Decimal(10),
      counted_quantity: new Prisma.Decimal(7),
      variance: new Prisma.Decimal(-3),
      variance_reason: 'تالف أثناء النقل',
    });
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [{
            id: 10,
            product_id: 4,
            item_code: 'W-1',
            item_name: 'مياه',
            category: null,
            system_quantity: new Prisma.Decimal(10),
            counted_quantity: new Prisma.Decimal(8),
            variance: new Prisma.Decimal(-2),
            variance_reason: 'كسر',
            status: null,
          }],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_count_items: { update: updateItem },
    };
    const service = new StockTakingService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.updateCountItem(3, 10, {
      productId: 4,
      itemName: 'مياه',
      countedQuantity: 7,
      varianceReason: '  تالف أثناء النقل  ',
    }, adminWithoutBranch);

    expect(updateItem).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({
        counted_quantity: 7,
        variance: -3,
        variance_reason: 'تالف أثناء النقل',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ countedQuantity: 7, variance: -3 }));
  });

  it('rejects editing a draft item from another branch before mutating it', async () => {
    const updateItem = jest.fn().mockResolvedValue({
      id: 10,
      product_id: 4,
      system_quantity: new Prisma.Decimal(10),
      counted_quantity: new Prisma.Decimal(7),
      variance: new Prisma.Decimal(-3),
      variance_reason: 'تالف',
    });
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [{
            id: 10,
            product_id: 4,
            item_code: 'W-1',
            item_name: 'مياه',
            category: null,
            system_quantity: new Prisma.Decimal(10),
            counted_quantity: new Prisma.Decimal(8),
            variance: new Prisma.Decimal(-2),
            variance_reason: 'كسر',
            status: null,
          }],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_count_items: { update: updateItem },
    };
    const service = new StockTakingService(
      prisma as never,
      {} as never,
      new InventoryLocationService(prisma as never),
      {} as never,
    );
    const otherBranchUser = { ...adminWithoutBranch, sub: 9, level: 3, branch: 2 };

    await expect(service.updateCountItem(3, 10, {
      itemName: 'مياه',
      countedQuantity: 7,
      varianceReason: 'تالف',
    }, otherBranchUser)).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('requires a reason when editing a draft item to a non-zero variance', async () => {
    const updateItem = jest.fn();
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [{
            id: 10,
            product_id: 4,
            item_code: 'W-1',
            item_name: 'مياه',
            category: null,
            system_quantity: new Prisma.Decimal(10),
            counted_quantity: new Prisma.Decimal(10),
            variance: new Prisma.Decimal(0),
            variance_reason: null,
            status: null,
          }],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_count_items: { update: updateItem },
    };
    const service = new StockTakingService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.updateCountItem(3, 10, {
      itemName: 'مياه',
      countedQuantity: 9,
    }, adminWithoutBranch)).rejects.toBeInstanceOf(BadRequestException);

    expect(updateItem).not.toHaveBeenCalled();
  });

  it('deletes an item only from its draft session', async () => {
    const deleteItem = jest.fn().mockResolvedValue({ id: 10 });
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'draft',
          notes: null,
          created_by: 17,
          items: [{
            id: 10,
            product_id: 4,
            item_code: 'W-1',
            item_name: 'مياه',
            category: null,
            system_quantity: new Prisma.Decimal(10),
            counted_quantity: new Prisma.Decimal(8),
            variance: new Prisma.Decimal(-2),
            variance_reason: 'كسر',
            status: null,
          }],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_count_items: { delete: deleteItem },
    };
    const service = new StockTakingService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.removeCountItem(3, 10, adminWithoutBranch)).resolves.toEqual({ success: true });

    expect(deleteItem).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('rejects editing items after a session leaves draft status', async () => {
    const prisma = {
      inv_count_sessions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          session_number: 'CNT000001',
          warehouse_id: 2,
          branch_id: 1,
          status: 'awaiting_approval',
          notes: null,
          created_by: 17,
          items: [{
            id: 10,
            product_id: 4,
            item_code: 'W-1',
            item_name: 'مياه',
            category: null,
            system_quantity: new Prisma.Decimal(10),
            counted_quantity: new Prisma.Decimal(8),
            variance: new Prisma.Decimal(-2),
            variance_reason: 'كسر',
            status: null,
          }],
          created_at: new Date('2026-08-22T10:00:00Z'),
          updated_at: new Date('2026-08-22T10:00:00Z'),
        }),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue({ id: 9, status: 'pending' }) },
      inv_count_items: { update: jest.fn() },
    };
    const service = new StockTakingService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.updateCountItem(3, 10, {
      itemName: 'مياه',
      countedQuantity: 10,
    }, adminWithoutBranch)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inv_count_items.update).not.toHaveBeenCalled();
  });

  it('applies a shortage as a delta so movements recorded after the count are preserved', async () => {
    const transactionClient = {
      inv_adjustments: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inv_products: {
        findMany: jest.fn().mockResolvedValue([
          { id: 4, cost_price: new Prisma.Decimal(25) },
        ]),
      },
      inv_count_sessions: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      inv_adjustments: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          adjustment_number: 'ADJ-CNT000001',
          status: 'pending',
          session: {
            id: 3,
            warehouse_id: 2,
            branch_id: 1,
            items: [
              {
                product_id: 4,
                item_name: 'مياه',
                item_code: 'W-1',
                system_quantity: new Prisma.Decimal(10),
                counted_quantity: new Prisma.Decimal(8),
                variance: new Prisma.Decimal(-2),
              },
            ],
          },
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    };
    const stock = { applyMovement: jest.fn().mockResolvedValue({}) };
    const moduleLedger = { postInventoryCountAdjustment: jest.fn().mockResolvedValue(undefined) };
    const service = new StockTakingService(
      prisma as never,
      stock as never,
      {} as never,
      moduleLedger as never,
    );

    await service.approveAdjustment(9, 17);

    expect(stock.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 4,
        warehouseId: 2,
        direction: MovementDirection.out,
        quantity: 2,
        txnType: InventoryTxnType.count,
      }),
      transactionClient,
    );
    expect(stock.applyMovement.mock.calls[0][0]).not.toHaveProperty('operation', 'set');
  });
});
