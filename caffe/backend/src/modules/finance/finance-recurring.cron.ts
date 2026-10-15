import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { EXPENSE_APPROVED, nextFinDocNumber, REVENUE_PAID, toNumber } from './finance.utils';

/** Advance a YYYY-MM-DD date by recurring frequency. */
function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  switch (frequency) {
    case 'يومي':
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'أسبوعي':
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'شهري':
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'ربع سنوي':
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'سنوي':
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class FinanceRecurringCron {
  private readonly logger = new Logger(FinanceRecurringCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  /** Recurring templates due today — includes null next_recurring_date (never scheduled yet). */
  private recurringDueWhere(today: string) {
    return {
      is_recurring: true,
      is_deleted: false,
      OR: [{ next_recurring_date: null }, { next_recurring_date: { lte: today } }],
    };
  }

  /** Runs daily at 01:00 — generates expense/revenue copies from recurring templates. */
  @Cron('0 1 * * *')
  async processRecurring() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:finance-recurring', 0, () =>
      this.processRecurringLocked(),
    );
    if (ran === null) this.logger.debug('Skipped finance recurring cron; another instance holds the lock');
  }

  private async processRecurringLocked() {
    const today = new Date().toISOString().slice(0, 10);
    const dueWhere = this.recurringDueWhere(today);
    const [expenses, revenues] = await Promise.all([
      this.prisma.fin_expenses.findMany({ where: dueWhere }),
      this.prisma.fin_revenues.findMany({ where: dueWhere }),
    ]);

    let generated = 0;
    for (const src of expenses) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const expenseNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
          const createdBy = src.created_by ?? 1;
          const created = await tx.fin_expenses.create({
            data: {
              expense_number: expenseNumber,
              expense_date: today,
              category: src.category,
              sub_category: src.sub_category,
              amount: src.amount,
              tax_amount: src.tax_amount,
              total_amount: src.total_amount,
              payment_method: src.payment_method,
              payment_status: src.payment_status,
              approval_status: EXPENSE_APPROVED,
              approved_by: createdBy,
              approved_at: new Date(),
              description: src.description ? `[متكرر] ${src.description}` : '[متكرر]',
              vendor: src.vendor,
              branch_id: src.branch_id,
              department_id: src.department_id,
              is_recurring: false,
            },
          });
          await this.moduleLedger.postExpenseApproval(
            {
              expenseId: created.id,
              expenseNumber: created.expense_number,
              branchId: created.branch_id ?? undefined,
              expenseDate: created.expense_date,
              totalAmount: toNumber(created.total_amount),
              paymentMethod: created.payment_method,
              createdBy,
            },
            tx,
          );
          const next = advanceDate(today, src.recurring_frequency ?? 'شهري');
          await tx.fin_expenses.update({
            where: { id: src.id },
            data: { next_recurring_date: next },
          });
        });
        generated++;
      } catch (e) {
        this.logger.error(`Failed recurring expense ${src.id}: ${e}`);
      }
    }

    for (const src of revenues) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const revenueNumber = await nextFinDocNumber(tx, 'fin_revenues', 'revenue_number', 'REV');
          await tx.fin_revenues.create({
            data: {
              revenue_number: revenueNumber,
              revenue_date: today,
              source: src.source,
              sub_source: src.sub_source,
              amount: src.amount,
              tax_amount: src.tax_amount,
              discount_amount: src.discount_amount,
              total_amount: src.total_amount,
              net_amount: src.net_amount,
              payment_method: src.payment_method,
              payment_status: src.payment_status,
              description: src.description ? `[متكرر] ${src.description}` : '[متكرر]',
              customer_name: src.customer_name,
              branch_id: src.branch_id,
              is_recurring: false,
            },
          });
          // GL is the authoritative income statement. Recurring revenue templates previously wrote
          // only to fin_revenues and never reached the GL, so recurring revenue silently diverged
          // from the accounting income statement. Post a balanced GL entry (debit cash/bank, credit
          // 'other_revenue') within the same tx, idempotent per revenue_number. Only when paid.
          if (src.payment_status === REVENUE_PAID) {
            await this.moduleLedger.postOtherRevenue(
              {
                sourceRef: revenueNumber,
                branchId: src.branch_id ?? undefined,
                date: today,
                amount: Number(src.net_amount),
                paymentMethod: src.payment_method,
                description: src.description ? `[متكرر] ${src.description}` : `إيراد متكرر ${revenueNumber}`,
              },
              tx,
            );
          }
          const next = advanceDate(today, src.recurring_frequency ?? 'شهري');
          await tx.fin_revenues.update({
            where: { id: src.id },
            data: { next_recurring_date: next },
          });
        });
        generated++;
      } catch (e) {
        this.logger.error(`Failed recurring revenue ${src.id}: ${e}`);
      }
    }

    if (generated > 0) {
      this.logger.log(`Generated ${generated} recurring finance entries for ${today}`);
    }
  }
}
