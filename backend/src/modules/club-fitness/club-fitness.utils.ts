import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const EGYPT_TZ = 'Africa/Cairo';

/** Local calendar date YYYY-MM-DD (Egypt), not UTC. */
export function localDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EGYPT_TZ }).format(date);
}

/** True when two time ranges [start, end) overlap (HH:MM or HH:MM:SS strings). */
export function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function normalizeTimeOfDay(value: unknown, message = 'صيغة الوقت غير صالحة'): string {
  const raw = value == null ? '' : String(value).trim();
  const parts = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!parts) throw new BadRequestException(message);
  const hours = Number(parts[1]);
  const minutes = Number(parts[2]);
  const seconds = parts[3] == null ? 0 : Number(parts[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) throw new BadRequestException(message);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Reject when end time is not strictly after start (same-day classes). */
export function assertEndTimeAfterStart(
  startTime: string,
  endTime: string,
  message = 'وقت النهاية يجب أن يكون بعد وقت البداية',
): void {
  if (!startTime || !endTime || startTime >= endTime) {
    throw new BadRequestException(message);
  }
}

/** BMI from weight (kg) and height (cm). */
export function computeBmi(weightKg: number, heightCm: number): number {
  if (!weightKg || !heightCm) return 0;
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 100) / 100;
}

export function lockerNetDue(subscriptionValue: number, discountEnabled: boolean, discountValue: number): number {
  const gross = subscriptionValue;
  const discount = discountEnabled ? Math.min(Math.max(0, discountValue), gross) : 0;
  return Math.round((gross - discount) * 100) / 100;
}

/** Transaction-safe sequential document number: `{prefix}-{padded}`. */
export async function nextNumber(
  prisma: PrismaService | Prisma.TransactionClient,
  table: string,
  column: string,
  prefix: string,
  pad = 6,
): Promise<string> {
  const prefixLen = prefix.length + 1;
  const lockKey = `seq:${table}:${column}:${prefix}`;
  await prisma.$queryRawUnsafe('SELECT GET_LOCK(?, 10)', lockKey);
  try {
    const rows = await prisma.$queryRawUnsafe<{ maxNum: number | null }[]>(
      `SELECT MAX(CAST(SUBSTRING(\`${column}\`, ${prefixLen}) AS UNSIGNED)) AS maxNum
       FROM \`${table}\` WHERE \`${column}\` LIKE ?`,
      `${prefix}-%`,
    );
    const next = (rows[0]?.maxNum ?? 0) + 1;
    return `${prefix}-${String(next).padStart(pad, '0')}`;
  } finally {
    await prisma.$queryRawUnsafe('SELECT RELEASE_LOCK(?)', lockKey);
  }
}

export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'active'] as const;

export function isActiveEnrollment(status: string): boolean {
  return status !== 'cancelled';
}

export function toNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

/** Verify club member exists and is not soft-deleted. */
export async function assertMemberExists(prisma: PrismaService, memberId: number) {
  const member = await prisma.club_members.findFirst({
    where: { id: memberId, is_deleted: false },
    select: { id: true, name: true },
  });
  if (!member) {
    throw new NotFoundException('العضو غير موجود');
  }
  return member;
}

/** `club_trainers.specialization` stays one VarChar(200); the API shape is a list. */
export const SPECIALIZATION_SEPARATOR = '، ';
export const SPECIALIZATION_MAX_LENGTH = 200;

/** Free text → chips, split on the separators staff actually type. */
export function splitSpecializations(specialization: string | null | undefined): string[] {
  if (!specialization?.trim()) return [];
  return specialization
    .split(/[،,/|]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Chips → the single stored column. Blanks are dropped and the result must still fit
 * VarChar(200), otherwise MySQL would silently truncate the last specialization.
 */
export function joinSpecializations(value: unknown): string | null {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new BadRequestException('التخصصات يجب أن تكون قائمة');
  const parts = value
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter((part) => part.length > 0);
  if (!parts.length) return null;
  const joined = parts.join(SPECIALIZATION_SEPARATOR);
  if (joined.length > SPECIALIZATION_MAX_LENGTH) {
    throw new BadRequestException(`التخصصات أطول من المسموح (${SPECIALIZATION_MAX_LENGTH} حرف)`);
  }
  return joined;
}

/**
 * Re-derive `club_trainers.rating_avg` from every rating row (per-attendance, member-app and
 * staff rows alike). Shared by the admin trainer service and the member app so both write the
 * average the exact same way; pass the transaction client so the rating write and the average
 * land together.
 */
export async function recalculateTrainerRatingAvg(
  db: PrismaService | Prisma.TransactionClient,
  trainerId: number,
): Promise<number> {
  const agg = await db.club_trainer_ratings.aggregate({
    where: { trainer_id: trainerId },
    _avg: { rating: true },
  });
  const avg = agg._avg.rating != null ? Number(agg._avg.rating) : 0;
  await db.club_trainers.update({
    where: { id: trainerId },
    data: { rating_avg: avg },
  });
  return avg;
}
