import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';

export interface BusinessAuditInput {
  entityType: string;
  entityId: string | number;
  action: string;
  actorUserId?: number;
  actorName?: string;
  branchId?: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ipAddress?: string;
}

export function computeChangedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  if (!before && !after) return [];
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) changed.push(key);
  }
  return changed;
}

@Injectable()
export class BusinessAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: BusinessAuditInput): Promise<void> {
    const before =
      input.before != null ? (input.before as Prisma.InputJsonValue) : undefined;
    const after = input.after != null ? (input.after as Prisma.InputJsonValue) : undefined;
    const changed =
      before || after
        ? computeChangedFields(
            input.before as Record<string, unknown> | undefined,
            input.after as Record<string, unknown> | undefined,
          )
        : [];

    await this.prisma.business_audit_log.create({
      data: {
        entity_type: input.entityType,
        entity_id: String(input.entityId),
        action: input.action,
        actor_user_id: input.actorUserId ?? null,
        actor_name: input.actorName ?? null,
        branch_id: input.branchId ?? null,
        before_json: before ?? Prisma.JsonNull,
        after_json: after ?? Prisma.JsonNull,
        changed_fields: changed.length ? changed : Prisma.JsonNull,
        reason: input.reason ?? null,
        ip_address: input.ipAddress ?? null,
      },
    });
  }

  async list(query: {
    entityType?: string;
    entityId?: string;
    action?: string;
    branchId?: number;
    actorUserId?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const and: Prisma.business_audit_logWhereInput[] = [];
    if (query.entityType) and.push({ entity_type: query.entityType });
    if (query.entityId) and.push({ entity_id: query.entityId });
    if (query.action) and.push({ action: { contains: query.action } });
    if (query.branchId) and.push({ branch_id: query.branchId });
    if (query.actorUserId) and.push({ actor_user_id: query.actorUserId });
    if (query.dateFrom && query.dateTo) {
      and.push({
        created_at: {
          gte: new Date(`${query.dateFrom}T00:00:00`),
          lte: new Date(`${query.dateTo}T23:59:59`),
        },
      });
    }

    const where: Prisma.business_audit_logWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.business_audit_log.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.business_audit_log.count({ where }),
    ]);

    return paginated(
      rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        branchId: r.branch_id,
        before: r.before_json,
        after: r.after_json,
        changedFields: r.changed_fields,
        reason: r.reason,
        createdAt: r.created_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  async forEntity(entityType: string, entityId: string | number, limit = 50) {
    const rows = await this.prisma.business_audit_log.findMany({
      where: { entity_type: entityType, entity_id: String(entityId) },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorUserId: r.actor_user_id,
      actorName: r.actor_name,
      before: r.before_json,
      after: r.after_json,
      changedFields: r.changed_fields,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }
}
