import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JournalEntryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  dateInRange,
  isBalanced,
  roundMoney,
} from './accounting.utils';

export interface LedgerLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface LedgerPostInput {
  sourceModule: string;
  sourceDocType: string;
  sourceDocId: string | number;
  branchId?: number;
  date: string;
  description: string;
  lines: LedgerLineInput[];
  createdBy?: number;
  entryPrefix?: 'A' | 'D' | 'M';
}

export interface JournalEntryDto {
  id: number;
  entryNo: string;
  date: string;
  status: JournalEntryStatus;
  totalDebit: number;
  totalCredit: number;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postEntry(input: LedgerPostInput, tx?: Tx): Promise<JournalEntryDto> {
    const run = async (client: Tx) => {
      const sourceDocId = String(input.sourceDocId);
      const existing = await client.acc_journal_entries.findFirst({
        where: {
          source_module: input.sourceModule,
          source_doc_type: input.sourceDocType,
          source_doc_id: sourceDocId,
          status: { in: ['posted', 'draft'] },
        },
        include: { lines: true },
      });
      if (existing) return this.mapEntry(existing);

      const previousVersion = await client.acc_journal_entries.aggregate({
        where: {
          source_module: input.sourceModule,
          source_doc_type: input.sourceDocType,
          source_doc_id: sourceDocId,
        },
        _max: { source_version: true },
      });
      const sourceVersion = (previousVersion._max.source_version ?? 0) + 1;

      this.validateLines(input.lines);
      await this.assertPeriodOpen(client, input.date);

      const resolvedLines = await Promise.all(
        input.lines.map(async (line, idx) => {
          const accountId = await this.resolveAccountId(
            client,
            line.accountCode,
            input.branchId,
          );
          const debit = roundMoney(line.debit);
          const credit = roundMoney(line.credit);
          if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
            throw new BadRequestException('كل سطر يجب أن يكون مدين أو دائن فقط');
          }
          return {
            account_id: accountId,
            debit,
            credit,
            description: line.description ?? null,
            line_order: idx,
          };
        }),
      );

      const totalDebit = roundMoney(resolvedLines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = roundMoney(resolvedLines.reduce((s, l) => s + l.credit, 0));
      if (!isBalanced(totalDebit, totalCredit)) {
        throw new BadRequestException('القيد غير متوازن');
      }

      const entryNo = await this.nextEntryNo(
        client,
        input.date,
        input.entryPrefix ?? 'A',
      );

      const entry = await client.acc_journal_entries.create({
        data: {
          entry_no: entryNo,
          date: input.date,
          branch_id: input.branchId ?? null,
          description: input.description,
          status: 'posted',
          source_module: input.sourceModule,
          source_doc_type: input.sourceDocType,
          source_doc_id: sourceDocId,
          source_version: sourceVersion,
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: input.createdBy ?? null,
          posted_by: input.createdBy ?? null,
          posted_at: new Date(),
          lines: { create: resolvedLines },
        },
        include: { lines: true },
      });
      return this.mapEntry(entry);
    };

    // With an external tx we can't retry (the caller owns rollback). On our own transaction, retry
    // on a unique entry_no collision so two concurrent posts that computed the same number don't 500
    // — the retry recomputes nextEntryNo against the now-committed row.
    if (tx) return run(tx);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(run);
      } catch (e) {
        const isRetryableUniqueClash =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002';
        // A concurrent writer can claim either the next entry number or source version.
        // Retrying re-runs the active-entry check and version calculation.
        if (isRetryableUniqueClash && attempt < 4) continue;
        throw e;
      }
    }
  }

  async reverseEntry(
    entryId: number,
    reason: string,
    postedBy: number,
    tx?: Tx,
  ): Promise<JournalEntryDto> {
    const run = async (client: Tx) => {
      const original = await client.acc_journal_entries.findUnique({
        where: { id: entryId },
        include: { lines: true },
      });
      if (!original) throw new NotFoundException('القيد غير موجود');
      if (original.status !== 'posted') {
        throw new BadRequestException('يمكن عكس القيود المرحّلة فقط');
      }
      if (original.reversed_by_id) {
        throw new BadRequestException('تم عكس هذا القيد مسبقاً');
      }

      await this.assertPeriodOpen(client, original.date);

      // Atomic conditional claim: mark the original 'reversed' only if it is still 'posted'
      // and not already reversed. Two concurrent reversals race here — the loser sees count 0.
      const claimed = await client.acc_journal_entries.updateMany({
        where: { id: original.id, status: 'posted', reversed_by_id: null },
        data: { status: 'reversed' },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('تم عكس هذا القيد مسبقاً');
      }

      const reversalNo = await this.nextEntryNo(client, original.date, 'M');
      const reversal = await client.acc_journal_entries.create({
        data: {
          entry_no: reversalNo,
          date: original.date,
          branch_id: original.branch_id,
          description: `عكس: ${original.description ?? original.entry_no}`,
          reference: original.entry_no,
          status: 'posted',
          source_module: original.source_module,
          source_doc_type: `${original.source_doc_type}_reversal`,
          source_doc_id: `${original.source_doc_id}-rev-${original.id}`,
          total_debit: original.total_credit,
          total_credit: original.total_debit,
          reverses_id: original.id,
          reversal_reason: reason,
          created_by: postedBy,
          posted_by: postedBy,
          posted_at: new Date(),
          lines: {
            create: original.lines.map((l, idx) => ({
              account_id: l.account_id,
              debit: l.credit,
              credit: l.debit,
              description: l.description,
              line_order: idx,
            })),
          },
        },
      });

      await client.acc_journal_entries.update({
        where: { id: original.id },
        data: { reversed_by_id: reversal.id },
      });

      return this.mapEntry(reversal);
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  async resolveAccountId(
    client: Tx | PrismaService,
    accountCode: string,
    branchId?: number,
  ): Promise<number> {
    const db = client as PrismaService;
    const mapped = await db.acc_default_accounts.findFirst({
      where: {
        key: accountCode,
        OR: [{ branch_id: branchId ?? null }, { branch_id: null }],
      },
      orderBy: { branch_id: 'desc' },
    });
    const code = mapped?.account_code ?? accountCode;
    const account = await db.acc_accounts.findFirst({
      where: { code, is_active: true, is_postable: true },
    });
    if (!account) {
      throw new BadRequestException(`الحساب غير موجود: ${accountCode}`);
    }
    return account.id;
  }

  async resolveAccountIdByCodeOrKey(
    client: Tx | PrismaService,
    accountId?: number,
    accountCode?: string,
    branchId?: number,
  ): Promise<number> {
    if (accountId) {
      const acc = await (client as PrismaService).acc_accounts.findUnique({
        where: { id: accountId },
      });
      if (!acc || !acc.is_active || !acc.is_postable) {
        throw new BadRequestException('الحساب غير صالح للترحيل');
      }
      return accountId;
    }
    if (!accountCode) throw new BadRequestException('يجب تحديد الحساب');
    return this.resolveAccountId(client, accountCode, branchId);
  }

  private validateLines(lines: LedgerLineInput[]) {
    if (lines.length < 2) {
      throw new BadRequestException('يجب أن يحتوي القيد على سطرين على الأقل');
    }
    const totalDebit = roundMoney(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
    const totalCredit = roundMoney(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
    if (!isBalanced(totalDebit, totalCredit)) {
      throw new BadRequestException('القيد غير متوازن');
    }
  }

  private async assertPeriodOpen(client: Tx, date: string) {
    let periods = await client.acc_accounting_periods.findMany({
      where: {
        start_date: { lte: date },
        end_date: { gte: date },
      },
    });
    if (periods.length === 0) {
      const year = date.slice(0, 4);
      const existing = await client.acc_accounting_periods.findFirst({ where: { name: year } });
      if (!existing) {
        await client.acc_accounting_periods.create({
          data: {
            name: year,
            start_date: `${year}-01-01`,
            end_date: `${year}-12-31`,
            status: 'open',
          },
        });
      }
      periods = await client.acc_accounting_periods.findMany({
        where: {
          start_date: { lte: date },
          end_date: { gte: date },
        },
      });
      if (periods.length === 0) return;
    }
    const blocked = periods.some((p) => p.status === 'closed' || p.status === 'locked');
    if (blocked) throw new BadRequestException('الفترة المحاسبية مغلقة');
    const open = periods.some((p) => p.status === 'open');
    if (!open && periods.length > 0) {
      throw new BadRequestException('الفترة المحاسبية مغلقة');
    }
  }

  private async nextEntryNo(client: Tx, date: string, prefix: 'A' | 'D' | 'M') {
    const bucket = date.replace(/-/g, '');
    const like = `JE-${prefix}-${bucket}-%`;
    const count = await client.acc_journal_entries.count({
      where: { entry_no: { startsWith: `JE-${prefix}-${bucket}-` } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `JE-${prefix}-${bucket}-${seq}`;
  }

  private mapEntry(entry: {
    id: number;
    entry_no: string;
    date: string;
    status: JournalEntryStatus;
    total_debit: Prisma.Decimal;
    total_credit: Prisma.Decimal;
  }): JournalEntryDto {
    return {
      id: entry.id,
      entryNo: entry.entry_no,
      date: entry.date,
      status: entry.status,
      totalDebit: roundMoney(entry.total_debit),
      totalCredit: roundMoney(entry.total_credit),
    };
  }

  /** Used by manual journal draft posting. */
  async nextManualEntryNo(date: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    return this.nextEntryNo(client as Tx, date, 'M');
  }

  async assertPeriodOpenForDate(date: string) {
    return this.assertPeriodOpen(this.prisma as unknown as Tx, date);
  }
}
