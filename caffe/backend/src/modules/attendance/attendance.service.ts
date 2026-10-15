import { SUSPEND_APPROVED } from '../../common/utils/suspend-status.util';
import { parseStrictNumeric, assertTimeOrder, parseEmployeeCode } from '../../common/validators/validation.util';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // BOARD
  // -------------------------------------------------------------------------
  async board(q: PaginationDto & { date?: string; source?: string; status?: string }) {
    const date = q.date?.slice(0, 10) ?? todayIso();
    const matches = legacyDateMatchValues(date);
    const where: Prisma.tbl_hdoor_empsWhereInput = { action_date_s: { in: matches } };

    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where,
      orderBy: { hodoor_id: 'desc' },
    });

    const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { emp_code: { in: empCodes } },
      select: { id: true, emp_code: true, employee: true, edara_n: true },
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

      return {
        id: r.hodoor_id,
        empCode: r.member_code != null ? String(r.member_code) : undefined,
        employeeName: emp?.employee ?? undefined,
        department: emp?.edara_n ?? undefined,
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
        checkInPhoto: r.hdoor_img_path ?? undefined,
        secondCheckInPhoto: r.second_hdoor_img_path ?? undefined,
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
  async manualCheck(body: CheckPunchDto, userId = 1) {
    const code = parseEmployeeCode(body.empCode);

    let emp = await this.prisma.employees.findFirst({ where: { emp_code: code } });
    if (!emp) {
      emp = await this.prisma.employees.findFirst({ where: { id: code } });
    }
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    // --- channel gate (attendance_channels) ---
    const channel = body.channel ?? 'app';
    const channels = await this.enabledChannels();
    if (channels.size > 0 && !channels.has(channel)) {
      throw new BadRequestException('قناة التسجيل غير مفعّلة');
    }
    const tasgelType = channel === 'device' ? 'automatic' : 'manual';

    const dwam = await this.prisma.hr_emp_dwam.findFirst({ where: { emp_id: emp.id } });

    // Resolve the shift window. Prefer a tbl_hdodr_setting linked via the employee's
    // dwam assignment; otherwise fall back to hr_emp_dwam attend/leave times.
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
    let shift: ShiftRow | null = await this.prisma.tbl_hdodr_setting.findFirst({
      where: dwam?.always_id_fk ? { id: dwam.always_id_fk } : { id: -1 },
    });
    if (!shift && dwam) {
      // Synthesize a window from hr_emp_dwam so the gate still functions.
      shift = {
        id: 0,
        title: null,
        hdoor_from_time: dwam.start_enter || dwam.attend_time,
        hdoor_to_time: dwam.end_enter || dwam.attend_time,
        hdoor_khasm_from: dwam.attend_time,
        ensraf_from_time: dwam.start_out || dwam.leave_time,
        ensraf_to_time: dwam.end_out || dwam.leave_time,
        ensraf_khasm_from: dwam.leave_time,
      };
    }
    if (!shift) {
      throw new BadRequestException('خارج إعدادات الدوام الأن');
    }

    const win = buildShiftWindow(shift);

    const explicitTime = body.type === 'out' ? body.checkOut : body.checkIn;
    const punchMin = explicitTime ? parseTimeToMinutes(explicitTime) : nowMinutes();
    const currentTimeStr = formatMinutesAsTime(punchMin);

    // --- auto-detect direction within the dwam window (port of add_hdor_ensraf step 2) ---
    const inWindow = (val: number, from: number, to: number) => {
      // window may straddle midnight (to > 1440); also test val+1440.
      return (val >= from && val <= to) || (val + 1440 >= from && val + 1440 <= to);
    };
    const ensrafMaxLimit = win.ensrafFrom + 60; // legacy: +1 hour grace on ensraf detection

    let detected: 'in' | 'out' | null = null;
    if (body.type) {
      detected = body.type;
    } else if (inWindow(punchMin, win.hdoorFrom, win.hdoorTo)) {
      detected = 'in';
    } else if (inWindow(punchMin, win.ensrafFrom, ensrafMaxLimit)) {
      detected = 'out';
    }

    const date = todayIso();
    const matches = legacyDateMatchValues(date);
    const existing = await this.prisma.tbl_hdoor_emps.findFirst({
      where: { member_code: code, action_date_s: { in: matches } },
    });

    // Late-departure rule: a punch ≥60 min after an open check-in counts as ensraf
    // even outside the detected window (port of add_hdor_ensraf step 3).
    if (!detected && existing?.hdoor_time && !existing.ensraf_time) {
      const inMin = parseTimeToMinutes(existing.hdoor_time);
      let delta = punchMin - inMin;
      if (delta < 0) delta += 1440;
      if (delta >= 60) detected = 'out';
    }

    if (!detected) {
      throw new BadRequestException('خارج نطاق أي دوام متاح حالياً للموظف');
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
      row = await this.prisma.tbl_hdoor_emps.create({
        data: {
          member_code: code,
          member_id: emp.id,
          action_date_s: date,
          action_date: date,
          for_month: new Date().getMonth() + 1,
          for_year: new Date().getFullYear(),
          sheft_type: dwam?.always_id_fk ?? 0,
          branch_id_fk: emp.branch_id_fk ?? 0,
          dwam_id_fk: shift.id || dwam?.id || 0,
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
      await this.prisma.tbl_hdoor_emps.update({
        where: { hodoor_id: row.hodoor_id },
        data: {
          ensraf_time: currentTimeStr,
          dwam_ensraf_time: expectedEnsraf,
          mobaker_min: mobakerMin,
          num_min: overtime,
          ensraf_user_id: userId,
          ensraf_lat: body.long != null ? body.lat : row.ensraf_lat,
          ensraf_long: body.long ?? row.ensraf_long,
          ensraf_img_path: body.photo ?? row.ensraf_img_path,
          ttype: 'ensraf',
          tasgel_type: tasgelType,
        },
      });
      return { id: row.hodoor_id, type: 'out', mobakerMin, overtimeMin: overtime };
    }

    // check-in: late vs khasm (calculate_late_minutes), then late-rule grace
    const lateRaw = sumMinLate(formatMinutesAsTime(win.hdoorKhasm % 1440), currentTimeStr);
    const lateMin = this.applyLateRule(lateRaw, rules);
    await this.prisma.tbl_hdoor_emps.update({
      where: { hodoor_id: row.hodoor_id },
      data: {
        hdoor_time: currentTimeStr,
        dwam_hdoor_time: expectedHdoor,
        late_min: lateMin,
        hdoor_user_id: userId,
        hdoor_lat: body.lat ?? row.hdoor_lat,
        hdoor_long: body.long ?? row.hdoor_long,
        hdoor_img_path: body.photo ?? row.hdoor_img_path,
        ttype: 'hdoor',
        tasgel_type: tasgelType,
      },
    });
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
  async createShiftSwap(dto: CreateShiftSwapDto, userId: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new BadRequestException('الموظف غير موجود في النظام');

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
        publisher_emp_id: 0,
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
        publisher_emp_id: 0,
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
      select: { emp_code: true, employee: true, edara_n: true },
    });
    const byCode = new Map(emps.map((e) => [e.emp_code, e]));
    const data = rows.map((r) => {
      const e = byCode.get(r.member_code ?? 0);
      return {
        id: r.hodoor_id,
        empCode: r.member_code,
        empName: e?.employee ?? '—',
        department: e?.edara_n ?? undefined,
        actionDate: r.action_date,
        checkIn: r.hdoor_time ?? undefined,
        checkOut: r.ensraf_time ?? undefined,
        lateMin: r.late_min != null ? Math.round(r.late_min) : 0,
        earlyLeaveMin: r.mobaker_min != null ? Math.round(r.mobaker_min) : 0,
        overtimeMin: r.num_min != null ? Math.round(r.num_min) : 0,
      };
    });
    return paginated(data, total, q.page, q.pageSize);
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
    const data = rows.map((r) => ({
      id: r.id,
      empCode: r.emp_code_fk,
      empName: r.emp_name,
      numHours: r.num_hours,
      edafaDate: r.edafa_date,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  /** R5 — Shift-swap report from tbl_emps_shef_edafi (Hdoor_m::get_datatables_sheft). */
  async shiftSwapReport(q: AttendanceReportDto) {
    return this.listShiftSwaps(q as unknown as ListEdafiDto);
  }
}
