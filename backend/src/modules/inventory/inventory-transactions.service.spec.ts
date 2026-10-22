import { InventoryTransactionsService } from './inventory-transactions.service';

describe('InventoryTransactionsService Noamany inventory flow', () => {
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
      resolveSelection: jest.fn().mockResolvedValue({ warehouseId: 19, branchId: 7 }),
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
});
