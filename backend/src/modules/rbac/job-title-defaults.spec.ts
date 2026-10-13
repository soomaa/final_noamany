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
});
