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
 * Reception desk, from the client's permissions sheet (الصلاحيات خاص الريسيبشن). "Today only"
 * and "no edit/delete" are enforced server-side for reception staff; these cells only open
 * the screens. Note: no `approve` — letting an expired member in stays a manager decision.
 */
export function receptionCells(): JobTitlePermissionCell[] {
  return [
    // Quick services are not a reception task (Nada, 2 Nov).
    ...grant(['club.reception'], VIEW_OPERATE),
    // Members: full desk workflow; edits/deletes are limited to members added today.
    ...grant(['club.members'], ['view', 'create', 'update', 'delete', 'print', 'export']),
    ...grant(['club.members.attendance'], ['view', 'create', 'print']),
    ...grant(['club.members.barcode_management'], ['view', 'create', 'print', 'export']),
    // Subscriptions & payments: add only, no edit/delete; lists are today-only.
    ...grant(['club.subscriptions.list', 'club.subscriptions.receipts', 'club.subscriptions.outstanding'], ['view', 'print']),
    ...grant(['club.subscriptions.new', 'club.subscriptions.special', 'club.subscriptions.online', 'club.subscriptions.refunds'], ['view', 'create', 'print']),
    // Points
    ...grant(['club.points.member_history', 'club.points.earned_report', 'club.points.active_members_report'], ['view', 'print', 'export']),
    // Discount codes
    ...grant(['club.discount_codes.member_grants'], ['view', 'create']),
    ...grant(['club.discount_codes.captain_codes', 'club.discount_codes.member_search'], ['view']),
    // Lockers: reception does not add locker numbers (club.lockers.new).
    ...grant(['club.lockers.list'], ['view']),
    ...grant(['club.lockers.inventory'], ['view', 'create', 'print']),
    ...grant(['club.lockers.inventory_reports'], ['view', 'print']),
    // Financial reports: today only; target is the employee's own, monthly.
    ...grant(['financial-reports.daily_closing', 'financial-reports.target'], ['view', 'print']),
    // Expenses: add one and see today's own-branch expenses (enforced by the expenses service),
    // not the expense reports.
    ...grant(['financial-reports.expenses'], ['view', 'create', 'print']),
    // HR: add an employee only.
    ...grant(['employees.new'], ['view', 'create']),
    // App invitations
    ...grant(['app-management.invitations.accepted', 'app-management.invitations.attended', 'app-management.invitations.rejected'], ['view']),
    // Own evaluations
    ...grant(['evaluation-management.report'], ['view']),
    // Cafe & stock
    ...grant(['gym-sales.sales.new_receipt'], ['view', 'create', 'print']),
    ...grant(['gym-sales.sales.shifts', 'gym-sales.sales.invoices'], ['view', 'print']),
    ...grant(['gym-sales.sales.drawings'], ['view', 'create']),
    ...grant(['gym-sales.inventory.stock_taking'], ['view', 'create', 'print']),
    ...grant(['gym-sales.inventory.stock_taking_report'], ['view', 'print']),
  ];
}

/**
 * Branch manager (مدير / مديرة فرع) and men/women management supervisor (مشرف إدارة حريمي / رجالي),
 * from the client's sheet «الصلاحيات — مدير فرع» (22 Nov 2026). View / print / export only: the
 * periods (today, current + previous month, current month, current year), the staff scope and the
 * "no edit / no delete" rule are enforced server-side (common/utils/manager-scope.util.ts).
 */
export function branchManagerCells(): JobTitlePermissionCell[] {
  return [
    // إدارة الباركود: SPA / classes attendance, barcode scan times
    ...grant(['club.members.barcode.spa_attendance', 'club.members.barcode.classes_attendance', 'club.members.barcode.scan_times'], VIEW_REPORT),
    // إدارة الاشتراكات والمدفوعات: today's lists
    ...grant(['club.subscriptions.list', 'club.subscriptions.receipts', 'club.subscriptions.refunds'], ['view', 'print']),
    // النقاط
    ...grant(['club.points.member_history', 'club.points.earned_report', 'club.points.active_members_report'], VIEW_REPORT),
    // أكواد الخصم: captains of the branch/section + reception staff
    ...grant(['club.discount_codes.captain_codes', 'club.discount_codes.member_report', 'club.discount_codes.usage_report'], VIEW_REPORT),
    // إدارة اللوكر: today's locker subscriptions and inventory reports
    ...grant(['club.lockers.list', 'club.lockers.inventory_reports'], ['view', 'print']),
    // التقارير المالية
    ...grant(['financial-reports.expenses', 'financial-reports.reports', 'financial-reports.daily_closing', 'financial-reports.analysis', 'financial-reports.target'], VIEW_REPORT),
    // الموارد البشرية — مركز التقارير + حضور وانصراف الموظفين
    ...grant(['reports.hub', 'attendance.board', 'attendance.reports'], VIEW_REPORT),
    // إدارة التطبيق: invitations of the current month
    ...grant(['app-management.invitations.accepted', 'app-management.invitations.attended', 'app-management.invitations.rejected'], ['view']),
    // إدارة التقييمات
    ...grant(['evaluation-management.report'], VIEW_REPORT),
    // إدارة الكافيه والمخزون
    ...grant(['gym-sales.sales.invoices', 'gym-sales.sales.drawings', 'gym-sales.inventory.stock_taking', 'gym-sales.inventory.stock_taking_report'], ['view', 'print']),
    // إدارة خدمة العملاء
    ...grant(['customer-service.reports'], VIEW_REPORT),
  ];
}

/** Titles that get the branch-manager sheet (normalised: ة→ه, إ→ا). */
export function isBranchManagerSheetTitle(name: string): boolean {
  const title = normalizeJobTitle(name);
  return /مدير(ه)? ?(ال)?فرع/.test(title) || /مشرف(ه)? ?(ال)?اداره ?(ال)?(حريمي|رجالي)/.test(title);
}

/** Captain, from the client's sheet: own discount codes, trainer evaluation/target, own target. */
export function captainCells(): JobTitlePermissionCell[] {
  return [
    ...grant(['club.discount_codes.member_grants'], ['view', 'create']),
    ...grant(['club.discount_codes.member_search', 'club.discount_codes.captain_codes'], ['view']),
    ...grant(['club.fitness.trainer_evaluations', 'club.fitness.trainer_targets'], ['view']),
    ...grant(['financial-reports.target'], ['view', 'print']),
    // Trainers (مدرب) were merged into كابتن, so the role keeps their portal.
    ...grant(['trainer.portal'], ['view']),
  ];
}

/** Bar / cafe counter: sell, see own shift and invoices, take stock. No price or product edits. */
export function barCells(): JobTitlePermissionCell[] {
  return [
    ...grant(['gym-sales.sales.new_receipt'], ['view', 'create', 'print']),
    ...grant(['gym-sales.sales.drafts', 'gym-sales.sales.shifts', 'gym-sales.sales.invoices'], ['view', 'print']),
    ...grant(['gym-sales.sales.drawings'], ['view', 'create']),
    ...grant(['gym-sales.inventory.stock_taking'], ['view', 'create', 'print']),
    ...grant(['gym-sales.inventory.stock_taking_report'], ['view', 'print']),
  ];
}

/**
 * «إدارة المبيعات»: what selling needs — the sales portal, registering a member and a
 * subscription. Granted by the sales job title, or on top of any other role through the
 * per-user «يعمل كأخصائي مبيعات» toggle (the `additional_sales` role).
 */
export function salesCells(): JobTitlePermissionCell[] {
  return [
    ...grant(['sales.portal'], ['view', 'update']),
    ...grant(['club.members'], ['view', 'create', 'print', 'export']),
    ...grant(['club.subscriptions.new'], ['view', 'create', 'print']),
    ...grant(['club.subscriptions.list'], ['view', 'print']),
  ];
}

/** Every staff role keeps the self-service the old generic «موظف» role gave: own leaves and permissions. */
export function selfServiceCells(): JobTitlePermissionCell[] {
  return grant(['leaves.permissions', 'leaves.requests'], ['view', 'create']);
}

/**
 * Conservative starter permissions for a newly-created job-title role.
 *
 * These cells are written only while the role matrix is empty. An administrator's
 * existing/custom matrix is never overwritten, and can be refined from Roles & Permissions.
 */
export function defaultPermissionCellsForJobTitle(name: string): JobTitlePermissionCell[] {
  const title = normalizeJobTitle(name);

  if (isBranchManagerSheetTitle(name)) return branchManagerCells();

  if (/(مدرب|مدربه)/.test(title)) {
    return grant(['trainer.portal'], ['view']);
  }
  if (/(مبيعات|تسويق)/.test(title)) {
    return grant(['club.members', 'club.subscriptions'], [
      'view',
      'create',
      'update',
      'export',
      'print',
    ]);
  }
  if (/(استقبال|ريسبشن|ريسيبشن)/.test(title) && !/(مدير|مشرف|رئيس)/.test(title)) {
    return receptionCells();
  }
  if (/كابتن/.test(title)) {
    return captainCells();
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
  if (/(^| )بار( |$)|باريستا/.test(title)) {
    return barCells();
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
  if (/(مدير عام|مدير فرع|مديره فرع|مشرف عام)/.test(title)) {
    // Managers start with read/report access. Super-admin elevation stays an explicit
    // human decision and is never inferred from a free-text title.
    return grant(['club', 'hr', 'gym-sales', 'financial-reports'], VIEW_REPORT);
  }

  return [];
}
