import { defaultPermissionCellsForJobTitle } from './job-title-defaults';

describe('job-title starter permissions', () => {
  it('gives trainers only their portal by default', () => {
    expect(defaultPermissionCellsForJobTitle('مدربة لياقة')).toEqual([
      { resourceKey: 'trainer.portal', actionKey: 'view', effect: 'allow' },
    ]);
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
});
