/** Financial accounting module routes — mirrors SwatGym sidebar under `/accounting`. */
export const ACCOUNTING_ROUTES = {
  dashboard: '/accounting',
  ledger: {
    journalEntries: '/accounting/journal-entries',
    chartOfAccounts: '/accounting/accounts',
    generalLedger: '/accounting/general-ledger',
    accountStatement: '/accounting/account-statement',
  },
  statements: {
    trialBalance: '/accounting/trial-balance',
    incomeStatement: '/accounting/income-statement',
    balanceSheet: '/accounting/balance-sheet',
    cashFlow: '/accounting/cash-flow',
  },
  settings: '/accounting/settings',
} as const;
