import type { PrismaClient } from '@prisma/client';

export interface LegacySubscriptionStaff {
  employeeName: string | null;
  creatorName: string | null;
}

/** Original labels remain useful when historical staff have no current account. */
export async function loadLegacySubscriptionStaff(
  db: Pick<PrismaClient, '$queryRawUnsafe'>,
  rows: ReadonlyArray<{ id?: number; subscription_number?: string }>,
): Promise<Map<number, LegacySubscriptionStaff>> {
  const ids = [...new Set(rows.filter(row => row.subscription_number?.startsWith('LEG-S-') && Number.isSafeInteger(row.id)).map(row => String(row.id)))];
  const result = new Map<number, LegacySubscriptionStaff>();
  if (!ids.length) return result;
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const records = await db.$queryRawUnsafe<Array<{ legacy_id: string; payload: string }>>(
        'SELECT legacy_id,payload FROM legacy_gym_source_records WHERE source_key=? AND legacy_table=? AND legacy_id IN (' + batch.map(() => '?').join(',') + ')',
        'noamanycenter_noamany:06f7dadd2176894a', 'legacy_subscription_staff', ...batch,
      );
      for (const record of records) {
        const value = JSON.parse(record.payload) as Record<string, unknown>;
        result.set(Number(record.legacy_id), {
          employeeName: typeof value.employeeName === 'string' && value.employeeName.trim() ? value.employeeName.trim() : null,
          creatorName: typeof value.creatorName === 'string' && value.creatorName.trim() ? value.creatorName.trim() : null,
        });
      }
    }
  } catch (error) {
    const failure = error as { code?: string; meta?: { code?: string } };
    // Environments without the customer migration archive continue to work.
    if (failure.code === 'ER_NO_SUCH_TABLE' || (failure.code === 'P2010' && failure.meta?.code === '1146')) return result;
    throw error;
  }
  return result;
}
