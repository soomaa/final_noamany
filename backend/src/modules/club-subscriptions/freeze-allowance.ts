import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

interface FreezeRow {
  id: number;
  freeze_start_date: string;
  freeze_end_date: string | null;
  planned_days: number;
  actual_days: number | null;
  is_active: boolean;
  reason: string | null;
}

/**
 * A subscription's freeze balance (ported from MetaFit): `freeze_days` on the package caps how
 * many times it may be frozen, `freeze_total_days` caps the days across all freezes; NULL means
 * unlimited. A running freeze has already added its planned days to the end date, so those
 * days count as used until it ends early.
 */
export async function freezeAllowance(client: Client, sub: { id: number; subscription_type_id: number | null }, excludeFreezeId?: number) {
  const type = sub.subscription_type_id
    ? await client.club_subscription_types.findUnique({
      where: { id: sub.subscription_type_id },
      select: { is_linked_to_freeze: true, freeze_days: true, freeze_total_days: true },
    })
    : null;
  const history: FreezeRow[] = await client.club_subscription_freezes.findMany({
    where: { subscription_id: sub.id },
    orderBy: { id: 'asc' },
    select: { id: true, freeze_start_date: true, freeze_end_date: true, planned_days: true, actual_days: true, is_active: true, reason: true },
  });
  const counted = history.filter((row) => row.id !== excludeFreezeId);
  const daysOf = (row: FreezeRow) => Math.max(0, row.is_active ? row.planned_days : row.actual_days ?? row.planned_days ?? 0);
  const usedDays = counted.reduce((sum, row) => sum + daysOf(row), 0);
  const totalTimes = type?.freeze_days ?? null;
  const totalDays = type?.freeze_total_days ?? null;
  return {
    allowed: type ? type.is_linked_to_freeze : true,
    totalTimes,
    usedTimes: counted.length,
    remainingTimes: totalTimes == null ? null : Math.max(0, totalTimes - counted.length),
    totalDays,
    usedDays,
    remainingDays: totalDays == null ? null : Math.max(0, totalDays - usedDays),
    history,
    daysOf,
  };
}

/** Throws when a new freeze of `days` days does not fit the subscription's balance. */
export function assertFreezeFits(allowance: Awaited<ReturnType<typeof freezeAllowance>>, days: number) {
  if (!allowance.allowed) throw new BadRequestException('نوع الاشتراك لا يدعم التجميد');
  if (allowance.remainingTimes === 0) {
    throw new BadRequestException(`تم استنفاذ عدد مرات التجميد المسموح بها (${allowance.totalTimes})`);
  }
  if (allowance.remainingDays === 0) {
    throw new BadRequestException(`تم استنفاذ إجمالي أيام التجميد (${allowance.totalDays} يوم)`);
  }
  if (allowance.remainingDays != null && days > allowance.remainingDays) {
    throw new BadRequestException(`المتبقي من رصيد التجميد ${allowance.remainingDays} يوم فقط`);
  }
}
