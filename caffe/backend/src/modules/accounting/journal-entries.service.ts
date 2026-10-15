import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isDryRun, previewResponse } from '../../common/preview';
import { isBalanced, roundMoney } from './accounting.utils';
import {
  ListJournalEntriesDto,
  UpsertJournalEntryDto,
} from './dto/accounting.dto';
import { LedgerService } from './ledger.service';

@Injectable()
export class JournalEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertEntryAccess(user: JwtUser | undefined, branchId: number | null) {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed !== null && (branchId == null || !allowed.includes(branchId))) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private effectiveBranchId(user: JwtUser | undefined, requested?: number | null) {
    const allowed = this.branchScope.resolveListFilter(user, requested ?? null);
    return requested ?? (allowed === null ? undefined : allowed[0]);
  }

  private mapEntry(row: {
    id: number;
    entry_no: string;
    date: string;
    branch_id: number | null;
    description: string | null;
    reference: string | null;
    status: string;
    source_module: string | null;
    source_doc_type: string | null;
    source_doc_id: string | null;
    total_debit: Prisma.Decimal;
    total_credit: Prisma.Decimal;
    reverses_id: number | null;
    reversed_by_id: number | null;
    reversal_reason: string | null;
    created_by: number | null;
    posted_by: number | null;
    posted_at: Date | null;
    created_at: Date;
    lines?: Array<{
      id: number;
      account_id: number;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      description: string | null;
      line_order: number;
      account?: { code: string; name: string };
    }>;
  }) {
    return {
      id: row.id,
      entryNo: row.entry_no,
      date: row.date,
      branchId: row.branch_id,
      description: row.description,
      reference: row.reference,
      status: row.status,
      sourceModule: row.source_module,
      sourceDocType: row.source_doc_type,
      sourceDocId: row.source_doc_id,
      totalDebit: roundMoney(row.total_debit),
      totalCredit: roundMoney(row.total_credit),
      reversesId: row.reverses_id,
      reversedById: row.reversed_by_id,
      reversalReason: row.reversal_reason,
      createdBy: row.created_by,
      postedBy: row.posted_by,
      postedAt: row.posted_at,
      createdAt: row.created_at,
      lines: row.lines?.map((l) => ({
        id: l.id,
        accountId: l.account_id,
        accountCode: l.account?.code,
        accountName: l.account?.name,
        debit: roundMoney(l.debit),
        credit: roundMoney(l.credit),
        description: l.description,
        lineOrder: l.line_order,
      })),
    };
  }

  async list(q: ListJournalEntriesDto, user?: JwtUser) {
    const where: Prisma.acc_journal_entriesWhereInput = {};
    if (q.status) where.status = q.status;
    const branchIds = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (branchIds !== null) where.branch_id = { in: branchIds };
    else if (q.branchId != null) where.branch_id = q.branchId;
    if (q.sourceModule) where.source_module = q.sourceModule;
    if (q.dateFrom || q.dateTo) {
      where.date = {};
      if (q.dateFrom) where.date.gte = q.dateFrom;
      if (q.dateTo) where.date.lte = q.dateTo;
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { entry_no: { contains: s } },
        { description: { contains: s } },
        { reference: { contains: s } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.acc_journal_entries.count({ where }),
      this.prisma.acc_journal_entries.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: [{ date: q.order }, { id: q.order }],
        include: {
          lines: {
            include: { account: { select: { code: true, name: true } } },
            orderBy: { line_order: 'asc' },
          },
        },
      }),
    ]);
    return paginated(rows.map((r) => this.mapEntry(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.acc_journal_entries.findUnique({
      where: { id },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { line_order: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('القيد غير موجود');
    this.assertEntryAccess(user, row.branch_id);
    return this.mapEntry(row);
  }

  private async buildLines(dto: UpsertJournalEntryDto, branchId?: number) {
    const resolved: Array<{
      account_id: number;
      debit: number;
      credit: number;
      description: string | null;
      line_order: number;
    }> = [];
    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i]!;
      const debit = roundMoney(line.debit ?? 0);
      const credit = roundMoney(line.credit ?? 0);
      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new BadRequestException('كل سطر يجب أن يكون مدين أو دائن فقط');
      }
      const accountId = await this.ledger.resolveAccountIdByCodeOrKey(
        this.prisma,
        line.accountId,
        line.accountCode,
        branchId ?? dto.branchId,
      );
      resolved.push({
        account_id: accountId,
        debit,
        credit,
        description: line.description ?? null,
        line_order: i,
      });
    }
    const totalDebit = roundMoney(resolved.reduce((s, l) => s + l.debit, 0));
    const totalCredit = roundMoney(resolved.reduce((s, l) => s + l.credit, 0));
    if (!isBalanced(totalDebit, totalCredit)) {
      throw new BadRequestException('القيد غير متوازن');
    }
    return { resolved, totalDebit, totalCredit };
  }

  async create(dto: UpsertJournalEntryDto, userId: number, user?: JwtUser) {
    const branchId = this.effectiveBranchId(user, dto.branchId);
    if (branchId != null) this.assertEntryAccess(user, branchId);
    const effectiveDto = { ...dto, branchId };
    await this.ledger.assertPeriodOpenForDate(effectiveDto.date);
    const { resolved, totalDebit, totalCredit } = await this.buildLines(effectiveDto);
    const entryNo = await this.ledger.nextManualEntryNo(effectiveDto.date);
    const row = await this.prisma.acc_journal_entries.create({
      data: {
        entry_no: entryNo,
        date: effectiveDto.date,
        branch_id: effectiveDto.branchId ?? null,
        description: effectiveDto.description ?? null,
        reference: effectiveDto.reference ?? null,
        status: 'draft',
        source_module: 'manual',
        source_doc_type: 'manual',
        source_doc_id: entryNo,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: userId,
        lines: { create: resolved },
      },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { line_order: 'asc' },
        },
      },
    });
    return this.mapEntry(row);
  }

  async update(id: number, dto: UpsertJournalEntryDto, user?: JwtUser) {
    const existing = await this.prisma.acc_journal_entries.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('القيد غير موجود');
    this.assertEntryAccess(user, existing.branch_id);
    if (existing.status !== 'draft') {
      throw new BadRequestException('لا يمكن تعديل قيد مرحّل');
    }
    const branchId = this.effectiveBranchId(user, dto.branchId ?? existing.branch_id);
    if (branchId != null) this.assertEntryAccess(user, branchId);
    const effectiveDto = { ...dto, branchId };
    await this.ledger.assertPeriodOpenForDate(effectiveDto.date);
    const { resolved, totalDebit, totalCredit } = await this.buildLines(effectiveDto);
    const [, row] = await this.prisma.$transaction([
      this.prisma.acc_journal_entry_lines.deleteMany({ where: { entry_id: id } }),
      this.prisma.acc_journal_entries.update({
        where: { id },
        data: {
          date: effectiveDto.date,
          branch_id: effectiveDto.branchId ?? null,
          description: effectiveDto.description ?? null,
          reference: effectiveDto.reference ?? null,
          total_debit: totalDebit,
          total_credit: totalCredit,
          lines: { create: resolved },
        },
        include: {
          lines: {
            include: { account: { select: { code: true, name: true } } },
            orderBy: { line_order: 'asc' },
          },
        },
      }),
    ]);
    return this.mapEntry(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.acc_journal_entries.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('القيد غير موجود');
    this.assertEntryAccess(user, existing.branch_id);
    if (existing.status !== 'draft') {
      throw new BadRequestException('لا يمكن حذف قيد مرحّل');
    }
    await this.prisma.acc_journal_entries.delete({ where: { id } });
    return { ok: true };
  }

  async post(id: number, userId: number, user?: JwtUser) {
    const existing = await this.prisma.acc_journal_entries.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('القيد غير موجود');
    this.assertEntryAccess(user, existing.branch_id);
    if (existing.status !== 'draft') {
      throw new BadRequestException('القيد مرحّل بالفعل');
    }
    await this.ledger.assertPeriodOpenForDate(existing.date);
    if (!isBalanced(roundMoney(existing.total_debit), roundMoney(existing.total_credit))) {
      throw new BadRequestException('القيد غير متوازن');
    }
    // Atomic conditional claim: only a draft can be posted, and only once. Two concurrent
    // posts race on this updateMany — the loser sees count === 0 and is rejected.
    const claimed = await this.prisma.acc_journal_entries.updateMany({
      where: { id, status: 'draft' },
      data: {
        status: 'posted',
        posted_by: userId,
        posted_at: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('القيد مرحّل بالفعل');
    }
    const row = await this.prisma.acc_journal_entries.findUniqueOrThrow({
      where: { id },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { line_order: 'asc' },
        },
      },
    });
    return this.mapEntry(row);
  }

  async reverse(
    id: number,
    reason: string,
    userId: number,
    dryRun = false,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.acc_journal_entries.findUnique({
      where: { id },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { line_order: 'asc' },
        },
      },
    });
    if (!existing) throw new NotFoundException('القيد غير موجود');
    this.assertEntryAccess(user, existing.branch_id);
    if (existing.status !== 'posted') {
      throw new BadRequestException('يمكن عكس القيود المرحّلة فقط');
    }
    if (existing.reversed_by_id) {
      throw new BadRequestException('تم عكس هذا القيد مسبقاً');
    }

    if (isDryRun(dryRun)) {
      const rows = existing.lines.map((l) => ({
        label: `${l.account?.code ?? l.account_id} — ${l.account?.name ?? ''}`.trim(),
        before: `${roundMoney(l.debit) > 0 ? `مدين ${roundMoney(l.debit).toFixed(2)}` : `دائن ${roundMoney(l.credit).toFixed(2)}`}`,
        after: `${roundMoney(l.credit) > 0 ? `مدين ${roundMoney(l.credit).toFixed(2)}` : `دائن ${roundMoney(l.debit).toFixed(2)}`}`,
      }));
      return previewResponse(
        {
          entryNo: existing.entry_no,
          date: existing.date,
          totalDebit: roundMoney(existing.total_credit),
          totalCredit: roundMoney(existing.total_debit),
        },
        { rows, warning: 'سيتم إنشاء قيد عكسي بمبالغ معكوسة' },
      );
    }

    return this.ledger.reverseEntry(id, reason, userId);
  }
}
