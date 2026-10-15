import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginated } from '../dto/list-result';
import { RequestContextService } from '../http/request-context.service';
import { cairoDateBounds } from '../utils/cairo-date';
import { BranchScopeService } from '../branch-scope/branch-scope.service';
import { JwtUser } from '../types/jwt-user';

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
  correlationId?: string;
}

type AuditMutationClient = Pick<Prisma.TransactionClient, 'business_audit_log'>;

const SENSITIVE_AUDIT_KEY = /(?:pass(?:word)?|token|secret|salary|rateb|safi|bank|account|iban|phone|mobile|national|passport|insurance|card_num|(?:^|_)(?:emp|employee|user)(?:_|$|id)|name|email|mail|address|city|photo|image|avatar|birth|dob|gender|marital|religion|qualification|military|personal)/i;
const SAFE_AUDIT_VALUE_KEY = /^(?:status|state|approved|enabled|active|success|count|version|mode|step|stage|outcome|result|year|month|day|errorType|statusCode)$/i;

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  return sanitizeAuditNode(value, depth, false);
}

function sanitizeAuditNode(
  value: unknown,
  depth: number,
  allowScalar: boolean,
): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return allowScalar ? value : '[REDACTED]';
  }
  if (typeof value === 'string') {
    return allowScalar ? value.slice(0, 2_000) : '[REDACTED]';
  }
  if (value instanceof Date) {
    return allowScalar ? value.toISOString() : '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeAuditNode(item, depth + 1, allowScalar));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_AUDIT_KEY.test(key)
          ? '[REDACTED]'
          : item != null && typeof item === 'object'
            ? sanitizeAuditNode(item, depth + 1, false)
            : SAFE_AUDIT_VALUE_KEY.test(key)
              ? sanitizeAuditNode(item, depth + 1, true)
              : '[REDACTED]',
      ]),
    );
  }
  return allowScalar ? String(value).slice(0, 2_000) : '[REDACTED]';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Optional() private readonly branches?: BranchScopeService,
  ) {}

  async log(
    input: BusinessAuditInput,
    client: AuditMutationClient = this.prisma,
  ): Promise<void> {
    const before =
      input.before != null
        ? (sanitizeAuditValue(input.before) as Prisma.InputJsonValue)
        : undefined;
    const after =
      input.after != null
        ? (sanitizeAuditValue(input.after) as Prisma.InputJsonValue)
        : undefined;
    const changed =
      before || after
        ? computeChangedFields(
            input.before as Record<string, unknown> | undefined,
            input.after as Record<string, unknown> | undefined,
          )
        : [];

    await client.business_audit_log.create({
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
        correlation_id: input.correlationId ?? this.requestContext.correlationId ?? null,
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
  }, user?: JwtUser) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const and: Prisma.business_audit_logWhereInput[] = [];
    if (user && this.branches) {
      const allowed = this.branches.allowedBranchIds(user);
      if (allowed !== null) and.push(allowed.length ? { branch_id: { in: allowed } } : { id: -1 });
    }
    if (query.entityType) and.push({ entity_type: query.entityType });
    if (query.entityId) and.push({ entity_id: query.entityId });
    if (query.action) and.push({ action: { contains: query.action } });
    if (query.branchId) and.push({ branch_id: query.branchId });
    if (query.actorUserId) and.push({ actor_user_id: query.actorUserId });
    if (query.dateFrom && query.dateTo) {
      const { start, endExclusive } = cairoDateBounds(query.dateFrom, query.dateTo);
      and.push({
        created_at: {
          gte: start,
          lt: endExclusive,
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

    // Older audit rows often stored only the user id. Resolve names in one
    // batched query so the administrative log stays understandable without
    // changing or rewriting historical audit data.
    const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter((value): value is number => value != null))];
    const actors = actorIds.length
      ? await this.prisma.users.findMany({
          where: { user_id: { in: actorIds } },
          select: { user_id: true, name: true, username: true },
        })
      : [];
    const actorNames = new Map(
      actors.map((actor) => [actor.user_id, actor.name ?? actor.username ?? null]),
    );

    return paginated(
      rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actorUserId: r.actor_user_id,
        actorName:
          r.actor_name ??
          (r.actor_user_id != null ? actorNames.get(r.actor_user_id) ?? null : null),
        branchId: r.branch_id,
        before: r.before_json,
        after: r.after_json,
        changedFields: r.changed_fields,
        reason: r.reason,
        correlationId: r.correlation_id,
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
    const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter((value): value is number => value != null))];
    const actors = actorIds.length
      ? await this.prisma.users.findMany({
          where: { user_id: { in: actorIds } },
          select: { user_id: true, name: true, username: true },
        })
      : [];
    const actorNames = new Map(actors.map((actor) => [actor.user_id, actor.name ?? actor.username ?? null]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorUserId: r.actor_user_id,
      actorName: r.actor_name ?? (r.actor_user_id != null ? actorNames.get(r.actor_user_id) ?? null : null),
      before: r.before_json,
      after: r.after_json,
      changedFields: r.changed_fields,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }
}
