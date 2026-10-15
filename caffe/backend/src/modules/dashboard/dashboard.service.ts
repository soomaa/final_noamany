import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

const AR_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export interface DashboardSummaryDto {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  onLeaveToday: number;
  presentPct: number;
  avgLateMinutes: number;
  weekly: { label: string; pct: number }[];
  todayAttendance: {
    hodoorId: number;
    empCode: number | null;
    name: string | null;
    department: string | null;
    checkIn: string | null;
    checkOut: string | null;
    lateMin: number | null;
    status: 'present' | 'late' | 'leave' | 'absent';
  }[];
}

@Injectable()
export class DashboardService {
  /**
   * Virtual "parent" branches that aggregate several physical branches — e.g.
   * filtering by branch 3 actually pulls rows for {6,7,3}. Configurable via
   * DASHBOARD_BRANCH_FANOUT.
   */
  private readonly branchFanout: Record<number, number[]>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.branchFanout = config.get<Record<number, number[]>>('dashboard.branchFanout') ?? {};
  }

  /** Concrete branch ids for a Prisma `in` filter, expanding any virtual branch; null = no scope. */
  private branchFilterIds(effectiveBranch: number | undefined): number[] | null {
    if (effectiveBranch == null) return null;
    return this.branchFanout[effectiveBranch] ?? [effectiveBranch];
  }

  /** Today if it has punches, else the latest available day (snapshot-friendly). */
  private async resolveReferenceDate(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = await this.prisma.tbl_hdoor_emps.count({ where: { action_date: today } });
    if (hasToday > 0) return today;
    const latest = await this.prisma.tbl_hdoor_emps.aggregate({ _max: { action_date: true } });
    return latest._max.action_date ?? today;
  }

  async getSummary(
    user: JwtUser,
    branch: number | 'all' = 'all',
    manWomen?: number,
  ): Promise<DashboardSummaryDto> {
    const today = await this.resolveReferenceDate();
    const isAdmin = user.level === 1;

    const effectiveBranch =
      !isAdmin && user.branch ? user.branch : branch === 'all' ? undefined : Number(branch);

    // Virtual branches fan out to their physical set; any other branch is a plain equality.
    const branchIds = this.branchFilterIds(effectiveBranch);

    const empWhere: Prisma.employeesWhereInput = {};
    if (branchIds) empWhere.branch_id_fk = { in: branchIds };
    if (manWomen != null && manWomen > 0) empWhere.emp_type = manWomen;

    const totalEmployees = await this.prisma.employees.count({ where: empWhere });

    const hdoorWhere: Prisma.tbl_hdoor_empsWhereInput = { action_date: today };
    if (branchIds) hdoorWhere.branch_id_fk = { in: branchIds };

    const todayRows = await this.prisma.tbl_hdoor_emps.findMany({
      where: hdoorWhere,
      orderBy: { hodoor_id: 'asc' },
      select: {
        hodoor_id: true,
        member_code: true,
        member_id: true,
        hdoor_time: true,
        ensraf_time: true,
        late_min: true,
        second_hdoor_time: true,
        second_late_min: true,
      },
    });

    const memberIds = [...new Set(todayRows.map((r) => r.member_id).filter((id): id is number => id != null))];
    const employees =
      memberIds.length > 0
        ? await this.prisma.employees.findMany({
            where: { id: { in: memberIds } },
            select: {
              id: true,
              emp_code: true,
              employee: true,
              edara_n: true,
              emp_type: true,
              branch_id_fk: true,
            },
          })
        : [];
    const empById = new Map(employees.map((e) => [e.id, e]));

    let presentToday = 0;
    let lateToday = 0;
    let lateSum = 0;
    let lateCount = 0;

    const todayAttendance = todayRows
      .map((row) => {
        const emp = row.member_id != null ? empById.get(row.member_id) : undefined;
        if (manWomen != null && manWomen > 0 && emp && emp.emp_type !== manWomen) return null;

        const hasCheckIn = Boolean(row.hdoor_time?.trim() || row.second_hdoor_time?.trim());
        if (hasCheckIn) presentToday += 1;

        const firstLate = row.hdoor_time?.trim() && row.late_min != null && row.late_min > 0 ? row.late_min : 0;
        const secondLate =
          row.second_hdoor_time?.trim() && row.second_late_min != null && row.second_late_min > 0
            ? row.second_late_min
            : 0;
        const lateMin = Math.max(firstLate, secondLate);
        const isLate = lateMin > 0;
        if (isLate) {
          lateToday += 1;
          lateSum += lateMin;
          lateCount += 1;
        }

        return {
          hodoorId: row.hodoor_id,
          empCode: row.member_code ?? emp?.emp_code ?? null,
          name: emp?.employee ?? null,
          department: emp?.edara_n ?? null,
          checkIn: row.hdoor_time ?? row.second_hdoor_time ?? null,
          checkOut: row.ensraf_time ?? null,
          lateMin: lateMin > 0 ? Math.round(lateMin) : null,
          status: (isLate ? 'late' : hasCheckIn ? 'present' : 'absent') as 'present' | 'late' | 'absent',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    const presentPct = totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;
    const avgLateMinutes = lateCount > 0 ? lateSum / lateCount : 0;

    const weekly = await this.buildWeekly(today, effectiveBranch, manWomen, totalEmployees);

    return {
      totalEmployees,
      presentToday,
      lateToday,
      onLeaveToday: 0,
      presentPct,
      avgLateMinutes,
      weekly,
      todayAttendance,
    };
  }

  private async buildWeekly(
    todayIso: string,
    branch: number | undefined,
    manWomen: number | undefined,
    totalEmployees: number,
  ): Promise<{ label: string; pct: number }[]> {
    const today = new Date(`${todayIso}T12:00:00`);
    const days: { label: string; date: string }[] = [];

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ label: AR_WEEKDAYS[d.getDay()], date: iso });
    }

    const dates = days.map((d) => d.date);
    const where: Prisma.tbl_hdoor_empsWhereInput = { action_date: { in: dates } };
    const branchIds = this.branchFilterIds(branch);
    if (branchIds) where.branch_id_fk = { in: branchIds };

    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where,
      select: { action_date: true, member_id: true, hdoor_time: true, second_hdoor_time: true },
    });

    const memberIds = [...new Set(rows.map((r) => r.member_id).filter((id): id is number => id != null))];
    let allowedIds: Set<number> | null = null;
    if (manWomen != null && manWomen > 0 && memberIds.length > 0) {
      const filtered = await this.prisma.employees.findMany({
        where: { id: { in: memberIds }, emp_type: manWomen },
        select: { id: true },
      });
      allowedIds = new Set(filtered.map((e) => e.id));
    }

    const presentByDate = new Map<string, number>();
    for (const row of rows) {
      if (allowedIds && row.member_id != null && !allowedIds.has(row.member_id)) continue;
      const hasIn = Boolean(row.hdoor_time?.trim() || row.second_hdoor_time?.trim());
      if (!hasIn || !row.action_date) continue;
      presentByDate.set(row.action_date, (presentByDate.get(row.action_date) ?? 0) + 1);
    }

    return days.map(({ label, date }) => {
      const present = presentByDate.get(date) ?? 0;
      const pct = totalEmployees > 0 ? (present / totalEmployees) * 100 : 0;
      return { label, pct: Math.round(pct * 10) / 10 };
    });
  }
}
