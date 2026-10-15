import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { HrDataScopeEnforcementGuard } from './hr-data-scope-enforcement.guard';
import { SCOPED_HR_DATA_KEY } from './scoped-hr-data.decorator';
import { REQUIRES_PERMISSION_KEY } from '../decorators/requires-permission.decorator';
import { SiteVisitsController } from '../../modules/site-visits/site-visits.controller';
import { PayrollController } from '../../modules/payroll/payroll.controller';
import { HR_SCOPE_SAFE_LOOKUP_KEY } from './hr-scope-safe-lookup.decorator';

function context(): ExecutionContext {
  return {
    getHandler: () => function list() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: 7, level: 3 } }) }),
  } as never;
}

describe('HrDataScopeEnforcementGuard', () => {
  function guard(
    scoped: boolean,
    scope: string | undefined,
    permission = 'affairs.initiatives:view',
    safeLookup = false,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === REQUIRES_PERMISSION_KEY) return [permission];
        return false;
      }),
      get: jest.fn((key: string) =>
        key === SCOPED_HR_DATA_KEY
          ? scoped
          : key === HR_SCOPE_SAFE_LOOKUP_KEY
            ? safeLookup
            : undefined,
      ),
    };
    const permissions = {
      isSuperAdmin: jest.fn().mockResolvedValue(false),
      can: jest.fn().mockResolvedValue(true),
      scopeFor: jest.fn().mockResolvedValue(scope),
    };
    return new HrDataScopeEnforcementGuard(reflector as never, permissions as never);
  }

  it('rejects a branch-scoped actor on an unmarked controller', async () => {
    await expect(guard(false, 'branch').canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a declared predicate controller or a global data scope', async () => {
    await expect(guard(true, 'branch').canActivate(context())).resolves.toBe(true);
    await expect(guard(false, 'global').canActivate(context())).resolves.toBe(true);
  });

  it('allows an explicitly declared read-only HR form lookup', async () => {
    await expect(
      guard(false, 'branch', 'employees.list:create', true).canActivate(context()),
    ).resolves.toBe(true);
  });

  it('does not apply the HR data-scope contract to ONE80 club routes', async () => {
    const instance = guard(false, undefined, 'club.members:view');

    await expect(instance.canActivate(context())).resolves.toBe(true);
  });

  it('marks only real predicate handlers, never their whole controller', () => {
    expect(Reflect.getMetadata(SCOPED_HR_DATA_KEY, SiteVisitsController)).toBeUndefined();
    expect(
      Reflect.getMetadata(
        SCOPED_HR_DATA_KEY,
        SiteVisitsController.prototype.listRecords,
      ),
    ).toBe(true);
    for (const handler of ['list', 'create', 'update', 'remove'] as const) {
      expect(
        Reflect.getMetadata(
          SCOPED_HR_DATA_KEY,
          SiteVisitsController.prototype[handler],
        ),
      ).toBeUndefined();
    }

    expect(Reflect.getMetadata(SCOPED_HR_DATA_KEY, PayrollController)).toBeUndefined();
    expect(
      Reflect.getMetadata(
        SCOPED_HR_DATA_KEY,
        PayrollController.prototype.listRuns,
      ),
    ).toBe(true);
    for (const handler of [
      'listTaxPolicies',
      'createTaxPolicy',
      'listSettlementPolicies',
      'createSettlementPolicy',
      'listComponents',
      'createComponent',
    ] as const) {
      expect(
        Reflect.getMetadata(
          SCOPED_HR_DATA_KEY,
          PayrollController.prototype[handler],
        ),
      ).toBeUndefined();
    }
  });
});
