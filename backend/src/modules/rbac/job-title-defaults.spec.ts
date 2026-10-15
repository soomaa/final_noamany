import { defaultPermissionCellsForJobTitle } from './job-title-defaults';

describe('job-title starter permissions', () => {
  it('gives trainers only their portal by default', () => {
    expect(defaultPermissionCellsForJobTitle('مدربة لياقة')).toEqual([
      { resourceKey: 'trainer.portal', actionKey: 'view', effect: 'allow' },
    ]);
  });

  it('gives sales staff only the personal follow-up portal', () => {
    const cells = defaultPermissionCellsForJobTitle('موظف مبيعات');
    expect(cells).toContainEqual({
      resourceKey: 'sales.portal',
      actionKey: 'view',
      effect: 'allow',
    });
    expect(cells).toContainEqual({
      resourceKey: 'sales.portal',
      actionKey: 'update',
      effect: 'allow',
    });
    expect(cells.some((cell) => cell.resourceKey === 'club.members')).toBe(false);
    expect(cells.some((cell) => cell.resourceKey === 'club.subscriptions')).toBe(false);
  });

  it('does not infer broad access for an unknown title', () => {
    expect(defaultPermissionCellsForJobTitle('مسمى مخصص')).toEqual([]);
  });

  it('gives HR officers departments and insurance settings', () => {
    const cells = defaultPermissionCellsForJobTitle('موارد بشرية');
    expect(cells).toContainEqual({
      resourceKey: 'org.edarat',
      actionKey: 'view',
      effect: 'allow',
    });
    expect(cells).toContainEqual({
      resourceKey: 'admin.insurance',
      actionKey: 'update',
      effect: 'allow',
    });
  });
});
