import { ForbiddenException } from '@nestjs/common';
import { EmployeesService } from './employees.service';

describe('EmployeesService job-title role security', () => {
  const makeService = (actor: { superAdmin: boolean; keys: Set<string> }, role: { superAdmin: boolean; keys: Set<string> }) => {
    const engine = {
      getEffective: jest.fn().mockResolvedValue(actor),
      effectiveForRoleIds: jest.fn().mockResolvedValue(role),
      invalidateUser: jest.fn(),
    };
    return {
      service: new EmployeesService({} as never, engine as never, {} as never),
      engine,
    };
  };

  it('blocks changing the role linked to the actor own employee record', async () => {
    const { service, engine } = makeService(
      { superAdmin: false, keys: new Set(['employees.list:update']) },
      { superAdmin: false, keys: new Set() },
    );

    await expect(
      (service as any).assertCanAssignRole(7, 7, 91, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(engine.getEffective).not.toHaveBeenCalled();
  });

  it('blocks a delegated HR actor from assigning a role above their grant ceiling', async () => {
    const { service } = makeService(
      { superAdmin: false, keys: new Set(['employees.list:update']) },
      { superAdmin: false, keys: new Set(['employees.list:update', 'admin.roles:manage']) },
    );

    await expect(
      (service as any).assertCanAssignRole(7, 8, 91, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an assignment whose effective permissions are within the actor ceiling', async () => {
    const { service } = makeService(
      { superAdmin: false, keys: new Set(['employees.list:view', 'employees.list:update']) },
      { superAdmin: false, keys: new Set(['employees.list:view']) },
    );

    await expect(
      (service as any).assertCanAssignRole(7, 8, 91, true),
    ).resolves.toBeUndefined();
  });
});
