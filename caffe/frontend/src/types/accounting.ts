export interface AccountNode {
  id: number;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentId: number | null;
  isPostable: boolean;
  category: string | null;
  description: string | null;
  branchId: number | null;
  isActive: boolean;
  children: AccountNode[];
}

export interface JournalEntryLine {
  id?: number;
  accountId?: number;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string | null;
}

export interface JournalEntryRow {
  id: number;
  entryNo: string;
  date: string;
  branchId: number | null;
  description: string | null;
  reference: string | null;
  status: 'draft' | 'posted' | 'reversed';
  sourceModule: string | null;
  totalDebit: number;
  totalCredit: number;
  lines?: JournalEntryLine[];
}

export interface AccountingDashboard {
  journalEntries: { total: number; daily: number; monthly: number };
  accountCount: number;
  totalAssets: number;
  totalLiabilities: number;
  revenue: number;
  expenses: number;
  netProfit: number;
  recentEntries: Array<{
    id: number;
    entryNo: string;
    date: string;
    status: string;
    description: string | null;
    totalDebit: number;
    totalCredit: number;
  }>;
}

export interface AccountingSettings {
  fiscalYearStart: string;
  baseCurrency: string;
  currencySymbol: string;
  requireApproval: boolean;
  defaultAccounts: Record<string, string>;
}

export interface TrialBalanceRow {
  accountId: number;
  code: string;
  name: string;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
}

export const DEFAULT_ACCOUNT_KEYS = [
  'cash',
  'bank',
  'card',
  'online',
  'subscription_revenue',
  'subscription_discount',
  'sales_revenue',
  'sales_discount',
  'vat_output',
  'vat_input',
  'accounts_payable',
  'inventory',
  'grn_clearing',
  'purchase_discount',
  'late_fee_expense',
] as const;
