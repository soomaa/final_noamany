import type { ResourceNode } from './rbac.catalog';

/** Missing sidebar pages. Existing keys/parents are kept to preserve stored grants. */
export const SIDEBAR_PAGE_ADDITIONS: { parentKey: string; node: ResourceNode }[] = [
  {"parentKey":"club.membership","node":{"key":"club.members.measurements","nameAr":"قياسات الأعضاء","type":"page","route":"/club/members/measurements","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.member_check_in","nameAr":"حضور الأعضاء بالباركود","type":"page","route":"/club/members/barcode-management/member-check-in","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.spa_check_in","nameAr":"حضور السبا بالباركود","type":"page","route":"/club/members/barcode-management/spa-check-in","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.classes_check_in","nameAr":"حضور الحصص بالباركود","type":"page","route":"/club/members/barcode-management/classes-check-in","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.print_range","nameAr":"طباعة باركود من كود إلى كود","type":"page","route":"/club/members/barcode-management/print-range","actions":["view","export","print"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.spa_attendance","nameAr":"تقرير حضور السبا","type":"page","route":"/club/members/barcode-management/spa-attendance","actions":["view","export","print"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.classes_attendance","nameAr":"تقرير حضور الحصص","type":"page","route":"/club/members/barcode-management/classes-attendance","actions":["view","export","print"]}},
  {"parentKey":"club.members.barcode_management","node":{"key":"club.members.barcode.scan_times","nameAr":"توقيتات سحب الباركود","type":"page","route":"/club/members/barcode-management/scan-times","actions":["view","export","print"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.subscriptions.online","nameAr":"اشتراكات الأونلاين","type":"page","route":"/club/subscriptions/online","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.membership","node":{"key":"club.points.earn_settings","nameAr":"إعدادات تجميع النقاط","type":"page","route":"/club/points/earn-settings","actions":["view","update","configure","audit"]}},
  {"parentKey":"club.membership","node":{"key":"club.points.conversion_settings","nameAr":"إعدادات تحويل النقاط","type":"page","route":"/club/points/conversion-settings","actions":["view","update","configure","audit"]}},
  {"parentKey":"club.membership","node":{"key":"club.points.member_history","nameAr":"سجل نقاط العضو","type":"page","route":"/club/points/member-history","actions":["view","export","print"]}},
  {"parentKey":"club.membership","node":{"key":"club.points.earned_report","nameAr":"تقرير الأعضاء الحاصلين على نقاط","type":"page","route":"/club/points/earned-report","actions":["view","export","print"]}},
  {"parentKey":"club.membership","node":{"key":"club.points.active_members_report","nameAr":"تقرير الأعضاء أصحاب النقاط الباقية","type":"page","route":"/club/points/active-members-report","actions":["view","export","print"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.create","nameAr":"إضافة كود خصم","type":"page","route":"/club/discount-codes/create","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.captain_allocations","nameAr":"إضافة كود خصم للكابتن","type":"page","route":"/club/discount-codes/captain-allocations","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.member_grants","nameAr":"كود خصم لعضو","type":"page","route":"/club/discount-codes/member-grants","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.member_search","nameAr":"البحث عن كود خصم","type":"page","route":"/club/discount-codes/member-search","actions":["view","export","print"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.member_report","nameAr":"تقرير أكواد الخصم للعضو","type":"page","route":"/club/discount-codes/member-report","actions":["view","export","print"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.captain_codes","nameAr":"أكواد الموظف الخاصة بالكابتن","type":"page","route":"/club/discount-codes/captain-codes","actions":["view","export","print"]}},
  {"parentKey":"club.subscriptions","node":{"key":"club.discount_codes.usage_report","nameAr":"تقرير الأعضاء المستخدمين لأكواد الخصم","type":"page","route":"/club/discount-codes/usage-report","actions":["view","export","print"]}},
  {"parentKey":"club.lockers","node":{"key":"club.lockers.inventory","nameAr":"محضر جرد اللوكر","type":"page","route":"/club/lockers/inventory","actions":["view","create","update","approve","reject","export","print","audit"]}},
  {"parentKey":"club.lockers","node":{"key":"club.lockers.inventory_reports","nameAr":"تقارير جرد اللوكر","type":"page","route":"/club/lockers/inventory-reports","actions":["view","export","print"]}},
  {"parentKey":"financial-reports","node":{"key":"financial-reports.daily_closing","nameAr":"التقفيل اليومي","type":"page","route":"/reports/finance/daily-closing","actions":["view","create","update","approve","export","print"]}},
  {"parentKey":"financial-reports","node":{"key":"financial-reports.target","nameAr":"تقرير التارجت","type":"page","route":"/reports/finance/target","actions":["view","update","export","print"]}},
  {"parentKey":"hr","node":{"key":"hr.organization.departments","nameAr":"الإدارات والأقسام","type":"page","route":"/org/departments","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"affairs.warnings","node":{"key":"affairs.warnings.templates","nameAr":"نماذج الإنذارات","type":"page","route":"/hr/warnings/templates","actions":["view","update","configure","audit"]}},
  {"parentKey":"attendance","node":{"key":"attendance.reports","nameAr":"تقارير الحضور والانصراف","type":"page","route":"/attendance/reports","actions":["view","export","print"]}},
  {"parentKey":"attendance","node":{"key":"attendance.adjustments","nameAr":"تبديل الورديات والإضافي","type":"page","route":"/attendance/adjustments","actions":["view","create","update","delete","audit"]}},
  {"parentKey":"attendance","node":{"key":"attendance.import","nameAr":"استيراد ملف الحضور","type":"page","route":"/attendance/import","actions":["view","create","execute","audit"]}},
  {"parentKey":"evaluation-management","node":{"key":"evaluation-management.hub","nameAr":"إدارة التقييمات","type":"page","route":"/hub/evaluation-management","actions":["view","export","print"]}},
  {"parentKey":"admin","node":{"key":"org.branch_groups","nameAr":"مجموعات الفروع","type":"page","route":"/club/branch-groups","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"customer-service","node":{"key":"customer-service.hub","nameAr":"إدارة خدمة العملاء","type":"page","route":"/hub/customer-service","actions":["view","export","print"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.section-settings","nameAr":"نصوص وعناوين الأقسام","type":"page","route":"/portal/section-settings","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.stats","nameAr":"إحصائيات الموقع","type":"page","route":"/portal/stats","actions":["view","export","print"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.ticker","nameAr":"الشريط المتحرك","type":"page","route":"/portal/ticker","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.services","nameAr":"خدمات الموقع","type":"page","route":"/portal/services","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.class-showcase","nameAr":"كروت الكلاسات الرئيسية","type":"page","route":"/portal/class-showcase","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.about-features","nameAr":"مميزات عن الجيم","type":"page","route":"/portal/about-features","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.coach-features","nameAr":"خطوات ومميزات المدرب","type":"page","route":"/portal/coach-features","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management","node":{"key":"portal-management.membership-plans","nameAr":"باقات عضوية الموقع","type":"page","route":"/portal/membership-plans","actions":["view","create","update","delete","export","print","audit"]}},
  {"parentKey":"portal-management.store","node":{"key":"portal-management.offers","nameAr":"عروض الموقع","type":"page","route":"/portal/offers","actions":["view","create","update","delete","export","print","audit"]}},
];

/** Add missing pages without changing existing resource identities or inheritance. */
export function addSidebarPages(tree: ResourceNode[]): void {
  const byKey = new Map<string, ResourceNode>();
  const byRoute = new Map<string, ResourceNode>();
  const walk = (nodes: ResourceNode[]) => nodes.forEach(node => {
    byKey.set(node.key, node);
    if (node.route) byRoute.set(node.route, node);
    walk(node.children ?? []);
  });
  walk(tree);
  for (const addition of SIDEBAR_PAGE_ADDITIONS) {
    const existing = byKey.get(addition.node.key);
    if (existing) {
      if (existing.route !== addition.node.route) throw new Error('Sidebar resource key collision: ' + existing.key);
      continue;
    }
    if (byRoute.has(addition.node.route!)) throw new Error('Sidebar route collision: ' + addition.node.route);
    const parent = byKey.get(addition.parentKey);
    if (!parent) throw new Error('Sidebar resource parent missing: ' + addition.parentKey);
    const node = { ...addition.node, actions: [...addition.node.actions] };
    (parent.children ??= []).push(node);
    byKey.set(node.key, node);
    byRoute.set(node.route!, node);
  }
}
