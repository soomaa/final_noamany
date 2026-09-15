import { Prisma, sales_quick_sales } from '@prisma/client';
import { mapPaymentMethodToArabic, REVENUE_PAID, EXPENSE_APPROVED, roundMoney, toNumber } from './finance.utils';

/** Finance-register projection only. The POS transaction already owns the ledger and inventory. */
export async function syncCafeSaleFinance(
  tx: Prisma.TransactionClient,
  sale: sales_quick_sales,
  reversal?: { date: string; createdBy: number | null },
) {
  if (sale.status !== 'completed' && !reversal) return;
  const revenue = {
    revenue_date: sale.sale_date, source: 'مبيعات الكافيه',
    sub_source: sale.sale_type === 'employee' ? 'موظفين' : sale.sale_type === 'partner' ? 'شركاء' : 'نقطة البيع',
    amount: toNumber(sale.subtotal), tax_amount: toNumber(sale.tax_amount),
    discount_amount: toNumber(sale.discount_amount), total_amount: toNumber(sale.total_amount),
    net_amount: toNumber(sale.total_amount), payment_status: sale.billing_status === 'settled' || toNumber(sale.collected_amount) >= toNumber(sale.total_amount) ? REVENUE_PAID : toNumber(sale.collected_amount) > 0 ? 'جزئي' : 'معلق',
    payment_method: mapPaymentMethodToArabic(sale.payment_method),
    description: `فاتورة الكافيه ${sale.sale_number}`, customer_name: sale.customer_name,
    invoice_number: sale.sale_number, receipt_number: sale.sale_number,
    source_module: 'quick_sale', source_ref: sale.sale_number,
    branch_id: sale.branch_id, created_by: sale.created_by,
    notes: 'مستند تلقائي مربوط بالنظام', is_deleted: false, deleted_at: null,
  };
  const revenueNumber = `SALE-${sale.sale_number}`;
  // Reuse legacy sync rows instead of recording the same sale twice.
  const legacy = await tx.fin_revenues.findFirst({
    where: { source_module: 'quick_sale', source_ref: sale.sale_number },
    orderBy: { id: 'asc' }, select: { id: true },
  });
  if (legacy) await tx.fin_revenues.update({ where: { id: legacy.id }, data: revenue });
  else await tx.fin_revenues.upsert({ where: { revenue_number: revenueNumber }, create: { revenue_number: revenueNumber, ...revenue }, update: revenue });
  const cost = sale.inventory_posted ? roundMoney(toNumber(sale.cost_total)) : 0;
  const expense = {
    expense_date: sale.sale_date, category: 'تكلفة مبيعات الكافيه',
    amount: cost, tax_amount: 0, total_amount: cost, payment_method: 'تسوية مخزون',
    payment_status: 'مدفوع', approval_status: EXPENSE_APPROVED,
    invoice_number: `CAFE-COGS-${sale.id}`, description: `تكلفة الخامات للفاتورة ${sale.sale_number}`,
    branch_id: sale.branch_id, created_by: sale.created_by,
    notes: 'مستند تلقائي مربوط بالنظام', is_deleted: false, deleted_at: null,
  };
  if (cost > 0) await tx.fin_expenses.upsert({ where: { expense_number: `CAFE-COGS-${sale.id}` }, create: { expense_number: `CAFE-COGS-${sale.id}`, ...expense }, update: expense });
  else if (sale.inventory_posted && (sale as typeof sale & { events?: Array<{ event_type: string }> }).events?.some(event => event.event_type === 'completed_edited')) {
    await tx.fin_expenses.updateMany({ where: { expense_number: `CAFE-COGS-${sale.id}` }, data: { amount: 0, tax_amount: 0, total_amount: 0 } });
  }
  if (!reversal) return;
  const refund = {
    ...revenue, revenue_date: reversal.date, source: 'مرتجعات الكافيه',
    amount: -revenue.amount, tax_amount: -revenue.tax_amount, discount_amount: -revenue.discount_amount,
    total_amount: -revenue.total_amount, net_amount: -revenue.net_amount,
    source_module: 'quick_sale_reversal', created_by: reversal.createdBy, payment_status: REVENUE_PAID,
    description: `عكس فاتورة الكافيه ${sale.sale_number}`,
  };
  await tx.fin_revenues.upsert({ where: { revenue_number: `CAFE-REV-${sale.id}` }, create: { revenue_number: `CAFE-REV-${sale.id}`, ...refund }, update: refund });
  // Reverse all COGS: returned ready goods restore stock; prepared goods are posted separately as waste.
  if (cost > 0) {
    const data = { ...expense, expense_date: reversal.date, amount: -cost, total_amount: -cost,
      invoice_number: `CAFE-COGS-REV-${sale.id}`, created_by: reversal.createdBy,
      description: `عكس تكلفة المبيعات للفاتورة ${sale.sale_number}` };
    await tx.fin_expenses.upsert({ where: { expense_number: `CAFE-COGS-REV-${sale.id}` }, create: { expense_number: `CAFE-COGS-REV-${sale.id}`, ...data }, update: data });
  }
}
