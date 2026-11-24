import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { trainerBranchMap } from '../club-fitness/trainer-branches.util';
import { effectiveSalesSettings, readSalesDefaults } from '../club-sales/sales-defaults';
import { effectiveTarget } from '../club-sales/target-period';
import { addDays, toNum } from '../club-subscriptions/club-subscription.utils';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

/**
 * Read-only «manager» widgets for the executive dashboard: today at a glance, follow-up alerts,
 * revenue mix, discounts, and sales/captain performance against target. Everything here follows
 * the dashboard's branch scope; nothing writes.
 */

const logger = new Logger('ClubDashboardManager');

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Change from `previous` to `current` in percent (1 decimal), or null when there is no base. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export type DiscountInputRow = {
  subscription_value: Prisma.Decimal | number | string | null;
  discount_enabled?: boolean | null;
  discount_value?: Prisma.Decimal | number | string | null;
};

/** Discount given on the period's subscriptions as a share of their gross (pre-discount) value. */
export function summarizeDiscounts(rows: DiscountInputRow[]) {
  let grossValue = 0;
  let discountValue = 0;
  let discountedCount = 0;
  for (const row of rows) {
    const gross = Math.max(0, toNum(row.subscription_value as never));
    const discount = row.discount_enabled === false ? 0 : Math.max(0, toNum((row.discount_value ?? 0) as never));
    grossValue += gross;
    discountValue += Math.min(discount, gross);
    if (discount > 0) discountedCount += 1;
  }
  return {
    subscriptionsCount: rows.length,
    discountedCount,
    grossValue: round2(grossValue),
    discountValue: round2(discountValue),
    netValue: round2(grossValue - discountValue),
    discountPct: grossValue > 0 ? Math.round((discountValue / grossValue) * 1000) / 10 : 0,
  };
}

export function revenueMix(subscriptions: number, bar: number, products: number) {
  const parts = { subscriptions: round2(subscriptions), bar: round2(bar), products: round2(products) };
  return { ...parts, total: round2(parts.subscriptions + parts.bar + parts.products) };
}

export type PerformanceRow = {
  id: number;
  name: string;
  achieved: number;
  target: number;
  count: number;
  /** `money` when achieved/target are EGP, `count` when they are subscriptions. */
  unit: 'money' | 'count';
  /** Branch(es) the person works in — a secondary label next to the name. */
  branchName?: string | null;
  /** The person's record is named like a branch (e.g. «فرع …»): a data issue worth flagging. */
  nameIsBranch?: boolean;
  achievementPct: number | null;
  hitTarget: boolean;
};

/** True when a staff record's name is really a branch name (a shared «branch» account). */
export function looksLikeBranchName(name: string, branchNames: string[]) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return false;
  if (/^فرع(\s|$)/.test(clean)) return true;
  return branchNames.some((branch) => {
    const b = branch.trim().replace(/\s+/g, ' ');
    return Boolean(b) && (clean === b || b.startsWith(`${clean} `) || clean.startsWith(`${b} `));
  });
}

/** Ranks people by achievement % (then by achieved value); those without a target rank after. */
export function rankPerformance(rows: Array<Omit<PerformanceRow, 'achievementPct' | 'hitTarget'>>) {
  const ranked: PerformanceRow[] = rows
    .filter((row) => row.target > 0 || row.achieved > 0 || row.count > 0)
    .map((row) => {
      const achievementPct = row.target > 0 ? Math.round((Math.max(0, row.achieved) / row.target) * 1000) / 10 : null;
      return { ...row, achieved: round2(row.achieved), target: round2(row.target), achievementPct, hitTarget: row.target > 0 && row.achieved >= row.target };
    });
  ranked.sort((a, b) =>
    (b.achievementPct ?? -1) - (a.achievementPct ?? -1)
    || b.achieved - a.achieved
    || a.name.localeCompare(b.name, 'ar'));
  return {
    rows: ranked,
    withTarget: ranked.filter((row) => row.target > 0).length,
    hitCount: ranked.filter((row) => row.hitTarget).length,
  };
}

/** Members whose birthday (stored as YYYY-MM-DD) falls on `today`'s month and day. */
export function birthdayKey(today: string) {
  return today.slice(5, 10);
}

type CountRow = { total: bigint | number | null };
type DaySubsRow = { registration_date: string; paid: Prisma.Decimal | number | null; total: bigint | number; renewals: bigint | number | null };
type DaySalesRow = { sale_date: string; amount: Prisma.Decimal | number | null };

export type ManagerContext = {
  prisma: PrismaService;
  permissions?: PermissionEngineService;
  user?: JwtUser;
  scopedBranches: number[] | null;
  today: string;
  /** Current time, injectable for tests. */
  now?: Date;
};

const INSIDE_WINDOW_HOURS = 3;
const ABSENT_DAYS = 7;

async function allowed(ctx: ManagerContext, keys: string[]) {
  if (!ctx.user || !ctx.permissions?.canAny) return true;
  try {
    return await ctx.permissions.canAny(ctx.user.sub, keys);
  } catch {
    return false;
  }
}

function inSql(column: string, ids: number[] | null) {
  return ids?.length ? Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})` : Prisma.empty;
}

async function todayAtGlance(ctx: ManagerContext) {
  const { prisma, scopedBranches, today } = ctx;
  const yesterday = addDays(today, -1);
  const subBranch = inSql('s.branch_id', scopedBranches);
  const now = ctx.now ?? new Date();
  const since = new Date(now.getTime() - INSIDE_WINDOW_HOURS * 3_600_000);
  const branchWhere = scopedBranches ? { branch_id: { in: scopedBranches } } : {};

  const [subs, sales, checkins, inside] = await Promise.all([
    prisma.$queryRaw<DaySubsRow[]>`
      SELECT
        s.registration_date,
        COALESCE(SUM(s.paid_amount), 0) AS paid,
        COUNT(*) AS total,
        SUM(CASE WHEN s.renewed_from_subscription_id IS NOT NULL OR (s.member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM club_subscriptions p
          WHERE p.member_id = s.member_id AND p.id <> s.id AND p.registration_date < s.registration_date
        )) THEN 1 ELSE 0 END) AS renewals
      FROM club_subscriptions s
      LEFT JOIN club_members m ON m.id = s.member_id
      WHERE s.registration_date IN (${yesterday}, ${today})
        AND (s.member_id IS NULL OR m.is_deleted = 0)
        ${subBranch}
      GROUP BY s.registration_date
    `,
    prisma.$queryRaw<DaySalesRow[]>`
      SELECT s.sale_date, COALESCE(SUM(i.line_total), 0) AS amount
      FROM sales_quick_sales s
      INNER JOIN sales_quick_sale_items i ON i.quick_sale_id = s.id
      WHERE s.status = 'completed'
        AND s.sale_date IN (${yesterday}, ${today})
        ${subBranch}
      GROUP BY s.sale_date
    `,
    prisma.club_attendance.count({ where: { attendance_date: today, ...branchWhere } }),
    prisma.club_attendance.findMany({
      where: { attendance_date: today, check_in_time: { gte: since }, check_out_time: null, ...branchWhere },
      select: { member_id: true },
      distinct: ['member_id'],
    }),
  ]);

  const day = (date: string) => {
    const sub = subs.find((row) => row.registration_date === date);
    const sale = sales.find((row) => row.sale_date === date);
    return {
      revenue: round2(toNum((sub?.paid ?? 0) as never) + toNum((sale?.amount ?? 0) as never)),
      total: Number(sub?.total ?? 0),
      renewals: Number(sub?.renewals ?? 0),
    };
  };
  const current = day(today);
  const previous = day(yesterday);
  return {
    date: today,
    revenue: current.revenue,
    yesterdayRevenue: previous.revenue,
    revenueChangePct: percentChange(current.revenue, previous.revenue),
    newSubscriptions: Math.max(0, current.total - current.renewals),
    renewals: current.renewals,
    subscriptionsTotal: current.total,
    checkins,
    insideNow: inside.length,
    insideWindowHours: INSIDE_WINDOW_HOURS,
  };
}

async function followUpAlerts(ctx: ManagerContext) {
  const { prisma, scopedBranches, today } = ctx;
  const in3 = addDays(today, 3);
  const absentCutoff = addDays(today, -ABSENT_DAYS);
  const subBranch = inSql('s.branch_id', scopedBranches);
  const memberBranch = inSql('m.branch_id', scopedBranches);
  const md = birthdayKey(today);

  const [ending, frozen, birthdays, absent] = await Promise.all([
    prisma.$queryRaw<Array<{ ending_today: bigint | number | null; ending_3: bigint | number | null }>>`
      SELECT
        SUM(CASE WHEN s.subscription_end_date = ${today} THEN 1 ELSE 0 END) AS ending_today,
        SUM(CASE WHEN s.subscription_end_date > ${today} AND s.subscription_end_date <= ${in3} THEN 1 ELSE 0 END) AS ending_3
      FROM club_subscriptions s
      LEFT JOIN club_members m ON m.id = s.member_id
      WHERE s.subscription_start_date <= ${today}
        AND s.subscription_end_date BETWEEN ${today} AND ${in3}
        AND (s.member_id IS NULL OR m.is_deleted = 0)
        AND (s.member_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM club_subscriptions n
          WHERE n.member_id = s.member_id AND n.id <> s.id AND n.subscription_end_date > s.subscription_end_date
        ))
        ${subBranch}
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT f.subscription_id) AS total
      FROM club_subscription_freezes f
      INNER JOIN club_subscriptions s ON s.id = f.subscription_id
      LEFT JOIN club_members m ON m.id = s.member_id
      WHERE f.is_active = 1
        AND f.freeze_start_date <= ${today}
        AND (f.freeze_end_date IS NULL OR f.freeze_end_date >= ${today})
        AND (s.member_id IS NULL OR m.is_deleted = 0)
        ${subBranch}
    `,
    prisma.$queryRaw<Array<{ id: number; name: string; member_code: string }>>`
      SELECT m.id, m.name, m.member_code
      FROM club_members m
      WHERE m.is_deleted = 0
        AND m.date_of_birth IS NOT NULL
        AND SUBSTRING(m.date_of_birth, 6, 5) = ${md}
        ${memberBranch}
      ORDER BY m.name ASC
      LIMIT 200
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT s.member_id) AS total
      FROM club_subscriptions s
      INNER JOIN club_members m ON m.id = s.member_id AND m.is_deleted = 0
      WHERE s.subscription_start_date <= ${absentCutoff}
        AND s.subscription_end_date >= ${today}
        AND s.status <> 'frozen'
        AND NOT EXISTS (
          SELECT 1 FROM club_attendance a
          WHERE a.member_id = s.member_id AND a.attendance_date > ${absentCutoff}
        )
        ${subBranch}
    `,
  ]);

  return {
    endingToday: Number(ending[0]?.ending_today ?? 0),
    ending3Days: Number(ending[0]?.ending_3 ?? 0),
    frozen: Number(frozen[0]?.total ?? 0),
    birthdaysToday: birthdays.length,
    birthdays: birthdays.slice(0, 6).map((row) => ({ id: Number(row.id), name: row.name, code: row.member_code })),
    absentMembers: Number(absent[0]?.total ?? 0),
    absentDays: ABSENT_DAYS,
  };
}

function monthWindow(today: string) {
  const month = today.slice(0, 7);
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { month, start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Sales reps this month: money collected on their subscriptions' receipts (paid receipts, branch
 * scoped) against their effective target — the same target rule as «فريق المبيعات», without the
 * commission settlement detail (refunds and re-allocations are left to that report).
 */
async function salesTeam(ctx: ManagerContext) {
  if (!(await allowed(ctx, ['club.sales.reports:view', 'club.sales.dashboard:view']))) return null;
  const { prisma, scopedBranches, today } = ctx;
  const window = monthWindow(today);
  const receiptBranch = inSql('r.branch_id', scopedBranches);
  const [collected, settings, defaults] = await Promise.all([
    prisma.$queryRaw<Array<{ sales_id: number; amount: Prisma.Decimal | number | null; subs: bigint | number }>>`
      SELECT s.sales_id, COALESCE(SUM(r.amount), 0) AS amount, COUNT(DISTINCT r.subscription_id) AS subs
      FROM club_receipts r
      INNER JOIN club_subscriptions s ON s.id = r.subscription_id
      WHERE r.status IN ('مدفوعة', 'paid')
        AND r.receipt_date BETWEEN ${window.start} AND ${today}
        AND s.sales_id IS NOT NULL
        ${receiptBranch}
      GROUP BY s.sales_id
    `,
    prisma.club_sales_rep_settings.findMany({ include: { tiers: true } }),
    readSalesDefaults(prisma),
  ]);
  const ids = [...new Set([...settings.map((row) => row.employee_id), ...collected.map((row) => Number(row.sales_id))])];
  if (!ids.length) return null;
  const [employees, extraBranches] = await Promise.all([
    prisma.employees.findMany({
      where: { id: { in: ids }, OR: [{ leave_emp: null }, { leave_emp: 0 }] },
      select: { id: true, employee: true, branch_id_fk: true },
    }),
    scopedBranches
      ? prisma.club_sales_rep_branches.findMany({ where: { employee_id: { in: ids } }, select: { employee_id: true, branch_id: true } })
      : Promise.resolve([] as Array<{ employee_id: number; branch_id: number }>),
  ]);
  const collectedBy = new Map(collected.map((row) => [Number(row.sales_id), row]));
  const branchRows = await prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } });
  const branchNameOf = new Map(branchRows.map((row) => [row.branch_id, row.branch_name ?? '']));
  const allBranchNames = branchRows.map((row) => row.branch_name ?? '');
  const rows = employees.flatMap((employee) => {
    const setting = effectiveSalesSettings(settings.find((row) => row.employee_id === employee.id), defaults);
    const done = collectedBy.get(employee.id);
    if (setting.is_active === false && !done) return [];
    if (scopedBranches && !done) {
      const branches = [employee.branch_id_fk, ...extraBranches.filter((row) => row.employee_id === employee.id).map((row) => row.branch_id)];
      if (!branches.some((id) => id != null && scopedBranches.includes(Number(id)))) return [];
    }
    const target = effectiveTarget(
      toNum(setting.monthly_target as never),
      { mode: setting.target_period_mode, startDate: setting.target_start_date, endDate: setting.target_end_date, days: setting.target_days },
      window.start,
      window.end,
    );
    return [{
      id: employee.id,
      name: employee.employee || `#${employee.id}`,
      branchName: employee.branch_id_fk ? branchNameOf.get(Number(employee.branch_id_fk)) || null : null,
      nameIsBranch: looksLikeBranchName(employee.employee ?? '', allBranchNames),
      achieved: toNum((done?.amount ?? 0) as never),
      target,
      count: Number(done?.subs ?? 0),
      unit: 'money' as const,
    }];
  });
  const ranked = rankPerformance(rows);
  return ranked.rows.length ? { month: window.month, ...ranked } : null;
}

/**
 * Captains this month: private subscriptions sold (net of discount, refunded ones excluded) against
 * the month's target — override for the month, else the fixed target, like trainer performance.
 */
async function captains(ctx: ManagerContext) {
  if (!(await allowed(ctx, ['club.fitness.trainer_targets:view', 'club.fitness.trainers:view']))) return null;
  const { prisma, scopedBranches, today } = ctx;
  const window = monthWindow(today);
  const [sold, trainers, fixed, overrides] = await Promise.all([
    prisma.club_subscriptions.findMany({
      where: {
        private_trainer_id: { not: null },
        registration_date: { gte: window.start, lte: window.end },
        refunds: { none: { status: 'completed' } },
        ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
      },
      select: { private_trainer_id: true, branch_id: true, subscription_value: true, discount_value: true },
    }),
    prisma.club_trainers.findMany({ where: { is_deleted: false, is_active: true }, select: { id: true, name: true } }),
    prisma.club_trainer_targets.findMany({ select: { trainer_id: true, private_sales_target: true, subscriptions_target: true } }),
    prisma.club_trainer_target_overrides.findMany({
      where: { target_month: window.month },
      select: { trainer_id: true, private_sales_target: true, subscriptions_target: true },
    }),
  ]);
  const soldBy = new Map<number, { value: number; count: number; branches: Map<number, number> }>();
  for (const row of sold) {
    const id = Number(row.private_trainer_id);
    const current = soldBy.get(id) ?? { value: 0, count: 0, branches: new Map<number, number>() };
    current.value += Math.max(0, toNum(row.subscription_value) - toNum(row.discount_value));
    current.count += 1;
    current.branches.set(row.branch_id, (current.branches.get(row.branch_id) ?? 0) + 1);
    soldBy.set(id, current);
  }
  const targetOf = (id: number) => overrides.find((row) => row.trainer_id === id) ?? fixed.find((row) => row.trainer_id === id);
  let candidates = trainers.filter((trainer) => {
    const target = targetOf(trainer.id);
    return soldBy.has(trainer.id) || toNum(target?.private_sales_target ?? 0) > 0 || Number(target?.subscriptions_target ?? 0) > 0;
  });
  const [homeBranches, branchRows] = await Promise.all([
    candidates.length ? trainerBranchMap(prisma, candidates.map((trainer) => trainer.id)) : Promise.resolve(new Map<number, number[]>()),
    prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } }),
  ]);
  if (scopedBranches) {
    candidates = candidates.filter((trainer) => soldBy.has(trainer.id)
      || (homeBranches.get(trainer.id) ?? []).some((id) => scopedBranches.includes(id)));
  }
  const branchNameOf = new Map(branchRows.map((row) => [row.branch_id, row.branch_name ?? '']));
  const allBranchNames = branchRows.map((row) => row.branch_name ?? '');
  // Label: the branch where most of this month's private sales were made, else the trainer's home branch(es).
  const branchLabel = (trainerId: number) => {
    const soldIn = soldBy.get(trainerId)?.branches;
    const ids = soldIn?.size
      ? [[...soldIn.entries()].sort((a, b) => b[1] - a[1])[0][0]]
      : homeBranches.get(trainerId) ?? [];
    const names = ids.map((id) => branchNameOf.get(id)).filter((name): name is string => Boolean(name));
    return names.length ? names.join('، ') : null;
  };
  const rows = candidates.map((trainer) => {
    const target = targetOf(trainer.id);
    const done = soldBy.get(trainer.id) ?? { value: 0, count: 0 };
    const moneyTarget = toNum(target?.private_sales_target ?? 0);
    const countTarget = Number(target?.subscriptions_target ?? 0);
    const byCount = moneyTarget <= 0 && countTarget > 0;
    return {
      id: trainer.id,
      name: trainer.name,
      branchName: branchLabel(trainer.id),
      nameIsBranch: looksLikeBranchName(trainer.name, allBranchNames),
      achieved: byCount ? done.count : done.value,
      target: byCount ? countTarget : moneyTarget,
      count: done.count,
      unit: byCount ? ('count' as const) : ('money' as const),
    };
  });
  const ranked = rankPerformance(rows);
  return ranked.rows.length ? { month: window.month, ...ranked } : null;
}

async function safely<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    // A manager widget must never take the whole dashboard down; the page hides it instead.
    logger.warn(`manager widget failed: ${(error as Error)?.message ?? String(error)}`);
    return null;
  }
}

export async function managerInsights(ctx: ManagerContext) {
  const [today, alerts, sales, trainers] = await Promise.all([
    safely(() => todayAtGlance(ctx)),
    safely(() => followUpAlerts(ctx)),
    safely(() => salesTeam(ctx)),
    safely(() => captains(ctx)),
  ]);
  return { today, alerts, salesTeam: sales, captains: trainers };
}
