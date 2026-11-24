import {
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
import { AttendanceService } from './attendance.service';
import { DevicePunchBatchDto, DevicePunchItemDto } from './dto/device-punch.dto';

/** Punches older than this are stored for audit but never applied to attendance. */
const MAX_PUNCH_AGE_DAYS = 35;
/** A second scan by the same person within this window is the same punch. */
const DUPLICATE_WINDOW_SECONDS = 120;
/** A row left in "processing" this long belongs to a request that died; retry it. */
const STALE_PROCESSING_SECONDS = 120;
const MIN_TOKEN_LENGTH = 24;

export type DevicePunchStatus = 'applied' | 'rejected' | 'ignored' | 'duplicate' | 'retry';

export interface DevicePunchResult {
  userId: string;
  time: string;
  status: DevicePunchStatus;
  message?: string;
  type?: 'in' | 'out';
}

type DeviceRow = { id: number; branch_id_fk: number | null };

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

  /** Claims the (device, user, time) slot. Returns the row id, or null if already handled. */
  private async reserve(
    deviceId: number,
    userId: string,
    date: string,
    time: string,
    punch: DevicePunchItemDto,
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
    // Already there: only take it over when an earlier request died half-way through.
    const claimed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE attendance_device_punches SET received_at = NOW()
      WHERE id = ${id} AND result = 'processing'
        AND received_at < NOW() - INTERVAL ${STALE_PROCESSING_SECONDS} SECOND`);
    return claimed === 1 ? id : null;
  }

  private async hasRecentAppliedPunch(userId: string, date: string, time: string, excludeId: number) {
    const sameDay = await this.prisma.$queryRaw<Array<{ punch_time: string }>>(Prisma.sql`
      SELECT punch_time FROM attendance_device_punches
      WHERE device_user_id = ${userId} AND punch_date = ${date} AND result = 'applied' AND id <> ${excludeId}`);
    const at = secondsOfDay(time);
    return sameDay.some((row) => {
      const diff = at - secondsOfDay(row.punch_time);
      return diff >= 0 && diff <= DUPLICATE_WINDOW_SECONDS;
    });
  }
}
