import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubOpsController } from './club-ops.controller';
import { ClubSearchService } from './club-search.service';

/** رجالي/حريمي/الكل rule on reception recent check-ins and member search. */
describe('reception recent check-ins / search — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 11, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1 } as never;

  function controller(search: Record<string, jest.Mock>) {
    return new ClubOpsController(search as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, new BranchScopeService(),
      { siblingBranchIds: jest.fn(async (id: number) => [id]) } as never);
  }

  it("men's employee gets everyone's check-ins by default, men's on a pick, and may open women's", async () => {
    const recentCheckIns = jest.fn().mockResolvedValue([]);
    const ops = controller({ recentCheckIns });
    await ops.recentCheckIns(undefined, undefined, men);
    expect(recentCheckIns).toHaveBeenLastCalledWith(20, expect.anything(), null);
    await ops.recentCheckIns(undefined, undefined, men, 'male');
    expect(recentCheckIns).toHaveBeenLastCalledWith(20, expect.anything(), 'male');
    await expect(ops.recentCheckIns(undefined, undefined, men, 'female')).resolves.toEqual([]);
    expect(recentCheckIns).toHaveBeenLastCalledWith(20, expect.anything(), 'female');
    expect(recentCheckIns).toHaveBeenCalledTimes(3);
  });

  it("women's employee gets everyone's check-ins on 'all' and may open men's", async () => {
    const recentCheckIns = jest.fn().mockResolvedValue([]);
    const ops = controller({ recentCheckIns });
    await ops.recentCheckIns('10', undefined, women, 'all');
    expect(recentCheckIns).toHaveBeenLastCalledWith(10, expect.anything(), null);
    await expect(ops.recentCheckIns(undefined, undefined, women, 'male')).resolves.toEqual([]);
    expect(recentCheckIns).toHaveBeenLastCalledWith(20, expect.anything(), 'male');
  });

  it('admin chooses a section or sees both', async () => {
    const recentCheckIns = jest.fn().mockResolvedValue([]);
    const ops = controller({ recentCheckIns });
    await ops.recentCheckIns(undefined, undefined, admin, 'female');
    expect(recentCheckIns).toHaveBeenLastCalledWith(20, null, 'female');
    await ops.recentCheckIns(undefined, undefined, admin);
    expect(recentCheckIns).toHaveBeenLastCalledWith(20, null, null);
  });

  it('member search lets a one-section employee search the other section, and everyone by default', async () => {
    const universalSearch = jest.fn().mockResolvedValue([]);
    const ops = controller({ universalSearch });
    await expect(ops.universalSearch('x', undefined, undefined, men, 'female')).resolves.toEqual([]);
    expect(universalSearch).toHaveBeenLastCalledWith('x', expect.anything(), 10, 'female');
    await ops.universalSearch('x', undefined, undefined, men);
    expect(universalSearch).toHaveBeenLastCalledWith('x', expect.anything(), 10, null);
    await ops.universalSearch('x', undefined, undefined, admin, 'female');
    expect(universalSearch).toHaveBeenLastCalledWith('x', null, 10, 'female');
  });

  it('the service filters check-in rows by the member section', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClubSearchService({ club_attendance: { findMany } } as never, {} as never);
    await service.recentCheckIns(20, [2], 'female');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { member: { is_deleted: false, gender: 'female' }, branch_id: { in: [2] } } }));
    await service.recentCheckIns(20, null, null);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { member: { is_deleted: false } } }));
  });
});
