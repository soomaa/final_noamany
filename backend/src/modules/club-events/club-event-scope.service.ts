import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

const FORBIDDEN_EVENT = 'لا تملك صلاحية الوصول لفعاليات هذا الفرع';

/**
 * Branch isolation for club events. Every event-scoped resource (sessions,
 * registrations, payments, check-ins, live display) inherits the owning
 * event's `club_events.branch_id`.
 */
@Injectable()
export class ClubEventScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService = new BranchScopeService(),
  ) {}

  /** Event list filter: null ⇒ unrestricted, otherwise an `in` filter on branch_id. */
  eventBranchFilter(user: JwtUser, requested?: string | number | null): Prisma.IntFilter | undefined {
    const ids = this.branchScope.resolveListFilter(user, requested ?? null);
    return ids === null ? undefined : { in: ids };
  }

  /** Throws 404 for a missing event and 403 for an event outside the user's branches. */
  async assertEvent(user: JwtUser, eventId: number): Promise<void> {
    if (!Number.isFinite(Number(eventId))) return;
    const event = await this.prisma.club_events.findFirst({
      where: { id: Number(eventId), is_deleted: false },
      select: { branch_id: true },
    });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    this.branchScope.assertBranchAllowed(user, event.branch_id, FORBIDDEN_EVENT);
  }

  async assertRegistration(user: JwtUser, registrationId: number): Promise<void> {
    const registration = await this.prisma.club_event_registrations.findFirst({
      where: { id: Number(registrationId) },
      select: { event: { select: { branch_id: true } }, member: { select: { gender: true } } },
    });
    if (!registration) throw new NotFoundException('التسجيل غير موجود');
    this.branchScope.assertBranchAllowed(user, registration.event.branch_id, FORBIDDEN_EVENT);
    if (registration.member && !this.branchScope.isMemberGenderAllowed(user, registration.member.gender)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لأعضاء هذا القسم');
    }
  }

  async assertMember(user: JwtUser, memberId: number | null | undefined): Promise<void> {
    if (memberId == null) return;
    const member = await this.prisma.club_members.findFirst({
      where: { id: Number(memberId), is_deleted: false },
      select: { gender: true },
    });
    if (member && !this.branchScope.isMemberGenderAllowed(user, member.gender)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لأعضاء هذا القسم');
    }
  }

  memberGender(user: JwtUser): 'male' | 'female' | null {
    return this.branchScope.memberGenderFilter(user);
  }

  /** رجالي/حريمي/الكل list filter: the section to show (null = both); 403 for another section. */
  resolveMemberGender(user: JwtUser, requested?: string | null): 'male' | 'female' | null {
    return this.branchScope.resolveMemberGenderRequest(user, requested);
  }

  assertBranch(user: JwtUser, branchId: number | null | undefined): void {
    this.branchScope.assertBranchAllowed(user, branchId, FORBIDDEN_EVENT);
  }
}
