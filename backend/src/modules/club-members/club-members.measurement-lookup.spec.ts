import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';
import { ClubMembersController } from './club-members.controller';
import { sidebarApiPermissions } from '../../common/guards/sidebar-api-permissions';

describe('measurement operation member lookup', () => {
  it('uses measurement operation permissions without requiring membership management permissions', () => {
    for (const method of ['measurementOperationLookup', 'measurementOperationMember']) {
      expect(sidebarApiPermissions('ClubMembersController', method, { method: 'GET', query: {}, params: {} } as never)).toEqual(['club.members.measurements:view', 'club.members.measurements:create', 'club.members.measurements:update']);
    }
  });
  it.each([[3, 7], [7, 3]])('finds the exact old member first across a group from branch %i to %i', async (operatorBranch, memberBranch) => {
    const exact = { id: 42, member_code: 'B868', name: 'عضو قديم مطابق', phone: '01000000000', gender: 'male', branch_id: memberBranch, created_at: new Date('2020-01-01') };
    const partials = Array.from({ length: 20 }, (_, i) => ({ ...exact, id: 100 + i, member_code: `B868${i}`, name: `عضو اقتراح ${i}` }));
    const findMany = jest.fn().mockImplementation(({ where }) => {
      if (where.AND.some((filter: any) => filter.member_code?.equals === 'B868')) return Promise.resolve([exact]);
      if (where.AND.some((filter: any) => filter.OR?.some((clause: any) => clause.phone?.equals))) return Promise.resolve([]);
      return Promise.resolve(partials);
    });
    const service = new ClubMembersService({ club_members: { findMany, findFirst: jest.fn().mockResolvedValue(exact) } } as never,
      {} as never, new BranchScopeService(), {} as never, {} as never, { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) });
    const controller = new ClubMembersController(service);
    const user = { sub: 10, level: 2, branch: operatorBranch, job_title: 'موظف استقبال', man_women_type: 3 } as never;
    const hits = await controller.measurementOperationLookup('b868', undefined, user);
    expect(hits[0]).toMatchObject({ id: 42, memberCode: 'B868', branchId: memberBranch });
    expect(hits).toHaveLength(20);
    const branchFilter = findMany.mock.calls[0][0].where.AND.find((filter: any) => filter.branch_id);
    expect(new Set(branchFilter.branch_id.in)).toEqual(new Set([3, 7]));
    expect(findMany.mock.calls[0][0].where.AND.some((filter: any) => filter.created_at)).toBe(false);
    await expect(controller.measurementOperationMember(42, user)).resolves.toMatchObject({ id: 42, branchId: memberBranch });
  });

  it('rejects selecting a member outside the active group', async () => {
    const service = new ClubMembersService({ club_members: { findFirst: jest.fn().mockResolvedValue({ id: 42, branch_id: 9, gender: 'male' }) } } as never,
      {} as never, new BranchScopeService(), {} as never, {} as never, { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) });
    const controller = new ClubMembersController(service);
    await expect(controller.measurementOperationMember(42, { sub: 10, level: 2, branch: 3, man_women_type: 3 } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
