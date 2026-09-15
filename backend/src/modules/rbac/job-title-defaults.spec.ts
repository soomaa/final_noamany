import { defaultPermissionCellsForJobTitle } from './job-title-defaults';

describe('job-title starter permissions', () => {
  it('gives trainers only their portal by default', () => {
    expect(defaultPermissionCellsForJobTitle('مدربة لياقة')).toEqual([
      { resourceKey: 'trainer.portal', actionKey: 'view', effect: 'allow' },
    ]);
  });

  it('gives personal sales staff the portal and read-only reception preview', () => {
    const cells = defaultPermissionCellsForJobTitle('موظف مبيعات');
    expect(cells).toEqual([
      { resourceKey: 'sales.portal', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'sales.portal', actionKey: 'update', effect: 'allow' },
      { resourceKey: 'club.reception', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'club.members.attendance', actionKey: 'view', effect: 'allow' },
    ]);
  });

  it.each(['Sales', 'sales specialist', 'SALES REPRESENTATIVE'])('recognizes imported personal sales title %s', (title) => {
    expect(defaultPermissionCellsForJobTitle(title)).toEqual(expect.arrayContaining([
      { resourceKey: 'sales.portal', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'sales.portal', actionKey: 'update', effect: 'allow' },
    ]));
  });

  it.each(['مدير مبيعات', 'Sales Manager'])('does not turn the management title %s into a personal portal role', (title) => {
    expect(defaultPermissionCellsForJobTitle(title).some((cell) => cell.resourceKey === 'sales.portal')).toBe(false);
  });

  it('keeps the exact preview-only sales title read-only', () => {
    expect(defaultPermissionCellsForJobTitle('السيلز — معاينة الأعضاء فقط')).toEqual([
      { resourceKey: 'club.reception', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'club.members.attendance', actionKey: 'view', effect: 'allow' },
    ]);
  });

  it('does not infer broad access for an unknown title', () => {
    expect(defaultPermissionCellsForJobTitle('مسمى مخصص')).toEqual([]);
  });
});
