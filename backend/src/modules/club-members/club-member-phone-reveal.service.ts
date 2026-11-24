import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ContactVisibilityService } from '../../common/privacy/contact-visibility.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { BusinessAuditService } from '../gym-ops/business-audit.service';

/**
 * The audited reveal behind the eye on a masked number (ported from Gymora / FIT90).
 *
 * Lists stay masked; this returns ONE real number at a time and writes an audit row for every
 * read, which is what makes someone scraping numbers one by one visible. Who may read is decided
 * by ContactVisibilityService (viewPhone / revealPhone, the reception desk for members, or the
 * rep who owns the record).
 */
@Injectable()
export class ClubMemberPhoneRevealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
    private readonly visibility: ContactVisibilityService,
  ) {}

  async revealMemberPhone(id: number, user: JwtUser): Promise<{ id: number; phone: string | null }> {
    if (!(await this.visibility.mayRevealMemberPhone(user, id))) {
      throw new ForbiddenException('ليس لديك صلاحية إظهار رقم هذا العضو');
    }
    const row = await this.prisma.club_members.findFirst({
      where: { id, is_deleted: false },
      select: { id: true, phone: true, branch_id: true, name: true },
    });
    if (!row || !this.branchScope.isBranchAllowed(user, row.branch_id)) throw new NotFoundException('العضو غير موجود');
    await this.audit.log({
      entityType: 'club_member',
      entityId: row.id,
      action: 'reveal_phone',
      actorUserId: user.sub,
      actorName: user.name ?? undefined,
      branchId: row.branch_id,
      after: { memberName: row.name },
    });
    return { id: row.id, phone: row.phone };
  }

  async revealLeadPhone(id: number, user: JwtUser): Promise<{ id: number; phone: string | null }> {
    if (!(await this.visibility.mayRevealLeadPhone(user, id))) {
      throw new ForbiddenException('ليس لديك صلاحية إظهار رقم هذا العميل');
    }
    const lead = await this.prisma.club_leads.findFirst({
      where: { id, is_deleted: false },
      select: { id: true, phone: true, name: true, branch_id: true },
    });
    // A lead not yet placed in a branch is reachable by whoever passed the check above.
    const allowed = lead && (lead.branch_id == null || this.branchScope.isBranchAllowed(user, lead.branch_id));
    if (!lead || !allowed) throw new NotFoundException('العميل المحتمل غير موجود');
    await this.audit.log({
      entityType: 'club_lead',
      entityId: lead.id,
      action: 'reveal_phone',
      actorUserId: user.sub,
      actorName: user.name ?? undefined,
      branchId: lead.branch_id ?? undefined,
      after: { leadName: lead.name },
    });
    return { id: lead.id, phone: lead.phone };
  }
}
