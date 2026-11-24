import { effectiveSalesSettings, readSalesDefaults } from './sales-defaults';
import { localDateString } from '../club-fitness/club-fitness.utils';
import { Prisma } from '@prisma/client';
import { roundMoney } from './club-sales.constants';
import { effectiveTarget } from './target-period';
import { resolveSalesCommission } from './sales-commission-calculation';

export type SalesCommissionSource = {
  source_kind: 'receipt' | 'refund'; source_id: number; employee_id: number; subscription_id: number;
  base_amount: number; commission_amount: number; commission_percent: number;
};

type PaidPayrollItem = {
  employee_id: number;
  commission_sources: unknown;
  sales_commission_pct: number;
  run: { period_start: string; period_end: string; branch_id: number | null };
};

export async function salesCashCommissions(db: Prisma.TransactionClient, start: string, end: string,
  scope: number[] | null, reps: Array<{ id: number; name: string | null }>, commissions: { resolveSalesCommission: typeof resolveSalesCommission } = { resolveSalesCommission },
) {
  const branch = scope === null ? {} : { branch_id: { in: scope } };
  const [settings, receipts, refunds, entries, legacyPaid, defaults] = await Promise.all([
    db.club_sales_rep_settings.findMany({ include: { tiers: true } }),
    db.club_receipts.findMany({ where: {
      receipt_date: { lte: end }, status: { in: ['مدفوعة', 'paid'] }, ...branch,
      subscription: { sales_id: { not: null } },
    }, include: { subscription: { select: { id: true, sales_id: true } } } }),
    db.club_subscription_refunds.findMany({ where: {
      status: 'completed', ...branch,
      OR: [{ completed_at: { lt: new Date(new Date(`${end}T00:00:00Z`).getTime() + 86400000) } },
        { completed_at: null, refund_date: { lte: end } }],
    }, include: { subscription: { select: { id: true, sales_id: true, receipts: { where: { status: { in: ['مدفوعة', 'paid'] } }, select: { id: true, amount: true, receipt_date: true, branch_id: true } } } } } }),
    db.club_sales_commission_entries.findMany(),
    // Noamany's payroll (hr_mosayer) does not record which receipts it paid commission on, so
    // there are no MetaFit-style paid payroll items: every receipt counts in its own window.
    Promise.resolve([] as PaidPayrollItem[]),
    readSalesDefaults(db),
  ]);
  const settled = new Set(entries.map(e => `${e.source_kind}:${e.source_id}:${e.employee_id}`));
  const settledReceiptIds = new Set(entries.filter(e => e.source_kind === 'receipt').map(e => e.source_id));
  const historical = (employeeId: number, date: string, branchId?: number | null) => legacyPaid.find(p => p.commission_sources == null && (p.run.branch_id == null || p.run.branch_id === branchId) && p.employee_id === employeeId && p.run.period_start <= date && p.run.period_end >= date);
  return reps.map(rep => {
    const setting = effectiveSalesSettings(settings.find(s => s.employee_id === rep.id), defaults);
    const deals = receipts.filter(r => r.subscription?.sales_id === rep.id && !settledReceiptIds.has(r.id) && !historical(rep.id, r.receipt_date, r.branch_id)
      && (r.receipt_date >= start || legacyPaid.some(p => p.commission_sources != null && p.employee_id === rep.id && p.run.period_start <= r.receipt_date && p.run.period_end >= r.receipt_date)));
    const collected = roundMoney(deals.reduce((sum, r) => sum + Number(r.amount), 0));
    // Defer the whole employee's reversal until every attributed original is known.
    // Consuming only a known part (or zero) would permanently lose the remaining reversal.
    const applicableRefunds = refunds.filter(refund => {
      if (settled.has(`refund:${refund.id}:${rep.id}`) || (refund.completed_at && localDateString(refund.completed_at) > end)) return false;
      const attributed = refund.subscription.receipts.filter(receipt => {
        const original = entries.find(entry => entry.source_kind === 'receipt' && entry.source_id === receipt.id);
        return original ? original.employee_id === rep.id : refund.subscription.sales_id === rep.id;
      });
      return attributed.length > 0 && attributed.every(receipt =>
        entries.some(entry => entry.source_kind === 'receipt' && entry.source_id === receipt.id)
        || historical(rep.id, receipt.receipt_date, receipt.branch_id)
        || deals.some(deal => deal.id === receipt.id));
    });
    const refundedRevenue = applicableRefunds.reduce((sum, refund) => {
      const paid = refund.subscription.receipts.reduce((total, receipt) => total + Number(receipt.amount), 0);
      const attributable = refund.subscription.receipts.filter(receipt => {
        const original = entries.find(entry => entry.source_kind === 'receipt' && entry.source_id === receipt.id);
        return original ? original.employee_id === rep.id : refund.subscription.sales_id === rep.id;
      }).reduce((total, receipt) => total + Number(receipt.amount), 0);
      return sum + (paid > 0 ? Number(refund.refund_amount) * attributable / paid : 0);
    }, 0);
    const target = effectiveTarget(Number(setting?.monthly_target ?? 0), { mode: setting?.target_period_mode, startDate: setting?.target_start_date, endDate: setting?.target_end_date, days: setting?.target_days }, start, end);
    const achievementPct = target > 0 ? roundMoney(Math.max(0, collected - refundedRevenue) / target * 100) : 0;
    const commission = commissions.resolveSalesCommission(setting, achievementPct, collected);
    const sources: SalesCommissionSource[] = deals.map(r => ({ source_kind: 'receipt', source_id: r.id, employee_id: rep.id, subscription_id: r.subscription_id!, base_amount: Number(r.amount), commission_percent: commission.percent, commission_amount: roundMoney(Number(r.amount) * commission.percent / 100) }));
    for (const refund of applicableRefunds) {
      if (refund.completed_at && localDateString(refund.completed_at) > end) continue;
      if (settled.has(`refund:${refund.id}:${rep.id}`)) continue;
      const originalReceipts = refund.subscription.receipts;
      const paidBase = originalReceipts.reduce((sum, r) => sum + Number(r.amount), 0);
      if (paidBase <= 0) continue;
      let reversed = 0, attributableBase = 0;
      for (const receipt of originalReceipts) {
        const allocation = entries.find(e => e.source_kind === 'receipt' && e.source_id === receipt.id);
        if (allocation && allocation.employee_id !== rep.id) continue;
        if (!allocation && refund.subscription.sales_id !== rep.id) continue;
        const originalPayroll = historical(rep.id, receipt.receipt_date, receipt.branch_id);
        const pending = sources.find(s => s.source_kind === 'receipt' && s.source_id === receipt.id);
        // A refund only reverses commission actually settled or being settled in this run.
        const originalCommission = allocation ? Number(allocation.commission_amount)
          : originalPayroll ? roundMoney(Number(receipt.amount) * Number(originalPayroll.sales_commission_pct) / 100)
          : pending?.commission_amount ?? 0;
        reversed += originalCommission * Number(refund.refund_amount) / paidBase;
        attributableBase += Number(receipt.amount) * Number(refund.refund_amount) / paidBase;
      }
      if (attributableBase <= 0) continue;
      sources.push({ source_kind: 'refund', source_id: refund.id, employee_id: rep.id, subscription_id: refund.subscription_id,
        base_amount: -roundMoney(attributableBase), commission_amount: -roundMoney(reversed),
        commission_percent: attributableBase > 0 ? roundMoney(reversed / attributableBase * 100) : 0 });
    }
    // Performance remains visible after payroll has settled the commission sources.
    const periodCollected = receipts.filter(receipt => receipt.receipt_date >= start &&
      (entries.find(entry => entry.source_kind === 'receipt' && entry.source_id === receipt.id)?.employee_id ?? receipt.subscription?.sales_id) === rep.id)
      .reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const periodRefunded = refunds.filter(refund => {
      const date = refund.completed_at ? localDateString(refund.completed_at) : refund.refund_date;
      return date >= start && date <= end;
    }).reduce((sum, refund) => {
      const paid = refund.subscription.receipts.reduce((total, receipt) => total + Number(receipt.amount), 0);
      const owned = refund.subscription.receipts.filter(receipt =>
        (entries.find(entry => entry.source_kind === 'receipt' && entry.source_id === receipt.id)?.employee_id ?? refund.subscription.sales_id) === rep.id)
        .reduce((total, receipt) => total + Number(receipt.amount), 0);
      return sum + (paid > 0 ? Number(refund.refund_amount) * owned / paid : 0);
    }, 0);
    const periodRevenue = roundMoney(periodCollected - periodRefunded);
    return { salesRepId: rep.id, name: rep.name, isActive: setting.is_active, periodRevenue, periodAchievementPct: target > 0 ? roundMoney(Math.max(0, periodRevenue) / target * 100) : 0, subscriptions: new Set(deals.map(r => r.subscription_id)).size,
      revenue: roundMoney(sources.reduce((sum, s) => sum + s.base_amount, 0)), target, achievementPct,
      commissionPercent: commission.percent, commissionDue: roundMoney(sources.reduce((sum, s) => sum + s.commission_amount, 0)), sources };
  });
}
