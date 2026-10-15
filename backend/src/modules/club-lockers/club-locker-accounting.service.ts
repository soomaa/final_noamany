import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { localDateString } from '../club-members/club-member.utils';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { toClubPaymentMethod } from '../club-subscriptions/club-subscription.utils';

type Tx = Prisma.TransactionClient;

export interface LockerReceiptInput {
  amount: number;
  memberName: string;
  memberId?: number | null;
  branchId: number;
  paymentMethod?: string | null;
  registrationDate?: string;
  createdBy?: number;
  /** For the receipt description / GL narration. */
  subscriptionNumber: string;
}

/**
 * Creates a club_receipts row (type 'locker') AND posts a balanced GL entry for a locker
 * subscription payment, atomically inside the caller's transaction. Mirrors how
 * club-subscriptions posts a receipt + GL together.
 *
 * NOTE: club_receipts.subscription_id is a FK to club_subscriptions (NOT locker subscriptions),
 * so it is left null here; the locker subscription is tied back via its own receipt_number column.
 */
@Injectable()
export class ClubLockerAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  private async nextReceiptNumber(tx: Tx): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LRCP-${year}-`;
    const last = await tx.club_receipts.findFirst({
      where: { receipt_number: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const seq = (last?.id ?? 0) + 1;
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  /**
   * Record a locker payment: receipt + GL. Returns the receipt number so the caller can persist
   * it on the subscription. Skips entirely when amount <= 0.
   */
  async recordPayment(tx: Tx, input: LockerReceiptInput): Promise<string | null> {
    const amount = Math.round(input.amount * 100) / 100;
    if (amount <= 0) return null;

    // Race-safe LRCP-###### number: recompute + insert together, retrying on a concurrent take.
    const receipt = await retryOnUniqueViolation(async () => {
      const receiptNumber = await this.nextReceiptNumber(tx);
      return tx.club_receipts.create({
        data: {
          receipt_number: receiptNumber,
          subscription_id: null,
          member_id: input.memberId ?? null,
          member_name: input.memberName,
          branch_id: input.branchId,
          amount,
          type: 'locker',
          payment_method: toClubPaymentMethod(input.paymentMethod),
          receipt_date: input.registrationDate ?? localDateString(),
          status: 'مدفوعة',
          description: `إيصال اشتراك لوكر - ${input.subscriptionNumber}`,
          created_by: input.createdBy ?? null,
        },
      });
    });

    // Balanced GL: Dr cash (by payment method) / Cr subscription revenue. There is no locker-specific
    // revenue default-account KEY seeded, so we use subscription_revenue per spec.
    const payKey = this.moduleLedger.paymentKeyFromString(input.paymentMethod);
    await this.moduleLedger.postClubSubscription(
      {
        subscriptionNumber: input.subscriptionNumber,
        // Unique per receipt so multiple payments on the same locker sub don't collide on the GL key.
        sourceDocId: receipt.receipt_number,
        branchId: input.branchId,
        date: input.registrationDate ?? localDateString(),
        kind: 'locker',
        sourceDocType: 'receipt',
        lines: [
          { accountCode: payKey, debit: amount, credit: 0 },
          { accountCode: 'subscription_revenue', debit: 0, credit: amount },
        ],
        createdBy: input.createdBy,
      },
      tx,
    );

    return receipt.receipt_number;
  }
}
