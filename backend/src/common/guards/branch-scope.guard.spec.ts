import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BranchScopeGuard } from './branch-scope.guard';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('BranchScopeGuard nested request isolation', () => {
  const scope = { allowedBranchIds: jest.fn() };
  const guard = new BranchScopeGuard(scope as never);

  beforeEach(() => scope.allowedBranchIds.mockReturnValue([2]));

  it('rejects a foreign branch nested inside trainer schedule arrays', () => {
    const request = {
      user: { level: 2, branch: 2 },
      query: {},
      body: {
        trainerSchedules: [{ slots: [{ branchId: 3 }] }],
      },
    };

    expect(() => guard.canActivate(context(request))).toThrow(ForbiddenException);
  });

  it('rejects a foreign branch in branchIds package selection', () => {
    const request = {
      user: { level: 2, branch: 2 },
      query: {},
      body: { branchIds: [2, 3] },
    };

    expect(() => guard.canActivate(context(request))).toThrow(ForbiddenException);
  });

  it('rejects creating or moving an employee into a foreign branch', () => {
    const request = {
      user: { level: 2, branch: 2 },
      query: {},
      body: { emp_name: 'موظف', branch_id_fk: 3 },
    };

    expect(() => guard.canActivate(context(request))).toThrow(ForbiddenException);
  });

  it('allows nested targets when every branch is in scope', () => {
    scope.allowedBranchIds.mockReturnValue([2, 3]);
    const request = {
      user: { level: 3, branch: 2 },
      query: {},
      body: { branchIds: [2, 3], slots: [{ branchId: 3 }] },
    };

    expect(guard.canActivate(context(request))).toBe(true);
    expect(request).toHaveProperty('branchScope', [2, 3]);
  });
});
