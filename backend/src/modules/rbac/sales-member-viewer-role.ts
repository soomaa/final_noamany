import type { ActionKey } from './catalog/rbac.catalog';

type ViewerCell = { resourceKey: string; actionKey: ActionKey; effect: 'allow' };

const resources = [
  'club.reception',
  'club.members.attendance',
  'org.branches',
  'club.packages.settings',
  'club.subscriptions.customer_sources',
];

export const SALES_MEMBER_VIEWER_ROLE: {
  key: string;
  nameAr: string;
  nameEn: string;
  description: string;
  cells: ViewerCell[];
} = {
  key: 'sales_member_viewer',
  nameAr: 'السيلز — معاينة الأعضاء فقط',
  nameEn: 'Sales member viewer',
  description: 'سكانر وبروفايل الأعضاء والاشتراكات داخل الفرع دون إنشاء أو تعديل أو حذف',
  cells: resources.map((resourceKey) => ({ resourceKey, actionKey: 'view', effect: 'allow' })),
};
