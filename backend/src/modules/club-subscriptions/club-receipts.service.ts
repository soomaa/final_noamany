import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { localDateString } from '../club-members/club-member.utils';
import {
  ClubPaymentSplit,
  nextSeqFromMax,
  primaryClubPaymentMethod,
  remainingAmount,
  resolveClubPayments,
  toClubPaymentMethod,
  toNum,
} from './club-subscription.utils';

type Tx = Prisma.TransactionClient;

@Injectable()
export class ClubReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async nextReceiptNumber(tx?: Tx): Promise<string> {
    const client = (tx ?? this.prisma) as Tx;
    const year = new Date().getFullYear();
    const prefix = `R-${year}-`;
    await client.$queryRaw`SELECT GET_LOCK('seq:club_receipts:receipt_number', 10)`;
    try {
      const rows = await client.$queryRaw<{ maxNum: number | null }[]>`
        SELECT MAX(CAST(SUBSTRING(receipt_number, ${prefix.length + 1}) AS UNSIGNED)) AS maxNum
        FROM club_receipts WHERE receipt_number LIKE ${prefix + '%'}
      `;
      const seq = nextSeqFromMax(rows[0]?.maxNum);
      return `${prefix}${String(seq).padStart(7, '0')}`;
    } finally {
      await client.$queryRaw`SELECT RELEASE_LOCK('seq:club_receipts:receipt_number')`;
    }
  }

  async recalculateSubscriptionPayments(subscriptionId: number, tx?: Tx) {
    const client = (tx ?? this.prisma) as Tx;
    const sub = await client.club_subscriptions.findUnique({ where: { id: subscriptionId } });
    if (!sub) return;

    const agg = await client.club_receipts.aggregate({
      where: { subscription_id: subscriptionId },
      _sum: { amount: true },
    });
    const paid = toNum(agg._sum.amount);
    const remaining = Math.max(0, remainingAmount(
      toNum(sub.subscription_value),
      sub.discount_enabled,
      toNum(sub.discount_value),
      paid,
    ) - toNum(sub.waived_amount) - toNum(sub.transferred_credit_amount));

    await client.club_subscriptions.update({
      where: { id: subscriptionId },
      data: { paid_amount: paid, remaining_amount: remaining },
    });
  }

  async createForSubscription(
    subscriptionId: number,
    amount: number,
    opts: {
      memberName: string;
      memberId?: number;
      type?: string;
      description?: string;
      paymentMethod?: string | null;
      /** Split tender. Omit for a single-method receipt — one row is still written. */
      payments?: ClubPaymentSplit[];
      createdBy?: number | null;
    },
    tx?: Tx,
  ) {
    if (amount <= 0) return null;
    const client = (tx ?? this.prisma) as Tx;
    const sub = await client.club_subscriptions.findUnique({ where: { id: subscriptionId } });
    if (!sub) return null;

    const splits = resolveClubPayments(
      amount,
      opts.paymentMethod ?? sub.payment_method,
      opts.payments,
    );

    // Race-safe RCP-###### number: recompute + insert together, retrying if a concurrent receipt took it.
    const receipt = await retryOnUniqueViolation(async () => {
      const receiptNumber = await this.nextReceiptNumber(tx);
      return client.club_receipts.create({
        data: {
          receipt_number: receiptNumber,
          subscription_id: subscriptionId,
          member_id: opts.memberId ?? sub.member_id,
          member_name: opts.memberName,
          branch_id: sub.branch_id,
          amount,
          type: opts.type ?? sub.subscription_type,
          payment_method:
            primaryClubPaymentMethod(splits) ??
            toClubPaymentMethod(opts.paymentMethod) ??
            sub.payment_method ??
            null,
          receipt_date: localDateString(),
          status: 'مدفوعة',
          description: opts.description ?? `إيصال اشتراك - ${sub.subscription_type ?? 'اشتراك'}`,
          created_by: opts.createdBy ?? sub.created_by ?? null,
          payments: { create: splits.map((p) => ({ method: p.method, amount: p.amount })) },
        },
      });
    });

    await client.club_subscriptions.update({
      where: { id: subscriptionId },
      data: { receipt_number: receipt.receipt_number },
    });
    await this.recalculateSubscriptionPayments(subscriptionId, tx);
    return receipt;
  }
}
