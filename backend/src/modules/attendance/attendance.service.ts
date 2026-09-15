import { SUSPEND_APPROVED } from '../../common/utils/suspend-status.util';
import { parseStrictNumeric, assertTimeOrder, parseEmployeeCode } from '../../common/validators/validation.util';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { legacyDateMatchValues, todayIso } from '../../common/utils/legacy-date.util';
import { UpsertShiftDto } from './dto/shift.dto';
import { CheckPunchDto } from './dto/check.dto';
import {
  CreateExtraHoursDto,
  CreateShiftSwapDto,
  ListEdafiDto,
} from './dto/edafi.dto';
import { AttendanceReportDto } from './dto/report.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { Workbook } from 'exceljs';
import { resolveOfflinePunchClock } from './offline-attendance.util';

interface CapturedAttendanceClock {
  actionDate: string;
  time: string;
}

const DEFAULT_ATTENDANCE_PHOTO = '/asisst/admin_asset/img/avatar5.png';

/** Minutes-since-midnight from a "h:i A" or "HH:mm" time-string. */
function parseTimeToMinutes(time: string): number {
  const t = (time ?? '').trim();
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const pm = ampm[3].toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  return 0;
}

/** Legacy stores shift/punch times as "h:i A". Normalise any input to that. */
function formatMinutesAsTime(totalMin: number): string {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function pairDurationSeconds(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const start = parseTimeToMinutes(checkIn);
  let end = parseTimeToMinutes(checkOut);
  if (end < start) end += 24 * 60;
  return Math.max(0, (end - start) * 60);
}

function activeDurationSeconds(actionDate: string, checkIn?: string | null): number {
  if (!checkIn) return 0;
  const date = actionDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!date) return 0;
  const [year, month, day] = date.split('-').map(Number);
  const minutes = parseTimeToMinutes(checkIn);
  const startedAt = new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60).getTime();
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

/**
 * Faithful port of Api::sum_min_late (active variant, l.7531): build same-day
 * datetimes, handle overnight wrap (actual<expected & gap>12h ⇒ +24h),
 * floor((actual-expected)/60), keep when >0.
 */
function sumMinLate(expected: string, actual: string): number {
  const expectedMin = parseTimeToMinutes(expected);
  let actualMin = parseTimeToMinutes(actual);
  if (actualMin < expectedMin && expectedMin - actualMin > 12 * 60) {
    actualMin += 24 * 60;
  }
  const diff = Math.floor(actualMin - expectedMin);
  return diff > 0 ? diff : 0;
}

/** Faithful port of Api::sum_min_mobaker (l.7547): floor((expected-actual)/60), >0. */
function sumMinMobaker(expected: string, actual: string): number {
  const expectedMin = parseTimeToMinutes(expected);
  const actualMin = parseTimeToMinutes(actual);
  const diff = Math.floor(expectedMin - actualMin);
  return diff > 0 ? diff : 0;
}

/**
 * Shift time-window (minutes-since-midnight, with next-day offsets) — port of
 * Api::get_shift_datetimes. Times that fall before hdoor_from are rolled to +1 day
 * so overnight shifts compare correctly.
 */
interface ShiftWindow {
  hdoorFrom: number;
  hdoorTo: number;
  hdoorKhasm: number;
  ensrafFrom: number;
  ensrafTo: number;
  ensrafKhasm: number;
}

function buildShiftWindow(s: {
  hdoor_from_time?: string | null;
  hdoor_to_time?: string | null;
  hdoor_khasm_from?: string | null;
  ensraf_from_time?: string | null;
  ensraf_to_time?: string | null;
  ensraf_khasm_from?: string | null;
}): ShiftWindow {
  const DAY = 24 * 60;
  const hdoorFromRaw = parseTimeToMinutes(s.hdoor_from_time ?? '');
  const hdoorToRaw = parseTimeToMinutes(s.hdoor_to_time ?? '');
  const hdoorKhasmRaw = parseTimeToMinutes(s.hdoor_khasm_from ?? '');
  const ensrafFromRaw = parseTimeToMinutes(s.ensraf_from_time ?? '');
  const ensrafToRaw = parseTimeToMinutes(s.ensraf_to_time ?? '');
  const ensrafKhasmRaw = parseTimeToMinutes(s.ensraf_khasm_from ?? '');

  const hdoorFrom = hdoorFromRaw;
  const hdoorTo = hdoorToRaw < hdoorFromRaw ? hdoorToRaw + DAY : hdoorToRaw;
  const hdoorKhasm = hdoorKhasmRaw < hdoorFromRaw ? hdoorKhasmRaw + DAY : hdoorKhasmRaw;

  // All ensraf times compare against hdoor_from; if earlier ⇒ next day.
  const ensrafFrom = ensrafFromRaw < hdoorFromRaw ? ensrafFromRaw + DAY : ensrafFromRaw;
  const ensrafKhasm = ensrafKhasmRaw < hdoorFromRaw ? ensrafKhasmRaw + DAY : ensrafKhasmRaw;
  // ensraf_to compares against ensraf_from's day.
  const ensrafFromDayOffset = ensrafFrom - ensrafFromRaw; // 0 or DAY
  const ensrafTo =
    ensrafToRaw < ensrafFromRaw
      ? ensrafToRaw + ensrafFromDayOffset + DAY
      : ensrafToRaw + ensrafFromDayOffset;

  return { hdoorFrom, hdoorTo, hdoorKhasm, ensrafFrom, ensrafTo, ensrafKhasm };
}

function isValidShiftTime(value: string | null | undefined): value is string {
  const time = value?.trim() ?? '';
  const ampm = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    const hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    return hour >= 1 && hour <= 12 && minute >= 0 && minute < 60;
  }
  const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return false;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

function assertShiftTimingIsComplete(shift: {
  hdoor_from_time?: string | null;
  hdoor_to_time?: string | null;
  hdoor_khasm_from?: string | null;
  ensraf_from_time?: string | null;
  ensraf_to_time?: string | null;
  ensraf_khasm_from?: string | null;
}) {
  const values = [
    shift.hdoor_from_time,
    shift.hdoor_to_time,
    shift.hdoor_khasm_from,
    shift.ensraf_from_time,
    shift.ensraf_to_time,
    shift.ensraf_khasm_from,
  ];
  if (!values.every(isValidShiftTime)) {
    throw new BadRequestException('بيانات الوردية غير مكتملة، راجع الإدارة لتصحيح إعداد الوردية');
  }
}

@Injectable()
export class AttendanceService {
  private readonly punchLocks = new Set<number>();
  private readonly logger = new Logger(AttendanceService.name);
  private readonly edafiForbiddenMessage =
    'غير مسموح: أنت لست المدير المباشر لهذا الموظف ولا مسؤول الموارد البشرية المعيّن';

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // BOARD
  // -------------------------------------------------------------------------
  async board(q: PaginationDto & { date?: string; source?: string; status?: string; branchId?: string }) {
    const date = q.date?.slice(0, 10) ?? todayIso();
    const matches = legacyDateMatchValues(date);
    const where: Prisma.tbl_hdoor_empsWhereInput = { action_date_s: { in: matches } };
    if (q.branchId && q.branchId !== 'all') {
      where.branch_id_fk = parseInt(q.branchId, 10) || 0;
    }

    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where,
      orderBy: { hodoor_id: 'desc' },
    });

    const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { emp_code: { in: empCodes } },
      select: {
        id: true,
        emp_code: true,
        employee: true,
        edara_n: true,
        mosma_wazefy_n: true,
      },
    });
    const empByCode = new Map(emps.map((e) => [e.emp_code, e]));

    const dwams = await this.prisma.hr_emp_dwam.findMany({
      where: { emp_id: { in: emps.map((e) => e.id) } },
    });
    const dwamByEmp = new Map(dwams.map((d) => [d.emp_id, d]));

    const empIds = emps.map((e) => e.id);
    const weeklyOffs = empIds.length
      ? await this.prisma.hr_emp_agazat_dayes.findMany({ where: { emp_id_fk: { in: empIds } } })
      : [];
    const offByEmp = new Map(weeklyOffs.map((o) => [o.emp_id_fk, o.off_day]));
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const arWeekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const branchIds = [...new Set(rows.map((r) => r.branch_id_fk))];
    const branches = await this.prisma.tbl_branches.findMany({
      where: { branch_id: { in: branchIds } },
      select: { branch_id: true, branch_name: true },
    });
    const branchById = new Map(branches.map((branch) => [branch.branch_id, branch.branch_name]));

    let mapped = rows.map((r) => {
      const emp = empByCode.get(r.member_code ?? 0);
      const dwam = emp ? dwamByEmp.get(emp.id) : undefined;
      const scheduledIn = dwam?.attend_time ?? r.dwam_hdoor_time ?? undefined;
      const scheduledOut = dwam?.leave_time ?? r.dwam_ensraf_time ?? undefined;
      const lateMin = r.late_min != null ? Math.round(r.late_min) : undefined;
      const earlyLeaveMin = r.mobaker_min != null ? Math.round(r.mobaker_min) : undefined;
      const overtimeMin = r.num_min != null ? Math.round(r.num_min) : undefined;
      const source = r.tasgel_type === 'manual' ? 'app' : 'device';
      let status = 'present';
      if (!r.hdoor_time) {
        const offDay = emp ? offByEmp.get(emp.id) : undefined;
        const rowDate = r.action_date_s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? todayIso();
        const dow = new Date(rowDate + 'T12:00:00').getDay();
        if (offDay && (offDay === weekdayNames[dow] || offDay === arWeekdays[dow])) {
          status = 'off';
        } else {
          status = 'absent';
        }
      } else if (lateMin && lateMin > 0) status = 'late';

      const actionDate = r.action_date_s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
        ?? r.action_date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
        ?? date;
      const dayIndex = new Date(`${actionDate}T12:00:00`).getDay();
      const firstCompleted = pairDurationSeconds(r.hdoor_time, r.ensraf_time);
      const secondCompleted = pairDurationSeconds(r.second_hdoor_time, r.second_ensraf_time);
      const isWorking = Boolean(
        (r.hdoor_time && !r.ensraf_time) ||
        (r.second_hdoor_time && !r.second_ensraf_time),
      );
      const activeSeconds = r.hdoor_time && !r.ensraf_time
        ? activeDurationSeconds(actionDate, r.hdoor_time)
        : r.second_hdoor_time && !r.second_ensraf_time
          ? activeDurationSeconds(actionDate, r.second_hdoor_time)
          : 0;

      return {
        id: r.hodoor_id,
        empCode: r.member_code != null ? String(r.member_code) : undefined,
        employeeName: emp?.employee ?? undefined,
        department: emp?.edara_n ?? undefined,
        jobTitle: emp?.mosma_wazefy_n ?? undefined,
        branchName: branchById.get(r.branch_id_fk) ?? undefined,
        weekday: arWeekdays[dayIndex],
        actionDate,
        scheduledIn,
        scheduledOut,
        checkIn: r.hdoor_time ?? undefined,
        checkOut: r.ensraf_time ?? undefined,
        secondCheckIn: r.second_hdoor_time ?? undefined,
        secondCheckOut: r.second_ensraf_time ?? undefined,
        lateMin,
        earlyLeaveMin,
        overtimeMin,
        status,
        source,
        checkInLat: r.hdoor_lat ? parseFloat(r.hdoor_lat) : undefined,
        checkInLng: r.hdoor_long ? parseFloat(r.hdoor_long) : undefined,
        checkOutLat: r.ensraf_lat ? parseFloat(r.ensraf_lat) : undefined,
        checkOutLng: r.ensraf_long ? parseFloat(r.ensraf_long) : undefined,
        checkInPhoto: r.hdoor_img_path ?? undefined,
        checkOutPhoto: r.ensraf_img_path ?? undefined,
        secondCheckInLat: r.second_hdoor_lat ? parseFloat(r.second_hdoor_lat) : undefined,
        secondCheckInLng: r.second_hdoor_long ? parseFloat(r.second_hdoor_long) : undefined,
        secondCheckOutLat: r.second_ensraf_lat ? parseFloat(r.second_ensraf_lat) : undefined,
        secondCheckOutLng: r.second_ensraf_long ? parseFloat(r.second_ensraf_long) : undefined,
        secondCheckInPhoto: r.second_hdoor_img_path ?? undefined,
        secondCheckOutPhoto: r.second_ensraf_img_path ?? undefined,
        workingSeconds: firstCompleted + secondCompleted + activeSeconds,
        isWorking,
      };
    });

    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      mapped = mapped.filter(
        (r) => r.employeeName?.toLowerCase().includes(s) || r.empCode?.includes(s),
      );
    }
    if (q.source && q.source !== 'all') {
      mapped = mapped.filter((r) => r.source === q.source);
    }
    if (q.status && q.status !== 'all') {
      mapped = mapped.filter((r) => r.status === q.status);
    }

    const total = mapped.length;
    const data = mapped.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  // -------------------------------------------------------------------------
  // RULES (now actually consumed by the check calc)
  // -------------------------------------------------------------------------
  private async getRulesMap(): Promise<
    Map<string, { enabled: boolean; threshold: number; graceMin: number; multiplier: number }>
  > {
    const rows = await this.prisma.attendance_rules.findMany();
    const map = new Map<
      string,
      { enabled: boolean; threshold: number; graceMin: number; multiplier: number }
    >();
    for (const r of rows) {
      map.set(r.key, {
        enabled: r.enabled === 1,
        threshold: r.threshold ? parseInt(r.threshold, 10) || 0 : 0,
        graceMin: r.grace_min ? parseInt(r.grace_min, 10) || 0 : 0,
        multiplier: r.multiplier ? parseFloat(r.multiplier) || 1 : 1,
      });
    }
    return map;
  }

  private async enabledChannels(): Promise<Set<string>> {
    const rows = await this.prisma.attendance_channels.findMany();
    const set = new Set<string>();
    for (const r of rows) if (r.enabled === 1) set.add(r.key);
    return set;
  }

  /**
   * Apply attendance_rules to a raw late value: late-rule grace (graceMin) is an
   * additional tolerance on top of the shift khasm threshold; if the (already
   * khasm-reduced) lateness is within grace, it is forgiven. Mirrors the intent
   * of the legacy 10-min tolerance / khasm grace.
   */
  private applyLateRule(
    rawLate: number,
    rules: Map<string, { enabled: boolean; graceMin: number }>,
  ): number {
    const rule = rules.get('late');
    if (!rule || !rule.enabled) return rawLate;
    const grace = rule.graceMin ?? 0;
    return rawLate > grace ? rawLate - grace : 0;
  }

  private applyEarlyRule(
    rawEarly: number,
    rules: Map<string, { enabled: boolean; graceMin: number }>,
  ): number {
    const rule = rules.get('early_leave');
    if (!rule || !rule.enabled) return rawEarly;
    const grace = rule.graceMin ?? 0;
    return rawEarly > grace ? rawEarly - grace : 0;
  }

  /**
   * Compute overtime minutes on departure: minutes worked past ensraf_khasm (the
   * legacy "احتساب الاضافى" threshold). Scaled by the overtime rule multiplier when
   * the overtime rule is enabled, and only counted once it exceeds the threshold.
   */
  private computeOvertime(
    actualOutMin: number,
    ensrafKhasm: number,
    rules: Map<string, { enabled: boolean; threshold: number; multiplier: number }>,
  ): number {
    let extra = actualOutMin - ensrafKhasm;
    if (extra <= 0) return 0;
    const rule = rules.get('overtime');
    if (rule && rule.enabled) {
      if (extra < rule.threshold) return 0;
      extra = Math.floor(extra * (rule.multiplier || 1));
    }
    return Math.floor(extra);
  }

  async getRules() {
    const rows = await this.prisma.attendance_rules.findMany({ orderBy: { id: 'asc' } });
    return rows.map((r) => ({
      key: r.key,
      enabled: r.enabled === 1,
      threshold: r.threshold ?? '',
      graceMin: r.grace_min ?? '',
      multiplier: r.multiplier ?? '1',
    }));
  }

  async patchRules(body: {
    rules?: Array<{
      key: string;
      enabled?: boolean;
      threshold?: string;
      graceMin?: string;
      multiplier?: string;
    }>;
  }) {
    const rules = Array.isArray(body.rules) ? body.rules : [];
    for (const r of rules) {
      const threshold = r.threshold != null && r.threshold !== ''
        ? String(parseStrictNumeric(r.threshold, 'العتبة', { min: 0 }))
        : '';
      const graceMin = r.graceMin != null && r.graceMin !== ''
        ? String(parseStrictNumeric(r.graceMin, 'فترة السماح', { min: 0 }))
        : '';
      const multiplier = r.multiplier != null && r.multiplier !== ''
        ? String(parseStrictNumeric(r.multiplier, 'المعامل', { min: 0 }))
        : '1';
      await this.prisma.attendance_rules.upsert({
        where: { key: r.key },
        create: {
          key: r.key,
          enabled: r.enabled ? 1 : 0,
          threshold,
          grace_min: graceMin,
          multiplier,
        },
        update: {
          enabled: r.enabled ? 1 : 0,
          threshold,
          grace_min: graceMin,
          multiplier,
        },
      });
    }
    return this.getRules();
  }

  // -------------------------------------------------------------------------
  // CHECK (faithful add_hdor_ensraf: dwam-window gate + late/early/overtime)
  // -------------------------------------------------------------------------
  async mobilePunch(
    user: JwtUser,
    body: { lat: string; long: string; photo?: string },
    capturedClock?: CapturedAttendanceClock,
  ) {
    if (user.emp_code == null) throw new ForbiddenException('الحساب غير مرتبط بموظف');
    const latitude = Number(body.lat);
    const longitude = Number(body.long);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('إحداثيات الموقع غير صحيحة');
    }

    // Legacy users.emp_code stores employees.id; attendance rows use the
    // employee business code, so resolve the employee before punching.
    const emp = await this.prisma.employees.findUnique({
      where: { id: user.emp_code },
      select: { id: true, emp_code: true, branch_id_fk: true, emp_sign: true },
    });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const distanceTo = (targetLatitude: number, targetLongitude: number) => {
      const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
      const latitudeDelta = toRadians(targetLatitude - latitude);
      const longitudeDelta = toRadians(targetLongitude - longitude);
      const a =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(latitude)) * Math.cos(toRadians(targetLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
      return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const fingerprintBranch = String(emp.emp_sign ?? '').trim().toLowerCase();
    const isAdministration = !fingerprintBranch;
    const isMultiLocation = isAdministration || fingerprintBranch === 'all';
    let branchId = 0;
    let branch: { branch_id: number; branch_name: string | null } | null = null;
    let geofence: { id: number; title: string; lat_map: string | null; long_map: string | null; distance: number } | null = null;

    if (isMultiLocation) {
      const geofences = await this.prisma.branch_settings.findMany();
      const valid = geofences
        .map((candidate) => {
          const candidateLatitude = Number(candidate.lat_map);
          const candidateLongitude = Number(candidate.long_map);
          const radius = Number(candidate.distance ?? 0);
          if (!Number.isFinite(candidateLatitude) || !Number.isFinite(candidateLongitude) || radius <= 0) return null;
          return {
            geofence: candidate,
            distanceMeters: distanceTo(candidateLatitude, candidateLongitude),
            radius,
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
        .filter((candidate) => candidate.distanceMeters <= candidate.radius)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);
      const nearest = valid[0];
      if (!nearest) {
        throw new BadRequestException('أنت خارج النطاق الجغرافي لفروع النعماني');
      }
      geofence = nearest.geofence;
      // branch_settings.id is its own primary key; it is not the canonical
      // tbl_branches.branch_id. The settings are linked to branches by title.
      branch = await this.prisma.tbl_branches.findFirst({
        where: { branch_name: nearest.geofence.title },
      });
      if (branch) branchId = branch.branch_id;
    } else {
      const selectedFingerprintBranch = Number(fingerprintBranch);
      if (!Number.isInteger(selectedFingerprintBranch) || selectedFingerprintBranch <= 0) {
        throw new BadRequestException('لا يوجد مكان بصمة مسجل لهذا الموظف، راجع الإدارة');
      }
      branchId = selectedFingerprintBranch;
      branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId } });
      geofence = branch?.branch_name
        ? await this.prisma.branch_settings.findFirst({ where: { title: branch.branch_name } })
        : null;
    }

    if (!branch) throw new BadRequestException('مكان البصمة غير موجود في إعدادات الفروع');

    const branchLatitude = Number(geofence?.lat_map);
    const branchLongitude = Number(geofence?.long_map);
    const radius = Number(geofence?.distance ?? 0);
    if (!geofence || !Number.isFinite(branchLatitude) || !Number.isFinite(branchLongitude) || radius <= 0) {
      throw new BadRequestException(`إحداثيات فرع "${branch.branch_name ?? geofence?.title ?? branchId}" غير مكتملة`);
    }

    const distanceMeters = distanceTo(branchLatitude, branchLongitude);
    if (distanceMeters > radius) {
      throw new BadRequestException(
        `أنت خارج النطاق الجغرافي المسموح به لفرع "${branch.branch_name ?? geofence.title}"، المسافة الحالية: ${Math.round(distanceMeters)} متر`,
      );
    }

    const result = await this.manualCheck(
      {
        empCode: String(emp.emp_code ?? emp.id),
        lat: body.lat,
        long: body.long,
        photo: body.photo,
        channel: 'app',
      },
      user.sub,
      branchId,
      capturedClock,
      isAdministration ? 0 : branchId,
    );
    return {
      ...result,
      branchId,
      branchName: branch.branch_name ?? geofence.title,
      distanceMeters: Math.round(distanceMeters),
    };
  }

  /**
   * Safely replays one employee-app punch captured while the device was offline.
   * The device clock is bounded and audited; the existing attendance engine still
   * decides whether it is an arrival or departure and applies all shift rules.
   */
  async syncOfflinePunch(
    user: JwtUser,
    dto: {
      offlineId: string;
      capturedAtUtc: string;
      timezone: string;
      lat: string;
      long: string;
      photo?: string;
    },
    receivedAt = new Date(),
  ) {
    const clock = resolveOfflinePunchClock(dto.capturedAtUtc, dto.timezone, receivedAt);
    const payloadHash = createHash('sha256').update(JSON.stringify({
      capturedAtUtc: dto.capturedAtUtc,
      timezone: dto.timezone,
      lat: dto.lat,
      long: dto.long,
      photo: dto.photo ?? null,
    })).digest('hex');
    const where = {
      user_id_offline_id: {
        user_id: user.sub,
        offline_id: dto.offlineId,
      },
    };
    const existing = await this.prisma.mobile_offline_attendance_sync.findUnique({ where });
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throw new ConflictException('معرّف البصمة المؤجلة مستخدم مع بيانات مختلفة');
      }
      if (existing.state !== 'completed' || !existing.result_json || typeof existing.result_json !== 'object' || Array.isArray(existing.result_json)) {
        throw new BadRequestException('مزامنة هذه البصمة ما زالت قيد التنفيذ، أعد المحاولة بعد لحظات');
      }
      return { ...(existing.result_json as Record<string, unknown>), replayed: true };
    }

    const reservation = await this.prisma.mobile_offline_attendance_sync.create({
      data: {
        user_id: user.sub,
        offline_id: dto.offlineId,
        payload_hash: payloadHash,
        captured_at_device: clock.capturedAt,
        captured_timezone: dto.timezone,
        received_at_server: clock.receivedAt,
        state: 'pending',
      },
    });

    try {
      const result = await this.mobilePunch(
        user,
        { lat: dto.lat, long: dto.long, photo: dto.photo },
        { actionDate: clock.actionDate, time: clock.time },
      );
      const response = {
        ...result,
        offlineId: dto.offlineId,
        capturedAtDevice: clock.capturedAt.toISOString(),
        receivedAtServer: clock.receivedAt.toISOString(),
        requiresReview: true,
        replayed: false,
      };
      await this.prisma.mobile_offline_attendance_sync.update({
        where: { id: reservation.id },
        data: {
          attendance_id: result.id,
          result_json: response as Prisma.InputJsonValue,
          state: 'completed',
          completed_at: clock.receivedAt,
        },
      });
      return response;
    } catch (error) {
      await this.prisma.mobile_offline_attendance_sync.delete({ where: { id: reservation.id } });
      throw error;
    }
  }

  private async manualEmployeeScope(user: JwtUser, requestedBranch?: string) {
    const requested = requestedBranch && requestedBranch !== 'all' ? Number(requestedBranch) : undefined;
    if (requestedBranch && requestedBranch !== 'all' && (!Number.isInteger(requested) || Number(requested) <= 0)) {
      throw new BadRequestException('الفرع المحدد غير صحيح');
    }

    if (user.level === 1) {
      return {
        branchId: requested,
        where: requested ? ({ branch_id_fk: requested } satisfies Prisma.employeesWhereInput) : {},
      };
    }

    const branchId = Number(user.branch ?? 0);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new ForbiddenException('لا يوجد فرع مرتبط بحسابك');
    }
    if (requested && requested !== branchId) {
      throw new ForbiddenException('لا يمكنك تسجيل حضور موظف من فرع آخر');
    }

    if (user.level === 2) {
      if (!user.emp_code) throw new ForbiddenException('لا يوجد موظف مرتبط بحسابك');
      return {
        branchId,
        where: {
          branch_id_fk: branchId,
          OR: [{ id: user.emp_code }, { manger: String(user.emp_code) }],
        } satisfies Prisma.employeesWhereInput,
      };
    }

    return {
      branchId,
      where: { branch_id_fk: branchId } satisfies Prisma.employeesWhereInput,
    };
  }

  async manualOptions(user: JwtUser, requestedBranch?: string) {
    const scope = await this.manualEmployeeScope(user, requestedBranch);
    const audienceEmployeeType = user.level === 1
      ? null
      : user.man_women_type === 0
        ? 1
        : user.man_women_type === 1
          ? 2
          : (() => { throw new ForbiddenException('نطاق القسم غير مضبوط لهذا المستخدم'); })();
    const employees = await this.prisma.employees.findMany({
      where: {
        ...scope.where,
        employee_type: 1,
        ...(audienceEmployeeType != null ? { emp_type: audienceEmployeeType } : {}),
        AND: [{ OR: [{ leave_emp: null }, { leave_emp: 0 }] }],
      },
      select: {
        id: true,
        emp_code: true,
        employee: true,
        branch_id_fk: true,
        edara_n: true,
        qsm_n: true,
      },
      orderBy: [{ employee: 'asc' }, { emp_code: 'asc' }],
    });
    return {
      branchId: scope.branchId ?? null,
      branchLocked: user.level !== 1,
      employees: employees.map((employee) => ({
        id: employee.id,
        empCode: employee.emp_code,
        name: employee.employee,
        branchId: employee.branch_id_fk,
        department: employee.edara_n,
        section: employee.qsm_n,
      })),
    };
  }

  /** Scan is preview-only. A separate explicit POST /attendance/check performs the punch. */
  async barcodePreviewForUser(empCode: string, user: JwtUser, requestedBranch?: string) {
    const code = parseEmployeeCode(empCode);
    const options = await this.manualOptions(user, requestedBranch);
    const employee = options.employees.find((item) => item.empCode === code);
    if (!employee) throw new ForbiddenException('الموظف غير تابع للفرع أو خارج نطاق صلاحياتك');
    const today = todayIso();
    const yesterdayDate = new Date(`${today}T12:00:00.000Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const [recent, attendanceRows] = await Promise.all([
      this.prisma.tbl_hdoor_emps_history.findMany({
        where: { member_code: code }, orderBy: { hodoor_id: 'desc' }, take: 10,
        select: { hodoor_id: true, action_date: true, action_date_s: true, action_time: true, hdoor_ensraf_time: true, ttype: true },
      }),
      this.prisma.tbl_hdoor_emps.findMany({
        where: {
          member_code: code,
          action_date_s: { in: [...legacyDateMatchValues(today), ...legacyDateMatchValues(yesterday)] },
        },
        orderBy: { hodoor_id: 'desc' },
        select: { hodoor_id: true, action_date_s: true, hdoor_time: true, ensraf_time: true },
      }),
    ]);
    const hasOpenAttendance = attendanceRows.some((row) => Boolean(row.hdoor_time) && !row.ensraf_time);
    const nextAction = hasOpenAttendance ? 'out' : 'in';
    return {
      employee,
      branchId: options.branchId ?? employee.branchId ?? null,
      nextAction,
      nextActionLabel: nextAction === 'in' ? 'تأكيد الدخول' : 'تأكيد الخروج',
      recentPunches: recent.map((row) => ({
        id: row.hodoor_id,
        date: row.action_date_s ?? row.action_date,
        time: row.action_time,
        action: /^(ensraf|out)$/i.test(String(row.ttype ?? ''))
          ? 'خروج'
          : /^(hdoor|in)$/i.test(String(row.ttype ?? ''))
            ? 'دخول'
            : 'بصمة',
      })),
    };
  }

  /** Dedicated scanner punch: direction is always server-derived; browser input cannot force it. */
  async barcodePunchForUser(body: Pick<CheckPunchDto, 'empCode' | 'branchId'>, user: JwtUser) {
    return this.manualCheckForUser({ empCode: body.empCode, branchId: body.branchId, channel: 'qr' }, user);
  }

  async manualCheckForUser(body: CheckPunchDto, user: JwtUser) {
    const options = await this.manualOptions(user, body.branchId);
    const code = parseEmployeeCode(body.empCode);
    const employee = options.employees.find((item) => item.empCode === code);
    if (!employee) throw new ForbiddenException('الموظف غير تابع للفرع أو خارج نطاق صلاحياتك');
    return this.manualCheck(body, user.sub, options.branchId ?? employee.branchId ?? undefined);
  }

  async manualCheck(
    body: CheckPunchDto,
    userId = 1,
    branchIdOverride?: number,
    capturedClock?: CapturedAttendanceClock,
    scheduleBranchScope?: number,
  ) {
    const code = parseEmployeeCode(body.empCode);
    if (this.punchLocks.has(code)) {
      throw new BadRequestException('يوجد طلب بصمة آخر قيد التنفيذ، حاول مرة أخرى بعد لحظات');
    }
    this.punchLocks.add(code);
    const requestId = `basma_${randomUUID()}`;
    try {
      // Keep the legacy MySQL named lock and the main/history writes on one pinned
      // Prisma connection. The in-process Set remains a cheap first line of defence.
      return await this.prisma.$transaction(async (tx) => {
        const lockName = `basma_${createHash('sha1').update(String(code)).digest('hex')}`;
        const lockRows = await tx.$queryRaw<Array<{ acquired: number | bigint | null }>>(
          Prisma.sql`SELECT GET_LOCK(${lockName}, 5) AS acquired`,
        );
        if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
          this.logPunchDecision(requestId, code, branchIdOverride, 'lock_timeout');
          throw new BadRequestException('يوجد طلب بصمة آخر قيد التنفيذ، حاول مرة أخرى بعد لحظات');
        }
        try {
          return await this.performCheck(
            body,
            userId,
            branchIdOverride,
            code,
            tx,
            requestId,
            capturedClock,
            scheduleBranchScope,
          );
        } finally {
          await tx.$queryRaw(Prisma.sql`SELECT RELEASE_LOCK(${lockName})`);
        }
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'تعذر تسجيل البصمة';
      this.logPunchDecision(requestId, code, branchIdOverride, 'error', { errorMessage });
      if (error instanceof HttpException) throw error;
      this.logger.error(`BASMA_UNEXPECTED ${JSON.stringify({ request_id: requestId, member_code: String(code), branch_id: branchIdOverride ?? 0 })}`,
        error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('تعذر تسجيل البصمة الآن، حاول مرة أخرى');
    } finally {
      this.punchLocks.delete(code);
    }
  }

  private logPunchDecision(
    requestId: string,
    code: number,
    branchId: number | undefined,
    status: string,
    context: { detectedAction?: string; hodoorId?: number; errorMessage?: string } = {},
  ) {
    // Deliberately exclude coordinates and image paths from logs.
    this.logger.log(`BASMA_DECISION ${JSON.stringify({
      request_id: requestId,
      member_code: String(code),
      branch_id: branchId ?? 0,
      status,
      ...(context.detectedAction ? { detected_action: context.detectedAction } : {}),
      ...(context.hodoorId ? { hodoor_id: context.hodoorId } : {}),
      ...(context.errorMessage ? { error_message: context.errorMessage } : {}),
    })}`);
  }

  private async performCheck(
    body: CheckPunchDto,
    userId: number,
    branchIdOverride: number | undefined,
    code: number,
    db: Prisma.TransactionClient = this.prisma,
    requestId = `basma_${randomUUID()}`,
    capturedClock?: CapturedAttendanceClock,
    scheduleBranchScope?: number,
  ) {
    const employeeSelect = { id: true, emp_code: true, branch_id_fk: true, emp_sign: true } as const;
    let emp = await db.employees.findFirst({ where: { emp_code: code }, select: employeeSelect });
    if (!emp) {
      emp = await db.employees.findFirst({ where: { id: code }, select: employeeSelect });
    }
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    // --- channel gate (attendance_channels) ---
    const channel = body.channel ?? 'app';
    const channels = await this.enabledChannels();
    if (channels.size > 0 && !channels.has(channel)) {
      throw new BadRequestException('قناة التسجيل غير مفعّلة');
    }
    const tasgelType = channel === 'device' ? 'automatic' : 'manual';
    const photoPath = body.photo?.trim() || DEFAULT_ATTENDANCE_PHOTO;

    // Resolve the shift window only from the new employee-to-shift assignments.
    type ShiftRow = {
      id: number;
      title: string | null;
      hdoor_from_time: string | null;
      hdoor_to_time: string | null;
      hdoor_khasm_from: string | null;
      ensraf_from_time: string | null;
      ensraf_to_time: string | null;
      ensraf_khasm_from: string | null;
    };
    const clockBranchId = branchIdOverride ?? emp.branch_id_fk ?? 0;
    const assignmentBranchScope = scheduleBranchScope ?? clockBranchId;
    const assignmentMatchesScheduleScope = (branchId: string | null, scope: number) => {
      const assignedBranch = String(branchId ?? '').trim().toLowerCase();
      if (scope === 0) return assignedBranch === 'all';
      return assignedBranch === 'all' || Number(assignedBranch) === scope;
    };
    const assignments = await db.tbl_hdoor_dawms_emps.findMany({
      where: { OR: [{ emp_code_fk: code }, { emp_id_fk: emp.id }] },
      orderBy: { id: 'asc' },
    });
    const assignedIds = [...new Set(assignments
      .filter((row) => assignmentMatchesScheduleScope(row.branch_id_fk, assignmentBranchScope))
      .map((row) => row.dwam_id_fk)
      .filter((id): id is number => Boolean(id)))];
    const mainShifts: ShiftRow[] = assignedIds.length
      ? await db.tbl_hdodr_setting.findMany({ where: { id: { in: assignedIds } } })
      : [];
    if (!mainShifts.length) {
      throw new BadRequestException('لا يوجد دوام مسجل لهذا الموظف في موقع البصمة');
    }

    const explicitTime = capturedClock?.time ?? (body.type === 'out' ? body.checkOut : body.checkIn);
    const punchMin = explicitTime ? parseTimeToMinutes(explicitTime) : nowMinutes();
    const currentTimeStr = formatMinutesAsTime(punchMin);

    if (!explicitTime) {
      const last = await db.tbl_hdoor_emps_history.findFirst({
        where: { member_code: code },
        orderBy: { hodoor_id: 'desc' },
      });
      if (last?.action_date && last.action_time) {
        const lastDate = last.action_date.slice(0, 10);
        const now = new Date();
        const lastAt = new Date(`${lastDate}T00:00:00`);
        lastAt.setMinutes(parseTimeToMinutes(last.action_time));
        const diffSeconds = Math.floor((now.getTime() - lastAt.getTime()) / 1000);
        if (diffSeconds >= 0 && diffSeconds < 45) {
          this.logPunchDecision(requestId, code, branchIdOverride, 'duplicate_45_seconds');
          throw new BadRequestException('تم استلام بصمتك بالفعل، برجاء الانتظار قليلاً قبل إعادة المحاولة');
        }
      }
    }

    // --- auto-detect direction across main/replacement/extra shift windows ---
    const inWindow = (val: number, from: number, to: number) => {
      // window may straddle midnight (to > 1440); also test val+1440.
      return (val >= from && val <= to) || (val + 1440 >= from && val + 1440 <= to);
    };
    type ShiftCandidate = {
      shift: ShiftRow;
      recordDwamId: number;
      date: string;
      source: 'main' | 'replacement' | 'extra';
    };

    const today = capturedClock?.actionDate ?? todayIso();
    const yesterdayValue = new Date(today + 'T12:00:00');
    yesterdayValue.setDate(yesterdayValue.getDate() - 1);
    const yesterday = yesterdayValue.toISOString().slice(0, 10);
    const toDmy = (iso: string) => {
      const [year, month, day] = iso.split('-');
      return `${day}/${month}/${year}`;
    };

    const buildCandidates = async (date: string): Promise<ShiftCandidate[]> => {
      const special = await db.tbl_emps_shef_edafi.findMany({
        where: { emp_code_fk: code, sheft_date: { in: [date, toDmy(date)] } },
        orderBy: { id: 'desc' },
      });
      const filtered = special.filter((row) => {
        if (!clockBranchId || !row.branch_id_fk || row.branch_id_fk === clockBranchId) return true;
        return false;
      });
      const replacement = filtered.find((row) => row.ttype === 1);
      const extras = filtered.filter((row) => row.ttype === 2);
      const ids = [
        ...(replacement ? [replacement.dwam_id_fk] : []),
        ...extras.map((row) => row.dwam_id_fk),
      ];
      const specialShifts = ids.length
        ? await db.tbl_hdodr_setting.findMany({ where: { id: { in: ids } } })
        : [];
      const byId = new Map(specialShifts.map((row) => [row.id, row]));
      const candidates: ShiftCandidate[] = [];
      if (replacement) {
        const row = byId.get(replacement.dwam_id_fk);
        if (row) candidates.push({ shift: row, recordDwamId: row.id, date, source: 'replacement' });
      } else {
        for (const normal of mainShifts) {
          candidates.push({
            shift: normal,
            recordDwamId: normal.id,
            date,
            source: 'main',
          });
        }
      }
      for (const extra of extras) {
        const row = byId.get(extra.dwam_id_fk);
        if (row && !candidates.some((item) => item.recordDwamId === row.id)) {
          candidates.push({ shift: row, recordDwamId: row.id, date, source: 'extra' });
        }
      }
      return candidates;
    };

    const [todayCandidates, yesterdayCandidates] = await Promise.all([
      buildCandidates(today),
      buildCandidates(yesterday),
    ]);
    const allCandidates = [...todayCandidates, ...yesterdayCandidates];
    for (const candidate of allCandidates) {
      assertShiftTimingIsComplete(candidate.shift);
    }
    const recentRows = await db.tbl_hdoor_emps.findMany({
      where: {
        member_code: code,
        action_date_s: {
          in: [...legacyDateMatchValues(today), ...legacyDateMatchValues(yesterday)],
        },
      },
      orderBy: { hodoor_id: 'desc' },
    });
    const openRow = recentRows.find((row) => row.hdoor_time && !row.ensraf_time);
    let candidate: ShiftCandidate | undefined;
    let detected: 'in' | 'out' | null = null;

    // An open attendance row always takes priority. It is either closed against
    // its own shift or blocks a new arrival; this prevents concurrent open rows.
    if (openRow) {
      const openCandidates: Array<{
        candidate: ShiftCandidate;
        window: ShiftWindow;
        punchForShift: number;
        elapsed: number;
      }> = [];
      for (const row of recentRows.filter((item) => item.hdoor_time && !item.ensraf_time)) {
        let openCandidate = allCandidates.find(
          (item) =>
            item.recordDwamId === row.dwam_id_fk &&
            legacyDateMatchValues(item.date).includes(row.action_date_s ?? ''),
        );
        if (!openCandidate) {
          const savedShift = await db.tbl_hdodr_setting.findUnique({ where: { id: row.dwam_id_fk } });
          if (savedShift) {
            const savedDate = row.action_date_s;
            openCandidate = {
              shift: savedShift,
              recordDwamId: savedShift.id,
              date: savedDate && /^\d{4}-\d{2}-\d{2}/.test(savedDate)
                ? savedDate.slice(0, 10)
                : yesterday,
              source: row.sheft_type === 2 ? 'extra' : row.sheft_type === 1 ? 'replacement' : 'main',
            };
          }
        }
        if (!openCandidate) continue;
        assertShiftTimingIsComplete(openCandidate.shift);
        const window = buildShiftWindow(openCandidate.shift);
        let punchForShift = punchMin;
        if (openCandidate.date === yesterday || punchForShift < window.hdoorFrom) punchForShift += 1440;
        let elapsed = punchForShift - parseTimeToMinutes(row.hdoor_time ?? '');
        if (elapsed < 0) elapsed += 1440;
        openCandidates.push({ candidate: openCandidate, window, punchForShift, elapsed });
      }

      const hasNewArrivalWaiting = todayCandidates.some((item) => {
        const window = buildShiftWindow(item.shift);
        return inWindow(punchMin, window.hdoorFrom - 60, window.hdoorTo);
      });
      const closeable = openCandidates.filter(({ window, punchForShift, elapsed }) => {
        const withinCheckoutAllowance = punchForShift >= window.hdoorFrom && punchForShift <= window.ensrafTo + 8 * 60;
        const staleWithinOneDay =
          elapsed >= 60 && elapsed <= 24 * 60 && punchForShift > window.ensrafTo + 8 * 60 && !hasNewArrivalWaiting;
        return withinCheckoutAllowance || staleWithinOneDay;
      });
      if (closeable.length) {
        const selected = closeable.sort(
          (a, b) =>
            Math.abs(a.punchForShift - a.window.ensrafKhasm) - Math.abs(b.punchForShift - b.window.ensrafKhasm),
        )[0];
        candidate = selected.candidate;
        detected = 'out';
      } else {
        this.logPunchDecision(requestId, code, branchIdOverride, 'rejected', {
          errorMessage: 'لديك حضور مفتوح يجب تسجيل انصرافه أو مراجعة الإدارة أولاً',
        });
        throw new BadRequestException('لديك حضور مفتوح يجب تسجيل انصرافه أو مراجعة الإدارة أولاً');
      }
    }

    if (!detected) {
      const pool = body.type === 'out' ? allCandidates : todayCandidates;
      const options = pool
        .map((item) => ({ item, window: buildShiftWindow(item.shift) }))
        .filter(({ window }) => {
          if (body.type === 'in') return true;
          if (body.type === 'out') {
            return inWindow(punchMin, window.ensrafFrom, window.ensrafTo + 8 * 60);
          }
          return inWindow(punchMin, window.hdoorFrom - 60, window.hdoorTo);
        })
        .sort((a, b) => {
          const aRef = body.type === 'out' ? a.window.ensrafKhasm : a.window.hdoorKhasm;
          const bRef = body.type === 'out' ? b.window.ensrafKhasm : b.window.hdoorKhasm;
          return Math.abs(punchMin - aRef) - Math.abs(punchMin - bRef);
        });
      if (options.length) {
        candidate = options[0].item;
        detected = body.type ?? 'in';
      }
    }

    // Legacy mobile allows a checkout-only row when the arrival punch was missed.
    if (!detected && !body.type) {
      const departure = allCandidates
        .map((item) => ({ item, window: buildShiftWindow(item.shift) }))
        .filter(({ window }) => inWindow(punchMin, window.hdoorFrom + 60, window.ensrafTo + 8 * 60))
        .sort((a, b) => Math.abs(punchMin - a.window.ensrafKhasm) - Math.abs(punchMin - b.window.ensrafKhasm))[0];
      if (departure) {
        candidate = departure.item;
        detected = 'out';
      }
    }

    candidate ??= todayCandidates[0];
    const shift = candidate.shift;
    const win = buildShiftWindow(shift);
    const date = candidate.date;
    const matches = legacyDateMatchValues(date);
    const existing = await db.tbl_hdoor_emps.findFirst({
      where: {
        member_code: code,
        action_date_s: { in: matches },
        dwam_id_fk: candidate.recordDwamId,
      },
      orderBy: { hodoor_id: 'desc' },
    });

    if (!detected) {
      this.logPunchDecision(requestId, code, branchIdOverride, 'rejected', {
        errorMessage: 'خارج نطاق أي دوام متاح حالياً للموظف',
      });
      throw new BadRequestException('خارج نطاق أي دوام متاح حالياً للموظف');
    }

    if (detected === 'out') {
      let punchForShift = punchMin;
      if (punchForShift < win.hdoorFrom) punchForShift += 1440;
      if (punchForShift < win.ensrafFrom) {
        const permissionDates = [...new Set([date, today])];
        const permissions = await db.hr_all_ozonat_orders.findMany({
          where: { emp_code_fk: code, suspend: { in: [1, 4] } },
          orderBy: { id: 'desc' },
        });
        const approved = permissions.some((permission) => {
          const rawDate = permission.ezn_date_ar || permission.ezn_date || '';
          let permissionDate = rawDate.slice(0, 10);
          if (/^\d{8,10}$/.test(rawDate)) {
            permissionDate = new Date(Number(rawDate) * 1000).toISOString().slice(0, 10);
          } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate)) {
            const [d, m, y] = rawDate.split('/');
            permissionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          if (!permissionDates.includes(permissionDate) || !permission.from_hour || !permission.to_hour) return false;
          const from = parseTimeToMinutes(permission.from_hour);
          let to = parseTimeToMinutes(permission.to_hour);
          let at = punchMin;
          if (to < from) to += 1440;
          if (at < from && to > 1440) at += 1440;
          return at >= from && at <= to;
        });
        if (!approved) {
          const remaining = Math.max(0, Math.ceil(win.ensrafFrom - punchForShift));
          throw new BadRequestException(
            `لا يمكن تسجيل الانصراف الآن بدون إذن معتمد؛ ما زال متبقيًا على موعد بداية الانصراف ${remaining} دقيقة`,
          );
        }
      }
    }

    // --- duplicate guards (step 4) ---
    if (existing) {
      if (detected === 'in' && existing.hdoor_time) {
        throw new BadRequestException('لقد سجلت حضورك بالفعل، انتظر ساعة على الأقل لتسجيل انصراف');
      }
      if (detected === 'out' && existing.ensraf_time) {
        throw new BadRequestException('لقد قمت بتسجيل الانصراف مسبقاً لهذا اليوم');
      }
    }

    const rules = await this.getRulesMap();
    const expectedHdoor = formatMinutesAsTime(win.hdoorFrom);
    const expectedEnsraf = formatMinutesAsTime(win.ensrafKhasm % 1440);

    let row = existing;
    if (!row) {
      row = await db.tbl_hdoor_emps.create({
        data: {
          member_code: code,
          member_id: emp.id,
          action_date_s: date,
          action_date: date,
          for_month: Number(date.slice(5, 7)),
          for_year: Number(date.slice(0, 4)),
          sheft_type: candidate.source === 'replacement' ? 1 : candidate.source === 'extra' ? 2 : 0,
          branch_id_fk: branchIdOverride ?? emp.branch_id_fk ?? 0,
          dwam_id_fk: candidate.recordDwamId,
          tasgel_type: tasgelType,
        },
      });
    }

    if (detected === 'out') {
      // early-leave vs ensraf_khasm (calculate_early_minutes / sum_min_mobaker)
      const earlyRaw = sumMinMobaker(expectedEnsraf, currentTimeStr);
      const mobakerMin = this.applyEarlyRule(earlyRaw, rules);
      const overtime = this.computeOvertime(
        punchMin < win.hdoorFrom ? punchMin + 1440 : punchMin,
        win.ensrafKhasm,
        rules,
      );
      const checkoutUpdate = await db.tbl_hdoor_emps.updateMany({
        where: { hodoor_id: row.hodoor_id, ensraf_time: null },
        data: {
          ensraf_time: currentTimeStr,
          dwam_ensraf_time: expectedEnsraf,
          mobaker_min: mobakerMin,
          num_min: overtime,
          ensraf_user_id: userId,
          ensraf_lat: body.lat ?? row.ensraf_lat,
          ensraf_long: body.long ?? row.ensraf_long,
          ensraf_img_path: photoPath,
          ttype: 'ensraf',
          tasgel_type: tasgelType,
        },
      });
      if (checkoutUpdate.count !== 1) {
        throw new BadRequestException('لقد قمت بتسجيل الانصراف مسبقاً لهذا اليوم');
      }
      await db.tbl_hdoor_emps_history.create({ data: {
        member_code: code, member_id: emp.id, action_date: today, action_date_s: today,
        action_time: currentTimeStr, hdoor_ensraf_time: currentTimeStr, ttype: 'ensraf',
        setting_time: expectedEnsraf, img_path: photoPath, m_lat: body.lat, m_long: body.long,
      } });
      this.logPunchDecision(requestId, code, branchIdOverride, 'success', { detectedAction: 'ensraf', hodoorId: row.hodoor_id });
      return { id: row.hodoor_id, type: 'out', mobakerMin, overtimeMin: overtime };
    }

    // check-in: late vs khasm (calculate_late_minutes), then late-rule grace
    const lateRaw = sumMinLate(formatMinutesAsTime(win.hdoorKhasm % 1440), currentTimeStr);
    const lateMin = this.applyLateRule(lateRaw, rules);
    await db.tbl_hdoor_emps.update({
      where: { hodoor_id: row.hodoor_id },
      data: {
        hdoor_time: currentTimeStr,
        dwam_hdoor_time: expectedHdoor,
        late_min: lateMin,
        hdoor_user_id: userId,
        hdoor_lat: body.lat ?? row.hdoor_lat,
        hdoor_long: body.long ?? row.hdoor_long,
        hdoor_img_path: photoPath,
        ttype: 'hdoor',
        tasgel_type: tasgelType,
      },
    });
    await db.tbl_hdoor_emps_history.create({ data: {
      member_code: code, member_id: emp.id, action_date: today, action_date_s: today,
      action_time: currentTimeStr, hdoor_ensraf_time: currentTimeStr, ttype: 'hdoor',
      setting_time: formatMinutesAsTime(win.hdoorKhasm % 1440), img_path: photoPath,
      m_lat: body.lat, m_long: body.long,
    } });
    this.logPunchDecision(requestId, code, branchIdOverride, 'success', { detectedAction: 'hdoor', hodoorId: row.hodoor_id });
    return { id: row.hodoor_id, type: 'in', lateMin };
  }

  // -------------------------------------------------------------------------
  // SHIFT CRUD (tbl_hdodr_setting — all 7 fields)
  // -------------------------------------------------------------------------
  async listShifts(q: PaginationDto) {
    const where: Prisma.tbl_hdodr_settingWhereInput = {};
    if (q.search?.trim()) {
      where.title = { contains: q.search.trim() };
    }
    const [rows, total] = await Promise.all([
      this.prisma.tbl_hdodr_setting.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_hdodr_setting.count({ where }),
    ]);
    const data = rows.map((r) => this.mapShift(r));
    return paginated(data, total, q.page, q.pageSize);
  }

  private mapShift(r: {
    id: number;
    title: string | null;
    hdoor_from_time: string | null;
    hdoor_to_time: string | null;
    hdoor_khasm_from: string | null;
    ensraf_from_time: string | null;
    ensraf_to_time: string | null;
    ensraf_khasm_from: string | null;
  }) {
    return {
      id: r.id,
      title: r.title ?? undefined,
      hdoorFromTime: r.hdoor_from_time ?? undefined,
      hdoorToTime: r.hdoor_to_time ?? undefined,
      hdoorKhasmFrom: r.hdoor_khasm_from ?? undefined,
      ensrafFromTime: r.ensraf_from_time ?? undefined,
      ensrafToTime: r.ensraf_to_time ?? undefined,
      ensrafKhasmFrom: r.ensraf_khasm_from ?? undefined,
      // legacy-compatible aliases kept for the existing board/grid consumers
      startTime: r.hdoor_from_time ?? undefined,
      endTime: r.ensraf_to_time ?? undefined,
      graceMin: r.hdoor_khasm_from ? parseInt(r.hdoor_khasm_from, 10) || 0 : 0,
    };
  }

  /** Normalise a free-form time to legacy "h:i A" (date("h:i A", strtotime(...))). */
  private toLegacyTime(raw: string, fallback: string): string {
    const v = (raw ?? '').trim();
    if (!v) return fallback;
    return formatMinutesAsTime(parseTimeToMinutes(v));
  }

  private shiftData(dto: UpsertShiftDto) {
    if (dto.hdoorFromTime && dto.hdoorToTime) {
      assertTimeOrder(dto.hdoorFromTime, dto.hdoorToTime, 'نافذة الحضور: البداية يجب أن تسبق النهاية');
    }
    if (dto.ensrafFromTime && dto.ensrafToTime) {
      assertTimeOrder(dto.ensrafFromTime, dto.ensrafToTime, 'نافذة الانصراف: البداية يجب أن تسبق النهاية');
    }
    return {
      title: dto.title?.trim() || 'الدوام الصباحي',
      hdoor_from_time: this.toLegacyTime(dto.hdoorFromTime, '08:00 AM'),
      hdoor_to_time: this.toLegacyTime(dto.hdoorToTime, '09:00 AM'),
      hdoor_khasm_from: this.toLegacyTime(dto.hdoorKhasmFrom, '08:15 AM'),
      ensraf_from_time: this.toLegacyTime(dto.ensrafFromTime, '11:00 AM'),
      ensraf_to_time: this.toLegacyTime(dto.ensrafToTime, '06:00 PM'),
      ensraf_khasm_from: this.toLegacyTime(dto.ensrafKhasmFrom, '12:40 PM'),
    };
  }

  async createShift(dto: UpsertShiftDto) {
    const row = await this.prisma.tbl_hdodr_setting.create({ data: this.shiftData(dto) });
    return this.mapShift(row);
  }

  async updateShift(id: number, dto: UpsertShiftDto) {
    const exist = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id } });
    if (!exist) throw new NotFoundException('الوردية غير موجودة');
    const row = await this.prisma.tbl_hdodr_setting.update({
      where: { id },
      data: this.shiftData(dto),
    });
    return this.mapShift(row);
  }

  async removeShift(id: number) {
    const row = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الوردية غير موجودة');
    await this.prisma.tbl_hdodr_setting.delete({ where: { id } });
    return { id };
  }

  // -------------------------------------------------------------------------
  // SETTINGS / CHANNELS
  // -------------------------------------------------------------------------
  async getSettings() {
    const rows = await this.prisma.attendance_channels.findMany();
    const channels: Record<string, boolean> = {};
    for (const r of rows) channels[r.key] = r.enabled === 1;
    return { channels };
  }

  async patchSettings(body: { channels?: Record<string, boolean> }) {
    const channels = body.channels ?? {};
    for (const [key, enabled] of Object.entries(channels)) {
      await this.prisma.attendance_channels.upsert({
        where: { key },
        create: { key, enabled: enabled ? 1 : 0 },
        update: { enabled: enabled ? 1 : 0 },
      });
    }
    return this.getSettings();
  }

  // -------------------------------------------------------------------------
  // DEVICES
  // -------------------------------------------------------------------------
  async listDevices(q: PaginationDto) {
    const where: Prisma.attendance_devicesWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ title: { contains: s } }, { ip: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.attendance_devices.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.attendance_devices.count({ where }),
    ]);
    const branchIds = [...new Set(rows.map((r) => r.branch_id_fk).filter(Boolean))] as number[];
    const branches = await this.prisma.tbl_branches.findMany({
      where: { branch_id: { in: branchIds } },
    });
    const branchMap = new Map(branches.map((b) => [b.branch_id, b.branch_name]));
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title ?? undefined,
      ip: r.ip ?? undefined,
      branchTitle: r.branch_id_fk ? (branchMap.get(r.branch_id_fk) ?? undefined) : undefined,
      lastSync: r.last_sync ?? undefined,
      status: r.status ?? 'offline',
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async createDevice(body: { title?: string; ip?: string; branchId?: number }) {
    const now = new Date().toISOString();
    const row = await this.prisma.attendance_devices.create({
      data: {
        title: body.title ?? '',
        ip: body.ip ?? '',
        branch_id_fk: body.branchId ?? null,
        status: 'offline',
        created_at: now,
        updated_at: now,
      },
    });
    return { id: row.id };
  }

  async removeDevice(id: number) {
    const row = await this.prisma.attendance_devices.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الجهاز غير موجود');
    await this.prisma.attendance_devices.delete({ where: { id } });
    return { id };
  }

  async syncDevice(id: number) {
    const row = await this.prisma.attendance_devices.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الجهاز غير موجود');
    if (!row.ip?.trim()) {
      throw new BadRequestException('لا يمكن المزامنة — عنوان IP غير مُعرَّف');
    }
    // Honest sync: attempt TCP reachability; only mark online when device responds.
    let reachable = false;
    try {
      const net = await import('net');
      reachable = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: row.ip!.trim(), port: 4370, timeout: 3000 }, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
      });
    } catch {
      reachable = false;
    }
    const now = new Date().toISOString();
    const status = reachable ? 'online' : 'offline';
    await this.prisma.attendance_devices.update({
      where: { id },
      data: {
        last_sync: reachable ? now : row.last_sync,
        status,
        updated_at: now,
      },
    });
    if (!reachable) {
      throw new BadRequestException('فشل الاتصال بجهاز البصمة — تحقق من IP والشبكة');
    }
    return { id, lastSync: now, status };
  }

  async syncAllDevices() {
    const devices = await this.prisma.attendance_devices.findMany();
    let synced = 0;
    let failed = 0;
    for (const d of devices) {
      try {
        await this.syncDevice(d.id);
        synced += 1;
      } catch {
        failed += 1;
      }
    }
    return { synced, failed, total: devices.length };
  }

  // -------------------------------------------------------------------------
  // SHIFT SWAP / EXTRA SHIFT (tbl_emps_shef_edafi) — Api::add_sheft_edafi
  // -------------------------------------------------------------------------
  private async assertCanManageEdafiEmployee(
    targetEmployee: { manger: string | null },
    userId: number,
  ) {
    const account = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { emp_code: true },
    });
    if (account?.emp_code == null) throw new ForbiddenException(this.edafiForbiddenMessage);

    // Legacy users.emp_code may point to employees.id or employees.emp_code.
    const actorEmployee = await this.prisma.employees.findFirst({
      where: { OR: [{ id: account.emp_code }, { emp_code: account.emp_code }] },
      select: { id: true, emp_code: true },
    });
    if (!actorEmployee) throw new ForbiddenException(this.edafiForbiddenMessage);

    const actorReferences = [actorEmployee.id, actorEmployee.emp_code]
      .filter((value): value is number => value != null);
    const managerReference = targetEmployee.manger?.trim();
    const isDirectManager = managerReference != null
      && actorReferences.some((reference) => String(reference) === managerReference);

    if (!isDirectManager) {
      const activeHrOfficer = await this.prisma.hr_egraat_emp_setting.findFirst({
        where: {
          job_title_code_fk: 44,
          person_suspend: 1,
          OR: [
            { person_id: { in: actorReferences } },
            { person_code: { in: actorReferences.map(String) } },
          ],
        },
        select: { id: true },
      });
      if (!activeHrOfficer) throw new ForbiddenException(this.edafiForbiddenMessage);
    }

    return actorEmployee;
  }

  async createShiftSwap(dto: CreateShiftSwapDto, userId: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new BadRequestException('الموظف غير موجود في النظام');
    const publisherEmployee = await this.assertCanManageEdafiEmployee(emp, userId);

    const sheftDate = (dto.sheftDate ?? '').replace(/\//g, '-').slice(0, 10);

    // dup-check: same emp + date + ttype (faithful)
    const dup = await this.prisma.tbl_emps_shef_edafi.findFirst({
      where: { emp_code_fk: emp.emp_code ?? 0, sheft_date: sheftDate, ttype: dto.ttype },
    });
    if (dup) {
      throw new BadRequestException('تم تسجيل هذا الشيفت مسبقًا لنفس الموظف في نفس التاريخ');
    }

    if (dto.dwamIdFk != null) {
      const shift = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id: dto.dwamIdFk } });
      if (!shift) throw new BadRequestException('الوردية المحددة غير موجودة');
    }

    const today = todayIso();
    const row = await this.prisma.tbl_emps_shef_edafi.create({
      data: {
        emp_id_fk: emp.id,
        emp_code_fk: emp.emp_code ?? 0,
        emp_name: emp.employee ?? '',
        ttype: dto.ttype,
        dwam_id_fk: dto.dwamIdFk,
        sheft_date: sheftDate,
        branch_id_fk: emp.branch_id_fk ?? 0,
        date_ar: today,
        date_s: String(Math.floor(new Date(today + 'T00:00:00').getTime() / 1000)),
        publisher: userId,
        publisher_emp_id: publisherEmployee.id,
      },
    });
    return {
      id: row.id,
      message: dto.ttype === 1 ? 'تم تسجيل شيفت التبديل بنجاح' : 'تم تسجيل الشيفت الإضافي بنجاح',
    };
  }

  async listShiftSwaps(q: ListEdafiDto) {
    const where: Prisma.tbl_emps_shef_edafiWhereInput = {};
    if (q.empCode && q.empCode !== 'all') where.emp_code_fk = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') where.branch_id_fk = parseInt(q.branchId, 10) || 0;
    if (q.dateFrom && q.dateTo) {
      where.sheft_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
    }
    if (q.search?.trim()) where.emp_name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.tbl_emps_shef_edafi.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_emps_shef_edafi.count({ where }),
    ]);

    const data = await this.decorateSwaps(rows);
    return paginated(data, total, q.page, q.pageSize);
  }

  private async decorateSwaps(rows: Prisma.tbl_emps_shef_edafiGetPayload<object>[]) {
    const dwamIds = [...new Set(rows.map((r) => r.dwam_id_fk))];
    const branchIds = [...new Set(rows.map((r) => r.branch_id_fk))];
    const [shifts, branches] = await Promise.all([
      this.prisma.tbl_hdodr_setting.findMany({ where: { id: { in: dwamIds } } }),
      this.prisma.tbl_branches.findMany({ where: { branch_id: { in: branchIds } } }),
    ]);
    const shiftMap = new Map(shifts.map((s) => [s.id, s.title]));
    const branchMap = new Map(branches.map((b) => [b.branch_id, b.branch_name]));
    const types: Record<number, string> = { 1: 'تبديل شيفت', 2: 'إضافة شيفت' };
    return rows.map((r) => ({
      id: r.id,
      empCode: r.emp_code_fk,
      empName: r.emp_name,
      branchTitle: r.branch_id_fk === 0 ? 'الادارة' : (branchMap.get(r.branch_id_fk) ?? undefined),
      sheftDate: r.sheft_date,
      ttype: r.ttype,
      ttypeName: types[r.ttype] ?? '—',
      dwamTitle: shiftMap.get(r.dwam_id_fk) ?? undefined,
    }));
  }

  async removeShiftSwap(id: number) {
    const row = await this.prisma.tbl_emps_shef_edafi.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الشيفت غير موجود');
    await this.prisma.tbl_emps_shef_edafi.delete({ where: { id } });
    return { id };
  }

  // -------------------------------------------------------------------------
  // EXTRA HOURS (tbl_emps_hours_edafi) — Api::add_hours_edafi
  // -------------------------------------------------------------------------
  async createExtraHours(dto: CreateExtraHoursDto, userId: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new BadRequestException('الموظف غير موجود في النظام');
    const publisherEmployee = await this.assertCanManageEdafiEmployee(emp, userId);

    const edafaDate = (dto.edafaDate ?? '').replace(/\//g, '-').slice(0, 10);

    const dup = await this.prisma.tbl_emps_hours_edafi.findFirst({
      where: { emp_code_fk: emp.emp_code ?? 0, edafa_date: edafaDate },
    });
    if (dup) {
      throw new BadRequestException('تم تسجيل الساعات الإضافية مسبقًا لنفس الموظف في نفس التاريخ');
    }

    const today = todayIso();
    const row = await this.prisma.tbl_emps_hours_edafi.create({
      data: {
        emp_id_fk: emp.id,
        emp_code_fk: emp.emp_code ?? 0,
        emp_name: emp.employee ?? '',
        branch_id_fk: emp.branch_id_fk ?? 0,
        num_hours: dto.numHours,
        edafa_date: edafaDate,
        date_ar: today,
        date_s: String(Math.floor(new Date(today + 'T00:00:00').getTime() / 1000)),
        publisher: userId,
        publisher_emp_id: publisherEmployee.id,
      },
    });
    return { id: row.id, message: 'تمت تسجيل الساعات الإضافية بنجاح' };
  }

  async listExtraHours(q: ListEdafiDto) {
    const where: Prisma.tbl_emps_hours_edafiWhereInput = {};
    if (q.empCode && q.empCode !== 'all') where.emp_code_fk = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') where.branch_id_fk = parseInt(q.branchId, 10) || 0;
    if (q.dateFrom && q.dateTo) {
      where.edafa_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
    }
    if (q.search?.trim()) where.emp_name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.tbl_emps_hours_edafi.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_emps_hours_edafi.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      empCode: r.emp_code_fk,
      empName: r.emp_name,
      numHours: r.num_hours,
      edafaDate: r.edafa_date,
      dateAr: r.date_ar,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async removeExtraHours(id: number) {
    const row = await this.prisma.tbl_emps_hours_edafi.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('السجل غير موجود');
    await this.prisma.tbl_emps_hours_edafi.delete({ where: { id } });
    return { id };
  }

  // -------------------------------------------------------------------------
  // REPORTS (date-range + employee + branch)
  // -------------------------------------------------------------------------

  /** R1 — Basma report (Hdoor_m::get_hdoor_actions): in/out per emp/branch over a range. */
  async basmaReport(q: AttendanceReportDto) {
    const where: Prisma.tbl_hdoor_empsWhereInput = {};
    if (q.dateFrom && q.dateTo) {
      where.action_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
    } else {
      where.action_date = todayIso();
    }
    if (q.empCode && q.empCode !== 'all') where.member_code = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') where.branch_id_fk = parseInt(q.branchId, 10) || 0;
    if (q.search?.trim()) {
      const search = q.search.trim();
      const code = Number(search);
      where.OR = [
        { action_date: { contains: search } }, { hdoor_time: { contains: search } },
        { ensraf_time: { contains: search } },
        ...(Number.isInteger(code) ? [{ member_code: code }] : []),
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.tbl_hdoor_emps.findMany({
        where,
        orderBy: { hodoor_id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_hdoor_emps.count({ where }),
    ]);
    const codes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { emp_code: { in: codes } },
      select: { emp_code: true, employee: true, edara_n: true, mosma_wazefy_n: true },
    });
    const byCode = new Map(emps.map((e) => [e.emp_code, e]));
    const data = rows.map((r) => {
      const e = byCode.get(r.member_code ?? 0);
      return {
        id: r.hodoor_id,
        empCode: r.member_code,
        empName: e?.employee ?? '—',
        department: e?.edara_n ?? undefined,
        jobTitle: e?.mosma_wazefy_n ?? undefined,
        weekday: r.action_date
          ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(`${r.action_date.slice(0, 10)}T12:00:00`).getDay()]
          : undefined,
        actionDate: r.action_date,
        checkInPhoto: r.hdoor_img_path ?? undefined,
        checkIn: r.hdoor_time ?? undefined,
        checkOutPhoto: r.ensraf_img_path ?? undefined,
        checkOut: r.ensraf_time ?? undefined,
        lateMin: r.late_min != null ? Math.round(r.late_min) : 0,
        earlyLeaveMin: r.mobaker_min != null ? Math.round(r.mobaker_min) : 0,
        overtimeMin: r.num_min != null ? Math.round(r.num_min) : 0,
      };
    });
    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * One row per employee per calendar day. The legacy rules are explicit:
   * weekly off comes from hr_emp_agazat_dayes.off_day; an approved leave type 19
   * on agaza_date is a swapped weekly leave; all other approved leave ranges are
   * regular leave; a day with no punch or leave is absence.
   */
  async fullAttendanceSheet(q: AttendanceReportDto) {
    const from = (q.dateFrom || todayIso()).slice(0, 10);
    const to = (q.dateTo || from).slice(0, 10);
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException('تاريخ النهاية يجب أن يساوي أو يلي تاريخ البداية');
    }
    const daysCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (daysCount > 366) throw new BadRequestException('الحد الأقصى لفترة شيت البصمة سنة واحدة');

    const employeeWhere: Prisma.employeesWhereInput = {
      employee_type: 1,
      OR: [{ leave_emp: null }, { leave_emp: 0 }],
    };
    if (q.empCode && q.empCode !== 'all') employeeWhere.emp_code = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') employeeWhere.branch_id_fk = parseInt(q.branchId, 10) || 0;
    if (q.search?.trim()) {
      const search = q.search.trim();
      const code = Number(search);
      employeeWhere.AND = [{
        OR: [
          { employee: { contains: search } },
          { edara_n: { contains: search } },
          { qsm_n: { contains: search } },
          ...(Number.isInteger(code) ? [{ emp_code: code }] : []),
        ],
      }];
    }

    const employees = await this.prisma.employees.findMany({
      where: employeeWhere,
      select: {
        id: true,
        emp_code: true,
        employee: true,
        branch_id_fk: true,
        edara_n: true,
        qsm_n: true,
      },
      orderBy: [{ employee: 'asc' }, { emp_code: 'asc' }],
    });
    const codes = employees.map((employee) => employee.emp_code).filter((code): code is number => code != null);
    const ids = employees.map((employee) => employee.id);
    const branchIds = [...new Set(employees.map((employee) => employee.branch_id_fk).filter((id): id is number => id != null))];

    const [attendance, weeklyOffs, leaveOrders, branches] = await Promise.all([
      this.prisma.tbl_hdoor_emps.findMany({
        where: {
          member_code: { in: codes },
          OR: [
            { action_date_s: { gte: from, lte: to } },
            { action_date: { gte: from, lte: to } },
          ],
        },
        orderBy: { hodoor_id: 'asc' },
      }),
      this.prisma.hr_emp_agazat_dayes.findMany({
        where: { OR: [{ emp_id_fk: { in: ids } }, { emp_code_fk: { in: codes } }] },
        select: { emp_id_fk: true, emp_code_fk: true, off_day: true },
      }),
      this.prisma.hr_all_agzat_orders.findMany({
        where: {
          emp_code_fk: { in: codes.map(BigInt) },
          suspend: { in: SUSPEND_APPROVED },
          OR: [
            { no3_agaza: 19, agaza_date: { gte: from, lte: to } },
            { agaza_from_date_m: { lte: to }, agaza_to_date_m: { gte: from } },
          ],
        },
        select: {
          emp_code_fk: true,
          no3_agaza: true,
          agaza_date: true,
          agaza_from_date_m: true,
          agaza_to_date_m: true,
        },
      }),
      this.prisma.tbl_branches.findMany({
        where: { branch_id: { in: branchIds } },
        select: { branch_id: true, branch_name: true },
      }),
    ]);

    const branchMap = new Map(branches.map((branch) => [branch.branch_id, branch.branch_name]));
    const offDayByCode = new Map<number, string>();
    const codeById = new Map(employees.map((employee) => [employee.id, employee.emp_code]));
    for (const off of weeklyOffs) {
      const code = off.emp_code_fk || codeById.get(off.emp_id_fk);
      if (code) offDayByCode.set(code, off.off_day.trim().toLowerCase());
    }

    const attendanceByDay = new Map<string, typeof attendance>();
    for (const punch of attendance) {
      if (punch.member_code == null) continue;
      const date = punch.action_date_s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
        ?? punch.action_date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      if (!date || date < from || date > to) continue;
      const key = `${punch.member_code}|${date}`;
      const list = attendanceByDay.get(key) ?? [];
      list.push(punch);
      attendanceByDay.set(key, list);
    }

    const swappedDays = new Set<string>();
    const leaveDays = new Set<string>();
    for (const leave of leaveOrders) {
      const code = leave.emp_code_fk != null ? Number(leave.emp_code_fk) : 0;
      if (!code) continue;
      if (leave.no3_agaza === 19 && leave.agaza_date) {
        swappedDays.add(`${code}|${leave.agaza_date.slice(0, 10)}`);
        continue;
      }
      if (!leave.agaza_from_date_m || !leave.agaza_to_date_m) continue;
      const leaveStart = new Date(`${leave.agaza_from_date_m.slice(0, 10)}T12:00:00`);
      const leaveEnd = new Date(`${leave.agaza_to_date_m.slice(0, 10)}T12:00:00`);
      for (const day = new Date(leaveStart); day <= leaveEnd; day.setDate(day.getDate() + 1)) {
        const iso = day.toISOString().slice(0, 10);
        if (iso >= from && iso <= to) leaveDays.add(`${code}|${iso}`);
      }
    }

    const weeklyDayAliases = [
      ['sunday', 'الأحد', 'الاحد'],
      ['monday', 'الإثنين', 'الاثنين'],
      ['tuesday', 'الثلاثاء'],
      ['wednesday', 'الأربعاء', 'الاربعاء'],
      ['thursday', 'الخميس'],
      ['friday', 'الجمعة'],
      ['saturday', 'السبت'],
    ].map((aliases) => aliases.map((alias) => alias.trim().toLowerCase()));
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const allRows: Array<Record<string, unknown>> = [];
    for (const employee of employees) {
      if (employee.emp_code == null) continue;
      for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        const date = day.toISOString().slice(0, 10);
        const key = `${employee.emp_code}|${date}`;
        const punches = attendanceByDay.get(key) ?? [];
        const configuredOffDay = offDayByCode.get(employee.emp_code);
        const weeklyOff = configuredOffDay != null
          && weeklyDayAliases[day.getDay()].includes(configuredOffDay);
        const swappedLeave = swappedDays.has(key);
        const approvedLeave = leaveDays.has(key);
        const firstIn = punches.find((punch) => punch.hdoor_time || punch.second_hdoor_time);
        const lastOut = [...punches].reverse().find((punch) => punch.second_ensraf_time || punch.ensraf_time);
        const status = weeklyOff ? 'weekly_off'
          : swappedLeave ? 'swapped_leave'
            : approvedLeave ? 'approved_leave'
              : punches.length ? 'present' : 'absent';
        const statusLabel = status === 'weekly_off' ? 'إجازة أسبوعية'
          : status === 'swapped_leave' ? 'تبديل إجازة أسبوعية'
            : status === 'approved_leave' ? 'إجازة معتمدة'
              : status === 'absent' ? 'غياب' : undefined;
        const workingSeconds = punches.reduce((total, punch) => total
          + pairDurationSeconds(punch.hdoor_time, punch.ensraf_time)
          + pairDurationSeconds(punch.second_hdoor_time, punch.second_ensraf_time), 0);
        allRows.push({
          id: `${employee.emp_code}-${date}`,
          empCode: employee.emp_code,
          empName: employee.employee ?? '—',
          branchTitle: employee.branch_id_fk ? branchMap.get(employee.branch_id_fk) : undefined,
          department: employee.edara_n ?? undefined,
          section: employee.qsm_n ?? undefined,
          weekday: arabicDays[day.getDay()],
          actionDate: date,
          status,
          statusLabel,
          checkInPhoto: status === 'present' ? (firstIn?.hdoor_img_path ?? firstIn?.second_hdoor_img_path ?? undefined) : undefined,
          checkIn: status === 'present' ? (firstIn?.hdoor_time ?? firstIn?.second_hdoor_time ?? undefined) : undefined,
          checkOutPhoto: status === 'present' ? (lastOut?.second_ensraf_img_path ?? lastOut?.ensraf_img_path ?? undefined) : undefined,
          checkOut: status === 'present' ? (lastOut?.second_ensraf_time ?? lastOut?.ensraf_time ?? undefined) : undefined,
          lateMin: status === 'present' ? punches.reduce((total, punch) => total + Math.max(0, Math.round(punch.late_min ?? 0)) + Math.max(0, Math.round(punch.second_late_min ?? 0)), 0) : undefined,
          workingSeconds: status === 'present' ? workingSeconds : undefined,
          notes: undefined,
        });
      }
    }

    return paginated(allRows.slice(q.skip, q.skip + q.take), allRows.length, q.page, q.pageSize);
  }

  /**
   * R3 — Late report (Hdoor_m::get_datatables_late): per-employee with/without
   * permission split + total. Permission = an approved ozonat order (suspend ∈ {1,4})
   * whose ezn_date_ar equals the punch action_date.
   */
  async lateReport(q: AttendanceReportDto) {
    const empWhere: Prisma.employeesWhereInput = {};
    if (q.empCode && q.empCode !== 'all') empWhere.emp_code = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') empWhere.branch_id_fk = parseInt(q.branchId, 10) || 0;
    if (q.search?.trim()) {
      const search = q.search.trim();
      const code = Number(search);
      empWhere.OR = [
        { employee: { contains: search } }, { edara_n: { contains: search } },
        { qsm_n: { contains: search } }, { phone: { contains: search } },
        ...(Number.isInteger(code) ? [{ emp_code: code }] : []),
      ];
    }

    const employees = await this.prisma.employees.findMany({
      where: empWhere,
      select: {
        emp_code: true,
        employee: true,
        edara_n: true,
        qsm_n: true,
        phone: true,
      },
    });

    const results: Array<{
      empCode: number | null;
      empName: string;
      department?: string;
      section?: string;
      phone?: string;
      lateWithPermission: number;
      lateWithoutPermission: number;
      totalLate: number;
    }> = [];

    for (const emp of employees) {
      if (emp.emp_code == null) continue;

      // approved permissions (ozonat) on dates
      const oznWhere: Prisma.hr_all_ozonat_ordersWhereInput = {
        emp_code_fk: emp.emp_code,
        suspend: { in: SUSPEND_APPROVED },
      };
      if (q.dateFrom && q.dateTo) {
        oznWhere.ezn_date_ar = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
      }
      const ozonat = await this.prisma.hr_all_ozonat_orders.findMany({
        where: oznWhere,
        select: { ezn_date_ar: true },
      });
      const approvedDates = new Set(ozonat.map((o) => o.ezn_date_ar));

      const lateWhere: Prisma.tbl_hdoor_empsWhereInput = {
        member_code: emp.emp_code,
        late_min: { gt: 0 },
      };
      if (q.dateFrom && q.dateTo) {
        lateWhere.action_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
      }
      const lateRows = await this.prisma.tbl_hdoor_emps.findMany({
        where: lateWhere,
        select: { late_min: true, action_date: true },
      });

      let withPerm = 0;
      let withoutPerm = 0;
      for (const r of lateRows) {
        const late = Math.trunc(r.late_min ?? 0);
        if (r.action_date != null && approvedDates.has(r.action_date)) withPerm += late;
        else withoutPerm += late;
      }

      if (withPerm > 0 || withoutPerm > 0) {
        results.push({
          empCode: emp.emp_code,
          empName: emp.employee ?? '—',
          department: emp.edara_n ?? undefined,
          section: emp.qsm_n ?? undefined,
          phone: emp.phone ?? undefined,
          lateWithPermission: withPerm,
          lateWithoutPermission: withoutPerm,
          totalLate: withPerm + withoutPerm,
        });
      }
    }

    const totals = results.reduce(
      (acc, r) => {
        acc.withPermission += r.lateWithPermission;
        acc.withoutPermission += r.lateWithoutPermission;
        acc.total += r.totalLate;
        return acc;
      },
      { withPermission: 0, withoutPermission: 0, total: 0 },
    );

    const total = results.length;
    const data = results.slice(q.skip, q.skip + q.take);
    const page = paginated(data, total, q.page, q.pageSize);
    return { ...page, totals };
  }

  /** R4 — Extra-hours report from tbl_emps_hours_edafi (Hdoor_m::get_hours_edafi_data). */
  async overtimeReport(q: AttendanceReportDto) {
    const where: Prisma.tbl_emps_hours_edafiWhereInput = {};
    if (q.dateFrom && q.dateTo) {
      where.edafa_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
    } else {
      where.edafa_date = todayIso();
    }
    if (q.empCode && q.empCode !== 'all') where.emp_code_fk = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') where.branch_id_fk = parseInt(q.branchId, 10) || 0;

    const [rows, total] = await Promise.all([
      this.prisma.tbl_emps_hours_edafi.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_emps_hours_edafi.count({ where }),
    ]);
    const branchIds = [...new Set(rows.map((r) => r.branch_id_fk))];
    const publisherIds = [...new Set(rows.map((r) => r.publisher))];
    const [branches, publishers] = await Promise.all([
      this.prisma.tbl_branches.findMany({ where: { branch_id: { in: branchIds } }, select: { branch_id: true, branch_name: true } }),
      this.prisma.users.findMany({ where: { user_id: { in: publisherIds } }, select: { user_id: true, name: true } }),
    ]);
    const branchMap = new Map(branches.map((branch) => [branch.branch_id, branch.branch_name]));
    const publisherMap = new Map(publishers.map((publisher) => [publisher.user_id, publisher.name]));
    const data = rows.map((r) => ({
      id: r.id,
      empCode: r.emp_code_fk,
      empName: r.emp_name,
      branchTitle: branchMap.get(r.branch_id_fk) ?? (r.branch_id_fk === 0 ? 'الادارة' : undefined),
      weekday: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(`${r.edafa_date.slice(0, 10)}T12:00:00`).getDay()],
      numHours: r.num_hours,
      edafaDate: r.edafa_date,
      publisherName: publisherMap.get(r.publisher) ?? undefined,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  /** R5 — Shift-swap report from tbl_emps_shef_edafi (Hdoor_m::get_datatables_sheft). */
  async shiftSwapReport(q: AttendanceReportDto) {
    return this.listShiftSwaps(q as unknown as ListEdafiDto);
  }

  /**
   * Active legacy absence formula: Friday is excluded, approved leave is counted
   * separately, employee official/off dates are excluded, and any remaining day
   * without a main attendance row is unexcused absence.
   */
  async absenceReport(q: AttendanceReportDto) {
    const from = (q.dateFrom || todayIso()).slice(0, 10);
    const to = (q.dateTo || from).slice(0, 10);
    if (to < from) throw new BadRequestException('تاريخ النهاية يجب أن يساوي أو يلي تاريخ البداية');

    const empWhere: Prisma.employeesWhereInput = { employee_type: 1 };
    if (q.empCode && q.empCode !== 'all') empWhere.emp_code = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') empWhere.branch_id_fk = parseInt(q.branchId, 10) || 0;
    if (q.search?.trim()) {
      const search = q.search.trim();
      const code = Number(search);
      empWhere.OR = [
        { employee: { contains: search } }, { edara_n: { contains: search } },
        { qsm_n: { contains: search } }, { phone: { contains: search } },
        ...(Number.isInteger(code) ? [{ emp_code: code }] : []),
      ];
    }
    const employees = await this.prisma.employees.findMany({
      where: empWhere,
      select: { id: true, emp_code: true, employee: true, edara_n: true, qsm_n: true, phone: true },
    });
    const codes = employees.map((e) => e.emp_code).filter((v): v is number => v != null);
    const ids = employees.map((e) => e.id);
    const [attendance, leaves, officialDays] = await Promise.all([
      this.prisma.tbl_hdoor_emps.findMany({
        where: { member_code: { in: codes }, action_date: { gte: from, lte: to }, hdoor_time: { not: null } },
        select: { member_code: true, action_date: true },
      }),
      this.prisma.hr_all_agzat_orders.findMany({
        where: {
          emp_code_fk: { in: codes.map(BigInt) }, suspend: { in: SUSPEND_APPROVED },
          agaza_from_date_m: { lte: to }, agaza_to_date_m: { gte: from },
        },
        select: { emp_code_fk: true, agaza_from_date_m: true, agaza_to_date_m: true },
      }),
      this.prisma.hr_emp_agazat_dayes.findMany({
        where: { OR: [{ emp_id_fk: { in: ids } }, { emp_code_fk: { in: codes } }] },
        select: { emp_code_fk: true, off_day: true, date_ar: true },
      }),
    ]);
    const present = new Set(attendance.map((r) => `${r.member_code}|${r.action_date?.slice(0, 10)}`));
    const leaveDates = new Set<string>();
    for (const leave of leaves) {
      if (leave.emp_code_fk == null || !leave.agaza_from_date_m || !leave.agaza_to_date_m) continue;
      for (const d = new Date(`${leave.agaza_from_date_m.slice(0, 10)}T12:00:00`);
        d <= new Date(`${leave.agaza_to_date_m.slice(0, 10)}T12:00:00`); d.setDate(d.getDate() + 1)) {
        leaveDates.add(`${leave.emp_code_fk}|${d.toISOString().slice(0, 10)}`);
      }
    }
    const official = new Set(officialDays.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date_ar)).map((r) => `${r.emp_code_fk}|${r.date_ar.slice(0, 10)}`));
    const weekly = new Map(officialDays.map((r) => [r.emp_code_fk, r.off_day.toLowerCase()]));
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    const rows = employees.flatMap((emp) => {
      if (emp.emp_code == null) return [];
      let excused = 0;
      let unexcused = 0;
      for (const d = new Date(`${from}T12:00:00`); d <= new Date(`${to}T12:00:00`); d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (d.getDay() === 5 || weekly.get(emp.emp_code) === weekday[d.getDay()]) continue;
        const key = `${emp.emp_code}|${iso}`;
        if (present.has(key) || official.has(key)) continue;
        if (leaveDates.has(key)) excused += 1;
        else unexcused += 1;
      }
      if (!unexcused) return [];
      return [{ empCode: emp.emp_code, empName: emp.employee ?? '—', department: emp.edara_n,
        section: emp.qsm_n, phone: emp.phone, absenceWithLeave: excused,
        absenceWithoutLeave: unexcused, totalAbsence: excused + unexcused }];
    });
    return paginated(rows.slice(q.skip, q.skip + q.take), rows.length, q.page, q.pageSize);
  }

  /** Exact column mapping used by Hdoor_m::insert_hdoor; target accepts safe XLSX files. */
  async importDeviceFile(file: Express.Multer.File, userId: number, userName?: string) {
    if (!file) throw new BadRequestException('الرجاء اختيار ملف Excel لرفعه');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('صيغة الملف المطلوبة XLSX؛ حوّل ملف XLS القديم إلى XLSX أولاً');
    }
    const workbook = new Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.columnCount < 10) throw new BadRequestException('ملف الحضور فارغ أو لا يحتوي الأعمدة العشرة المطلوبة');
    const value = (cell: unknown) => String(cell ?? '').trim();
    const normalDate = (raw: string) => {
      const dmY = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
    };
    const rows: Prisma.tbl_emp_hdoorCreateManyInput[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = Number(row.getCell(1).value);
      if (!Number.isInteger(code) || code <= 0) return;
      const dateAr = value(row.getCell(3).text || row.getCell(3).value);
      const date = normalDate(dateAr);
      if (!date) return;
      rows.push({ emp_code: code, emp_name: value(row.getCell(2).text), date_ar: dateAr, date,
        hdoor_time: value(row.getCell(4).text), ensraf_time: value(row.getCell(5).text),
        actual_hdoor_time: value(row.getCell(6).text), actual_ensraf_time: value(row.getCell(7).text),
        absent: value(row.getCell(8).text) || null, hour_works: new Prisma.Decimal(Number(row.getCell(9).value) || 0),
        edara_n: value(row.getCell(10).text), inserted_date: todayIso(), publisher: userId,
        publisher_name: userName || 'system' });
    });
    if (!rows.length) throw new BadRequestException('لم يتم العثور على صفوف حضور صحيحة في الملف');
    const dates = [...new Set(rows.map((r) => r.date_ar))];
    await this.prisma.$transaction([
      this.prisma.tbl_emp_hdoor.deleteMany({ where: { date_ar: { in: dates } } }),
      this.prisma.tbl_emp_hdoor.createMany({ data: rows }),
    ]);
    return { imported: rows.length, replacedDates: dates.length };
  }
}
