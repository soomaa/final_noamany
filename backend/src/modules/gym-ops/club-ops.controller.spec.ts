import { ClubOpsController } from './club-ops.controller';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

describe('ClubOpsController', () => {
  it('searches Tanta members when the selected subscription branch is Tanta Down', async () => {
    const universalSearch = jest.fn();
    const controller = new ClubOpsController(
      { universalSearch } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new BranchScopeService(),
    );

    await controller.universalSearch('محمد', '5', undefined, {
      level: 1,
    } as never);

    expect(universalSearch).toHaveBeenCalledWith('محمد', [2], 10, null);
  });

  it.each([[3, 8], [8, 3]])('searches both grouped reception branches from branch %i', async (operatorBranch, sibling) => {
    const universalSearch = jest.fn();
    const controller = new ClubOpsController({ universalSearch } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, new BranchScopeService(),
      { siblingBranchIds: jest.fn().mockResolvedValue([operatorBranch, sibling]) } as never);
    await controller.universalSearch('محمد', String(operatorBranch), undefined, { level: 2, branch: operatorBranch, man_women_type: 3 } as never);
    expect(universalSearch).toHaveBeenCalledWith('محمد', [operatorBranch, sibling], 10, null);
  });

  it('keeps a branch with no group isolated', async () => {
    const universalSearch = jest.fn();
    const controller = new ClubOpsController({ universalSearch } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, new BranchScopeService(),
      { siblingBranchIds: jest.fn().mockResolvedValue([3]) } as never);
    await controller.universalSearch('محمد', '3', undefined, { level: 2, branch: 3, man_women_type: 3 } as never);
    expect(universalSearch).toHaveBeenCalledWith('محمد', [3], 10, null);
  });

  it('limits a women-section employee search to female members', async () => {
    const universalSearch = jest.fn();
    const controller = new ClubOpsController({ universalSearch } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, new BranchScopeService(),
      { siblingBranchIds: jest.fn().mockResolvedValue([3]) } as never);
    await controller.universalSearch('منى', '3', undefined, { level: 2, branch: 3, man_women_type: 2 } as never);
    expect(universalSearch).toHaveBeenCalledWith('منى', [3], 10, 'female');
  });

  it('hides audit entries of other branches from a branch user', async () => {
    const forEntity = jest.fn();
    const controller = new ClubOpsController({} as never, {} as never, { forEntity } as never, {} as never, {} as never, {} as never, {} as never, new BranchScopeService());
    await controller.entityAudit('club_member', '9', { level: 2, branch: 3 } as never);
    expect(forEntity).toHaveBeenCalledWith('club_member', '9', 50, [3]);
    await controller.entityAudit('club_member', '9', { level: 1 } as never);
    expect(forEntity).toHaveBeenLastCalledWith('club_member', '9', 50, null);
  });

  it('rejects a task status change for a foreign-branch task', async () => {
    const automation = { findTaskBranch: jest.fn().mockResolvedValue({ branch_id: 4 }), updateTaskStatus: jest.fn() };
    const controller = new ClubOpsController({} as never, {} as never, {} as never, automation as never, {} as never, {} as never, {} as never, new BranchScopeService());
    await expect(controller.updateTaskStatus(5, 'completed', { level: 2, branch: 3 } as never)).rejects.toThrow('لا تملك صلاحية');
    expect(automation.updateTaskStatus).not.toHaveBeenCalled();
  });
});
