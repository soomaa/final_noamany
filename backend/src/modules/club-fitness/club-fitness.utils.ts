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
