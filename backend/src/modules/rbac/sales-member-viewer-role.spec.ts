import { SALES_MEMBER_VIEWER_ROLE } from './sales-member-viewer-role';

describe('preview-only sales scanner role', () => {
  it('keeps the exact client name and grants view-only scanner dependencies', () => {
    expect(SALES_MEMBER_VIEWER_ROLE.nameAr).toBe('السيلز — معاينة الأعضاء فقط');
    expect(SALES_MEMBER_VIEWER_ROLE.cells).toEqual([
      { resourceKey: 'club.reception', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'club.members.attendance', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'org.branches', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'club.packages.settings', actionKey: 'view', effect: 'allow' },
      { resourceKey: 'club.subscriptions.customer_sources', actionKey: 'view', effect: 'allow' },
    ]);
    expect(SALES_MEMBER_VIEWER_ROLE.cells.every((cell) => cell.actionKey === 'view')).toBe(true);
  });
});
