import { ClubBranchGroupService } from './club-branch-group.service';

describe('ClubBranchGroupService', () => {
  it('returns only the branches in the selected active group', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      group: { is_active: true, members: [{ branch_id: 3 }, { branch_id: 4 }] },
    });
    const service = new ClubBranchGroupService({
      club_branch_group_members: { findUnique },
    } as never);

    await expect(service.siblingBranchIds(3)).resolves.toEqual([3, 4]);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { branch_id: 3 } }));
  });

  it('keeps an ungrouped or inactive branch isolated', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ group: { is_active: false, members: [{ branch_id: 3 }, { branch_id: 4 }] } });
    const service = new ClubBranchGroupService({ club_branch_group_members: { findUnique } } as never);

    await expect(service.siblingBranchIds(9)).resolves.toEqual([9]);
    await expect(service.siblingBranchIds(3)).resolves.toEqual([3]);
  });

  it('recognizes siblings without authorizing unrelated branches', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      group: { is_active: true, members: [{ branch_id: 3 }, { branch_id: 4 }] },
    });
    const service = new ClubBranchGroupService({ club_branch_group_members: { findUnique } } as never);

    await expect(service.sharesGroup(3, 4)).resolves.toBe(true);
    await expect(service.sharesGroup(3, 8)).resolves.toBe(false);
  });
});
