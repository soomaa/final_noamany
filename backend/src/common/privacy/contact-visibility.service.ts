import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionEngineService } from '../../modules/rbac/engine/permission-engine.service';
import { employeeIdForLogin } from '../../modules/employees/sales-attribution.util';
import type { JwtUser } from '../types/jwt-user';
import { maskPhone, maskSensitive } from './mask';

/**
 * Granting any of these on any customer screen reveals phone numbers everywhere (FIT90's model).
 *
 * Every screen the catalog offers the action on has to be listed here, or the cell in the
 * permissions matrix is a dead switch: an admin ticks "reveal phone numbers" on it, nothing
 * changes, and there is no error to explain why. The coverage spec pins the two lists together.
 */
export const PHONE_PERMISSIONS = [
  'club.reception:viewPhone',
  'club.members:viewPhone',
  'club.subscriptions.list:viewPhone',
  'club.leads:viewPhone',
  'sales.portal:viewPhone',
  'club.calls:viewPhone',
];

/** Off until Noamany's permission catalog gets the `viewPhone` / `viewSensitive` actions. */
export const NOAMANY_HAS_CONTACT_PRIVACY = false;

/** Same, for identity documents (national ID, card number). */
export const SENSITIVE_PERMISSIONS = PHONE_PERMISSIONS.map((key) => key.replace(':viewPhone', ':viewSensitive'));

export interface ContactVisibility {
  /** Every phone comes back readable. */
  phones: boolean;
  /** National IDs and card numbers come back readable. */
  sensitive: boolean;
  /** `employees.id` of the caller, when they are staff — used for lead ownership. */
  employeeId: number | null;
}

/**
 * Who may read a member's contact details.
 *
 * Two independent grants, both in the permissions matrix. On top of them a sales rep can
 * always reveal the number of a lead assigned to *them* — one at a time, through the
 * reveal endpoint, which is what makes bulk scraping visible in the audit log while
 * leaving a rep able to do their job.
 */
@Injectable()
export class ContactVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
  ) {}

  /**
   * Noamany has no phone-privacy permissions (its catalog has no `viewPhone` / `viewSensitive`
   * actions and every other screen shows numbers in full), so staff always see them here too.
   * The MetaFit permission check stays below for when those actions are added to the catalog.
   */
  async forUser(user: JwtUser | null | undefined): Promise<ContactVisibility> {
    if (!user) return { phones: false, sensitive: false, employeeId: null };
    const employeeId = await employeeIdForLogin(this.prisma, user.emp_code).catch(() => null);
    if (!NOAMANY_HAS_CONTACT_PRIVACY) return { phones: true, sensitive: true, employeeId: employeeId ?? null };
    const [phones, sensitive] = await Promise.all([
      this.engine.canAny(user.sub, PHONE_PERMISSIONS),
      this.engine.canAny(user.sub, SENSITIVE_PERMISSIONS),
    ]);
    return { phones, sensitive, employeeId: employeeId ?? null };
  }

  /**
   * May this caller read this one member's number in full?
   *
   * Blanket permission, or ownership: the rep the member (or the lead they came from) is
   * assigned to. Ownership is deliberately per-record — it never unmasks a list.
   */
  async mayRevealMemberPhone(user: JwtUser, memberId: number): Promise<boolean> {
    const vis = await this.forUser(user);
    if (vis.phones) return true;
    if (vis.employeeId == null) return false;
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { sales_id: true, employee_id: true },
    });
    if (!member) return false;
    return member.sales_id === vis.employeeId || member.employee_id === vis.employeeId;
  }

  /** Same question for a potential member (`club_leads`). */
  async mayRevealLeadPhone(user: JwtUser, leadId: number): Promise<boolean> {
    const vis = await this.forUser(user);
    if (vis.phones) return true;
    if (vis.employeeId == null) return false;
    const lead = await this.prisma.club_leads.findUnique({
      where: { id: leadId },
      select: { assigned_to: true },
    });
    return !!lead && lead.assigned_to === vis.employeeId;
  }

  /** Applies the visibility to one row in place of the raw values. */
  applyPhone<T extends string | null | undefined>(vis: ContactVisibility, value: T) {
    return vis.phones ? value : (maskPhone(value) as T);
  }

  applySensitive<T extends string | null | undefined>(vis: ContactVisibility, value: T) {
    return vis.sensitive ? value : (maskSensitive(value) as T);
  }
}
