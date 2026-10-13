import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';

describe('employee transfer history', () => {
  const prisma = { club_member_subscription_transfers: { findMany: jest.fn().mockResolvedValue([]) }, club_subscription_transfers: { findMany: jest.fn().mockResolvedValue([]) } };
  const groups = { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) };
  const service = new ClubSubscriptionTransfersService(prisma as never, {} as never, {} as never, {} as never, new BranchScopeService(), groups);
  const employee = { level: 2, branch: 3 } as JwtUser;

  it('restricts member-transfer history to today within the allowed group', async () => {
    await service.listMemberTransfers(employee);
    expect(prisma.club_member_subscription_transfers.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { effective_date: localDateString(), OR: [{ source_branch_id: { in: [3, 7] } }, { destination_branch_id: { in: [3, 7] } }] } }));
  });

  it('restricts plan-transfer history and statistics to today for employees', async () => {
    await service.list(employee);
    expect(prisma.club_subscription_transfers.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { branch_id: { in: [3] }, transfer_date: localDateString() } }));
    await service.statistics(employee);
    expect(prisma.club_subscription_transfers.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { branch_id: { in: [3] }, transfer_date: localDateString() } }));
  });

  it.each([{ ...employee, level: 1 }, { ...employee, level: 3 }, { ...employee, is_super_admin: true }])('preserves historical access for administrators and managers', async (user) => {
    await service.listMemberTransfers(user);
    const calls = prisma.club_member_subscription_transfers.findMany.mock.calls;
    expect(calls[calls.length - 1][0].where).not.toHaveProperty('effective_date');
  });
});
