/**
 * RBAC CATALOG — the single source of truth for the permissionable resource tree
 * and the standard action set. Derived from the new React app's navigation
 * (frontend/src/lib/nav.ts) and routes (frontend/src/app/router.tsx).
 *
 * Consumed by:
 *   - prisma/seed-rbac.ts          (seeds rbac_resources / rbac_actions / rbac_resource_actions)
 *   - controllers (@RequiresPermission keys must match resource `key`s here)
 *   - MenuService / MeController   (filtered nav + route→key map for the frontend)
 *
 * Keep keys STABLE — they are stored in the DB and referenced across the codebase.
 */

export type ActionKey =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'print'
  | 'audit'
  | 'configure'
  | 'execute'
  | 'manage'
  | 'use';

export interface ActionDef {
  key: ActionKey;
  labelAr: string;
  labelEn: string;
  sensitive: boolean;
  sortOrder: number;
}

/** The fixed matrix columns + a few special actions (only shown where applicable). */
export const ACTIONS: ActionDef[] = [
  { key: 'view', labelAr: 'عرض', labelEn: 'View', sensitive: false, sortOrder: 1 },
  { key: 'create', labelAr: 'إضافة', labelEn: 'Create', sensitive: false, sortOrder: 2 },
  { key: 'update', labelAr: 'تعديل', labelEn: 'Update', sensitive: false, sortOrder: 3 },
  { key: 'delete', labelAr: 'حذف', labelEn: 'Delete', sensitive: true, sortOrder: 4 },
  { key: 'approve', labelAr: 'اعتماد', labelEn: 'Approve', sensitive: true, sortOrder: 5 },
  { key: 'reject', labelAr: 'رفض', labelEn: 'Reject', sensitive: true, sortOrder: 6 },
  { key: 'export', labelAr: 'تصدير', labelEn: 'Export', sensitive: false, sortOrder: 7 },
  { key: 'print', labelAr: 'طباعة', labelEn: 'Print', sensitive: false, sortOrder: 8 },
  { key: 'audit', labelAr: 'سجل التدقيق', labelEn: 'Audit', sensitive: false, sortOrder: 9 },
  { key: 'configure', labelAr: 'إعدادات', labelEn: 'Configure', sensitive: true, sortOrder: 10 },
  // Special actions — only attached to resources that need them.
  { key: 'execute', labelAr: 'تنفيذ', labelEn: 'Execute', sensitive: false, sortOrder: 11 },
  { key: 'manage', labelAr: 'إدارة', labelEn: 'Manage', sensitive: true, sortOrder: 12 },
  { key: 'use', labelAr: 'استخدام', labelEn: 'Use', sensitive: false, sortOrder: 13 },
];

export const SENSITIVE_ACTIONS = new Set<ActionKey>(
  ACTIONS.filter((a) => a.sensitive).map((a) => a.key),
);

/** Action presets by resource archetype (keeps the tree below readable). */
const ALL: ActionKey[] = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'export',
  'print',
  'audit',
  'configure',
];
const LIST: ActionKey[] = ['view', 'create', 'update', 'delete', 'export', 'print', 'audit'];
const APPROVAL: ActionKey[] = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'export',
  'print',
  'audit',
];
const REPORT: ActionKey[] = ['view', 'export', 'print'];
const SETTINGS: ActionKey[] = ['view', 'update', 'configure', 'audit'];
const RECORD: ActionKey[] = ['view', 'update', 'audit']; // single-record screens (e.g. company data)

export type ResType = 'module' | 'group' | 'page';

export interface ResourceNode {
  key: string;
  nameAr: string;
  nameEn?: string;
  type: ResType;
  route?: string;
  icon?: string;
  actions: ActionKey[];
  children?: ResourceNode[];
}

/**
 * Resource tree. Modules carry the FULL standard action set so a top-level grant
 * inherits down per-action; pages carry a tailored subset (archetype preset).
 */
/** Shorthand for a navigable page row in the matrix. */
const page = (
  key: string,
  nameAr: string,
  route: string,
  actions: ActionKey[],
  nameEn?: string,
): ResourceNode => ({ key, nameAr, nameEn, type: 'page', route, actions });

/** Shorthand for a collapsible nav group in the matrix. */
const group = (
  key: string,
  nameAr: string,
  icon: string,
  children: ResourceNode[],
  nameEn?: string,
): ResourceNode => ({ key, nameAr, nameEn, type: 'group', icon, actions: ALL, children });

export const RESOURCE_TREE: ResourceNode[] = [
  {
    key: 'hr',
    nameAr: 'الموارد البشرية',
    nameEn: 'HR',
    type: 'module',
    icon: 'Briefcase',
    actions: ALL,
    children: [
      group('employees', 'الموظفون', 'Users', [
        page('employees.list', 'قائمة الموظفين', '/employees', LIST, 'Employees list'),
        page('employees.new', 'إضافة موظف', '/employees/new', LIST, 'New employee'),
      ], 'Employees'),
      page('hr.partners', 'الشركاء', '/hr/partners', LIST, 'Partners'),
    ],
  },
  {
    key: 'club',
    nameAr: 'إدارة النادي الرياضي',
    nameEn: 'Club',
    type: 'module',
    icon: 'Dumbbell',
    actions: ALL,
    children: [
      page('club.dashboard', 'لوحة التحكم', '/hub/club', REPORT, 'Dashboard'),
      group('club.membership', 'إدارة العضوية والأعضاء', 'Users', [
        // APPROVAL (not LIST): `approve` gates grace sessions — letting an expired member in.
        page('club.reception', 'الاستقبال', '/club/reception', APPROVAL, 'Reception'),
        page(
          'club.reception.quick_services',
          'خدمات سريعة',
          '/club/reception/quick-services',
          LIST,
          'Quick services',
        ),
        page('club.members', 'إدارة العضوية', '/club/members', LIST, 'Members'),
        page('club.members.barcode_management', 'إدارة الباركود', '/club/members/barcode-management', LIST, 'Barcode management'),
        page('club.members.attendance', 'حضور الأعضاء', '/club/members/attendance', LIST, 'Member attendance'),
        page('club.members.groups', 'المجموعات والفئات', '/club/members/groups', LIST, 'Groups'),
        page('club.members.surveys', 'الاستبيانات', '/club/members/surveys', LIST, 'Surveys'),
      ], 'Membership'),
      group('club.subscriptions', 'إدارة الاشتراكات والمدفوعات', 'CreditCard', [
        page('club.packages.settings', 'الباقات والأسعار', '/club/packages/settings', SETTINGS, 'Packages'),
        page('club.subscriptions.list', 'الاشتراكات', '/club/subscriptions', APPROVAL, 'Subscriptions'),
        page('club.subscriptions.new', 'إضافة اشتراك جديد', '/club/subscriptions/new', APPROVAL, 'New subscription'),
        page('club.subscriptions.special', 'الاشتراكات الخاصة والحصص', '/club/subscriptions/special', APPROVAL, 'Special classes'),
        // Keep the existing permission key so current roles automatically retain access while
        // the former user-only analytics screen becomes the unified subscription reports page.
        page('club.subscriptions.user_analytics', 'تقارير الاشتراكات', '/club/subscriptions/reports', REPORT, 'Subscription reports'),
        page('club.subscriptions.receipts', 'الإيصالات', '/club/subscriptions/receipts', APPROVAL, 'Receipts'),
        // SPA + InBody paid invoices — relocated here (they already count in revenue). Keys kept
        // under club.fitness.* so existing permissions/guards (club.fitness:*) keep working.
        page('club.fitness.spa_invoices', 'فواتير SPA', '/club/fitness/spa-invoices', LIST, 'SPA invoices'),
        page('club.fitness.inbody_invoices', 'فواتير InBody', '/club/fitness/inbody-invoices', LIST, 'InBody invoices'),
        page('club.subscriptions.outstanding', 'المبالغ المتبقية', '/club/subscriptions/outstanding', APPROVAL, 'Outstanding'),
        page('club.subscriptions.treasury', 'يومية الخزينة', '/club/subscriptions/treasury', APPROVAL, 'Treasury'),
        page('club.subscriptions.unified_treasury', 'الخزينة الموحدة', '/club/unified-treasury', APPROVAL, 'Unified treasury'),
        page('club.subscriptions.refunds', 'المستردات', '/club/subscriptions/refunds', APPROVAL, 'Refunds'),
        page('club.subscriptions.customer_sources', 'مصادر العملاء', '/club/subscriptions/customer-sources', LIST, 'Customer sources'),
      ], 'Subscriptions'),
      group('club.lockers', 'إدارة اللوكر', 'Lock', [
        page('club.lockers.list', 'قائمة اللوكر', '/club/lockers', LIST, 'Lockers'),
        page('club.lockers.new', 'إضافة لوكر', '/club/lockers/new', LIST, 'New locker'),
        page('club.lockers.settings', 'إعدادات اللوكر', '/club/lockers/settings', SETTINGS, 'Locker settings'),
      ], 'Lockers'),
      group('club.fitness', 'اللياقة والتدريب', 'Dumbbell', [
        page('club.fitness.inbody', 'إدارة InBody', '/club/fitness/inbody', LIST, 'InBody'),
        page('club.fitness.room_bookings', 'حجوزات القاعات', '/club/fitness/room-bookings', LIST, 'Room bookings'),
        page('club.fitness.personal_sessions', 'المواعيد الشخصية', '/club/fitness/personal-sessions', LIST, 'Personal sessions'),
        page('club.fitness.trainers', 'إدارة المدربين', '/club/fitness/trainers', LIST, 'Trainers'),
        page('club.fitness.trainer_payments', 'أجور المدربين', '/club/fitness/trainer-payments', LIST, 'Trainer payments'),
        page('club.fitness.trainer_search', 'بحث عن المدرب', '/club/fitness/trainer-search', LIST, 'Trainer search'),
        page('club.fitness.trainer_ratings', 'تقييمات المدربين', '/club/fitness/trainer-ratings', LIST, 'Trainer ratings'),
        page('club.fitness.trainer_settings', 'إعدادات المدربين', '/club/fitness/trainer-settings', SETTINGS, 'Trainer settings'),
        page('club.fitness.facilities', 'إدارة المرافق', '/club/fitness/facilities', LIST, 'Facilities'),
        page('club.fitness.equipment', 'جرد المعدات', '/club/fitness/equipment', LIST, 'Equipment'),
        page('club.fitness.equipment_maintenance', 'صيانة المعدات', '/club/fitness/equipment-maintenance', LIST, 'Maintenance'),
        page('club.fitness.spa_services', 'خدمات SPA', '/club/fitness/spa-services', LIST, 'SPA services'),
        page('club.fitness.spa_bookings', 'حجوزات SPA', '/club/fitness/spa-bookings', LIST, 'SPA bookings'),
        page('club.fitness.facility_settings', 'إعدادات المرافق', '/club/fitness/facility-settings', SETTINGS, 'Facility settings'),
      ], 'Fitness'),
      group('club.events', 'الفعاليات والأنشطة', 'CalendarDays', [
        page('club.events.list', 'إدارة الفعاليات', '/club/events', APPROVAL, 'Events'),
        page('club.events.registrations', 'التسجيل والمشاركون', '/club/events/registrations', APPROVAL, 'Registrations'),
        page('club.events.checkin', 'تسجيل الحضور', '/club/events/checkin', LIST, 'Check-in'),
        page('club.events.reports', 'تقارير الفعاليات', '/club/events/reports', REPORT, 'Event reports'),
        page('club.events.settings', 'إعدادات الفعاليات', '/club/events/settings', SETTINGS, 'Event settings'),
      ], 'Events'),
      // Financial reporting lives under the Gym section. Keys kept as financial-reports.* so
      // routes/permissions/guards are unchanged; only the tree parent moved.
      group('financial-reports', 'التقارير المالية', 'TrendingUp', [
        page('financial-reports.dashboard', 'لوحة تحكم المالية', '/finance/dashboard', REPORT, 'Finance dashboard'),
        page('financial-reports.expenses', 'إدارة المصروفات', '/finance/expenses', APPROVAL, 'Expenses'),
        page('financial-reports.revenues', 'إدارة الإيرادات', '/finance/revenues', LIST, 'Revenues'),
        page('financial-reports.reports', 'تقارير المصروفات', '/finance/expense-reports', REPORT, 'Expense reports'),
        page('financial-reports.revenue_reports', 'تقارير الإيرادات', '/finance/revenue-reports', REPORT, 'Revenue reports'),
        page('financial-reports.analysis', 'التحليل المالي', '/finance/analysis', REPORT, 'Analysis'),
        page('financial-reports.profit_loss', 'الأرباح والخسائر', '/finance/profit-loss', REPORT, 'Profit & loss'),
      ], 'Financial Reports'),
    ],
  },
  {
    key: 'trainer.portal',
    nameAr: 'صلاحيات المدربين',
    nameEn: 'Trainer Portal',
    type: 'module',
    icon: 'Dumbbell',
    route: '/trainer',
    actions: LIST,
    children: [],
  },
  {
    key: 'gym-sales',
    nameAr: 'إدارة الكافيه والمخزون',
    nameEn: 'Cafe & Inventory',
    type: 'module',
    icon: 'Coffee',
    actions: ALL,
    children: [
      group('gym-sales.sales', 'إدارة البيع', 'Receipt', [
        page('gym-sales.sales.new_receipt', 'إيصال بيع جديد', '/sales/new', LIST, 'New receipt'),
        page('gym-sales.sales.drafts', 'فواتير اليوم', '/sales/drafts', LIST, "Today's invoices"),
        page('gym-sales.sales.shifts', 'الورديات', '/sales/shifts', ALL, 'Shifts'),
        page('gym-sales.sales.treasury', 'الخزينة والدرج', '/sales/treasury', ALL, 'Cash drawer'),
        page('gym-sales.sales.settlements', 'تسويات الموظفين والشركاء', '/sales/settlements', ALL, 'Employee & partner settlements'),
        page('gym-sales.sales.pos_admin', 'إعدادات نقطة البيع', '/sales/pos-admin', ALL, 'POS admin'),
      ], 'Sales'),
      group('gym-sales.cafe', 'الكافيه', 'Coffee', [
        page('club.cafe.categories', 'فئات الكافيه', '/club/cafe/categories', LIST, 'Cafe categories'),
        page('club.cafe.products', 'منتجات الكافيه', '/club/cafe/products', LIST, 'Cafe products'),
        page('club.cafe.price_list', 'قائمة الأسعار', '/inventory/price-list', ['view', 'update', 'export', 'print', 'audit'], 'Price list'),
        page('club.cafe.reports', 'تقارير الكافيه', '/club/cafe/reports', REPORT, 'Cafe reports'),
        page('club.cafe.customers', 'إدارة العملاء', '/cafe/customers', REPORT, 'Customer management'),
        page('club.cafe.feedback_reports', 'تقييمات منتجات الكافيه', '/club/cafe/reports/feedback', REPORT, 'Cafe product feedback'),
      ], 'Cafe'),
      group('gym-sales.inventory', 'إدارة الخامات والمخزون', 'Database', [
        page('gym-sales.inventory.dashboard', 'لوحة تحكم المخزون', '/inventory/dashboard', REPORT, 'Inventory dashboard'),
        page('gym-sales.inventory.raw_materials', 'خامات الكافيه', '/club/cafe/raw-materials', APPROVAL, 'Cafe raw materials'),
        page('gym-sales.inventory.gym_issue', 'صرف مخزون داخل الجيم', '/inventory/gym-issue', APPROVAL, 'Gym internal issue'),
        page('gym-sales.inventory.stock_taking', 'الجرد', '/club/cafe/stock-taking', APPROVAL, 'Stock taking'),
        page('gym-sales.inventory.movement_log', 'الحركات المخزنية', '/club/cafe/movements', REPORT, 'Inventory movements'),
      ], 'Inventory'),
      group('gym-sales.procurement', 'إدارة المشتريات', 'ShoppingCart', [
        page('gym-sales.procurement.suppliers', 'موردو الكافيه', '/club/cafe/suppliers', APPROVAL, 'Cafe suppliers'),
        page('gym-sales.procurement.cafe_purchases', 'مشتريات الكافيه', '/club/cafe/purchases', APPROVAL, 'Cafe purchases'),
        page('gym-sales.procurement.supplier_payments', 'سداد مديونية الموردين', '/club/cafe/supplier-payments', APPROVAL, 'Supplier payments'),
      ], 'Procurement'),
    ],
  },
  {
    key: 'accounting',
    nameAr: 'المحاسبة المالية',
    nameEn: 'Financial Accounting',
    type: 'module',
    icon: 'Calculator',
    actions: ALL,
    children: [
      page('accounting.hub', 'لوحة التحكم', '/hub/accounting', REPORT, 'Dashboard'),
      page('accounting.dashboard', 'لوحة التحكم', '/accounting', REPORT, 'Accounting dashboard'),
      group('accounting.ledger', 'القيود والحسابات', 'BookOpen', [
        page('accounting.journal', 'القيود المحاسبية', '/accounting/journal-entries', APPROVAL, 'Journal entries'),
        page('accounting.accounts', 'شجرة الحسابات', '/accounting/accounts', LIST, 'Chart of accounts'),
        page('accounting.reports.gl', 'دفتر الأستاذ العام', '/accounting/general-ledger', REPORT, 'General ledger'),
        page('accounting.reports.statement', 'كشف حساب', '/accounting/account-statement', REPORT, 'Account statement'),
      ], 'Ledger'),
      group('accounting.statements', 'القوائم المالية', 'Scale', [
        page('accounting.reports', 'ميزان المراجعة', '/accounting/trial-balance', REPORT, 'Trial balance'),
        page('accounting.reports.income', 'قائمة الدخل', '/accounting/income-statement', REPORT, 'Income statement'),
        page('accounting.reports.balance', 'الميزانية العمومية', '/accounting/balance-sheet', REPORT, 'Balance sheet'),
        page('accounting.reports.cashflow', 'قائمة التدفق النقدي', '/accounting/cash-flow', REPORT, 'Cash flow'),
      ], 'Statements'),
      page('accounting.settings', 'إعدادات المحاسبة', '/accounting/settings', SETTINGS, 'Accounting settings'),
    ],
  },
  {
    key: 'app-management',
    nameAr: 'إدارة التطبيق',
    nameEn: 'App Management',
    type: 'module',
    icon: 'Smartphone',
    actions: ALL,
    children: [
      page('app-management.hub', 'لوحة التحكم', '/hub/app-management', REPORT, 'Dashboard'),
      page('app-management.about', 'عن التطبيق', '/app/about', RECORD, 'About App'),
      group('app-management.invitations', 'الدعوات', 'Mail', [
        page('app-management.invitations.sent', 'الدعوات المرسلة', '/app/invitations/sent', LIST, 'Sent invitations'),
        page('app-management.invitations.accepted', 'الدعوات المقبولة', '/app/invitations/accepted', LIST, 'Accepted invitations'),
        page('app-management.invitations.attended', 'حضور الدعوات', '/app/invitations/attended', LIST, 'Attended invitations'),
        page('app-management.invitations.rejected', 'الدعوات المرفوضة', '/app/invitations/rejected', LIST, 'Rejected invitations'),
      ], 'Invitations'),
      group('app-management.content', 'المحتوى والعروض', 'FileText', [
        page('app-management.offers', 'إدارة العروض', '/app/offers', LIST, 'Offers'),
        page('app-management.trainers', 'إدارة المدربين', '/app/trainers', LIST, 'Trainers'),
        page('app-management.exercise-categories', 'تصنيفات التمارين', '/app/exercise-categories', LIST, 'Exercise categories'),
        page('app-management.exercises', 'التمارين', '/app/exercises', LIST, 'Exercises'),
        page('app-management.news', 'إدارة الأخبار', '/app/news', LIST, 'News'),
        page('app-management.ads', 'إدارة الإعلانات', '/app/ads', LIST, 'Ads'),
        page('app-management.notifications', 'إشعارات الأعضاء', '/app/notifications', LIST, 'Member notifications'),
      ], 'Content'),
    ],
  },
  {
    key: 'admin',
    nameAr: 'الإعدادات والنظام',
    nameEn: 'Administration',
    type: 'module',
    icon: 'Settings',
    actions: ALL,
    children: [
      page('admin.dashboard', 'لوحة التحكم الرئيسية', '/dashboard', REPORT, 'Main dashboard'),
      page('admin.hub', 'لوحة التحكم', '/hub/settings', REPORT, 'Settings hub'),
      { key: 'org.branches', nameAr: 'إدارة الفروع', nameEn: 'Branches', type: 'page', route: '/org/branches', actions: LIST },
      { key: 'org.departments', nameAr: 'مسميات وظيفية', nameEn: 'Job titles', type: 'page', route: '/org/job-titles', actions: LIST },
      page('admin.roles', 'الأدوار والصلاحيات', '/admin/roles', ['view', 'manage', 'audit'], 'Roles & permissions'),
      page('admin.exceptions', 'استثناءات المستخدمين', '/admin/exceptions', ['view', 'manage', 'audit'], 'User exceptions'),
      page('admin.users', 'المستخدمون', '/users', ['view', 'create', 'update', 'delete', 'audit'], 'Users'),
      page('admin.audit', 'سجل التدقيق', '/admin/audit', ['view', 'export'], 'Audit log'),
      page('admin.business-audit', 'سجل التغييرات التشغيلي', '/settings/business-audit', ['view', 'export'], 'Business audit log'),
      page('admin.automation', 'أتمتة سير العمل', '/settings/automation', SETTINGS, 'Workflow automation'),
      page('admin.gym-policies', 'سياسات الجيم', '/settings/gym-policies', SETTINGS, 'Gym policies'),
      page('admin.backup', 'النسخ الاحتياطي والتصدير', '/settings/backup', ['view', 'export'], 'Backup & export'),
      page('admin.webhooks', 'Webhooks', '/settings/webhooks', ['view', 'manage'], 'Webhooks'),
      page('admin.company', 'بيانات الشركة', '/company', RECORD, 'Company data'),
      page('admin.forms', 'إعدادات النماذج', '/settings/forms', SETTINGS, 'Forms settings'),
      page('admin.locations', 'المواقع والمدن', '/settings/locations', SETTINGS, 'Locations'),
      page('admin.insurance', 'إعدادات التأمين', '/settings/insurance', SETTINGS, 'Insurance settings'),
    ],
  },
];

// ---------------------------------------------------------------------------------------
//  Derived helpers (pure)
// ---------------------------------------------------------------------------------------

export interface FlatResource {
  key: string;
  parentKey: string | null;
  nameAr: string;
  nameEn?: string;
  type: ResType;
  route?: string;
  icon?: string;
  actions: ActionKey[];
  sortOrder: number;
}

/** Depth-first flatten with parent links + stable sort order. */
export function flattenCatalog(tree: ResourceNode[] = RESOURCE_TREE): FlatResource[] {
  const out: FlatResource[] = [];
  const walk = (nodes: ResourceNode[], parentKey: string | null) => {
    nodes.forEach((n, i) => {
      out.push({
        key: n.key,
        parentKey,
        nameAr: n.nameAr,
        nameEn: n.nameEn,
        type: n.type,
        route: n.route,
        icon: n.icon,
        actions: n.actions,
        sortOrder: i + 1,
      });
      if (n.children?.length) walk(n.children, n.key);
    });
  };
  walk(tree, null);
  return out;
}

/** parentKey map for the inheritance engine: childKey -> parentKey|null. */
export function buildAncestry(flat: FlatResource[] = flattenCatalog()): Map<string, string | null> {
  return new Map(flat.map((r) => [r.key, r.parentKey]));
}

/** Map of React route -> resource key (only permissioned routes). */
export function buildRouteMap(flat: FlatResource[] = flattenCatalog()): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of flat) if (r.route) map[r.route] = r.key;
  return map;
}

/** Convenience: a permission key is `${resourceKey}:${actionKey}`. */
export const permKey = (resourceKey: string, action: ActionKey | string) =>
  `${resourceKey}:${action}`;
