import { AccountType } from '@prisma/client';
import { normalBalanceForType } from './accounting.utils';

export interface SeedAccountDef {
  code: string;
  name: string;
  accountType: AccountType;
  parentCode?: string;
  category?: string;
  isPostable?: boolean;
  defaultKey?: string;
}

/** Gym chart of accounts + default-account keys for LedgerService resolution. */
export const DEFAULT_CHART: SeedAccountDef[] = [
  { code: '1', name: 'الأصول', accountType: 'asset', isPostable: false },
  { code: '1.01', name: 'الأصول المتداولة', accountType: 'asset', parentCode: '1', isPostable: false },
  { code: '1.01.001', name: 'الخزينة النقدية', accountType: 'asset', parentCode: '1.01', defaultKey: 'cash' },
  { code: '1.01.002', name: 'البنك', accountType: 'asset', parentCode: '1.01', defaultKey: 'bank' },
  { code: '1.01.003', name: 'بطاقات ائتمان', accountType: 'asset', parentCode: '1.01', defaultKey: 'card' },
  { code: '1.01.004', name: 'المدفوعات الإلكترونية', accountType: 'asset', parentCode: '1.01', defaultKey: 'online' },
  { code: '1.01.005', name: 'المخزون', accountType: 'asset', parentCode: '1.01', defaultKey: 'inventory' },
  { code: '1.01.006', name: 'تسوية استلام البضائع', accountType: 'asset', parentCode: '1.01', defaultKey: 'grn_clearing' },
  { code: '1.01.007', name: 'ضريبة القيمة المضافة - مدخلات', accountType: 'asset', parentCode: '1.01', defaultKey: 'vat_input' },
  { code: '1.01.008', name: 'العملاء / المدينون', accountType: 'asset', parentCode: '1.01', defaultKey: 'accounts_receivable' },
  { code: '1.01.009', name: 'سلف الموظفين', accountType: 'asset', parentCode: '1.01', defaultKey: 'employee_advances' },
  { code: '2', name: 'الخصوم', accountType: 'liability', isPostable: false },
  { code: '2.01', name: 'الخصوم المتداولة', accountType: 'liability', parentCode: '2', isPostable: false },
  { code: '2.01.001', name: 'الدائنون / الموردون', accountType: 'liability', parentCode: '2.01', defaultKey: 'accounts_payable' },
  { code: '2.01.002', name: 'ضريبة القيمة المضافة - مخرجات', accountType: 'liability', parentCode: '2.01', defaultKey: 'vat_output' },
  { code: '2.01.003', name: 'رواتب مستحقة', accountType: 'liability', parentCode: '2.01', defaultKey: 'salaries_payable' },
  { code: '2.01.006', name: 'تأمينات اجتماعية مستحقة', accountType: 'liability', parentCode: '2.01', defaultKey: 'social_insurance_payable' },
  { code: '2.01.007', name: 'تسويات الشركاء المستحقة', accountType: 'liability', parentCode: '2.01', defaultKey: 'partner_payable' },
  { code: '3', name: 'حقوق الملكية', accountType: 'equity', isPostable: false },
  { code: '3.01', name: 'رأس المال', accountType: 'equity', parentCode: '3', defaultKey: 'opening_balance_equity' },
  { code: '3.02', name: 'الأرباح المحتجزة', accountType: 'equity', parentCode: '3' },
  { code: '4', name: 'الإيرادات', accountType: 'revenue', isPostable: false },
  { code: '4.01', name: 'إيرادات الاشتراكات', accountType: 'revenue', parentCode: '4', defaultKey: 'subscription_revenue' },
  { code: '4.02', name: 'إيرادات المبيعات', accountType: 'revenue', parentCode: '4', defaultKey: 'sales_revenue' },
  { code: '4.06', name: 'إيرادات أخرى', accountType: 'revenue', parentCode: '4', defaultKey: 'other_revenue' },
  { code: '4.03', name: 'خصومات الاشتراكات', accountType: 'revenue', parentCode: '4', defaultKey: 'subscription_discount' },
  { code: '4.04', name: 'خصومات المبيعات', accountType: 'revenue', parentCode: '4', defaultKey: 'sales_discount' },
  { code: '4.05', name: 'خصومات المشتريات', accountType: 'revenue', parentCode: '4', defaultKey: 'purchase_discount' },
  { code: '5', name: 'المصروفات', accountType: 'expense', isPostable: false },
  { code: '5.01', name: 'مصروفات تشغيلية', accountType: 'expense', parentCode: '5', isPostable: false },
  { code: '5.01.001', name: 'مصروفات عامة', accountType: 'expense', parentCode: '5.01', defaultKey: 'operating_expense' },
  { code: '5.01.002', name: 'غرامات التأخير', accountType: 'expense', parentCode: '5.01', defaultKey: 'late_fee_expense' },
  { code: '5.01.004', name: 'صيانة أجهزة الجيم', accountType: 'expense', parentCode: '5.01', defaultKey: 'maintenance_expense' },
  { code: '5.01.011', name: 'مصروف الرواتب والأجور', accountType: 'expense', parentCode: '5.01', defaultKey: 'salary_expense' },
  { code: '5.01.012', name: 'عمولات وأتعاب المدربين', accountType: 'expense', parentCode: '5.01', defaultKey: 'trainer_commission_expense' },
  { code: '5.08', name: 'تكلفة البضاعة المباعة', accountType: 'expense', parentCode: '5', defaultKey: 'cost_of_goods_sold' },
];

export function seedAccountPayload(def: SeedAccountDef, parentId: number | null) {
  const postable = def.isPostable ?? true;
  return {
    code: def.code,
    name: def.name,
    account_type: def.accountType,
    normal_balance: normalBalanceForType(def.accountType),
    parent_id: parentId,
    is_postable: postable,
    category: def.category ?? null,
    is_active: true,
  };
}
