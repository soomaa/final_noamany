import { toast } from 'sonner';
import type { ClubPrintingPolicy } from '@/lib/club-printing';
import { useAuth } from '@/store/auth';
import { uiStatic } from '@/lib/ui-static';
import {
  buildThermalFinancialReceiptHtml, buildThermalSubscriptionReceiptHtml,
  type ThermalFinancialReceipt, type ThermalReceiptSubscription,
} from './thermal-receipt-template';

function openReceiptWindow(html: string, policy?: Pick<ClubPrintingPolicy, 'receiptPaperSize'>) {
  const features = policy?.receiptPaperSize === 'a4' ? 'width=960,height=900' : 'width=320,height=720';
  const popup = window.open('', '_blank', features);
  if (!popup) return false;
  popup.document.write(html); popup.document.close(); return true;
}

function identity<T extends { operatorName?: string | null; operatorUsername?: string | null }>(receipt: T): T {
  const user = useAuth.getState().user;
  return { ...receipt, operatorName: receipt.operatorName || user?.name, operatorUsername: receipt.operatorUsername || (user?.sub ? `#${user.sub}` : null) };
}

export function printThermalSubscriptionReceipt(receipt: ThermalReceiptSubscription, policy?: ClubPrintingPolicy) {
  return openReceiptWindow(buildThermalSubscriptionReceiptHtml(identity(receipt), policy), policy);
}
export function printThermalFinancialReceipt(receipt: ThermalFinancialReceipt, policy?: ClubPrintingPolicy) {
  return openReceiptWindow(buildThermalFinancialReceiptHtml(identity(receipt), policy), policy);
}
export function printThermalFinancialReceiptWithFallback(receipt: ThermalFinancialReceipt, policy?: ClubPrintingPolicy) {
  const printed = printThermalFinancialReceipt(receipt, policy);
  if (!printed) toast.warning(uiStatic('تم حفظ العملية، لكن المتصفح منع نافذة الطباعة'), { action: { label: uiStatic('طباعة مرة أخرى'), onClick: () => printThermalFinancialReceipt(receipt, policy) } });
  return printed;
}
