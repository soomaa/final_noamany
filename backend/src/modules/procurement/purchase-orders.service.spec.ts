import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService branch isolation', () => {
  function fixture(po: { branch_id: number | null; warehouse_id?: number | null }) {
    const existing = {
      id: 10,
      po_number: 'PO-10',
      supplier_id: 3,
      status: 'draft',
      total_amount: 0,
      paid_amount: 0,
      supplier_invoice_id: null,
      warehouse_id: null,
      items: [],
      ...po,
    };
    const update = jest.fn().mockImplementation(({ data }) => ({ ...existing, ...data, items: [] }));
    const prisma = {
      prc_purchase_orders: { findFirst: jest.fn().mockResolvedValue(existing), update },
      prc_goods_receipts: { count: jest.fn().mockResolvedValue(0) },
      inv_suppliers: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const location = { assertWarehouseInScope: jest.fn(), resolveSelection: jest.fn() };
    const service = new PurchaseOrdersService(
      prisma as never,
      { voidPosted: jest.fn() } as never,
      new BranchScopeService(),
      location as never,
    );
    return { service, prisma, update };
  }

  const branch3User = { sub: 7, branch: 3, level: 2 } as never;
  const tantaMainUser = { sub: 8, branch: 2, level: 2 } as never;
  const admin = { sub: 1, branch: 1, level: 1 } as never;

  it('rejects updating another branch purchase order', async () => {
    const { service, update } = fixture({ branch_id: 1 });
    await expect(service.update(10, { notes: 'x' }, branch3User)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects deleting another branch purchase order', async () => {
    const { service, update } = fixture({ branch_id: 1 });
    await expect(service.remove(10, branch3User)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects reading another branch purchase order', async () => {
    const { service } = fixture({ branch_id: 1 });
    await expect(service.findOne(10, branch3User)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets Tanta main staff update a Tanta Up (branch 5) purchase order', async () => {
    const { service, update } = fixture({ branch_id: 5 });
    await expect(service.update(10, { notes: 'ok' }, tantaMainUser)).resolves.toMatchObject({ branchId: 5 });
    expect(update).toHaveBeenCalled();
  });

  it('keeps system admins unrestricted', async () => {
    const { service } = fixture({ branch_id: 1 });
    await expect(service.remove(10, admin)).resolves.toEqual({ success: true });
  });

  it('scopes the list to the caller branches by default', async () => {
    const { service, prisma } = fixture({ branch_id: 2 });
    (prisma.prc_purchase_orders as Record<string, jest.Mock>).findMany = jest.fn().mockResolvedValue([]);
    (prisma.prc_purchase_orders as Record<string, jest.Mock>).count = jest.fn().mockResolvedValue(0);
    await service.list({ page: 1, pageSize: 10, skip: 0, take: 10 } as never, tantaMainUser);
    const where = (prisma.prc_purchase_orders as Record<string, jest.Mock>).findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ branch_id: { in: [2, 5, 6] } });
  });
});
