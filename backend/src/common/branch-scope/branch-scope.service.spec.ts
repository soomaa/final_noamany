import { BranchScopeService } from './branch-scope.service';

describe('BranchScopeService explicit assignments', () => {
  const service = new BranchScopeService({ get: jest.fn().mockReturnValue({}) } as never);
  const base = { sub: 1, level: 2, branch: 2 };

  it('uses explicit live multi-branch assignments when present on the session', () => {
    expect(service.allowedBranchIds({ ...base, branchIds: [2, 4, 7] } as never)).toEqual([2, 4, 7]);
    expect(service.resolveListFilter({ ...base, branchIds: [2, 4, 7] } as never, 4)).toEqual([4]);
  });
});
