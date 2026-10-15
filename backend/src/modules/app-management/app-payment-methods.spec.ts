import { AppManagementService } from './app-management.service';

function setup(branchRows: unknown[] = [], globalRows: unknown[] = []) {
  const findMany = jest.fn()
    .mockResolvedValueOnce(branchRows)
    .mockResolvedValueOnce(globalRows);
  const prisma = { am_payment_methods: { findMany, create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() }, tbl_branches: { findMany: jest.fn() } };
  const branchScope = {
    allowedBranchIds: jest.fn().mockReturnValue(null),
    isBranchAllowed: jest.fn().mockReturnValue(true),
  };
  return { prisma, branchScope, service: new AppManagementService(prisma as never, { get: () => '/uploads' } as never, {} as never, branchScope as never, { create: jest.fn() } as never) };
}

describe('member-app payment method catalog', () => {
  const wallet = { id: 1, provider: 'instapay', label: 'InstaPay', value: 'one80@instapay', instructions: null, sort_order: 1, is_active: true, branch_id: null };

  it('uses active branch rows as a complete override', async () => {
    const branch = { ...wallet, id: 2, value: 'branch@instapay', branch_id: 7 };
    const { prisma, service } = setup([branch], [wallet]);
    await expect(service.listPaymentMethodsForMember(7)).resolves.toEqual([
      { id: 2, provider: 'instapay', label: 'InstaPay', value: 'branch@instapay', instructions: null, sortOrder: 1 },
    ]);
    expect(prisma.am_payment_methods.findMany).toHaveBeenCalledTimes(1);
  });

  it('falls back to active global rows when a branch has none', async () => {
    const { service } = setup([], [wallet]);
    await expect(service.listPaymentMethodsForMember(7)).resolves.toEqual([
      { id: 1, provider: 'instapay', label: 'InstaPay', value: 'one80@instapay', instructions: null, sortOrder: 1 },
    ]);
  });

  it('fails closed when scoped staff try to manage a global or foreign-branch method', async () => {
    const { service, branchScope, prisma } = setup();
    branchScope.allowedBranchIds.mockReturnValue([7]);
    branchScope.isBranchAllowed.mockImplementation((_user: unknown, branchId: number) => branchId === 7);
    const user = { level: 3, branch: 7 } as never;

    await expect(service.createPaymentMethod({ provider: 'instapay', label: 'فرع 8', value: 'x', branchId: 8 }, user)).rejects.toThrow('فرع آخر');
    await expect(service.createPaymentMethod({ provider: 'instapay', label: 'عام', value: 'x' }, user)).rejects.toThrow('كل الفروع');
    expect(prisma.am_payment_methods.create).not.toHaveBeenCalled();
  });
});
