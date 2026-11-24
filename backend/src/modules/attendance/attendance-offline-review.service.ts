import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { todayIso } from '../../common/utils/legacy-date.util';
import { AttendanceService } from './attendance.service';
import { resolveOfflinePunchClock } from './offline-attendance.util';
import { ListOfflinePunchesDto } from './dto/offline-review.dto';

/** Synced this long after capture → worth a closer look (device clock may have been changed). */
export const SUSPICIOUS_DELAY_MINUTES = 120;
/** Captured this close to the edge of the branch radius → worth a closer look. */
const GEOFENCE_EDGE_RATIO = 0.8;
const MAX_LIST_ROWS = 2000;

export type OfflineReviewFlag = 'late_sync' | 'outside_geofence' | 'near_geofence_edge' | 'edited' | 'comp_day';

type SyncRow = {
  id: number;
  user_id: number;
  captured_at_device: Date;
  captured_timezone: string;
  received_at_server: Date;
  attendance_id: number | null;
  result_json: Prisma.JsonValue | null;
};

type ReviewRow = {
  sync_id: number;
  decision: 'approved' | 'rejected';
  reason: string | null;
  reviewed_by_name: string | null;
  reviewed_at: Date | string;
};

type SyncResult = {
  id?: number;
  type?: 'in' | 'out';
  branchId?: number;
  branchName?: string;
  distanceMeters?: number;
  compDayEarned?: boolean;
};

/** "8:05 AM" → "08:05 AM", the format the attendance engine writes into tbl_hdoor_emps. */
function engineTime(time: string): string {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  return m ? `${m[1].padStart(2, '0')}:${m[2]} ${m[3].toUpperCase()}` : time.trim();
}

function parseResult(value: Prisma.JsonValue | null): SyncResult {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as SyncResult;
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as unknown as SyncResult) : {};
}

/** The wall-clock day/time the engine used for this punch (same conversion as the sync). */
function punchClock(row: Pick<SyncRow, 'captured_at_device' | 'captured_timezone' | 'received_at_server'>) {
  const captured = new Date(row.captured_at_device).toISOString();
  const received = new Date(row.received_at_server);
  try {
    return resolveOfflinePunchClock(captured, row.captured_timezone, received);
  } catch {
    return resolveOfflinePunchClock(captured, 'Africa/Cairo', received);
  }
}

/**
 * «بصمات أوفلاين للمراجعة»: punches the employee app captured offline and replayed later with the
 * phone's clock (AttendanceService.syncOfflinePunch, which answers requiresReview: true). HR or the
 * branch manager keeps each one (approve) or removes its effect from tbl_hdoor_emps (reject).
 *
 * attendance_offline_punch_reviews is plain SQL on purpose: production runs a hand-patched
 * Prisma Client that is never regenerated.
 */
@Injectable()
export class AttendanceOfflineReviewService {
  private readonly logger = new Logger(AttendanceOfflineReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly scope: BranchScopeService = new BranchScopeService(),
  ) {}

  async list(q: ListOfflinePunchesDto, user: JwtUser) {
    const to = q.dateTo ?? todayIso();
    const fromDefault = new Date(`${to}T12:00:00Z`);
    fromDefault.setUTCDate(fromDefault.getUTCDate() - 13);
    const from = q.dateFrom ?? fromDefault.toISOString().slice(0, 10);
    if (to < from) throw new BadRequestException('تاريخ النهاية يجب أن يساوي أو يلي تاريخ البداية');

    // Widen by a day each side, then filter on the punch's own local day.
    const lower = new Date(`${from}T00:00:00Z`);
    lower.setUTCDate(lower.getUTCDate() - 1);
    const upper = new Date(`${to}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 2);
    const rows = (await this.prisma.mobile_offline_attendance_sync.findMany({
      where: { state: 'completed', captured_at_device: { gte: lower, lt: upper } },
      orderBy: { captured_at_device: 'desc' },
      take: MAX_LIST_ROWS,
    })) as SyncRow[];

    const items = await this.decorate(rows, user, q.branchId);
    const inRange = items.filter((item) => item.actionDate >= from && item.actionDate <= to);
    const status = q.status ?? 'pending';
    const visible = inRange.filter((item) =>
      status === 'all' ? true : status === 'pending' ? !item.review : item.review?.decision === status);
    return {
      from,
      to,
      items: visible,
      counters: {
        pending: inRange.filter((i) => !i.review).length,
        suspicious: inRange.filter((i) => !i.review && i.flags.some((f) => f !== 'comp_day')).length,
        approved: inRange.filter((i) => i.review?.decision === 'approved').length,
        rejected: inRange.filter((i) => i.review?.decision === 'rejected').length,
      },
    };
  }

  async approve(ids: number[], user: JwtUser) {
    const unique = [...new Set(ids)];
    const rows = (await this.prisma.mobile_offline_attendance_sync.findMany({
      where: { id: { in: unique }, state: 'completed' },
    })) as SyncRow[];
    const allowed = new Set((await this.decorate(rows, user)).map((item) => item.id));
    const reviews = await this.reviewsFor(unique);
    const skipped: Array<{ id: number; message: string }> = [];
    let approved = 0;
    for (const id of unique) {
      if (!rows.some((r) => r.id === id)) { skipped.push({ id, message: 'البصمة غير موجودة' }); continue; }
      if (!allowed.has(id)) { skipped.push({ id, message: 'البصمة خارج نطاق صلاحياتك' }); continue; }
      if (reviews.get(id)?.decision === 'rejected') { skipped.push({ id, message: 'تم رفض البصمة وإزالة أثرها من قبل' }); continue; }
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO attendance_offline_punch_reviews (sync_id, decision, reason, reviewed_by, reviewed_by_name, reviewed_at)
        VALUES (${id}, 'approved', NULL, ${user.sub}, ${user.name ?? null}, NOW())
        ON DUPLICATE KEY UPDATE decision = 'approved', reviewed_by = ${user.sub},
          reviewed_by_name = ${user.name ?? null}, reviewed_at = NOW()`);
      approved += 1;
    }
    return { approved, skipped };
  }

  /**
   * Removes what this punch wrote: a check-in clears the arrival on its tbl_hdoor_emps row, a
   * check-out clears the departure; a row left with neither time is deleted, and the matching
   * history line goes too. Refused when the time was edited after the sync (HR fixes it by hand).
   */
  async reject(id: number, reason: string, user: JwtUser) {
    const row = (await this.prisma.mobile_offline_attendance_sync.findUnique({ where: { id } })) as SyncRow | null;
    if (!row || (row as unknown as { state?: string }).state !== 'completed') throw new NotFoundException('البصمة غير موجودة');
    const [item] = await this.decorate([row], user);
    if (!item) throw new ForbiddenException('البصمة خارج نطاق صلاحياتك');
    if (item.review?.decision === 'rejected') throw new ConflictException('تم رفض هذه البصمة من قبل');
    const text = reason.trim();
    if (text.length < 3) throw new BadRequestException('اكتب سبب الرفض');

    const result = parseResult(row.result_json);
    const hodoorId = row.attendance_id ?? result.id ?? null;
    const type = result.type === 'out' ? 'out' : 'in';
    const clock = punchClock(row);
    const expected = engineTime(clock.time);

    const removed = await this.prisma.$transaction(async (tx) => {
      const record = hodoorId ? await tx.tbl_hdoor_emps.findUnique({ where: { hodoor_id: hodoorId } }) : null;
      let effect: 'cleared' | 'deleted' | 'missing' = 'missing';
      if (record) {
        const current = type === 'in' ? record.hdoor_time : record.ensraf_time;
        if (current !== expected) {
          throw new ConflictException(
            `تم تعديل ${type === 'in' ? 'الحضور' : 'الانصراف'} بعد المزامنة (${current ?? 'فارغ'})؛ عدّله يدوياً من لوحة الحضور`);
        }
        const other = type === 'in' ? record.ensraf_time : record.hdoor_time;
        const guard = type === 'in' ? { hdoor_time: expected } : { ensraf_time: expected };
        if (!other) {
          const gone = await tx.tbl_hdoor_emps.deleteMany({
            where: { hodoor_id: record.hodoor_id, ...guard, ...(type === 'in' ? { ensraf_time: null } : { hdoor_time: null }) },
          });
          if (gone.count !== 1) throw new ConflictException('تغيّر سجل الحضور أثناء الرفض، أعد المحاولة');
          effect = 'deleted';
        } else {
          const data: Prisma.tbl_hdoor_empsUpdateManyMutationInput = type === 'in'
            ? { hdoor_time: null, dwam_hdoor_time: null, late_min: null, hdoor_user_id: null, hdoor_lat: null,
              hdoor_long: null, hdoor_img_path: null, ttype: 'ensraf' }
            : { ensraf_time: null, dwam_ensraf_time: null, mobaker_min: null, num_min: null, ensraf_user_id: null,
              ensraf_lat: null, ensraf_long: null, ensraf_img_path: null, ttype: 'hdoor' };
          const changed = await tx.tbl_hdoor_emps.updateMany({ where: { hodoor_id: record.hodoor_id, ...guard }, data });
          if (changed.count !== 1) throw new ConflictException('تغيّر سجل الحضور أثناء الرفض، أعد المحاولة');
          effect = 'cleared';
        }
        const history = await tx.tbl_hdoor_emps_history.findFirst({
          where: { member_code: record.member_code, action_date: clock.actionDate, action_time: expected,
            ttype: type === 'in' ? 'hdoor' : 'ensraf' },
          orderBy: { hodoor_id: 'desc' },
          select: { hodoor_id: true },
        });
        if (history) await tx.tbl_hdoor_emps_history.delete({ where: { hodoor_id: history.hodoor_id } });
      }
      const snapshot = record ? {
        effect,
        hodoorId: record.hodoor_id,
        type,
        time: expected,
        actionDate: record.action_date,
        ...(type === 'in'
          ? { lateMin: record.late_min, lat: record.hdoor_lat, long: record.hdoor_long, img: record.hdoor_img_path }
          : { earlyLeaveMin: record.mobaker_min, overtimeMin: record.num_min, lat: record.ensraf_lat,
            long: record.ensraf_long, img: record.ensraf_img_path }),
      } : { effect, hodoorId, type, time: expected };
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO attendance_offline_punch_reviews
          (sync_id, decision, reason, removed_json, reviewed_by, reviewed_by_name, reviewed_at)
        VALUES (${id}, 'rejected', ${text}, ${JSON.stringify(snapshot)}, ${user.sub}, ${user.name ?? null}, NOW())
        ON DUPLICATE KEY UPDATE decision = 'rejected', reason = ${text}, removed_json = ${JSON.stringify(snapshot)},
          reviewed_by = ${user.sub}, reviewed_by_name = ${user.name ?? null}, reviewed_at = NOW()`);
      return snapshot;
    }, { maxWait: 10_000, timeout: 20_000 });

    this.logger.log(`OFFLINE_PUNCH_REJECTED sync=${id} user=${user.sub} effect=${removed.effect} hodoor=${removed.hodoorId ?? 0}`);
    return {
      id,
      effect: removed.effect,
      ...(result.compDayEarned
        ? { warning: 'هذه البصمة سجلت يوم بدل راحة؛ راجع بدل الراحة يدوياً إن لزم' }
        : {}),
    };
  }

  private async reviewsFor(ids: number[]) {
    if (!ids.length) return new Map<number, ReviewRow>();
    const rows = await this.prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
      SELECT sync_id, decision, reason, reviewed_by_name, reviewed_at
      FROM attendance_offline_punch_reviews WHERE sync_id IN (${Prisma.join(ids)})`);
    return new Map(rows.map((r) => [Number(r.sync_id), r]));
  }

  /** Joins employee, branch, attendance row and review; drops rows outside the caller's scope. */
  private async decorate(rows: SyncRow[], user: JwtUser, requestedBranch?: string) {
    if (!rows.length) return [];
    const results = new Map(rows.map((r) => [r.id, parseResult(r.result_json)]));
    const users = await this.prisma.users.findMany({
      where: { user_id: { in: [...new Set(rows.map((r) => r.user_id))] } },
      select: { user_id: true, emp_code: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.user_id, u]));
    const empIds = [...new Set(users.map((u) => u.emp_code).filter((v): v is number => v != null))];
    const employees = empIds.length
      ? await this.prisma.employees.findMany({
        where: { id: { in: empIds } },
        select: { id: true, emp_code: true, employee: true, branch_id_fk: true },
      })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const hodoorIds = rows.map((r) => r.attendance_id ?? results.get(r.id)?.id).filter((v): v is number => !!v);
    const records = hodoorIds.length
      ? await this.prisma.tbl_hdoor_emps.findMany({
        where: { hodoor_id: { in: hodoorIds } },
        select: { hodoor_id: true, hdoor_time: true, ensraf_time: true, late_min: true, mobaker_min: true, branch_id_fk: true },
      })
      : [];
    const recordMap = new Map(records.map((r) => [r.hodoor_id, r]));
    const reviews = await this.reviewsFor(rows.map((r) => r.id));

    const allowedBranches = this.scope.resolveListFilter(user, requestedBranch);
    const staff = await this.attendance.managerStaffCodes(user);
    const branchIds = new Set<number>();
    const prepared = rows.flatMap((row) => {
      const result = results.get(row.id)!;
      const emp = empMap.get(userMap.get(row.user_id)?.emp_code ?? -1);
      const hodoorId = row.attendance_id ?? result.id ?? null;
      const record = hodoorId ? recordMap.get(hodoorId) : undefined;
      const branchId = record?.branch_id_fk ?? result.branchId ?? emp?.branch_id_fk ?? 0;
      if (allowedBranches && !allowedBranches.includes(branchId)) return [];
      if (staff && (emp?.emp_code == null || !staff.includes(emp.emp_code))) return [];
      branchIds.add(branchId);
      return [{ row, result, emp, record, branchId, hodoorId }];
    });
    const [branches, geofences] = await Promise.all([
      this.prisma.tbl_branches.findMany({
        where: { branch_id: { in: [...branchIds] } },
        select: { branch_id: true, branch_name: true },
      }),
      this.prisma.branch_settings.findMany({ select: { title: true, distance: true } }),
    ]);
    const branchName = new Map(branches.map((b) => [b.branch_id, b.branch_name]));
    const radiusByTitle = new Map(geofences.map((g) => [g.title, Number(g.distance ?? 0)]));

    return prepared.map(({ row, result, emp, record, branchId, hodoorId }) => {
      const clock = punchClock(row);
      const punchTime = engineTime(clock.time);
      const type: 'in' | 'out' = result.type === 'out' ? 'out' : 'in';
      const delayMinutes = Math.max(0, Math.round(
        (new Date(row.received_at_server).getTime() - new Date(row.captured_at_device).getTime()) / 60_000));
      const name = result.branchName ?? branchName.get(branchId) ?? null;
      const radius = name ? radiusByTitle.get(name) ?? null : null;
      const distance = typeof result.distanceMeters === 'number' ? result.distanceMeters : null;
      const review = reviews.get(row.id);
      const currentTime = record ? (type === 'in' ? record.hdoor_time : record.ensraf_time) ?? null : null;
      const flags: OfflineReviewFlag[] = [];
      if (delayMinutes > SUSPICIOUS_DELAY_MINUTES) flags.push('late_sync');
      if (distance != null && radius) {
        if (distance > radius) flags.push('outside_geofence');
        else if (distance > radius * GEOFENCE_EDGE_RATIO) flags.push('near_geofence_edge');
      }
      if (review?.decision !== 'rejected' && currentTime !== punchTime) flags.push('edited');
      if (result.compDayEarned) flags.push('comp_day');
      return {
        id: row.id,
        hodoorId,
        empCode: emp?.emp_code ?? null,
        employeeName: emp?.employee ?? userMap.get(row.user_id)?.name ?? `#${row.user_id}`,
        branchId,
        branchName: name ?? (branchId === 0 ? 'الإدارة' : null),
        type,
        actionDate: clock.actionDate,
        punchTime,
        currentTime,
        lateMin: type === 'in' ? Math.round(record?.late_min ?? 0) : 0,
        earlyLeaveMin: type === 'out' ? Math.round(record?.mobaker_min ?? 0) : 0,
        capturedAt: new Date(row.captured_at_device).toISOString(),
        receivedAt: new Date(row.received_at_server).toISOString(),
        timezone: row.captured_timezone,
        delayMinutes,
        distanceMeters: distance,
        radiusMeters: radius,
        flags,
        review: review
          ? {
            decision: review.decision,
            reason: review.reason,
            reviewedByName: review.reviewed_by_name,
            reviewedAt: new Date(review.reviewed_at).toISOString(),
          }
          : null,
      };
    });
  }
}
