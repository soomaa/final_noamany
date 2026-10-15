import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

/**
 * Sales calls already stored on lead follow-ups, in one list.
 * A follow-up counts as a call when its activity is `call`.
 */
@Injectable()
export class ClubCallsLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async list(user: JwtUser, query: { search?: string; branchId?: string; answered?: string }) {
    const requested = query.branchId && query.branchId !== 'all' ? Number(query.branchId) : null;
    const branches = this.branchScope.resolveListFilter(user, requested);
    const search = query.search?.trim();
    const answered = query.answered === 'yes' ? true : query.answered === 'no' ? false : undefined;
    const leadWhere: Prisma.club_sales_crm_leadsWhereInput = {
      ...(branches ? { branch_id: { in: branches } } : {}),
      ...(search
        ? {
            OR: [
              { full_name: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.club_sales_crm_lead_follow_ups.findMany({
      where: {
        activity_type: 'call',
        ...(answered !== undefined ? { answered } : {}),
        lead: leadWhere,
      },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true,
        note: true,
        answered: true,
        next_call_at: true,
        next_follow_up_at: true,
        created_at: true,
        lead: { select: { id: true, full_name: true, phone: true } },
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        leadId: row.lead.id,
        clientName: row.lead.full_name,
        phone: row.lead.phone,
        calledAt: row.created_at,
        answered: row.answered,
        notes: row.note,
        nextCallAt: row.next_call_at,
        nextFollowUpAt: row.next_follow_up_at,
      })),
    };
  }
}
