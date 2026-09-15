import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../accounting/ledger.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';

type Tx = Prisma.TransactionClient;

export interface JournalInput {
  subscriptionNumber: string;
  paidAmount: number;
  subscriptionValue: number;
  discountValue: number;
  discountEnabled: boolean;
  paymentMethod?: string;
  /** Split tender for this collection. Empty/omitted posts the whole amount on `paymentMethod`. */
  payments?: { method: string; amount: number }[];
  branchId: number;
  createdBy?: number;
  registrationDate?: string;
  kind?: 'subscription' | 'payment' | 'renewal' | 'refund' | 'transfer';
  /** Unique business key per posting event (receipt no / refund invoice / transfer id). Falls back
   *  to subscriptionNumber, which is only safe for the one-off initial subscription posting. */
  sourceDocId?: string;
}

@Injectable()
export class ClubSubscriptionAccountingService {
  constructor(
    private readonly moduleLedger: ModuleLedgerService,
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  private paymentKey(method?: string): string {
    return this.moduleLedger.paymentKeyFromString(method);
  }

  /**
   * Money-in side of a collection, as one line per GL asset account.
   *
   * The 8 payment methods collapse onto 4 accounts (cash/bank/card/online), so a split receipt is
   * merged per account first — two lines on the same account would be a malformed entry. The
   * amounts are asserted against the collected total because the ledger rejects unbalanced entries
   * with a generic error that is impossible to trace back to a bad split.
   */
  private collectionLines(
    total: number,
    payments: { method: string; amount: number }[] | undefined,
    fallbackMethod: string | undefined,
    side: 'debit' | 'credit',
  ): Array<{ accountCode: string; debit: number; credit: number }> {
    // A zero-value posting (e.g. a fully-consumed refund) still needs its line, otherwise the
    // entry would be built from a single side.
    if (total <= 0) {
      const account = this.paymentKey(fallbackMethod);
      return [{ accountCode: account, debit: 0, credit: 0 }];
    }

    const rows =
      payments && payments.length > 0
        ? payments
        : [{ method: fallbackMethod ?? 'cash', amount: total }];

    const byAccount = new Map<string, number>();
    for (const p of rows) {
      const amount = Math.round(p.amount * 100) / 100;
      if (amount <= 0) continue;
      const account = this.paymentKey(p.method);
      byAccount.set(account, Math.round(((byAccount.get(account) ?? 0) + amount) * 100) / 100);
    }

    const sum = Math.round([...byAccount.values()].reduce((s, v) => s + v, 0) * 100) / 100;
    if (sum !== total) {
      throw new BadRequestException(
        `مجموع طرق الدفع (${sum}) لا يساوي المبلغ المحصّل (${total})`,
      );
    }

    return [...byAccount].map(([accountCode, amount]) => ({
      accountCode,
      debit: side === 'debit' ? amount : 0,
      credit: side === 'credit' ? amount : 0,
    }));
  }

  /**
   * Reverse the GL entry posted for a club receipt/renewal so the subledger and GL stay in sync
   * when the receipt is deleted or the period is reset. Idempotent-ish: a source doc that never
   * posted (paid=0) or was already reversed is simply skipped.
   */
  async reverseReceiptEntry(
    sourceDocId: string,
    reason: string,
    postedBy?: number,
    tx?: Tx,
  ): Promise<void> {
    const client = (tx ?? this.prisma) as Tx;
    // The initial subscription posting uses source_doc_type 'subscription' (kind 'subscription'),
    // later payments/renewals use 'receipt' — but both carry the receipt number as source_doc_id.
    const entry = await client.acc_journal_entries.findFirst({
      where: {
        source_module: 'club',
        source_doc_type: { in: ['receipt', 'subscription'] },
        source_doc_id: sourceDocId,
        status: 'posted',
      },
      orderBy: { id: 'desc' },
    });
    if (!entry) return;
    await this.ledger.reverseEntry(entry.id, reason, postedBy ?? 0, tx);
  }

  private sourceDocType(kind: string): string {
    switch (kind) {
      case 'payment':
      case 'renewal':
        return 'receipt';
      case 'refund':
        return 'refund';
      case 'transfer':
        return 'transfer';
      default:
        return 'subscription';
    }
  }

  async postJournal(input: JournalInput, tx?: Tx): Promise<void> {
    const kind = input.kind ?? 'subscription';
    const paid = Math.round(input.paidAmount * 100) / 100;
    if (paid <= 0 && kind !== 'refund') return;

    const date = input.registrationDate ?? new Date().toISOString().slice(0, 10);
    const amount = paid;

    let lines: Array<{ accountCode: string; debit: number; credit: number }>;
    if (kind === 'refund') {
      lines = [
        { accountCode: 'subscription_revenue', debit: amount, credit: 0 },
        ...this.collectionLines(amount, input.payments, input.paymentMethod, 'credit'),
      ];
    } else if (
      (kind === 'subscription' || kind === 'renewal') &&
      input.discountEnabled &&
      input.discountValue > 0
    ) {
      // Discount is recognized ONCE, at creation/renewal, alongside the initial payment. Revenue
      // credited must equal total debits (cash + discount) or postEntry rejects as unbalanced —
      // credit (paid + discount), NOT the gross subscription value (which breaks on partial pays).
      const discount = Math.round(input.discountValue * 100) / 100;
      lines = [
        ...this.collectionLines(paid, input.payments, input.paymentMethod, 'debit'),
        { accountCode: 'subscription_discount', debit: discount, credit: 0 },
        { accountCode: 'subscription_revenue', debit: 0, credit: Math.round((paid + discount) * 100) / 100 },
      ];
    } else {
      // Later installments (kind 'payment') and any no-discount posting: cash in = revenue.
      lines = [
        ...this.collectionLines(paid, input.payments, input.paymentMethod, 'debit'),
        { accountCode: 'subscription_revenue', debit: 0, credit: paid },
      ];
    }

    await this.moduleLedger.postClubSubscription(
      {
        subscriptionNumber: input.subscriptionNumber,
        sourceDocId: input.sourceDocId ?? input.subscriptionNumber,
        branchId: input.branchId,
        date,
        kind,
        sourceDocType: this.sourceDocType(kind),
        lines,
        createdBy: input.createdBy,
      },
      tx,
    );
  }
}
