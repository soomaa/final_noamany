import { ForbiddenException } from '@nestjs/common';

type DailyCloseAuditRow = { entity_id: string; action: string };
type DailyCloseAuditClient = {
  business_audit_log?: {
    findMany: (args: unknown) => Promise<DailyCloseAuditRow[]>;
  };
};

/**
 * Closed accounting days are immutable. A later append-only reopen event is the
 * only way to permit another write; historical close/reopen events stay intact.
 */
export async function assertClubAccountingDayOpen(
  client: DailyCloseAuditClient,
  input: { date: string; branchId: number; gender?: string | null },
): Promise<void> {
  // Production Prisma clients always expose this delegate. Optionality keeps narrow
  // unit-test doubles that do not exercise accounting locks backwards compatible.
  if (!client.business_audit_log?.findMany) return;
  const entityIds = [
    `${input.date}:${input.branchId}:all`,
    ...(input.gender ? [`${input.date}:${input.branchId}:${input.gender}`] : []),
  ];
  const events = await client.business_audit_log.findMany({
    where: {
      entity_type: 'club_subscription_daily_close',
      entity_id: { in: entityIds },
    },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    select: { entity_id: true, action: true },
  });
  const latestByScope = new Map<string, string>();
  for (const event of events) {
    if (!latestByScope.has(event.entity_id)) latestByScope.set(event.entity_id, event.action);
  }
  if ([...latestByScope.values()].some((action) => action === 'daily_close_close')) {
    throw new ForbiddenException('اليوم المالي مقفل — أعد فتحه بصلاحية مدير النظام ثم سجّل قيدًا عكسيًا أو العملية الجديدة');
  }
}
