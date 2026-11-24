import { defaultPermissionCellsForJobTitle, selfServiceCells } from './job-title-defaults';
import { applyBranchManagerHrDefaults } from './job-title-role.util';

describe('job-title starter permissions', () => {
  it('gives trainers only their portal plus staff self-service by default', () => {
    expect(defaultPermissionCellsForJobTitle('مدربة لياقة')).toEqual([
      { resourceKey: 'trainer.portal', actionKey: 'view', effect: 'allow' },
      ...selfServiceCells(),
    ]);
  });

  it('gives branch managers the HR approval cells (leaves, permissions, requests, extra hours, daily reports, exceptions)', () => {
    const keys = defaultPermissionCellsForJobTitle('مديرة فرع').map((c) => `${c.resourceKey}:${c.actionKey}`);
    expect(keys).toEqual(expect.arrayContaining([
      'leaves.list:view', 'leaves.list:approve', 'leaves.list:reject',
      'leaves.permissions:view', 'leaves.permissions:approve',
      'leaves.requests:view', 'leaves.requests:approve',
      'attendance.adjustments:create',
      'affairs.daily_reports:view',
      'attendance.exceptions:view', 'attendance.exceptions:update',
    ]));
    expect(keys.some((k) => k.endsWith(':delete'))).toBe(false);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives sales staff the member-to-subscription workflow', () => {
    const cells = defaultPermissionCellsForJobTitle('موظف مبيعات');
    expect(cells).toContainEqual({
      resourceKey: 'club.members',
      actionKey: 'create',
      effect: 'allow',
    });
    expect(cells).toContainEqual({
      resourceKey: 'club.subscriptions',
      actionKey: 'create',
      effect: 'allow',
    });
    expect(cells.some((cell) => cell.actionKey === 'delete')).toBe(false);
  });

  it('does not infer broad access for an unknown title', () => {
    expect(defaultPermissionCellsForJobTitle('مسمى مخصص')).toEqual([]);
  });

  it('opens the reception sheet screens without edit or delete on subscriptions', () => {
    const cells = defaultPermissionCellsForJobTitle('ريسيبشن');
    expect(cells).toContainEqual({ resourceKey: 'club.subscriptions.new', actionKey: 'create', effect: 'allow' });
    expect(cells).toContainEqual({ resourceKey: 'employees.new', actionKey: 'create', effect: 'allow' });
    expect(cells.some((c) => c.resourceKey.startsWith('club.subscriptions') && (c.actionKey === 'update' || c.actionKey === 'delete'))).toBe(false);
    expect(cells.some((c) => c.actionKey === 'approve')).toBe(false);
  });

  it('keeps reception managers off the reception starter set', () => {
    expect(defaultPermissionCellsForJobTitle('مدير ريسيبشن')).toEqual([]);
  });

  it('gives captains their discount codes, trainer pages and target', () => {
    const cells = defaultPermissionCellsForJobTitle('كابتن');
    expect(cells).toContainEqual({ resourceKey: 'club.discount_codes.member_grants', actionKey: 'create', effect: 'allow' });
    expect(cells).toContainEqual({ resourceKey: 'club.fitness.trainer_targets', actionKey: 'view', effect: 'allow' });
    expect(cells).toContainEqual({ resourceKey: 'financial-reports.target', actionKey: 'view', effect: 'allow' });
  });

  it('backfills only missing HR cells onto existing branch-manager roles', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma: any = {
      rbac_roles: {
        findMany: jest.fn().mockResolvedValue([
          { id: 7, name_ar: 'مدير فرع' },
          { id: 8, name_ar: 'ريسيبشن' },
        ]),
      },
      rbac_resources: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, key: 'leaves.list' },
          { id: 2, key: 'attendance.adjustments' },
        ]),
      },
      rbac_actions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, key: 'view' },
          { id: 11, key: 'approve' },
          { id: 12, key: 'create' },
        ]),
      },
      rbac_role_permissions: { createMany },
    };
    const result = await applyBranchManagerHrDefaults(prisma);
    expect(result.roles).toEqual([{ id: 7, name: 'مدير فرع' }]);
    expect(result.missingResources).toContain('attendance.exceptions');
    expect(createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } = createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual(expect.arrayContaining([
      { role_id: 7, resource_id: 1, action_id: 11, effect: 'allow' },
      { role_id: 7, resource_id: 2, action_id: 12, effect: 'allow' },
    ]));
    expect(data.every((d: { role_id: number }) => d.role_id === 7)).toBe(true);
  });
});
