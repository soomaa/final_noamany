import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, toNum } from '../club-subscriptions/club-subscription.utils';
import {
  buildInsights,
  DAY_NAMES,
  DISCOUNT_THRESHOLD_PCT,
  LONG_FREEZE_DAYS,
  LOW_ATTENDANCE_PCT,
} from './period-summary.insights';
import type {
  BranchRow,
  DurationRow,
  MemberSection,
  MonthPoint,
  PackageRow,
  PeakRow,
  PeriodSummary,
  PeriodTotals,
} from './period-summary.types';

type Num = Prisma.Decimal | number | bigint | string | null;
type Range = { start: string; end: string };

type RevenueRow = { branch_id: number; month: string; stream: string; amount: Num; cnt: Num };
type ExpenseRow = { branch_id: number | null; month: string; account_name: string; amount: Num };
type CountRow = { branch_id: number; month: string; cnt: Num };
type SubAggRow = { cnt: Num; gross: Num; discount: Num; remaining: Num };
type SubDetailRow = {
  id: number;
  member_id: number | null;
  registration_date: string;
  duration: Num;
  package_name: string | null;
  value: Num;
  discount: Num;
  paid: Num;
  remaining: Num;
  employee_id: number | null;
};
type RenewalRow = { package_name: string | null; renewed: Num };
type AttendanceRow = { member_id: number; window_start: string; window_end: string; days: Num };
type PeakSqlRow = { branch_id: number; attendance_date: string; h: Num; cnt: Num };
type FreezeRow = { member_key: Num; days: Num };

const n = (value: Num | undefined): number => (value == null ? 0 : typeof value === 'bigint' ? Number(value) : toNum(value as never));
const round = (value: number) => Math.round(value * 100) / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 731;

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function shiftYear(date: string, years: number) {
  const [y, m, d] = date.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

function monthsBetween(start: string, end: string) {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number);
  const last = end.slice(0, 7);
  for (let guard = 0; guard < 40; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Cairo UTC offset (hours) on a given date — DST-aware, no MySQL tz tables needed. */
const offsetCache = new Map<string, number>();
function cairoOffset(date: string) {
  const cached = offsetCache.get(date);
  if (cached != null) return cached;
  const noon = new Date(`${date}T12:00:00Z`);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false }).format(noon),
  );
  const offset = (hour - 12 + 24) % 24;
  offsetCache.set(date, offset);
  return offset;
}

export function durationBucket(days: number): { key: string; label: string; order: number } {
  if (days <= 1) return { key: 'day', label: 'يومي / حصة', order: 0 };
  if (days <= 20) return { key: 'short', label: 'أقل من شهر', order: 1 };
  if (days <= 45) return { key: 'm1', label: 'شهر', order: 2 };
  if (days <= 75) return { key: 'm2', label: 'شهرين', order: 3 };
  if (days <= 120) return { key: 'm3', label: '3 شهور', order: 4 };
  if (days <= 300) return { key: 'm6', label: '6 شهور', order: 5 };
  return { key: 'y1', label: 'سنة', order: 6 };
}

/** A comparison period counts only if it has a meaningful share of the current activity —
 *  otherwise (e.g. before the system went live) every ↑/↓ would read +100000٪. */
export function hasComparableData(current: PeriodTotals, other: PeriodTotals) {
  if (current.revenue <= 0) return other.revenue > 0;
  return other.revenue >= current.revenue * 0.25;
}

/** Shared reception logins are named after the section («رجالي» / «حريمي»). */
function staffLabel(name: string) {
  return name === 'رجالي' || name === 'حريمي' ? `حساب ريسيبشن ${name}` : name;
}

@Injectable()
export class PeriodSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  // ─── Filters ───────────────────────────────────────────────────────────────────────────────

  private period(from?: string, to?: string) {
    const today = localDateString();
    const end = to && ISO.test(to) ? to : today;
    const start = from && ISO.test(from) ? from : `${end.slice(0, 4)}-01-01`;
    if (start > end) throw new BadRequestException('تاريخ البداية بعد تاريخ النهاية');
    const days = dayDiff(start, end) + 1;
    if (days > MAX_DAYS) throw new BadRequestException('أقصى فترة للملخص سنتين');
    return {
      start,
      end,
      days,
      prev: { start: addDays(start, -days), end: addDays(start, -1) },
      yoy: { start: shiftYear(start, -1), end: shiftYear(end, -1) },
      today,
    };
  }

  private async resolveBranches(user: JwtUser | undefined, branchId?: string, groupId?: string) {
    const gid = Number(groupId);
    if (Number.isInteger(gid) && gid > 0) {
      const group = await this.prisma.club_branch_groups.findUnique({
        where: { id: gid },
        include: { members: { select: { branch_id: true } } },
      });
      if (!group) throw new BadRequestException('مجموعة الفروع غير موجودة');
      const allowed = this.branchScope.allowedBranchIds(user);
      const ids = group.members.map((m) => m.branch_id).filter((id) => allowed === null || allowed.includes(id));
      return { ids, groupId: gid, groupName: group.name };
    }
    return { ids: this.branchScope.resolveListFilter(user, branchId ?? null), groupId: null, groupName: null as string | null };
  }

  // ─── SQL fragments ─────────────────────────────────────────────────────────────────────────

  private branchSql(ids: number[] | null, column: string) {
    if (ids === null) return Prisma.empty;
    if (ids.length === 0) return Prisma.sql`AND 1 = 0`;
    return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})`;
  }

  private sectionSql(gender: MemberSection | null, expression: string) {
    return gender ? Prisma.sql`AND ${Prisma.raw(expression)} = ${gender}` : Prisma.empty;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────────────────────

  /** Every revenue stream by branch × month. Bar/products have no member section, so a
   *  رجالي/حريمي filter leaves them out (see `notes`). */
  private revenueRows({ start, end }: Range, ids: number[] | null, gender: MemberSection | null) {
    const sales = gender
      ? Prisma.empty
      : Prisma.sql`
        UNION ALL
        SELECT q.branch_id, LEFT(q.sale_date, 7) AS month,
               CASE WHEN i.item_type = 'cafe' THEN 'bar' ELSE 'products' END AS stream,
               SUM(i.line_total) AS amount, COUNT(DISTINCT q.id) AS cnt
        FROM sales_quick_sales q
        INNER JOIN sales_quick_sale_items i ON i.quick_sale_id = q.id
        WHERE q.status = 'completed' AND q.sale_date BETWEEN ${start} AND ${end}
          ${this.branchSql(ids, 'q.branch_id')}
        GROUP BY q.branch_id, month, stream`;
    return this.prisma.$queryRaw<RevenueRow[]>`
      SELECT s.branch_id, LEFT(s.registration_date, 7) AS month, 'subscriptions' AS stream,
             SUM(s.paid_amount) AS amount, COUNT(*) AS cnt
      FROM club_subscriptions s
      LEFT JOIN club_members m ON m.id = s.member_id
      WHERE (s.member_id IS NULL OR m.is_deleted = 0)
        AND s.registration_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 's.branch_id')}
        ${this.sectionSql(gender, 'COALESCE(s.gender, m.gender)')}
      GROUP BY s.branch_id, month
      UNION ALL
      SELECT l.main_branch_id AS branch_id, LEFT(l.subscription_start_date, 7) AS month, 'lockers' AS stream,
             SUM(l.paid_amount) AS amount, COUNT(*) AS cnt
      FROM club_locker_subscriptions l
      LEFT JOIN club_members m ON m.id = l.member_id
      WHERE l.subscription_start_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 'l.main_branch_id')}
        ${this.sectionSql(gender, 'COALESCE(l.gender, m.gender)')}
      GROUP BY l.main_branch_id, month
      UNION ALL
      SELECT v.branch_id, LEFT(v.invoice_date, 7) AS month, 'inbody' AS stream,
             SUM(v.total_amount) AS amount, COUNT(*) AS cnt
      FROM club_inbody_invoices v
      LEFT JOIN club_members m ON m.id = v.member_id
      WHERE v.is_active = 1 AND v.status = 'paid' AND v.invoice_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 'v.branch_id')}
        ${this.sectionSql(gender, 'm.gender')}
      GROUP BY v.branch_id, month
      UNION ALL
      SELECT v.branch_id, LEFT(v.invoice_date, 7) AS month, 'spa' AS stream,
             SUM(v.total_amount) AS amount, COUNT(*) AS cnt
      FROM club_spa_invoices v
      LEFT JOIN club_members m ON m.id = v.member_id
      WHERE v.is_active = 1 AND v.status = 'paid' AND v.invoice_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 'v.branch_id')}
        ${this.sectionSql(gender, 'm.gender')}
      GROUP BY v.branch_id, month
      ${sales}
    `;
  }

  /** Posted general-ledger expenses (same source as the executive dashboard). */
  private expenseRows({ start, end }: Range, ids: number[] | null) {
    return this.prisma.$queryRaw<ExpenseRow[]>`
      SELECT e.branch_id, LEFT(e.date, 7) AS month, a.name AS account_name, SUM(l.debit - l.credit) AS amount
      FROM acc_journal_entries e
      INNER JOIN acc_journal_entry_lines l ON l.entry_id = e.id
      INNER JOIN acc_accounts a ON a.id = l.account_id
      WHERE e.status IN ('posted', 'reversed')
        AND e.date BETWEEN ${start} AND ${end}
        AND a.account_type = 'expense'
        ${this.branchSql(ids, 'e.branch_id')}
      GROUP BY e.branch_id, month, a.id, a.name
    `;
  }

  /** New member = a member whose FIRST-ever subscription was registered in the range (counted
   *  at that subscription's branch). Member `created_at` is not used: the legacy import stamped
   *  tens of thousands of old members with the import date. */
  private async newMemberRows({ start, end }: Range, ids: number[] | null, gender: MemberSection | null) {
    const rows = await this.prisma.$queryRaw<CountRow[]>`
      SELECT f.branch_id, LEFT(f.first_date, 7) AS month, COUNT(*) AS cnt
      FROM (
        SELECT s.member_id, MIN(s.registration_date) AS first_date,
               CAST(SUBSTRING_INDEX(GROUP_CONCAT(s.branch_id ORDER BY s.registration_date, s.id), ',', 1) AS UNSIGNED) AS branch_id
        FROM club_subscriptions s
        WHERE s.member_id IS NOT NULL
        GROUP BY s.member_id
        HAVING first_date BETWEEN ${start} AND ${end}
      ) f
      INNER JOIN club_members m ON m.id = f.member_id AND m.is_deleted = 0
      WHERE 1 = 1
        ${this.branchSql(ids, 'f.branch_id')}
        ${this.sectionSql(gender, 'm.gender')}
      GROUP BY f.branch_id, month
    `;
    return rows.map((row) => ({ ...row, branch_id: Number(row.branch_id) }));
  }

  private async subscriptionAggregate({ start, end }: Range, ids: number[] | null, gender: MemberSection | null) {
    const rows = await this.prisma.$queryRaw<SubAggRow[]>`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(s.subscription_value), 0) AS gross,
             COALESCE(SUM(s.discount_value), 0) AS discount,
             COALESCE(SUM(CASE WHEN s.remaining_amount > 0 THEN s.remaining_amount ELSE 0 END), 0) AS remaining
      FROM club_subscriptions s
      LEFT JOIN club_members m ON m.id = s.member_id
      WHERE (s.member_id IS NULL OR m.is_deleted = 0)
        AND s.registration_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 's.branch_id')}
        ${this.sectionSql(gender, 'COALESCE(s.gender, m.gender)')}
    `;
    const row = rows[0];
    return { count: n(row?.cnt), gross: n(row?.gross), discount: n(row?.discount), remaining: n(row?.remaining) };
  }

  private subscriptionDetails({ start, end }: Range, ids: number[] | null, gender: MemberSection | null) {
    return this.prisma.$queryRaw<SubDetailRow[]>`
      SELECT s.id, s.member_id, s.registration_date,
             DATEDIFF(s.subscription_end_date, s.subscription_start_date) AS duration,
             COALESCE(t.name, s.subscription_type) AS package_name,
             s.subscription_value AS value, s.discount_value AS discount, s.paid_amount AS paid,
             s.remaining_amount AS remaining, s.employee_id
      FROM club_subscriptions s
      LEFT JOIN club_members m ON m.id = s.member_id
      LEFT JOIN club_subscription_types t ON t.id = s.subscription_type_id
      WHERE (s.member_id IS NULL OR m.is_deleted = 0)
        AND s.registration_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 's.branch_id')}
        ${this.sectionSql(gender, 'COALESCE(s.gender, m.gender)')}
    `;
  }

  /** Time-based subscriptions (≥ 25 days) that ended in the period: did the member come back
   *  with a later subscription registered no later than 30 days after the end? */
  private renewalRows({ start, end }: Range, today: string, ids: number[] | null, gender: MemberSection | null) {
    const last = end < today ? end : today;
    return this.prisma.$queryRaw<RenewalRow[]>`
      SELECT COALESCE(t.name, s.subscription_type) AS package_name,
             EXISTS (
               SELECT 1 FROM club_subscriptions x
               WHERE x.member_id = s.member_id AND x.id <> s.id
                 AND x.subscription_start_date > s.subscription_start_date
                 AND x.registration_date <= DATE_FORMAT(DATE_ADD(s.subscription_end_date, INTERVAL 30 DAY), '%Y-%m-%d')
             ) AS renewed
      FROM club_subscriptions s
      INNER JOIN club_members m ON m.id = s.member_id AND m.is_deleted = 0
      LEFT JOIN club_subscription_types t ON t.id = s.subscription_type_id
      WHERE s.subscription_end_date BETWEEN ${start} AND ${last}
        AND DATEDIFF(s.subscription_end_date, s.subscription_start_date) >= 25
        AND s.is_linked_to_sessions = 0
        ${this.branchSql(ids, 's.branch_id')}
        ${this.sectionSql(gender, 'COALESCE(s.gender, m.gender)')}
    `;
  }

  /** Attendance days inside each time-based subscription's overlap with the period. */
  private attendanceRows({ start, end }: Range, today: string, ids: number[] | null, gender: MemberSection | null) {
    const last = end < today ? end : today;
    return this.prisma.$queryRaw<AttendanceRow[]>`
      SELECT w.member_id, w.window_start, w.window_end,
             (SELECT COUNT(DISTINCT a.attendance_date) FROM club_attendance a
               WHERE a.member_id = w.member_id AND a.attendance_date BETWEEN w.window_start AND w.window_end) AS days
      FROM (
        SELECT s.member_id,
               GREATEST(s.subscription_start_date, ${start}) AS window_start,
               LEAST(s.subscription_end_date, ${last}) AS window_end
        FROM club_subscriptions s
        INNER JOIN club_members m ON m.id = s.member_id AND m.is_deleted = 0
        WHERE s.subscription_start_date <= ${last}
          AND s.subscription_end_date >= ${start}
          AND DATEDIFF(s.subscription_end_date, s.subscription_start_date) >= 25
          AND s.is_linked_to_sessions = 0
          ${this.branchSql(ids, 's.branch_id')}
          ${this.sectionSql(gender, 'COALESCE(s.gender, m.gender)')}
      ) w
      WHERE DATEDIFF(w.window_end, w.window_start) >= 13
    `;
  }

  private peakRows({ start, end }: Range, ids: number[] | null, gender: MemberSection | null) {
    const join = gender ? Prisma.sql`INNER JOIN club_members m ON m.id = a.member_id` : Prisma.empty;
    return this.prisma.$queryRaw<PeakSqlRow[]>`
      SELECT a.branch_id, a.attendance_date, HOUR(a.check_in_time) AS h, COUNT(*) AS cnt
      FROM club_attendance a
      ${join}
      WHERE a.attendance_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 'a.branch_id')}
        ${this.sectionSql(gender, 'm.gender')}
      GROUP BY a.branch_id, a.attendance_date, h
    `;
  }

  private freezeRows({ start, end }: Range, ids: number[] | null, gender: MemberSection | null) {
    return this.prisma.$queryRaw<FreezeRow[]>`
      SELECT COALESCE(s.member_id, -s.id) AS member_key, COALESCE(f.actual_days, f.planned_days) AS days
      FROM club_subscription_freezes f
      INNER JOIN club_subscriptions s ON s.id = f.subscription_id
      LEFT JOIN club_members m ON m.id = s.member_id
      WHERE f.freeze_start_date BETWEEN ${start} AND ${end}
        ${this.branchSql(ids, 'COALESCE(f.branch_id, s.branch_id)')}
        ${this.sectionSql(gender, 'COALESCE(s.gender, m.gender)')}
    `;
  }

  // ─── Assembly ──────────────────────────────────────────────────────────────────────────────

  private totals(
    revenue: RevenueRow[],
    expenses: ExpenseRow[],
    newMembers: CountRow[],
    subs: { count: number; remaining: number },
  ): PeriodTotals {
    const stream = (key: string) => revenue.filter((r) => r.stream === key).reduce((s, r) => s + n(r.amount), 0);
    const subscriptionRevenue = stream('subscriptions');
    const barRevenue = stream('bar');
    const productRevenue = stream('products');
    const inbodyRevenue = stream('inbody');
    const spaRevenue = stream('spa');
    const lockerRevenue = stream('lockers');
    const total = subscriptionRevenue + barRevenue + productRevenue + inbodyRevenue + spaRevenue + lockerRevenue;
    const exp = expenses.reduce((s, r) => s + n(r.amount), 0);
    const profit = total - exp;
    return {
      revenue: round(total),
      subscriptionRevenue: round(subscriptionRevenue),
      barRevenue: round(barRevenue),
      productRevenue: round(productRevenue),
      inbodyRevenue: round(inbodyRevenue),
      spaRevenue: round(spaRevenue),
      lockerRevenue: round(lockerRevenue),
      expenses: round(exp),
      netProfit: round(profit),
      margin: total > 0 ? Math.round((profit / total) * 1000) / 10 : null,
      subscriptions: subs.count,
      newMembers: newMembers.reduce((s, r) => s + n(r.cnt), 0),
      outstanding: round(subs.remaining),
    };
  }

  async summary(
    query: { from?: string; to?: string; branchId?: string; groupId?: string; gender?: string },
    user?: JwtUser,
  ): Promise<PeriodSummary> {
    const p = this.period(query.from, query.to);
    const { ids, groupId, groupName } = await this.resolveBranches(user, query.branchId, query.groupId);
    const gender = this.branchScope.resolveMemberGenderRequest(user, query.gender);
    const cur: Range = { start: p.start, end: p.end };

    const [
      branchesTable,
      revCur, revPrev, revYoy,
      expCur, expPrev, expYoy,
      nmCur, nmPrev, nmYoy,
      aggCur, aggPrev, aggYoy,
      details, renewals, attendance, peaks, freezes, prevFreezes,
    ] = await Promise.all([
      this.prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true }, orderBy: { branch_id: 'asc' } }),
      this.revenueRows(cur, ids, gender),
      this.revenueRows(p.prev, ids, gender),
      this.revenueRows(p.yoy, ids, gender),
      this.expenseRows(cur, ids),
      this.expenseRows(p.prev, ids),
      this.expenseRows(p.yoy, ids),
      this.newMemberRows(cur, ids, gender),
      this.newMemberRows(p.prev, ids, gender),
      this.newMemberRows(p.yoy, ids, gender),
      this.subscriptionAggregate(cur, ids, gender),
      this.subscriptionAggregate(p.prev, ids, gender),
      this.subscriptionAggregate(p.yoy, ids, gender),
      this.subscriptionDetails(cur, ids, gender),
      this.renewalRows(cur, p.today, ids, gender),
      this.attendanceRows(cur, p.today, ids, gender),
      this.peakRows(cur, ids, gender),
      this.freezeRows(cur, ids, gender),
      this.freezeRows(p.prev, ids, gender),
    ]);

    const branchName = new Map(branchesTable.map((b) => [b.branch_id, b.branch_name?.trim() || `فرع #${b.branch_id}`]));
    const current = this.totals(revCur, expCur, nmCur, aggCur);
    const previous = this.totals(revPrev, expPrev, nmPrev, aggPrev);
    const yoyTotals = this.totals(revYoy, expYoy, nmYoy, aggYoy);

    // Monthly trend
    const monthMap = new Map<string, MonthPoint>(
      monthsBetween(p.start, p.end).map((month) => [month, { month, revenue: 0, expenses: 0, profit: 0, subscriptions: 0 }]),
    );
    for (const r of revCur) {
      const point = monthMap.get(r.month);
      if (!point) continue;
      point.revenue += n(r.amount);
      if (r.stream === 'subscriptions') point.subscriptions += n(r.cnt);
    }
    for (const r of expCur) {
      const point = monthMap.get(r.month);
      if (point) point.expenses += n(r.amount);
    }
    const monthly = [...monthMap.values()].map((m) => ({
      ...m,
      revenue: round(m.revenue),
      expenses: round(m.expenses),
      profit: round(m.revenue - m.expenses),
    }));

    // Year over year by month
    const yoyByMonth = new Map<string, number>();
    for (const r of revYoy) yoyByMonth.set(r.month, (yoyByMonth.get(r.month) ?? 0) + n(r.amount));
    const yoyMonthly = monthly.map((m) => ({
      month: m.month,
      current: m.revenue,
      previous: round(yoyByMonth.get(shiftYear(`${m.month}-01`, -1).slice(0, 7)) ?? 0),
    }));

    // Breakdowns
    const revenueBreakdown = [
      { key: 'subscriptions', name: 'الاشتراكات', value: current.subscriptionRevenue },
      { key: 'bar', name: 'البار والكافيه', value: current.barRevenue },
      { key: 'products', name: 'البروتين والمنتجات', value: current.productRevenue },
      { key: 'inbody', name: 'InBody', value: current.inbodyRevenue },
      { key: 'spa', name: 'SPA', value: current.spaRevenue },
      { key: 'lockers', name: 'اللوكرات', value: current.lockerRevenue },
    ].filter((item) => item.value > 0.009);
    const expenseByAccount = new Map<string, number>();
    for (const r of expCur) {
      const name = r.account_name?.trim() || 'غير مصنف';
      expenseByAccount.set(name, (expenseByAccount.get(name) ?? 0) + n(r.amount));
    }
    const expenseBreakdown = [...expenseByAccount.entries()]
      .map(([name, value]) => ({ name, value: round(value) }))
      .filter((item) => Math.abs(item.value) >= 0.01)
      .sort((a, b) => b.value - a.value);

    // Branch comparison
    const branchIds = new Set<number>();
    for (const rows of [revCur, revPrev, expCur, expPrev] as Array<Array<{ branch_id: number | null }>>) {
      for (const r of rows) if (r.branch_id != null) branchIds.add(r.branch_id);
    }
    if (ids) ids.forEach((id) => branchIds.add(id));
    const sumBy = <T extends { branch_id: number | null }>(rows: T[], id: number, value: (row: T) => number) =>
      rows.filter((r) => r.branch_id === id).reduce((s, r) => s + value(r), 0);
    const branches: BranchRow[] = [...branchIds]
      .filter((id) => branchName.has(id))
      .map((id) => {
        const revenue = sumBy(revCur, id, (r) => n(r.amount));
        const expenses = sumBy(expCur, id, (r) => n(r.amount));
        return {
          branchId: id,
          branchName: branchName.get(id)!,
          revenue: round(revenue),
          expenses: round(expenses),
          profit: round(revenue - expenses),
          prevRevenue: round(sumBy(revPrev, id, (r) => n(r.amount))),
          prevExpenses: round(sumBy(expPrev, id, (r) => n(r.amount))),
          subscriptions: sumBy(revCur.filter((r) => r.stream === 'subscriptions'), id, (r) => n(r.cnt)),
          newMembers: sumBy(nmCur, id, (r) => n(r.cnt)),
        };
      })
      .filter((b) => b.revenue !== 0 || b.expenses !== 0 || b.subscriptions > 0 || ids !== null)
      .sort((a, b) => b.profit - a.profit);
    const unassignedExpenses = sumBy(expCur, null as unknown as number, (r) => n(r.amount));

    // Durations, packages, discounts, outstanding
    const durationMap = new Map<string, DurationRow & { order: number }>();
    const packageMap = new Map<string, { name: string; count: number; paid: number; gross: number; discount: number }>();
    const employeeMap = new Map<number | null, { count: number; amount: number; gross: number }>();
    let discountedCount = 0;
    let aboveCount = 0;
    let aboveAmount = 0;
    let outAmount = 0;
    let outOldAmount = 0;
    let outOldCount = 0;
    let outCount = 0;
    const outMembers = new Set<number>();
    const oldCutoff = addDays(p.today, -30);
    for (const s of details) {
      const value = n(s.value);
      const discount = n(s.discount);
      const paid = n(s.paid);
      const bucket = durationBucket(n(s.duration));
      const row = durationMap.get(bucket.key) ?? { key: bucket.key, label: bucket.label, order: bucket.order, count: 0, gross: 0, discount: 0, paid: 0 };
      row.count += 1;
      row.gross += value;
      row.discount += discount;
      row.paid += paid;
      durationMap.set(bucket.key, row);

      const pkgName = s.package_name?.trim() || 'اشتراك غير مصنف';
      const pkg = packageMap.get(pkgName) ?? { name: pkgName, count: 0, paid: 0, gross: 0, discount: 0 };
      pkg.count += 1;
      pkg.paid += paid;
      pkg.gross += value;
      pkg.discount += discount;
      packageMap.set(pkgName, pkg);

      if (discount > 0) {
        discountedCount += 1;
        const emp = employeeMap.get(s.employee_id) ?? { count: 0, amount: 0, gross: 0 };
        emp.count += 1;
        emp.amount += discount;
        emp.gross += value;
        employeeMap.set(s.employee_id, emp);
        if (value > 0 && (discount / value) * 100 >= DISCOUNT_THRESHOLD_PCT - 0.001) {
          aboveCount += 1;
          aboveAmount += discount;
        }
      }
      const remaining = n(s.remaining);
      if (remaining > 0) {
        outAmount += remaining;
        outCount += 1;
        outMembers.add(s.member_id ?? -s.id);
        if (s.registration_date < oldCutoff) {
          outOldAmount += remaining;
          outOldCount += 1;
        }
      }
    }
    const durations = [...durationMap.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...row }) => ({ ...row, gross: round(row.gross), discount: round(row.discount), paid: round(row.paid) }));

    const employeeIds = [...employeeMap.keys()].filter((id): id is number => id != null);
    const employees = employeeIds.length
      ? await this.prisma.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employee: true } })
      : [];
    const employeeName = new Map(employees.map((e) => [e.id, e.employee?.trim() || `موظف #${e.id}`]));
    const topEmployees = [...employeeMap.entries()]
      .map(([id, e]) => ({
        employeeId: id,
        name: id == null ? 'بدون موظف مسجل' : staffLabel(employeeName.get(id) ?? `موظف #${id}`),
        count: e.count,
        amount: round(e.amount),
        avgPct: e.gross > 0 ? Math.round((e.amount / e.gross) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Renewal per package
    const renewalByPackage = new Map<string, { ended: number; renewed: number }>();
    let renewedTotal = 0;
    for (const r of renewals) {
      const name = r.package_name?.trim() || 'اشتراك غير مصنف';
      const item = renewalByPackage.get(name) ?? { ended: 0, renewed: 0 };
      item.ended += 1;
      if (n(r.renewed) > 0) {
        item.renewed += 1;
        renewedTotal += 1;
      }
      renewalByPackage.set(name, item);
    }
    const rate = (renewed: number, ended: number) => (ended > 0 ? Math.round((renewed / ended) * 1000) / 10 : null);
    const worstPackage =
      [...renewalByPackage.entries()]
        .filter(([, v]) => v.ended >= 15)
        .map(([name, v]) => ({ name, ended: v.ended, renewed: v.renewed, rate: rate(v.renewed, v.ended)! }))
        .sort((a, b) => a.rate - b.rate)[0] ?? null;

    const packages: PackageRow[] = [...packageMap.values()]
      .map((pkg) => {
        const ren = renewalByPackage.get(pkg.name);
        return {
          name: pkg.name,
          count: pkg.count,
          paid: round(pkg.paid),
          discountPct: pkg.gross > 0 ? Math.round((pkg.discount / pkg.gross) * 1000) / 10 : 0,
          ended: ren?.ended ?? 0,
          renewed: ren?.renewed ?? 0,
          renewalRate: ren && ren.ended >= 5 ? rate(ren.renewed, ren.ended) : null,
        };
      })
      .sort((a, b) => b.paid - a.paid);

    // Attendance (per member: attended days / subscription days inside the period)
    const perMember = new Map<number, { attended: number; days: number }>();
    for (const row of attendance) {
      const windowDays = dayDiff(String(row.window_start), String(row.window_end)) + 1;
      const item = perMember.get(row.member_id) ?? { attended: 0, days: 0 };
      item.attended += n(row.days);
      item.days += windowDays;
      perMember.set(row.member_id, item);
    }
    const rates = [...perMember.values()].filter((m) => m.days > 0).map((m) => Math.min(1, m.attended / m.days) * 100);
    const lowCount = rates.filter((r) => r < LOW_ATTENDANCE_PCT).length;

    // Peaks per branch (Cairo local hour)
    const peakByBranch = new Map<number, { total: number; days: number[]; hours: number[] }>();
    for (const row of peaks) {
      const item = peakByBranch.get(row.branch_id) ?? { total: 0, days: Array(7).fill(0), hours: Array(24).fill(0) };
      const count = n(row.cnt);
      const date = String(row.attendance_date);
      const hour = (n(row.h) + cairoOffset(date)) % 24;
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      item.total += count;
      item.days[weekday] += count;
      item.hours[hour] += count;
      peakByBranch.set(row.branch_id, item);
    }
    const argMax = (values: number[]) => values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
    const peakRows: PeakRow[] = [...peakByBranch.entries()]
      .filter(([id]) => branchName.has(id))
      .map(([id, item]) => {
        const topDay = argMax(item.days);
        const topHour = argMax(item.hours);
        // Quietest hour among the hours the gym is actually open (≥ 1% of check-ins).
        const openHours = item.hours
          .map((v, h) => ({ v, h }))
          .filter((x) => x.v >= item.total * 0.01);
        const quiet = openHours.length ? openHours.reduce((a, b) => (b.v < a.v ? b : a)).h : null;
        return {
          branchId: id,
          branchName: branchName.get(id)!,
          checkins: item.total,
          topDay: item.total ? DAY_NAMES[topDay] : null,
          topDayShare: item.total ? Math.round((item.days[topDay] / item.total) * 1000) / 10 : null,
          topHour: item.total ? topHour : null,
          topHourShare: item.total ? Math.round((item.hours[topHour] / item.total) * 1000) / 10 : null,
          quietHour: quiet,
        };
      })
      .sort((a, b) => b.checkins - a.checkins);

    // Freezes
    const freezeDays = freezes.map((f) => n(f.days));
    const freezeMembers = new Map<number, number>();
    for (const f of freezes) freezeMembers.set(n(f.member_key), (freezeMembers.get(n(f.member_key)) ?? 0) + 1);
    const longFreezes = freezeDays.filter((d) => d > LONG_FREEZE_DAYS);

    // Filters / labels
    const selectedNames = ids === null ? [] : ids.map((id) => branchName.get(id) ?? `#${id}`);
    const branchLabel =
      ids === null ? 'كل الفروع' : groupName ? `مجموعة ${groupName} (${selectedNames.join('، ')})` : selectedNames.join('، ');

    const notes: string[] = [];
    if (gender) {
      notes.push('المصروفات من الحسابات للفرع كله (غير مقسمة رجالي/حريمي)، وإيرادات البار والمنتجات غير محسوبة لأن البيع السريع لا يُسجَّل بقسم.');
    }
    if (unassignedExpenses !== 0 && ids === null) {
      notes.push(`مصروفات غير مربوطة بفرع: ${Math.round(unassignedExpenses).toLocaleString('ar-EG')} جنيه (داخلة في الإجمالي وليست في مقارنة الفروع).`);
    }

    const base: Omit<PeriodSummary, 'insights' | 'skipped'> = {
      filters: {
        start: p.start,
        end: p.end,
        days: p.days,
        prevStart: p.prev.start,
        prevEnd: p.prev.end,
        yoyStart: p.yoy.start,
        yoyEnd: p.yoy.end,
        branchIds: ids,
        branchNames: selectedNames,
        branchLabel,
        groupId,
        gender,
        genderLabel: gender === 'male' ? 'رجالي' : gender === 'female' ? 'حريمي' : 'الكل (رجالي وحريمي)',
        generatedAt: new Date().toISOString(),
        today: p.today,
      },
      current,
      previous,
      previousAvailable: hasComparableData(current, previous),
      yoy: { available: hasComparableData(current, yoyTotals), totals: yoyTotals, monthly: yoyMonthly },
      monthly,
      revenueBreakdown,
      expenseBreakdown,
      branches,
      durations,
      packages,
      discounts: {
        totalCount: details.length,
        discountedCount,
        share: details.length ? Math.round((discountedCount / details.length) * 1000) / 10 : null,
        grossTotal: round(aggCur.gross),
        discountTotal: round(aggCur.discount),
        discountShareOfGross: aggCur.gross > 0 ? Math.round((aggCur.discount / aggCur.gross) * 1000) / 10 : null,
        prevDiscountShareOfGross: aggPrev.gross > 0 ? Math.round((aggPrev.discount / aggPrev.gross) * 1000) / 10 : null,
        topEmployees,
        threshold: DISCOUNT_THRESHOLD_PCT,
        aboveThresholdCount: aboveCount,
        aboveThresholdAmount: round(aboveAmount),
      },
      outstanding: {
        amount: round(outAmount),
        members: outMembers.size,
        subscriptions: outCount,
        olderThan30Amount: round(outOldAmount),
        olderThan30Count: outOldCount,
      },
      renewal: {
        ended: renewals.length,
        renewed: renewedTotal,
        rate: rate(renewedTotal, renewals.length),
        worstPackage,
      },
      attendance: {
        evaluated: rates.length,
        low: lowCount,
        share: rates.length ? Math.round((lowCount / rates.length) * 1000) / 10 : null,
        threshold: LOW_ATTENDANCE_PCT,
        avgRate: rates.length ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 10) / 10 : null,
      },
      peaks: peakRows,
      freezes: {
        count: freezes.length,
        prevCount: prevFreezes.length,
        totalDays: freezeDays.reduce((s, d) => s + d, 0),
        avgDays: freezeDays.length ? Math.round(freezeDays.reduce((s, d) => s + d, 0) / freezeDays.length) : null,
        members: freezeMembers.size,
        longFreezes: longFreezes.length,
        longFreezeDays: longFreezes.reduce((s, d) => s + d, 0),
        repeatMembers: [...freezeMembers.values()].filter((count) => count > 1).length,
      },
      notes,
    };

    return { ...base, ...buildInsights(base) };
  }
}
