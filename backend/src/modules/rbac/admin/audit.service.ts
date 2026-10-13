import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

const auditDetailType = Prisma.dmmf.datamodel.models
  .find((model) => model.name === 'rbac_audit_log')?.fields
  .find((field) => field.name === 'detail')?.type;

function encodeAuditDetail(value: unknown): unknown {
  if (value == null) return undefined;
  if (auditDetailType === 'String') {
    return JSON.stringify(value);
  }
  return value;
}

function decodeAuditDetail(value: unknown): unknown {
  if (auditDetailType !== 'String' || typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** Thin wrapper for writing RBAC administrative changes to rbac_audit_log. */
@Injectable()
export class RbacAuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(opts: {
    actorUserId?: number | null;
    action: string;
    targetType?: string;
    targetId?: string | number;
    detail?: unknown;
  }) {
    return this.prisma.rbac_audit_log.create({
      data: {
        actor_user_id: opts.actorUserId ?? null,
        action: opts.action,
        target_type: opts.targetType ?? null,
        target_id: opts.targetId != null ? String(opts.targetId) : null,
        detail: encodeAuditDetail(opts.detail) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(skip: number, take: number) {
    const [rows, total] = await Promise.all([
      this.prisma.rbac_audit_log.findMany({ orderBy: { id: 'desc' }, skip, take }),
      this.prisma.rbac_audit_log.count(),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((x): x is number => x != null))];
    const actors = actorIds.length
      ? await this.prisma.users.findMany({
          where: { user_id: { in: actorIds } },
          select: { user_id: true, username: true, name: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.user_id, a.name ?? a.username ?? String(a.user_id)]));
    return {
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorUserId: r.actor_user_id,
        actorName: r.actor_user_id != null ? actorMap.get(r.actor_user_id) ?? null : null,
        targetType: r.target_type,
        targetId: r.target_id,
        detail: decodeAuditDetail(r.detail),
        createdAt: r.created_at,
      })),
      total,
    };
  }
}
