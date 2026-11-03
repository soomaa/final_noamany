/** Chart-of-accounts types, in the order the tree presents them. */
export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Depth-derived label: root → main, its children → sub-main, deeper → sub. */
export type AccountLevel = 'main' | 'sub-main' | 'sub';

/** One account as the API returns it, without the tree edge. */
export interface AccountRow {
  id: number;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: string;
  parentId: number | null;
  isPostable: boolean;
  category: string | null;
  description: string | null;
  branchId: number | null;
  isActive: boolean;
  /** Net balance rolled up from every descendant. */
  balance?: number;
  accountLevel?: AccountLevel;
}

export interface AccountNode extends AccountRow {
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

/** Presentation-level entry type, mirrored from `acc_journal_entries.entry_type`. */
export const JOURNAL_ENTRY_TYPES = ['daily', 'monthly', 'annual'] as const;
export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPES)[number];

export interface JournalEntryRow {
  id: number;
  entryNo: string;
  date: string;
  branchId: number | null;
  description: string | null;
  reference: string | null;
  entryType: JournalEntryType;
  status: 'draft' | 'posted' | 'reversed';
  sourceModule: string | null;
  totalDebit: number;
  totalCredit: number;
  createdAt?: string;
  postedAt?: string | null;
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
