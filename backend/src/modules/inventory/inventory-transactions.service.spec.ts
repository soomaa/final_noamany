import {
  InventoryTransactionsService,
  resolveInventoryConsumptionUnitCost,
} from './inventory-transactions.service';

describe('InventoryTransactionsService Noamany inventory flow', () => {
  it('uses authoritative stock cost for management withdrawals even if a legacy draft contains a price', () => {
    expect(resolveInventoryConsumptionUnitCost(999, 5, true)).toBe(5);
    expect(resolveInventoryConsumptionUnitCost(999, 5, false)).toBe(999);
  });

  it('records an internal issue against the signed-in user branch without warehouse input', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      id: 11,
      ...data,
      txn_type: data.txn_type,
      status: data.status,
      txn_date: data.txn_date,
      source_warehouse_id: data.source_warehouse_id,
      target_warehouse_id: data.target_warehouse_id,
      branch_id: data.branch_id,
      total_amount: data.total_amount,
      notes: data.notes,
      reason: data.reason,
      created_by: data.created_by,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      items: data.items.create.map((item: Record<string, unknown>, index: number) => ({ id: index + 1, ...item })),
      created_at: new Date(),
      updated_at: new Date(),
    }));
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback({
        inv_transactions: { create },
      })),
    };
    const location = {
      requireUserBranch: jest.fn().mockReturnValue(7),
      resolveBranchStockLocation: jest.fn().mockResolvedValue(19),
    };
    const service = new InventoryTransactionsService(
      prisma as never,
      {} as never,
      location as never,
      {} as never,
      { isBranchAllowed: (_user: unknown, branchId: number) => branchId === 7, resolveListFilter: () => [7] } as never,
    );

    await service.create({
      reference: 'GYM-ISSUE-1',
      txnType: 'issue',
      txnDate: '2026-07-19',
      branchId: 7,
      items: [{ productId: 3, itemName: 'مياه', quantity: 2 }],
    }, { sub: 5, branch: 7 } as never);

    expect(location.resolveBranchStockLocation).toHaveBeenCalledWith(7);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        branch_id: 7,
        source_warehouse_id: 19,
        target_warehouse_id: null,
        created_by: 5,
      }),
    }));
  });

  it('rejects a branch user trying to issue stock from another branch', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new InventoryTransactionsService(
      prisma as never,
      {} as never,
      { resolveBranchStockLocation: jest.fn() } as never,
      {} as never,
      { isBranchAllowed: (_user: unknown, branchId: number) => branchId === 7, resolveListFilter: () => [7] } as never,
    );

    await expect(service.create({
      reference: 'GYM-ISSUE-OTHER-BRANCH',
      txnType: 'issue',
      txnDate: '2026-07-21',
      branchId: 8,
      items: [{ productId: 3, itemName: 'مناديل', quantity: 1 }],
    }, { sub: 5, branch: 7 } as never)).rejects.toThrow('لا تملك صلاحية');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('owns the management-withdrawal classification on the server', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      id: 12,
      ...data,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      items: data.items.create.map((item: Record<string, unknown>, index: number) => ({ id: index + 1, ...item })),
      created_at: new Date(),
      updated_at: new Date(),
    }));
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback({
        inv_transactions: { create },
      })),
    };
    const service = new InventoryTransactionsService(
      prisma as never,
      {} as never,
      { resolveBranchStockLocation: jest.fn().mockResolvedValue(19) } as never,
      {} as never,
      { isBranchAllowed: () => true, resolveListFilter: () => [7] } as never,
    );

    await service.createManagementWithdrawal({
      reference: 'MGMT-1',
      txnType: 'damage',
      txnDate: '2026-07-22',
      branchId: 7,
      items: [{ productId: 3, itemName: 'مياه الإدارة', quantity: 1, price: 999, total: 999 }],
    }, { sub: 5, branch: 7 } as never);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        txn_type: 'issue',
        business_classification: 'management_withdrawal',
        branch_id: 7,
        total_amount: 0,
        items: { create: [expect.objectContaining({ price: 0, total: 0 })] },
      }),
    }));
  });

  it('keeps the management-withdrawal type and amount policy when a draft is edited', async () => {
    const existing = {
      id: 12,
      branch_id: 7,
      status: 'draft',
      business_classification: 'management_withdrawal',
    };
    const update = jest.fn().mockImplementation(({ data }) => ({
      ...existing,
      ...data,
      reference: 'MGMT-1',
      txn_date: new Date('2026-07-22'),
      source_warehouse_id: 19,
      target_warehouse_id: null,
      notes: null,
      reason: null,
      created_by: 5,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      items: data.items.create.map((item: Record<string, unknown>, index: number) => ({ id: index + 1, ...item })),
      created_at: new Date(),
      updated_at: new Date(),
    }));
    const prisma = {
      inv_transactions: { findFirst: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback({
        inv_transaction_items: { deleteMany: jest.fn() },
        inv_transactions: { update },
      })),
    };
    const service = new InventoryTransactionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { isBranchAllowed: () => true, resolveListFilter: () => [7] } as never,
    );

    await service.update(12, {
      txnType: 'damage',
      items: [{ productId: 3, itemName: 'مياه الإدارة', quantity: 2, price: 999, total: 1998 }],
    }, { sub: 5, branch: 7 } as never);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        txn_type: 'issue',
        total_amount: 0,
        items: { create: [expect.objectContaining({ price: 0, total: 0 })] },
      }),
    }));
  });
});
