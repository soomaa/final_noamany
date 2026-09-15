import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  it('lands a sales specialist on the personal portal before generic cafe routes', async () => {
    const engine = {
      getEffective: jest.fn().mockResolvedValue({
        superAdmin: false,
        keys: new Set(['sales.portal:view']),
      }),
    };
    const prisma = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: null }) },
      club_trainers: { findUnique: jest.fn() },
    };
    const service = new WorkspaceService(engine as never, prisma as never);

    await expect(service.getWorkspace(22)).resolves.toMatchObject({
      homeRoute: '/sales-portal?tab=today',
      roleHint: 'sales',
    });
  });
});
