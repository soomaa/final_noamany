import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubLeadsService } from './club-leads.service';
import { ClubStaffInvitationsService } from './club-staff-invitations.service';
import {
  decideQuota,
  effectiveQuota,
  egyptianMobile,
  invitationOutcome,
  normalizeInvitationCode,
  remainingQuota,
  suggestedInvitationCode,
  validateAdjustment,
  validateVisitDate,
} from './staff-invitation-quota';

describe('staff invitation quota rules', () => {
  it('adds this month\'s +/− adjustments to the base quota and never goes negative', () => {
    expect(effectiveQuota(5, [])).toBe(5);
    expect(effectiveQuota(5, [2, -1])).toBe(6);
    expect(effectiveQuota(2, [-5])).toBe(0);
    expect(remainingQuota(6, 4)).toBe(2);
    expect(remainingQuota(3, 5)).toBe(0);
  });

  it('allows within the quota, refuses past it, and lets an override through only with a reason', () => {
    expect(decideQuota({ quota: 3, used: 2, canOverride: false })).toEqual({ ok: true, overQuota: false });
    const refused = decideQuota({ quota: 3, used: 3, canOverride: false });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.message).toContain('خلّص دعواته');
    expect(decideQuota({ quota: 3, used: 3, canOverride: true }).ok).toBe(false);
    expect(decideQuota({ quota: 3, used: 3, canOverride: true, overrideReason: '  ' }).ok).toBe(false);
    expect(decideQuota({ quota: 3, used: 3, canOverride: true, overrideReason: 'ضيف VIP' })).toEqual({ ok: true, overQuota: true });
    // A code closed for the month (quota 0) behaves the same.
    expect(decideQuota({ quota: 0, used: 0, canOverride: false }).ok).toBe(false);
  });

  it('requires a non-zero whole number and a reason for a quick +/−', () => {
    expect(validateAdjustment(2, 'شغل كويس')).toEqual({ delta: 2, reason: 'شغل كويس' });
    expect(validateAdjustment('-1', ' عقوبة ')).toEqual({ delta: -1, reason: 'عقوبة' });
    expect(() => validateAdjustment(0, 'سبب')).toThrow('غير صفر');
    expect(() => validateAdjustment(1.5, 'سبب')).toThrow();
    expect(() => validateAdjustment(1, '')).toThrow('سبب التعديل مطلوب');
  });

  it('normalises codes and suggests NM + employee code', () => {
    expect(normalizeInvitationCode(' nm 1001 ')).toBe('NM1001');
    expect(normalizeInvitationCode('nm-٢٥')).toBe('NM-25');
    expect(() => normalizeInvitationCode('ab')).toThrow();
    expect(() => normalizeInvitationCode('كود')).toThrow();
    expect(suggestedInvitationCode({ id: 9, emp_code: 1001 })).toBe('NM1001');
    expect(suggestedInvitationCode({ id: 9, emp_code: null })).toBe('NM9');
  });

  it('accepts Egyptian mobiles only, in their local form', () => {
    expect(egyptianMobile('01012345678')).toBe('01012345678');
    expect(egyptianMobile('+20 115 123 4567')).toBe('01151234567');
    expect(egyptianMobile('00201551234567')).toBe('01551234567');
    expect(egyptianMobile('٠١٢٣٤٥٦٧٨٩٠')).toBe('01234567890');
    expect(egyptianMobile('1012345678')).toBe('01012345678');
    expect(egyptianMobile('01312345678')).toBeNull();
    expect(egyptianMobile('0101234567')).toBeNull();
    expect(egyptianMobile('')).toBeNull();
  });

  it('keeps the visit date between a week back and a month ahead', () => {
    expect(validateVisitDate('', '2026-11-24')).toBe('2026-11-24');
    expect(validateVisitDate('2026-11-20', '2026-11-24')).toBe('2026-11-20');
    expect(() => validateVisitDate('2026-11-01', '2026-11-24')).toThrow();
    expect(() => validateVisitDate('2027-01-30', '2026-11-24')).toThrow();
    expect(() => validateVisitDate('24/11/2026', '2026-11-24')).toThrow();
  });

  it('shows a guest as converted once the lead became a member', () => {
    expect(invitationOutcome({ status: 'converted', converted_member_id: 4 }).key).toBe('converted');
    expect(invitationOutcome({ status: 'contacted', converted_member_id: 4 }).key).toBe('converted');
    expect(invitationOutcome({ status: 'membership_done', converted_member_id: null }).key).toBe('subscribed');
    expect(invitationOutcome({ status: 'new', converted_member_id: null }).key).toBe('open');
    expect(invitationOutcome(null).key).toBe('no_lead');
  });
});

describe('ClubStaffInvitationsService', () => {
  const admin = { sub: 1, level: 1, emp_code: 50, branch: 1 } as JwtUser;
  const captain = { sub: 2, level: 2, emp_code: 7, branch: 1, job_title: 'كابتن' } as JwtUser;
  const code = { id: 11, employee_id: 7, code: 'NM7', monthly_quota: 2, is_active: true };

  function setup(opts: { used: number; adjustments?: number[]; canOverride?: boolean }) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_staff_invitation_codes: { findUnique: jest.fn().mockResolvedValue(code) },
      club_staff_invitations: {
        groupBy: jest.fn().mockImplementation(async () => [{ code_id: 11, _count: { _all: opts.used } }]),
        create: jest.fn().mockResolvedValue({ id: 900, code_id: 11, employee_id: 7, code: 'NM7' }),
        update: jest.fn().mockResolvedValue({}),
      },
      club_staff_invitation_adjustments: {
        findMany: jest.fn().mockResolvedValue((opts.adjustments ?? []).map((delta) => ({ code_id: 11, delta }))),
        create: jest.fn().mockResolvedValue({}),
      },
      club_leads: { findUnique: jest.fn(), update: jest.fn() },
      club_lead_follow_ups: { create: jest.fn() },
    };
    const prisma = {
      ...tx,
      club_staff_invitations: { ...tx.club_staff_invitations, findFirst: jest.fn().mockResolvedValue(null) },
      club_staff_invitation_settings: { findUnique: jest.fn().mockResolvedValue({ duplicate_window_days: 30, default_monthly_quota: 5 }) },
      club_staff_invitation_codes: { findUnique: jest.fn().mockResolvedValue(code) },
      employees: {
        findFirst: jest.fn().mockResolvedValue({ id: 7, employee: 'كابتن أحمد' }),
        findMany: jest.fn().mockResolvedValue([{ id: 7, employee: 'كابتن أحمد' }]),
      },
      club_members: { findFirst: jest.fn().mockResolvedValue(null) },
      club_leads: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ assigned_to: 30 }) },
      $transaction: jest.fn().mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const leads = {
      staffInvitationAssignment: jest.fn().mockResolvedValue({ assignedToId: 30, assignmentMode: 'automatic', lockedToInviter: false }),
      createStaffInvitationLead: jest.fn().mockResolvedValue({ id: 501 }),
    };
    const engine = { canAny: jest.fn().mockResolvedValue(opts.canOverride ?? false) };
    const branchScope = { assertBranchAllowed: jest.fn(), allowedBranchIds: jest.fn().mockReturnValue(null) };
    const service = new ClubStaffInvitationsService(
      prisma as unknown as PrismaService,
      branchScope as unknown as BranchScopeService,
      leads as unknown as ClubLeadsService,
      engine as unknown as PermissionEngineService,
    );
    return { service, prisma, tx, leads, engine };
  }

  const guest = { code: 'nm7', guestName: 'ضيف تجربة', guestPhone: '01012345678', branchId: 1 };

  it('records a guest within the allowance, locks the code row and creates the sales lead', async () => {
    const { service, tx, leads } = setup({ used: 1 });
    const result = await service.create(guest, captain);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(leads.createStaffInvitationLead).toHaveBeenCalledWith(
      expect.objectContaining({ inviterEmployeeId: 7, code: 'NM7', staffInvitationId: 900, phone: '01012345678' }),
      captain,
      tx,
    );
    expect(tx.club_staff_invitations.update).toHaveBeenCalledWith({ where: { id: 900 }, data: { lead_id: 501 } });
    expect(result).toEqual(expect.objectContaining({ leadId: 501, overQuota: false, assignedToId: 30 }));
  });

  it('says plainly when no sales rep is free, and keeps the inviter on the unassigned lead', async () => {
    const { service, prisma, leads } = setup({ used: 0 });
    leads.staffInvitationAssignment.mockResolvedValue({ assignedToId: null, assignmentMode: 'automatic', lockedToInviter: false });
    prisma.club_leads.findUnique.mockResolvedValue({ assigned_to: null });
    const result = await service.create(guest, captain);
    expect(leads.createStaffInvitationLead).toHaveBeenCalledWith(
      expect.objectContaining({ inviterEmployeeId: 7, assignment: expect.objectContaining({ assignedToId: null }) }),
      captain,
      expect.anything(),
    );
    expect(result.assignment).toBe('unassigned');
    expect(result.assignmentMessage).toBe('مفيش سيلز متاح — العميل اتسجل غير مسند');
  });

  it('refuses once the monthly allowance is used up', async () => {
    const { service, tx } = setup({ used: 2 });
    await expect(service.create(guest, captain)).rejects.toThrow(BadRequestException);
    expect(tx.club_staff_invitations.create).not.toHaveBeenCalled();
  });

  it('counts this month\'s + adjustment towards the allowance', async () => {
    const { service, tx } = setup({ used: 2, adjustments: [1] });
    await service.create(guest, captain);
    expect(tx.club_staff_invitations.create).toHaveBeenCalled();
  });

  it('lets an admin override the allowance with a reason and logs it', async () => {
    const { service, tx } = setup({ used: 2, canOverride: true });
    const result = await service.create({ ...guest, overrideReason: 'ضيف مهم' }, admin);
    expect(result.overQuota).toBe(true);
    expect(tx.club_staff_invitation_adjustments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'override', code_id: 11, reason: expect.stringContaining('ضيف مهم') }),
    });
  });

  it('rejects a phone that is not an Egyptian mobile before touching the allowance', async () => {
    const { service, prisma } = setup({ used: 0 });
    await expect(service.create({ ...guest, guestPhone: '12345' }, captain)).rejects.toThrow('موبايل مصري');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('logs a quick +/− with the quota before and after', async () => {
    const { service, tx } = setup({ used: 0, canOverride: true });
    await service.adjust(11, { delta: 3, reason: 'تشجيع' }, admin);
    expect(tx.club_staff_invitation_adjustments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'adjust', delta: 3, quota_before: 2, quota_after: 5, reason: 'تشجيع' }),
    });
  });

  it('keeps quota changes for managers of codes only', async () => {
    const { service } = setup({ used: 0, canOverride: false });
    await expect(service.adjust(11, { delta: 1, reason: 'سبب كافي' }, captain)).rejects.toThrow(ForbiddenException);
  });
});
