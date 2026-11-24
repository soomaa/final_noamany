import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { businessWallClockMs } from '../../common/utils/legacy-date.util';
import { AttendanceService } from './attendance.service';
import { DevicePunchBatchDto, DevicePunchItemDto } from './dto/device-punch.dto';
import { FilePunch, parseDeviceFile } from './device-file-import.util';

/** Punches older than this are stored for audit but never applied to attendance. */
const MAX_PUNCH_AGE_DAYS = 35;
/** A second scan by the same person within this window is the same punch. */
const DUPLICATE_WINDOW_SECONDS = 120;
/** A row left in "processing" this long belongs to a request that died; retry it. */
const STALE_PROCESSING_SECONDS = 120;
const MIN_TOKEN_LENGTH = 24;
/** attendance_device_punches.device_id for Excel rows uploaded without choosing a device. */
export const FILE_IMPORT_DEVICE_ID = 0;

export type DevicePunchStatus = 'applied' | 'rejected' | 'ignored' | 'duplicate' | 'retry';

export interface DevicePunchResult {
  userId: string;
  time: string;
  status: DevicePunchStatus;
  message?: string;
  type?: 'in' | 'out';
}

type DeviceRow = { id: number; branch_id_fk: number | null };

export type FilePunchStatus = 'applied' | 'duplicate' | 'rejected' | 'retry';

export interface FilePunchResult {
  row: number;
  empCode: string;
  name: string;
  date: string;
  time: string;
  column: 'in' | 'out' | null;
  status: FilePunchStatus;
  message?: string;
  type?: 'in' | 'out';
}

/** Engine refusals that only mean "this punch is already on the record" (app, manual or device). */
const ALREADY_RECORDED = /بالفعل|مسبقاً|مسبقًا/;

function secondsOfDay(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/** Strict calendar check: rejects 2026-02-30 and 25:00:00. */
function isRealDateTime(date: string, time: string): boolean {
  const parsed = new Date(`${date}T${time}Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 19) === `${date}T${time}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('، ');
    if (typeof message === 'string') return message;
  }
  return error instanceof Error ? error.message : 'خطأ غير معروف';
}

/**
 * Receives punches from the on-site ZKTeco agent (tools/zk-agent) and replays each one
 * through the normal attendance engine at the time it was captured on the device, so
 * shifts, late/early rules and the "device" channel switch all apply as usual.
 *
 * attendance_device_punches is accessed with plain SQL on purpose: production runs a
 * hand-patched Prisma Client, and this way the feature ships without regenerating it.
 */
@Injectable()
export class AttendanceDeviceAgentService {
  private readonly logger = new Logger(AttendanceDeviceAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    // Stateless; defaulted so the unit specs can construct the service with two arguments.
    private readonly scope: BranchScopeService = new BranchScopeService(),
  ) {}

  assertAgentToken(header: string | undefined) {
    const expected = (process.env.ATTENDANCE_AGENT_TOKEN ?? '').trim();
    if (expected.length < MIN_TOKEN_LENGTH) {
      throw new ServiceUnavailableException('ربط أجهزة البصمة غير مفعّل على السيرفر (ATTENDANCE_AGENT_TOKEN)');
    }
    const given = Buffer.from(String(header ?? '').trim());
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new UnauthorizedException('مفتاح ربط جهاز البصمة غير صحيح');
    }
  }

  async ingest(dto: DevicePunchBatchDto, now = new Date()) {
    const device = await this.prisma.attendance_devices.findUnique({
      where: { id: dto.deviceId },
      select: { id: true, branch_id_fk: true },
    });
    if (!device) throw new NotFoundException('جهاز البصمة غير مسجل في النظام');

    // Oldest first: the engine decides in/out from what is already recorded that day.
    const punches = [...dto.punches].sort((a, b) => a.time.localeCompare(b.time));
    const results: DevicePunchResult[] = [];
    for (const punch of punches) {
      results.push(await this.ingestOne(device, punch, now));
    }

    const stamp = now.toISOString();
    await this.prisma.attendance_devices.update({
      where: { id: device.id },
      data: { status: 'online', last_sync: stamp, updated_at: stamp },
    });

    const count = (status: DevicePunchStatus) => results.filter((r) => r.status === status).length;
    return {
      deviceId: device.id,
      received: results.length,
      applied: count('applied'),
      rejected: count('rejected'),
      ignored: count('ignored'),
      duplicate: count('duplicate'),
      retry: count('retry'),
      results,
    };
  }

  private async ingestOne(device: DeviceRow, punch: DevicePunchItemDto, now: Date): Promise<DevicePunchResult> {
    const userId = punch.userId.trim();
    const [date, time] = punch.time.split(' ');
    const base = { userId, time: punch.time };

    if (!isRealDateTime(date, time)) {
      return { ...base, status: 'rejected', message: 'وقت البصمة غير صحيح' };
    }

    const reserved = await this.reserve(device.id, userId, date, time, punch);
    if (!reserved) return { ...base, status: 'duplicate' };

    const finish = async (status: 'applied' | 'rejected' | 'ignored', message?: string, attendanceId?: number) => {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE attendance_device_punches
        SET result = ${status}, message = ${message?.slice(0, 255) ?? null}, attendance_id = ${attendanceId ?? null}
        WHERE id = ${reserved}`);
    };

    const code = Number(userId);
    if (!/^\d{1,9}$/.test(userId) || !Number.isSafeInteger(code) || code <= 0) {
      await finish('rejected', 'رقم المستخدم على الجهاز ليس كود موظف رقمي');
      return { ...base, status: 'rejected', message: 'رقم المستخدم على الجهاز ليس كود موظف رقمي' };
    }

    const ageMs = now.getTime() - new Date(`${date}T${time}Z`).getTime();
    if (ageMs > MAX_PUNCH_AGE_DAYS * 24 * 3600 * 1000) {
      const message = `بصمة أقدم من ${MAX_PUNCH_AGE_DAYS} يوم لا تُسجل تلقائياً`;
      await finish('rejected', message);
      return { ...base, status: 'rejected', message };
    }

    if (await this.hasRecentAppliedPunch(userId, date, time, reserved)) {
      const message = 'بصمة مكررة خلال دقيقتين';
      await finish('ignored', message);
      return { ...base, status: 'ignored', message };
    }

    try {
      const result = await this.attendance.manualCheck(
        { empCode: String(code), channel: 'device' },
        0,
        device.branch_id_fk ?? undefined,
        { actionDate: date, time: time.slice(0, 5) },
      );
      await finish('applied', result.type === 'out' ? 'انصراف' : 'حضور', result.id);
      return { ...base, status: 'applied', type: result.type as 'in' | 'out' };
    } catch (error) {
      const message = errorMessage(error);
      const transient =
        !(error instanceof HttpException) ||
        error.getStatus() >= 500 ||
        message.includes('قيد التنفيذ');
      if (transient) {
        // Leave no trace so the agent's next push tries this punch again.
        await this.prisma.$executeRaw(Prisma.sql`DELETE FROM attendance_device_punches WHERE id = ${reserved}`);
        this.logger.warn(`DEVICE_PUNCH_RETRY device=${device.id} user=${userId} at=${punch.time}: ${message}`);
        return { ...base, status: 'retry', message };
      }
      await finish('rejected', message);
      return { ...base, status: 'rejected', message };
    }
  }

  /**
   * POST /attendance/imports/device-file — the fingerprint device's Excel export, used when the
   * device is not linked through the agent. Every actual in/out time is replayed through the same
   * engine call, duplicate window and audit table as an agent punch, so it reaches the board,
   * reports and payroll exactly like a live scan. Re-uploading the same file is safe: punches
   * already handled come back as duplicates; punches refused before are tried again.
   */
  async importFile(
    file: Express.Multer.File | undefined,
    user: Pick<JwtUser, 'sub'> & Partial<JwtUser>,
    deviceId?: number,
    now = new Date(),
  ) {
    if (!file) throw new BadRequestException('الرجاء اختيار ملف Excel لرفعه');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('صيغة الملف المطلوبة XLSX؛ حوّل ملف XLS القديم إلى XLSX أولاً');
    }
    let device: DeviceRow = { id: FILE_IMPORT_DEVICE_ID, branch_id_fk: null };
    if (deviceId) {
      const found = await this.prisma.attendance_devices.findUnique({
        where: { id: deviceId },
        select: { id: true, branch_id_fk: true },
      });
      if (!found) throw new NotFoundException('جهاز البصمة غير مسجل في النظام');
      device = found;
    }

    const parsed = await parseDeviceFile(file.buffer);
    const codes = [...new Set(parsed.punches.map((p) => Number(p.empCode)))];
    const employees = codes.length
      ? await this.prisma.employees.findMany({
        where: { emp_code: { in: codes } },
        select: { emp_code: true, branch_id_fk: true },
      })
      : [];
    const branchOf = new Map(employees.map((e) => [String(e.emp_code), e.branch_id_fk ?? 0]));
    // Branch-scoped importers stay inside their branches. An account with no branch at all keeps
    // the legacy behaviour (the import permission alone), so head-office HR is not locked out.
    const scoped = this.scope.allowedBranchIds(user as JwtUser);
    const allowed = scoped?.length ? scoped : null;

    // Oldest first across the whole file: the engine decides in/out from what is already recorded.
    const punches = [...parsed.punches].sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || Number(a.empCode) - Number(b.empCode));
    const results: FilePunchResult[] = parsed.problems.map((p) => ({
      row: p.row, empCode: p.empCode, name: p.name, date: '', time: '', column: null,
      status: 'rejected' as const, message: p.message,
    }));
    for (const punch of punches) {
      let status: FilePunchResult['status'] = 'rejected';
      let message: string | undefined;
      let type: 'in' | 'out' | undefined;
      if (!branchOf.has(punch.empCode)) {
        message = 'كود الموظف غير موجود في النظام';
      } else if (allowed && !allowed.includes(branchOf.get(punch.empCode)!)) {
        message = 'الموظف من فرع خارج صلاحياتك';
      } else {
        ({ status, message, type } = await this.importOne(device, punch, user.sub, now));
      }
      results.push({ row: punch.row, empCode: punch.empCode, name: punch.name, date: punch.date,
        time: punch.time.slice(0, 5), column: punch.column, status, message, type });
    }
    results.sort((a, b) => a.row - b.row || (a.column === 'out' ? 1 : 0) - (b.column === 'out' ? 1 : 0));

    const count = (status: FilePunchStatus) => results.filter((r) => r.status === status).length;
    this.logger.log(`DEVICE_FILE_IMPORT user=${user.sub} device=${device.id} punches=${punches.length} applied=${count('applied')}`);
    return {
      fileName: file.originalname,
      deviceId: device.id || null,
      received: punches.length,
      applied: count('applied'),
      duplicate: count('duplicate'),
      rejected: count('rejected'),
      retry: count('retry'),
      emptyRows: parsed.emptyRows,
      results,
    };
  }

  private async importOne(
    device: DeviceRow,
    punch: FilePunch,
    userId: number,
    now: Date,
  ): Promise<{ status: FilePunchStatus; message?: string; type?: 'in' | 'out' }> {
    const { empCode, date, time } = punch;
    if (!isRealDateTime(date, time)) return { status: 'rejected', message: 'وقت البصمة غير صحيح' };
    // File times are Cairo wall clock; compare them with the Cairo wall clock, not UTC.
    const at = Date.parse(`${date}T${time}Z`);
    const wallNow = businessWallClockMs(now);
    if (at > wallNow + 5 * 60_000) return { status: 'rejected', message: 'وقت البصمة في المستقبل' };
    if (wallNow - at > MAX_PUNCH_AGE_DAYS * 24 * 3600 * 1000) {
      return { status: 'rejected', message: `بصمة أقدم من ${MAX_PUNCH_AGE_DAYS} يوم لا تُسجل من الملف` };
    }

    const reserved = await this.reserve(device.id, empCode, date, time, { state: punch.column === 'in' ? 0 : 1 }, true);
    if (!reserved) return { status: 'duplicate', message: 'تم استيراد هذه البصمة من قبل' };
    const finish = async (result: 'applied' | 'rejected' | 'ignored', message?: string, attendanceId?: number) => {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE attendance_device_punches
        SET result = ${result}, message = ${message?.slice(0, 255) ?? null}, attendance_id = ${attendanceId ?? null}
        WHERE id = ${reserved}`);
    };

    if (await this.hasRecentAppliedPunch(empCode, date, time, reserved, true)) {
      const message = 'مسجلة بالفعل من جهاز البصمة (خلال دقيقتين)';
      await finish('ignored', message);
      return { status: 'duplicate', message };
    }

    try {
      const result = await this.attendance.manualCheck(
        { empCode, channel: 'device' },
        userId,
        device.branch_id_fk ?? undefined,
        { actionDate: date, time: time.slice(0, 5) },
      );
      await finish('applied', result.type === 'out' ? 'انصراف' : 'حضور', result.id);
      return { status: 'applied', type: result.type as 'in' | 'out' };
    } catch (error) {
      const message = errorMessage(error);
      const transient = !(error instanceof HttpException) || error.getStatus() >= 500 || message.includes('قيد التنفيذ');
      if (transient) {
        await this.prisma.$executeRaw(Prisma.sql`DELETE FROM attendance_device_punches WHERE id = ${reserved}`);
        this.logger.warn(`DEVICE_FILE_PUNCH_RETRY user=${empCode} at=${date} ${time}: ${message}`);
        return { status: 'retry', message: `${message} — أعد رفع الملف لاحقاً لتسجيلها` };
      }
      if (ALREADY_RECORDED.test(message)) {
        await finish('ignored', message);
        return { status: 'duplicate', message };
      }
      await finish('rejected', message);
      return { status: 'rejected', message };
    }
  }

  /** Claims the (device, user, time) slot. Returns the row id, or null if already handled. */
  private async reserve(
    deviceId: number,
    userId: string,
    date: string,
    time: string,
    punch: Pick<DevicePunchItemDto, 'state' | 'verify'>,
    reclaimRejected = false,
  ): Promise<number | null> {
    const inserted = await this.prisma.$executeRaw(Prisma.sql`
      INSERT IGNORE INTO attendance_device_punches
        (device_id, device_user_id, punch_date, punch_time, device_state, verify_type, result)
      VALUES (${deviceId}, ${userId}, ${date}, ${time}, ${punch.state ?? null}, ${punch.verify ?? null}, 'processing')`);
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM attendance_device_punches
      WHERE device_id = ${deviceId} AND device_user_id = ${userId}
        AND punch_date = ${date} AND punch_time = ${time}`);
    const id = rows[0] ? Number(rows[0].id) : null;
    if (id == null) return null;
    if (inserted === 1) return id;
    if (reclaimRejected) {
      // A file re-upload retries rows refused earlier (e.g. the employee was added since).
      const retaken = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE attendance_device_punches SET result = 'processing', message = NULL, received_at = NOW()
        WHERE id = ${id} AND result = 'rejected'`);
      if (retaken === 1) return id;
    }
    // Already there: only take it over when an earlier request died half-way through.
    const claimed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE attendance_device_punches SET received_at = NOW()
      WHERE id = ${id} AND result = 'processing'
        AND received_at < NOW() - INTERVAL ${STALE_PROCESSING_SECONDS} SECOND`);
    return claimed === 1 ? id : null;
  }

  /**
   * The device agent only looks back (clock seconds are exact). Excel times have minute
   * resolution, so a file punch also matches a device punch up to two minutes after it.
   */
  private async hasRecentAppliedPunch(userId: string, date: string, time: string, excludeId: number, bothWays = false) {
    const sameDay = await this.prisma.$queryRaw<Array<{ punch_time: string }>>(Prisma.sql`
      SELECT punch_time FROM attendance_device_punches
      WHERE device_user_id = ${userId} AND punch_date = ${date} AND result = 'applied' AND id <> ${excludeId}`);
    const at = secondsOfDay(time);
    return sameDay.some((row) => {
      const diff = at - secondsOfDay(row.punch_time);
      return (bothWays || diff >= 0) && Math.abs(diff) <= DUPLICATE_WINDOW_SECONDS;
    });
  }
}
