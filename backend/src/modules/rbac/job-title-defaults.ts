import type { ActionKey } from './catalog/rbac.catalog';

export interface JobTitlePermissionCell {
  resourceKey: string;
  actionKey: ActionKey;
  effect: 'allow';
}

const VIEW_OPERATE: ActionKey[] = ['view', 'create', 'update', 'print'];
const VIEW_REPORT: ActionKey[] = ['view', 'export', 'print'];

function grant(resources: string[], actions: ActionKey[]): JobTitlePermissionCell[] {
  return resources.flatMap((resourceKey) =>
    actions.map((actionKey) => ({ resourceKey, actionKey, effect: 'allow' as const })),
  );
}

function normalizeJobTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Conservative starter permissions for a newly-created job-title role.
 *
 * These cells are written only while the role matrix is empty. An administrator's
 * existing/custom matrix is never overwritten, and can be refined from Roles & Permissions.
 */
export function defaultPermissionCellsForJobTitle(name: string): JobTitlePermissionCell[] {
  const title = normalizeJobTitle(name);
  const isSalesManagement = /(^|\s)(مدير|رئيس|رييس|مشرف)(\s|$)/.test(title)
    || /\b(manager|head|supervisor)\b/.test(title);
  const isPreviewOnlySales = /معاينه الاعضاء فقط/.test(title);
  const isPersonalSales = !isSalesManagement && !isPreviewOnlySales && (
    /(مبيعات|تسويق|سيلز)/.test(title)
    || /^(sales|sales specialist|sales representative)$/.test(title)
  );

  if (/(مدرب|مدربه)/.test(title)) {
    return grant(['trainer.portal'], ['view']);
  }
  if (isPreviewOnlySales) {
    return grant(['club.reception', 'club.members.attendance'], ['view']);
  }
  if (isPersonalSales) {
    return [
      ...grant(['sales.portal'], ['view', 'update']),
      ...grant(['club.reception', 'club.members.attendance'], ['view']),
    ];
  }
  if (/(استقبال|ريسبشن)/.test(title)) {
    // Note: no `approve` — allowing an expired member in stays a manager decision.
    return grant(
      [
        'club.reception',
        'club.reception.quick_services',
        'club.members',
        'club.members.attendance',
        'club.subscriptions',
      ],
      VIEW_OPERATE,
    );
  }
  if (/(لياقه|مشرف صاله|تغذيه)/.test(title)) {
    return grant(['club.fitness'], VIEW_OPERATE);
  }
  if (/صيانه/.test(title)) {
    return grant(
      ['club.fitness.equipment', 'club.fitness.equipment_maintenance'],
      VIEW_OPERATE,
    );
  }
  if (/(مستودع|مخزن)/.test(title)) {
    return grant(['gym-sales.inventory'], [
      'view',
      'create',
      'update',
      'approve',
      'export',
      'print',
    ]);
  }
  if (/(محاسب|حسابات)/.test(title)) {
    return grant(['accounting', 'financial-reports'], [
      'view',
      'create',
      'update',
      'approve',
      'export',
      'print',
      'audit',
    ]);
  }
  if (/امين صندوق/.test(title)) {
    return grant(['club.subscriptions', 'gym-sales.sales'], VIEW_OPERATE);
  }
  if (/(موارد بشريه|شؤون موظفين)/.test(title)) {
    return grant(['hr'], [
      'view',
      'create',
      'update',
      'approve',
      'reject',
      'export',
      'print',
      'audit',
    ]);
  }
  if (/كافيه|cafe/.test(title)) {
    return grant(['gym-sales'], [
      'view',
      'create',
      'update',
      'approve',
      'export',
      'print',
    ]);
  }
  if (/(مدير عام|مدير فرع|مشرف عام)/.test(title)) {
    // Managers start with read/report access. Super-admin elevation stays an explicit
    // human decision and is never inferred from a free-text title.
    return grant(['club', 'hr', 'gym-sales', 'financial-reports'], VIEW_REPORT);
  }

  return [];
}
