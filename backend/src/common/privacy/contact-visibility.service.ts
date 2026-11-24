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

/**
 * The eye next to a masked number: reveal ONE record's number at a time, through the audited
 * endpoint, without unmasking any list. Granted per screen in the permissions matrix.
 */
export const REVEAL_PHONE_PERMISSIONS = PHONE_PERMISSIONS.map((key) => key.replace(':viewPhone', ':revealPhone'));

/**
 * The reception desk has to be able to call a member, so anyone who works the desk gets the
 * audited eye even before an admin ticks «revealPhone» for their role (existing roles predate it).
 */
export const DESK_REVEAL_PERMISSIONS = ['club.reception:view'];

/**
 * Phone privacy is on (client, 24 Nov: «بنخفي كل حاجة بنجمة وجنبها أيقون العين»). Staff-facing
 * customer lists come back masked unless the caller holds `viewPhone`; the eye reveals one number.
 */
export const NOAMANY_HAS_CONTACT_PRIVACY = true;

/**
 * Noamany does not mask identity documents: `card_number` is the member's barcode card, which the
 * desk scans and prints, so `sensitive` is always readable.
 */

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

  /** Lists: readable for super admin and `viewPhone` holders, masked for everyone else. */
  async forUser(user: JwtUser | null | undefined): Promise<ContactVisibility> {
    if (!user) return { phones: false, sensitive: true, employeeId: null };
    const employeeId = await employeeIdForLogin(this.prisma, user.emp_code).catch(() => null);
    if (!NOAMANY_HAS_CONTACT_PRIVACY) return { phones: true, sensitive: true, employeeId: employeeId ?? null };
    const phones = await this.engine.canAny(user.sub, PHONE_PERMISSIONS);
    return { phones, sensitive: true, employeeId: employeeId ?? null };
  }

  /**
   * The audited eye: `viewPhone`, or `revealPhone` on a customer screen. Members' numbers also
   * open to the reception desk; potential members (sales' pipeline) do not.
   */
  async mayRevealAny(user: JwtUser, vis?: ContactVisibility, opts: { desk?: boolean } = {}): Promise<boolean> {
    if ((vis ?? (await this.forUser(user))).phones) return true;
    const keys = opts.desk === false ? REVEAL_PHONE_PERMISSIONS : [...REVEAL_PHONE_PERMISSIONS, ...DESK_REVEAL_PERMISSIONS];
    return this.engine.canAny(user.sub, keys);
  }

  /**
   * May this caller read this one member's number in full?
   *
   * Blanket permission, or ownership: the rep the member (or the lead they came from) is
   * assigned to. Ownership is deliberately per-record — it never unmasks a list.
   */
  async mayRevealMemberPhone(user: JwtUser, memberId: number): Promise<boolean> {
    const vis = await this.forUser(user);
    if (await this.mayRevealAny(user, vis)) return true;
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { sales_id: true, employee_id: true, created_by: true },
    });
    if (!member) return false;
    // Same ownership the sales portal uses: the assigned rep, or whoever registered the member.
    const mine = new Set([vis.employeeId, user.emp_code].filter((id): id is number => id != null));
    return (member.sales_id != null && mine.has(member.sales_id))
      || (member.employee_id != null && mine.has(member.employee_id))
      || member.created_by === user.sub;
  }

  /** Same question for a potential member (`club_leads`). */
  async mayRevealLeadPhone(user: JwtUser, leadId: number): Promise<boolean> {
    const vis = await this.forUser(user);
    if (await this.mayRevealAny(user, vis, { desk: false })) return true;
    const lead = await this.prisma.club_leads.findUnique({
      where: { id: leadId },
      select: { assigned_to: true },
    });
    const mine = new Set([vis.employeeId, user.emp_code].filter((id): id is number => id != null));
    return !!lead && lead.assigned_to != null && mine.has(lead.assigned_to);
  }

  /** Applies the visibility to one row in place of the raw values. */
  applyPhone<T extends string | null | undefined>(vis: ContactVisibility, value: T) {
    return vis.phones ? value : (maskPhone(value) as T);
  }

  applySensitive<T extends string | null | undefined>(vis: ContactVisibility, value: T) {
    return vis.sensitive ? value : (maskSensitive(value) as T);
  }
}
