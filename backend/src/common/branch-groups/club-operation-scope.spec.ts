import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BranchScopeService } from '../branch-scope/branch-scope.service';
import { BranchScopeGuard } from '../guards/branch-scope.guard';
import { JwtUser } from '../types/jwt-user';
import { ClubSubscriptionsController } from '../../modules/club-subscriptions/club-subscriptions.controller';
import { assertClubOperationBranch, clubOperationBranchIds } from './club-operation-scope';
import { ClubBranchGroupService } from './club-branch-group.service';

describe('refund and member transfer group scope', () => {
  const scope = new BranchScopeService();
  const user = { level: 2, branch: 3, man_women_type: 3 } as JwtUser;
  const groups = { siblingBranchIds: jest.fn() };
  beforeEach(() => { groups.siblingBranchIds.mockReset(); groups.siblingBranchIds.mockResolvedValue([3, 7]); });

  it('allows a sibling and rejects branches outside the active group', async () => {
    await expect(assertClubOperationBranch(scope, groups, user, 7)).resolves.toBeUndefined();
    await expect(assertClubOperationBranch(scope, groups, user, 9)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps an inactive or ungrouped branch isolated', async () => {
    const service = new ClubBranchGroupService({ club_branch_group_members: { findUnique: jest.fn().mockResolvedValue({ group: { is_active: false, members: [{ branch_id: 3 }, { branch_id: 7 }] } }) } } as never);
    await expect(assertClubOperationBranch(scope, service, user, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps admins unrestricted and unassigned users closed', async () => {
    await expect(clubOperationBranchIds(scope, groups, { ...user, level: 1 })).resolves.toBeNull();
    await expect(clubOperationBranchIds(scope, groups, { ...user, branch: 0 })).resolves.toEqual([]);
    expect(groups.siblingBranchIds).not.toHaveBeenCalled();
  });

  it('allows foreign branch parameters only on marked operation routes', async () => {
    const guard = new BranchScopeGuard(scope, new Reflector(), groups);
    const request = { user, query: { branch: '7' }, body: {} };
    const context = (handler: Function) => ({ getHandler: () => handler, getClass: () => ClubSubscriptionsController, switchToHttp: () => ({ getRequest: () => request }) }) as never;
    await expect(guard.canActivate(context(ClubSubscriptionsController.prototype.memberTransferSources))).resolves.toBe(true);
    await expect(guard.canActivate(context(ClubSubscriptionsController.prototype.list))).rejects.toBeInstanceOf(ForbiddenException);
    request.query.branch = '9';
    await expect(guard.canActivate(context(ClubSubscriptionsController.prototype.refundSources))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
