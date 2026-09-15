import { ClubSubscriptionTypesService } from './club-subscription-types.service';

describe('subscription package removal', () => {
  it('retires a package used by active history instead of deleting that history', async () => {
    const prisma = { club_subscription_types: { findUnique: jest.fn().mockResolvedValue({ id: 7, name: 'شهري', branch_id: null, apply_to_all_branches: true, branches: [] }), update: jest.fn() }, club_subscriptions: { count: jest.fn().mockResolvedValue(3) } };
    const service = new ClubSubscriptionTypesService(prisma as never, { allowedBranchIds: jest.fn().mockReturnValue(null) } as never);
    await expect(service.remove(7)).resolves.toMatchObject({ success: true, retired: true, affectedSubscriptions: 3 });
    expect(prisma.club_subscription_types.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { is_active: false } });
  });
});
