import { OperationalScopeService } from './operational-scope.service';

describe('OperationalScopeService', () => {
  const prisma = {
    users: { findUnique: jest.fn() },
    rbac_user_operational_scopes: { findMany: jest.fn() },
    rbac_user_section_exceptions: { findMany: jest.fn() },
  } as any;
  const engine = { isSuperAdmin: jest.fn() } as any;

  beforeEach(() => jest.clearAllMocks());

  it('limits a staff member to her assigned branch and women section', async () => {
    engine.isSuperAdmin.mockResolvedValue(false);
    prisma.rbac_user_operational_scopes.findMany.mockResolvedValue([
      { branch_id: 3, section: 'female' },
    ]);
    prisma.rbac_user_section_exceptions.findMany.mockResolvedValue([]);

    const service = new OperationalScopeService(prisma, engine);

    await expect(service.resolve(12)).resolves.toEqual({
      all: false,
      branches: new Map([[3, new Set(['female'])]]),
    });
  });

  it('does not grant the other section after its exception expires', async () => {
    engine.isSuperAdmin.mockResolvedValue(false);
    prisma.rbac_user_operational_scopes.findMany.mockResolvedValue([
      { branch_id: 3, section: 'female' },
    ]);
    prisma.rbac_user_section_exceptions.findMany.mockResolvedValue([]);

    const service = new OperationalScopeService(prisma, engine);

    const scope = await service.resolve(12, new Date('2026-09-21T00:00:00.000Z'));
    expect(scope.branches.get(3)).toEqual(new Set(['female']));
  });
});
