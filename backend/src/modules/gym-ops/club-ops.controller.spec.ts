import { ClubOpsController } from './club-ops.controller';

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
      {} as never,
    );

    await controller.universalSearch('محمد', '5', undefined, {
      level: 1,
    } as never);

    expect(universalSearch).toHaveBeenCalledWith('محمد', [2]);
  });

  it.each([[3, 8], [8, 3]])('searches both grouped reception branches from branch %i', async (operatorBranch, sibling) => {
    const universalSearch = jest.fn();
    const controller = new ClubOpsController({ universalSearch } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { siblingBranchIds: jest.fn().mockResolvedValue([operatorBranch, sibling]) } as never);
    await controller.universalSearch('محمد', String(operatorBranch), undefined, { level: 2, branch: operatorBranch } as never);
    expect(universalSearch).toHaveBeenCalledWith('محمد', [operatorBranch, sibling]);
  });

  it('keeps a branch with no group isolated', async () => {
    const universalSearch = jest.fn();
    const controller = new ClubOpsController({ universalSearch } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { siblingBranchIds: jest.fn().mockResolvedValue([3]) } as never);
    await controller.universalSearch('محمد', '3', undefined, { level: 2, branch: 3 } as never);
    expect(universalSearch).toHaveBeenCalledWith('محمد', [3]);
  });
});
