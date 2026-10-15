export type ClubPrintTransactionType =
  | 'subscription' | 'subscriptionPayment' | 'quickService' | 'inbody' | 'spa' | 'locker' | 'event';
export type ReceiptPaperSize = 'thermal' | 'a4';
export type ReceiptLanguage = 'ar' | 'en';

export interface ClubPrintingPolicy {
  receiptPaperSize: ReceiptPaperSize;
  receiptA4Copies: 1 | 2;
  receiptLanguage: ReceiptLanguage;
  printSubscriptionReceipts: boolean;
  printSubscriptionPayments: boolean;
  printQuickServiceReceipts: boolean;
  printInbodyReceipts: boolean;
  printSpaReceipts: boolean;
  printLockerReceipts: boolean;
  printEventReceipts: boolean;
}

export const DEFAULT_CLUB_PRINTING_POLICY: Readonly<ClubPrintingPolicy> = Object.freeze({
  receiptPaperSize: 'thermal', receiptA4Copies: 2, receiptLanguage: 'ar',
  printSubscriptionReceipts: false, printSubscriptionPayments: false,
  printQuickServiceReceipts: false, printInbodyReceipts: false,
  printSpaReceipts: false, printLockerReceipts: false, printEventReceipts: false,
});

const fieldByType: Record<ClubPrintTransactionType, keyof ClubPrintingPolicy> = {
  subscription: 'printSubscriptionReceipts', subscriptionPayment: 'printSubscriptionPayments',
  quickService: 'printQuickServiceReceipts', inbody: 'printInbodyReceipts', spa: 'printSpaReceipts',
  locker: 'printLockerReceipts', event: 'printEventReceipts',
};

export function normalizeClubPrintingPolicy(value?: Partial<ClubPrintingPolicy> | null): ClubPrintingPolicy {
  return {
    receiptPaperSize: value?.receiptPaperSize === 'a4' ? 'a4' : 'thermal',
    receiptA4Copies: value?.receiptA4Copies === 1 ? 1 : 2,
    receiptLanguage: value?.receiptLanguage === 'en' ? 'en' : 'ar',
    printSubscriptionReceipts: value?.printSubscriptionReceipts === true,
    printSubscriptionPayments: value?.printSubscriptionPayments === true,
    printQuickServiceReceipts: value?.printQuickServiceReceipts === true,
    printInbodyReceipts: value?.printInbodyReceipts === true,
    printSpaReceipts: value?.printSpaReceipts === true,
    printLockerReceipts: value?.printLockerReceipts === true,
    printEventReceipts: value?.printEventReceipts === true,
  };
}

export function shouldAutoPrint(policy: ClubPrintingPolicy, type: ClubPrintTransactionType, amount: number, reference?: string | number | null) {
  const numericAmount = Number(amount);
  return Boolean(policy[fieldByType[type]] && Number.isFinite(numericAmount) && numericAmount > 0 && String(reference ?? '').trim());
}

const attemptedPrints = new Set<string>();
export function runAutoPrintOnce(type: ClubPrintTransactionType, reference: string | number, action: () => void) {
  const key = `${type}:${String(reference).trim()}`;
  if (!String(reference).trim() || attemptedPrints.has(key)) return false;
  attemptedPrints.add(key);
  action();
  return true;
}
