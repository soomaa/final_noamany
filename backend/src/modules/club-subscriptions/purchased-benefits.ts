import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type CatalogBenefits = { classTypeIds?: number[]; inbody_count?: number | null; includes_spa?: boolean; spa_count?: number | null; is_linked_to_freeze?: boolean; freeze_days?: number | null; freeze_total_days?: number | null; min_freeze?: number | null };
export function purchasedBenefits(subscription: { purchased_benefits?: unknown }, fallback?: CatalogBenefits | null): CatalogBenefits {
  const value = subscription.purchased_benefits;
  if (value && typeof value === 'object' && !Array.isArray(value) && (value as { version?: unknown }).version === 1) return value as CatalogBenefits;
  return fallback ?? {};
}
export async function captureBenefits(client: PrismaService | Prisma.TransactionClient, typeId?: number | null): Promise<Prisma.InputJsonObject> {
  const type = typeId ? await client.club_subscription_types.findUnique({ where: { id: typeId }, include: { class_types: { include: { class_type: true } } } }) : null;
  return { version: 1, classTypeNames: type?.class_types?.map(row => row.class_type?.name ?? '').filter(Boolean) ?? [], classTypeIds: type?.class_types?.map(row => row.class_type_id) ?? [], inbody_count: type?.inbody_count ?? 0, includes_spa: type?.includes_spa ?? false, spa_count: type?.spa_count ?? 0,
    is_linked_to_freeze: type ? type.is_linked_to_freeze === true : true, freeze_days: type?.freeze_days ?? null,
    freeze_total_days: type?.freeze_total_days ?? null, min_freeze: (type as CatalogBenefits | null)?.min_freeze ?? 0 };
}
