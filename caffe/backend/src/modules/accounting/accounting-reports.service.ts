import { BadRequestException, Injectable } from "@nestjs/common";
import { AccountType, NormalBalance, Prisma } from "@prisma/client";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtUser } from "../../common/types/jwt-user";
import {
  collectDescendantIds,
  isBalanced,
  LEDGER_REPORT_STATUSES,
  netBalance,
  roundMoney,
} from "./accounting.utils";
import {
  AccountStatementQueryDto,
  BalanceSheetQueryDto,
  GeneralLedgerQueryDto,
  ReportDateRangeDto,
} from "./dto/accounting.dto";

@Injectable()
export class AccountingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private branchEntryFilter(
    requested: number | string | undefined,
    user?: JwtUser,
  ): Prisma.acc_journal_entriesWhereInput {
    const ids = this.branchScope.resolveListFilter(user, requested ?? null);
    return ids === null ? {} : { branch_id: { in: ids } };
  }

  private postedLineFilter(
    q: ReportDateRangeDto,
    user?: JwtUser,
    accountIds?: number[],
  ): Prisma.acc_journal_entry_linesWhereInput {
    const entryFilter: Prisma.acc_journal_entriesWhereInput = {
      status: { in: LEDGER_REPORT_STATUSES },
      ...this.branchEntryFilter(q.branchId, user),
    };
    const filter: Prisma.acc_journal_entry_linesWhereInput = {
      entry: entryFilter,
    };
    if (accountIds?.length) filter.account_id = { in: accountIds };
    return filter;
  }

  private async sumLines(
    where: Prisma.acc_journal_entry_linesWhereInput,
    dateBefore?: string,
    dateRange?: { from?: string; to?: string },
  ) {
    const entryWhere: Prisma.acc_journal_entriesWhereInput = {
      ...(where.entry as Prisma.acc_journal_entriesWhereInput),
    };
    if (dateBefore) entryWhere.date = { lt: dateBefore };
    if (dateRange?.from || dateRange?.to) {
      entryWhere.date = {};
      if (dateRange.from) entryWhere.date.gte = dateRange.from;
      if (dateRange.to) entryWhere.date.lte = dateRange.to;
    }
    const agg = await this.prisma.acc_journal_entry_lines.aggregate({
      where: { ...where, entry: entryWhere },
      _sum: { debit: true, credit: true },
    });
    return {
      debit: roundMoney(agg._sum.debit ?? 0),
      credit: roundMoney(agg._sum.credit ?? 0),
    };
  }

  async trialBalance(q: ReportDateRangeDto, user?: JwtUser) {
    const accounts = await this.prisma.acc_accounts.findMany({
      where: { is_active: true, is_postable: true },
      orderBy: { code: "asc" },
    });
    const rows: Array<{
      accountId: number;
      code: string;
      name: string;
      accountType: AccountType;
      debit: number;
      credit: number;
      balance: number;
    }> = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const acc of accounts) {
      const opening = q.dateFrom
        ? await this.sumLines(
            {
              account_id: acc.id,
              entry: {
                status: { in: LEDGER_REPORT_STATUSES },
                ...this.branchEntryFilter(q.branchId, user),
              },
            },
            q.dateFrom,
          )
        : { debit: 0, credit: 0 };
      const period = await this.sumLines(
        this.postedLineFilter(q, user, [acc.id]),
        undefined,
        { from: q.dateFrom, to: q.dateTo },
      );
      const debit = roundMoney(opening.debit + period.debit);
      const credit = roundMoney(opening.credit + period.credit);
      if (debit === 0 && credit === 0) continue;
      totalDebit += debit;
      totalCredit += credit;
      rows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        accountType: acc.account_type,
        debit,
        credit,
        balance: netBalance(debit, credit, acc.normal_balance),
      });
    }
    totalDebit = roundMoney(totalDebit);
    totalCredit = roundMoney(totalCredit);
    return {
      rows,
      summary: {
        totalDebit,
        totalCredit,
        difference: roundMoney(totalDebit - totalCredit),
        isBalanced: isBalanced(totalDebit, totalCredit),
      },
    };
  }

  async accountStatement(q: AccountStatementQueryDto, user?: JwtUser) {
    const account = await this.prisma.acc_accounts.findUnique({
      where: { id: q.accountId },
    });
    if (!account) throw new BadRequestException("الحساب غير موجود");

    let accountIds = [q.accountId];
    if (q.includeChildren) {
      const all = await this.prisma.acc_accounts.findMany({
        where: { is_active: true },
        select: { id: true, parent_id: true },
      });
      accountIds = collectDescendantIds(all, q.accountId);
    }

    const opening = q.dateFrom
      ? await this.sumLines(
          {
            account_id: { in: accountIds },
            entry: {
              status: { in: LEDGER_REPORT_STATUSES },
              ...this.branchEntryFilter(q.branchId, user),
            },
          },
          q.dateFrom,
        )
      : { debit: 0, credit: 0 };

    const lines = await this.prisma.acc_journal_entry_lines.findMany({
      where: {
        account_id: { in: accountIds },
        entry: {
          status: { in: LEDGER_REPORT_STATUSES },
          ...this.branchEntryFilter(q.branchId, user),
          ...(q.dateFrom || q.dateTo
            ? {
                date: {
                  ...(q.dateFrom ? { gte: q.dateFrom } : {}),
                  ...(q.dateTo ? { lte: q.dateTo } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        entry: { select: { entry_no: true, date: true, description: true } },
        account: { select: { code: true, name: true } },
      },
      orderBy: [{ entry: { date: "asc" } }, { line_order: "asc" }],
    });

    let running = netBalance(
      opening.debit,
      opening.credit,
      account.normal_balance,
    );
    const movements = lines.map((l) => {
      const debit = roundMoney(l.debit);
      const credit = roundMoney(l.credit);
      running = roundMoney(
        running + netBalance(debit, credit, account.normal_balance),
      );
      return {
        date: l.entry.date,
        entryNo: l.entry.entry_no,
        description: l.description ?? l.entry.description,
        accountCode: l.account.code,
        accountName: l.account.name,
        debit,
        credit,
        balance: running,
      };
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        normalBalance: account.normal_balance,
      },
      openingBalance: netBalance(
        opening.debit,
        opening.credit,
        account.normal_balance,
      ),
      movements,
      closingBalance: running,
    };
  }

  async generalLedger(q: GeneralLedgerQueryDto, user?: JwtUser) {
    const accounts = await this.prisma.acc_accounts.findMany({
      where: {
        is_active: true,
        is_postable: true,
        ...(q.accountId ? { id: q.accountId } : {}),
      },
      orderBy: { code: "asc" },
    });

    const sections: Array<{
      accountId: number;
      code: string;
      name: string;
      normalBalance: NormalBalance;
      openingBalance: number;
      movements: Array<{
        date: string;
        entryNo: string;
        description: string | null;
        debit: number;
        credit: number;
        balance: number;
      }>;
      closingBalance: number;
    }> = [];
    for (const acc of accounts) {
      const opening = q.dateFrom
        ? await this.sumLines(
            {
              account_id: acc.id,
              entry: {
                status: { in: LEDGER_REPORT_STATUSES },
                ...this.branchEntryFilter(q.branchId, user),
              },
            },
            q.dateFrom,
          )
        : { debit: 0, credit: 0 };

      const lines = await this.prisma.acc_journal_entry_lines.findMany({
        where: {
          account_id: acc.id,
          entry: {
            status: { in: LEDGER_REPORT_STATUSES },
            ...this.branchEntryFilter(q.branchId, user),
            ...(q.dateFrom || q.dateTo
              ? {
                  date: {
                    ...(q.dateFrom ? { gte: q.dateFrom } : {}),
                    ...(q.dateTo ? { lte: q.dateTo } : {}),
                  },
                }
              : {}),
          },
        },
        include: {
          entry: { select: { entry_no: true, date: true, description: true } },
        },
        orderBy: [{ entry: { date: "asc" } }, { line_order: "asc" }],
      });

      if (lines.length === 0 && opening.debit === 0 && opening.credit === 0)
        continue;

      let running = netBalance(
        opening.debit,
        opening.credit,
        acc.normal_balance,
      );
      const movements = lines.map((l) => {
        const debit = roundMoney(l.debit);
        const credit = roundMoney(l.credit);
        running = roundMoney(
          running + netBalance(debit, credit, acc.normal_balance),
        );
        return {
          date: l.entry.date,
          entryNo: l.entry.entry_no,
          description: l.description ?? l.entry.description,
          debit,
          credit,
          balance: running,
        };
      });

      sections.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        normalBalance: acc.normal_balance,
        openingBalance: netBalance(
          opening.debit,
          opening.credit,
          acc.normal_balance,
        ),
        movements,
        closingBalance: running,
      });
    }
    return { sections };
  }

  private async typeTotals(
    types: AccountType[],
    q: {
      dateFrom?: string;
      dateTo?: string;
      branchId?: number;
      asOfDate?: string;
    },
    user?: JwtUser,
  ) {
    const accounts = await this.prisma.acc_accounts.findMany({
      where: {
        is_active: true,
        is_postable: true,
        account_type: { in: types },
      },
    });
    let total = 0;
    const items: Array<{ code: string; name: string; amount: number }> = [];
    for (const acc of accounts) {
      const baseWhere: Prisma.acc_journal_entry_linesWhereInput = {
        account_id: acc.id,
        entry: {
          status: { in: LEDGER_REPORT_STATUSES },
          ...this.branchEntryFilter(q.branchId, user),
        },
      };
      // Revenue and expense reports are period activity, not running balances. A dateFrom
      // must therefore exclude earlier activity. Balance-sheet callers pass asOfDate and
      // intentionally receive the cumulative balance through that date.
      const totals = q.asOfDate
        ? await this.sumLines(baseWhere, undefined, { to: q.asOfDate })
        : q.dateFrom || q.dateTo
          ? await this.sumLines(baseWhere, undefined, {
              from: q.dateFrom,
              to: q.dateTo,
            })
          : await this.sumLines(baseWhere);
      const debit = totals.debit;
      const credit = totals.credit;
      const amount = netBalance(debit, credit, acc.normal_balance);
      if (amount === 0) continue;
      total = roundMoney(total + amount);
      items.push({ code: acc.code, name: acc.name, amount });
    }
    return { total, items };
  }

  async incomeStatement(q: ReportDateRangeDto, user?: JwtUser) {
    const revenue = await this.typeTotals(["revenue"], q, user);
    const expenses = await this.typeTotals(["expense"], q, user);
    const netIncome = roundMoney(revenue.total - expenses.total);
    return {
      revenue,
      expenses,
      grossProfit: revenue.total,
      netIncome,
    };
  }

  /** Authoritative P&L activity used by both accounting and finance dashboards. */
  async profitLossActivity(q: ReportDateRangeDto, user?: JwtUser) {
    const lines = await this.prisma.acc_journal_entry_lines.findMany({
      where: {
        account: { account_type: { in: ["revenue", "expense"] } },
        entry: {
          status: { in: LEDGER_REPORT_STATUSES },
          ...this.branchEntryFilter(q.branchId, user),
          ...(q.dateFrom || q.dateTo
            ? {
                date: {
                  ...(q.dateFrom ? { gte: q.dateFrom } : {}),
                  ...(q.dateTo ? { lte: q.dateTo } : {}),
                },
              }
            : {}),
        },
      },
      select: {
        debit: true,
        credit: true,
        account: {
          select: { id: true, code: true, name: true, account_type: true },
        },
        entry: {
          select: { id: true, date: true, status: true, reverses_id: true },
        },
      },
    });

    const months = new Map<string, { revenue: number; expense: number }>();
    const revenueEntries = new Set<number>();
    const expenseEntries = new Set<number>();
    const revenueAccounts = new Map<
      number,
      { code: string; name: string; total: number; entryIds: Set<number> }
    >();
    const expenseAccounts = new Map<
      number,
      { code: string; name: string; total: number; entryIds: Set<number> }
    >();
    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const line of lines) {
      const month = line.entry.date.slice(0, 7);
      const bucket = months.get(month) ?? { revenue: 0, expense: 0 };
      if (line.account.account_type === "revenue") {
        const amount = roundMoney(
          roundMoney(line.credit) - roundMoney(line.debit),
        );
        totalRevenue = roundMoney(totalRevenue + amount);
        bucket.revenue = roundMoney(bucket.revenue + amount);
        // Totals include both a reversed original and its reversing entry so the pair nets to
        // zero. Document counts, however, must reflect active business documents only—not the
        // two technical journal rows created by a reversal.
        const isActiveBusinessEntry =
          line.entry.status === "posted" && line.entry.reverses_id == null;
        if (isActiveBusinessEntry) revenueEntries.add(line.entry.id);
        const account = revenueAccounts.get(line.account.id) ?? {
          code: line.account.code,
          name: line.account.name,
          total: 0,
          entryIds: new Set<number>(),
        };
        account.total = roundMoney(account.total + amount);
        if (isActiveBusinessEntry) account.entryIds.add(line.entry.id);
        revenueAccounts.set(line.account.id, account);
      } else {
        const amount = roundMoney(
          roundMoney(line.debit) - roundMoney(line.credit),
        );
        totalExpenses = roundMoney(totalExpenses + amount);
        bucket.expense = roundMoney(bucket.expense + amount);
        const isActiveBusinessEntry =
          line.entry.status === "posted" && line.entry.reverses_id == null;
        if (isActiveBusinessEntry) expenseEntries.add(line.entry.id);
        const account = expenseAccounts.get(line.account.id) ?? {
          code: line.account.code,
          name: line.account.name,
          total: 0,
          entryIds: new Set<number>(),
        };
        account.total = roundMoney(account.total + amount);
        if (isActiveBusinessEntry) account.entryIds.add(line.entry.id);
        expenseAccounts.set(line.account.id, account);
      }
      months.set(month, bucket);
    }

    const monthlyTrend = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month,
        revenue: values.revenue,
        expense: values.expense,
        revenues: values.revenue,
        expenses: values.expense,
        profit: roundMoney(values.revenue - values.expense),
      }));

    return {
      totalRevenue,
      totalExpenses,
      netProfit: roundMoney(totalRevenue - totalExpenses),
      revenueCount: revenueEntries.size,
      expenseCount: expenseEntries.size,
      monthlyTrend,
      revenueByAccount: [...revenueAccounts.entries()]
        .map(([accountId, account]) => ({
          accountId,
          code: account.code,
          name: account.name,
          total: account.total,
          count: account.entryIds.size,
        }))
        .sort((a, b) => b.total - a.total),
      expenseByAccount: [...expenseAccounts.entries()]
        .map(([accountId, account]) => ({
          accountId,
          code: account.code,
          name: account.name,
          total: account.total,
          count: account.entryIds.size,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async balanceSheet(q: BalanceSheetQueryDto, user?: JwtUser) {
    const assets = await this.typeTotals(
      ["asset"],
      { asOfDate: q.asOfDate, branchId: q.branchId },
      user,
    );
    const liabilities = await this.typeTotals(
      ["liability"],
      { asOfDate: q.asOfDate, branchId: q.branchId },
      user,
    );
    const equity = await this.typeTotals(
      ["equity"],
      { asOfDate: q.asOfDate, branchId: q.branchId },
      user,
    );

    // No period-closing entry is ever posted, so revenue/expense balances never roll into equity.
    // Compute cumulative net income to date (inception → asOfDate) and inject it as a synthetic
    // equity line, otherwise the balance sheet is always unbalanced for any dataset with P&L activity.
    // typeTotals with {asOfDate} sums everything up to (and including) asOfDate for the given types.
    const revenueToDate = await this.typeTotals(
      ["revenue"],
      { asOfDate: q.asOfDate, branchId: q.branchId },
      user,
    );
    const expenseToDate = await this.typeTotals(
      ["expense"],
      { asOfDate: q.asOfDate, branchId: q.branchId },
      user,
    );
    const netIncomeToDate = roundMoney(
      revenueToDate.total - expenseToDate.total,
    );

    const equityWithEarnings = {
      total: roundMoney(equity.total + netIncomeToDate),
      items: [
        ...equity.items,
        {
          code: "NET_INCOME",
          name: "صافي الأرباح الحالية / Current period earnings",
          amount: netIncomeToDate,
        },
      ],
    };

    const totalLiabilitiesEquity = roundMoney(
      liabilities.total + equityWithEarnings.total,
    );
    return {
      asOfDate: q.asOfDate,
      assets,
      liabilities,
      equity: equityWithEarnings,
      netIncomeToDate,
      totalAssets: assets.total,
      totalLiabilitiesEquity,
      isBalanced: isBalanced(assets.total, totalLiabilitiesEquity),
    };
  }

  async cashFlow(q: ReportDateRangeDto, user?: JwtUser) {
    const defaults = await this.prisma.acc_default_accounts.findMany({
      where: {
        key: { in: ["cash", "bank", "card", "online"] },
      },
    });
    const codes = [...new Set(defaults.map((d) => d.account_code))];
    const cashAccounts = await this.prisma.acc_accounts.findMany({
      where: { code: { in: codes }, is_active: true },
    });
    const cashIds = cashAccounts.map((a) => a.id);

    const classify = (
      codesToClassify: string[],
    ): "operating" | "investing" | "financing" => {
      if (
        codesToClassify.some(
          (code) => code.startsWith("2.02") || code.startsWith("3"),
        )
      ) {
        return "financing";
      }
      if (
        codesToClassify.some(
          (code) => code.startsWith("1.02") || code.startsWith("1.03"),
        )
      ) {
        return "investing";
      }
      return "operating";
    };

    const buckets = {
      operating: { inflow: 0, outflow: 0 },
      investing: { inflow: 0, outflow: 0 },
      financing: { inflow: 0, outflow: 0 },
    };

    const entries = await this.prisma.acc_journal_entries.findMany({
      where: {
        status: { in: LEDGER_REPORT_STATUSES },
        ...this.branchEntryFilter(q.branchId, user),
        ...(q.dateFrom || q.dateTo
          ? {
              date: {
                ...(q.dateFrom ? { gte: q.dateFrom } : {}),
                ...(q.dateTo ? { lte: q.dateTo } : {}),
              },
            }
          : {}),
        lines: { some: { account_id: { in: cashIds } } },
      },
      include: {
        lines: {
          include: { account: { select: { code: true } } },
        },
      },
    });

    const cashIdSet = new Set(cashIds);
    for (const entry of entries) {
      const cashNet = roundMoney(
        entry.lines
          .filter((line) => cashIdSet.has(line.account_id))
          .reduce(
            (sum, line) =>
              sum + roundMoney(line.debit) - roundMoney(line.credit),
            0,
          ),
      );
      // Transfers between cash/bank/card accounts do not change total cash.
      if (cashNet === 0) continue;
      const counterpartCodes = entry.lines
        .filter((line) => !cashIdSet.has(line.account_id))
        .map((line) => line.account.code);
      const section = classify(counterpartCodes);
      if (cashNet > 0) {
        buckets[section].inflow = roundMoney(buckets[section].inflow + cashNet);
      } else {
        buckets[section].outflow = roundMoney(
          buckets[section].outflow + Math.abs(cashNet),
        );
      }
    }

    const net = (b: { inflow: number; outflow: number }) =>
      roundMoney(b.inflow - b.outflow);

    return {
      operating: { ...buckets.operating, net: net(buckets.operating) },
      investing: { ...buckets.investing, net: net(buckets.investing) },
      financing: { ...buckets.financing, net: net(buckets.financing) },
      netChange: roundMoney(
        net(buckets.operating) +
          net(buckets.investing) +
          net(buckets.financing),
      ),
    };
  }

  async dashboard(q: ReportDateRangeDto, user?: JwtUser) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    const entryWhere: Prisma.acc_journal_entriesWhereInput =
      this.branchEntryFilter(q.branchId, user);

    const [
      totalEntries,
      dailyEntries,
      monthlyEntries,
      accountCount,
      recentEntries,
    ] = await Promise.all([
      this.prisma.acc_journal_entries.count({
        where: { ...entryWhere, status: { in: LEDGER_REPORT_STATUSES } },
      }),
      this.prisma.acc_journal_entries.count({
        where: {
          ...entryWhere,
          status: { in: LEDGER_REPORT_STATUSES },
          date: today,
        },
      }),
      this.prisma.acc_journal_entries.count({
        where: {
          ...entryWhere,
          status: { in: LEDGER_REPORT_STATUSES },
          date: { gte: monthStart },
        },
      }),
      this.prisma.acc_accounts.count({ where: { is_active: true } }),
      this.prisma.acc_journal_entries.findMany({
        where: entryWhere,
        orderBy: { created_at: "desc" },
        take: 8,
        include: {
          lines: {
            take: 1,
            include: { account: { select: { name: true } } },
          },
        },
      }),
    ]);

    const assets = await this.typeTotals(
      ["asset"],
      {
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        branchId: q.branchId,
      },
      user,
    );
    const liabilities = await this.typeTotals(
      ["liability"],
      {
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        branchId: q.branchId,
      },
      user,
    );
    const revenue = await this.typeTotals(
      ["revenue"],
      {
        dateFrom: q.dateFrom ?? monthStart,
        dateTo: q.dateTo ?? today,
        branchId: q.branchId,
      },
      user,
    );
    const expenses = await this.typeTotals(
      ["expense"],
      {
        dateFrom: q.dateFrom ?? monthStart,
        dateTo: q.dateTo ?? today,
        branchId: q.branchId,
      },
      user,
    );

    return {
      journalEntries: {
        total: totalEntries,
        daily: dailyEntries,
        monthly: monthlyEntries,
      },
      accountCount,
      totalAssets: assets.total,
      totalLiabilities: liabilities.total,
      revenue: revenue.total,
      expenses: expenses.total,
      netProfit: roundMoney(revenue.total - expenses.total),
      recentEntries: recentEntries.map((e) => ({
        id: e.id,
        entryNo: e.entry_no,
        date: e.date,
        status: e.status,
        description: e.description,
        totalDebit: roundMoney(e.total_debit),
        totalCredit: roundMoney(e.total_credit),
      })),
    };
  }
}
