import { uiStatic } from '@/lib/ui-static';

/**
 * Option = a stored canonical VALUE (Arabic, matching backend DB literals — see
 * finance/expenses.service.ts / finance.utils.ts) plus a translated display LABEL.
 * The value is stable across locales; only the label is translated at read time.
 */
export interface FinanceOption {
  value: string;
  label: string;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
}

export interface SourceBreakdown {
  source: string;
  total: number;
  count: number;
}

export interface MonthlyTrendPoint {
  month: string;
  revenue: number;
  expense: number;
  profit?: number;
}

export interface FinanceDashboard {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  revenueCount: number;
  expenseCount: number;
  monthlyTrend: MonthlyTrendPoint[];
  expensesByCategory?: CategoryBreakdown[];
  revenuesBySource?: SourceBreakdown[];
}

export interface ExpenseRow {
  id: number;
  expenseDate: string;
  category: string;
  subCategory?: string | null;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  approvalStatus: string;
  description?: string | null;
  vendor?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  taxAmount?: number | null;
  notes?: string | null;
  branchId?: number | null;
}

export interface ExpenseFormPayload {
  expenseDate: string;
  category: string;
  subCategory?: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  description?: string;
  vendor?: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  taxAmount?: number;
  notes?: string;
  branchId?: number;
}

export interface RevenueRow {
  id: number;
  revenueDate: string;
  source: string;
  subSource?: string | null;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  description?: string | null;
  customerName?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  notes?: string | null;
  branchId?: number | null;
}

export interface RevenueFormPayload {
  revenueDate: string;
  source: string;
  subSource?: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  description?: string;
  customerName?: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  taxAmount?: number;
  discountAmount?: number;
  notes?: string;
  branchId?: number;
}

export interface RevenueSyncResult {
  syncedCount?: number;
  skippedCount?: number;
  totalFoundInPeriod?: number;
  revenuesInDbForPeriod?: number;
  gymReceiptsSynced?: number;
  gymReceiptsCount?: number;
  spaSynced?: number;
  spaCount?: number;
  inbodySynced?: number;
  inbodyCount?: number;
  lockerSynced?: number;
  lockerCount?: number;
  timeBasedSynced?: number;
  timeBasedCount?: number;
  quickSalesCount?: number;
  quickSalesSynced?: number;
  bookingsCount?: number;
  bookingsSynced?: number;
}

export interface ExpenseReportData {
  totalAmount: number;
  totalExpenses: number;
  expensesByCategory: CategoryBreakdown[];
  monthlyExpenses: { month: string; total: number; count: number }[];
  expensesByStatus?: { status: string; total: number; count: number }[];
}

export interface RevenueReportData {
  totalAmount: number;
  totalRevenues: number;
  totalTax: number;
  totalDiscount: number;
  revenuesBySource: SourceBreakdown[];
  monthlyRevenues: { month: string; total: number; count: number }[];
  topCustomers?: { customerName: string; total: number; count: number }[];
}

export interface FinancialAnalysisData {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  revenueGrowth?: number;
  expenseGrowth?: number;
  ratioAnalysis?: { label: string; value: number }[];
  monthlyComparison: MonthlyTrendPoint[];
  expensesByCategory?: CategoryBreakdown[];
  revenuesBySource?: SourceBreakdown[];
}

export interface ProfitLossLineItem {
  label: string;
  amount: number;
}

export interface ProfitLossData {
  period: { startDate: string; endDate: string };
  revenue: { items: ProfitLossLineItem[]; total: number };
  expenses: { items: ProfitLossLineItem[]; total: number };
  netProfit: number;
  profitMargin: number;
}

/**
 * Canonical stored values (Arabic — must match backend DB literals). These are used
 * as the persisted value and as filter query params, so they MUST NOT change per locale.
 */
export interface ExpenseCategory {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
  isSystem: boolean;
}

/** Built-in fallback list — the live picker is driven by the DB (`/expense-categories`). */
export const EXPENSE_CATEGORY_VALUES = [
  'رواتب',
  'إيجار',
  'مرافق',
  'صيانة',
  'تسويق',
  'مشتريات',
  'نقل وشحن',
  'ضرائب ورسوم',
  'تأمينات',
  'قرطاسية',
  'اتصالات',
  'ضيافة',
  'تدريب',
  'أخرى',
] as const;

export const REVENUE_SOURCE_VALUES = [
  'مبيعات سريعة',
  'اشتراكات النادي',
  'حجوزات',
  'لوكرات',
  'خدمات SPA',
  'InBody',
  'مبيعات منتجات',
  'مبيعات خدمات',
  'اشتراكات',
  'عمولات',
  'استثمارات',
  'إيجارات',
  'تبرعات',
  'فوائد',
  'مردودات',
  'أخرى',
] as const;

export const PAYMENT_METHOD_VALUES = ['نقدي', 'بطاقة', 'تحويل', 'شيك'] as const;

export const PAYMENT_STATUS_VALUES = ['مدفوع', 'معلق', 'جزئي'] as const;

/** Build { value: canonical, label: translated } options. Call inside a component render. */
export function financeOptions(values: readonly string[]): FinanceOption[] {
  return values.map((value) => ({ value, label: uiStatic(value) }));
}

export const APPROVAL_STATUSES = ['معلق', 'موافق عليه', 'مرفوض'] as const;
