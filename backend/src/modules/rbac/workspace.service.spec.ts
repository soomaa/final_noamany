import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  function makeService(keys: string[], trainer = false) {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ emp_code: trainer ? 73 : null }),
      },
      club_trainers: {
        findUnique: jest.fn().mockResolvedValue(trainer ? { is_active: true, is_deleted: false } : null),
      },
    };
    const engine = {
      getEffective: jest.fn().mockResolvedValue({ superAdmin: false, keys: new Set(keys) }),
    };
    return { service: new WorkspaceService(engine as never, prisma as never), engine };
  }

  it('gives a subscription creator a personal workspace with only operational widgets', async () => {
    const { service } = makeService([
      'club.subscriptions.new:view',
      'club.subscriptions.new:create',
    ]);

    await expect(service.getWorkspace(14)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'subscriptions',
      widgets: ['my_subscriptions_today'],
    });
  });

  it('does not expose subscription widgets when creation is granted without page view', async () => {
    const { service } = makeService(['club.subscriptions.new:create']);

    await expect(service.getWorkspace(19)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'staff',
      widgets: [],
    });
  });

  it('gives an employee with no operational permission a safe personal workspace', async () => {
    const { service } = makeService([]);

    await expect(service.getWorkspace(15)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'staff',
      widgets: [],
    });
  });

  it('gives a trainer with HR access the regular HR workspace instead of forcing the trainer portal', async () => {
    const { service } = makeService(['hr.hub:view'], true);

    await expect(service.getWorkspace(20)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'hr',
      widgets: [],
    });
  });

  it('keeps a trainer with no administrative access on the trainer portal', async () => {
    const { service } = makeService([], true);

    await expect(service.getWorkspace(21)).resolves.toEqual({
      homeRoute: '/trainer',
      roleHint: 'trainer',
      widgets: ['my_schedule', 'attendance', 'earnings', 'trainer_statistics'],
    });
  });

  it('does not add branch-wide subscription widgets to a member creator without subscription views', async () => {
    const { service } = makeService(['club.members:create', 'club.members:view']);

    await expect(service.getWorkspace(16)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'reception',
      widgets: [],
    });
  });

  it('uses the subscription list view to authorize the expiring-subscriptions widget', async () => {
    const { service } = makeService([
      'club.members:create',
      'club.members:view',
      'club.subscriptions.list:view',
    ]);

    await expect(service.getWorkspace(17)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'reception',
      widgets: ['expiring_subscriptions'],
    });
  });

  it('adds the personal treasury widget only when its workspace page is viewable', async () => {
    const { service } = makeService([
      'club.members:create',
      'club.members:view',
      'club.subscriptions.daily_cashier:view',
    ]);

    await expect(service.getWorkspace(18)).resolves.toEqual({
      homeRoute: '/workspace',
      roleHint: 'reception',
      widgets: ['treasury_today'],
    });
  });
});
