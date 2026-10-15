import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubGymPoliciesService } from './club-gym-policies.service';

describe('ClubGymPoliciesService grace-session policy', () => {
  const storedRow = {
    id: 1,
    allow_checkin_with_outstanding: true,
    allow_grace_sessions: false,
    outstanding_alert_enabled: true,
    outstanding_alert_after_subscription_pct: 50,
    allow_refunds: true,
    allow_same_guest_multiple_invitations: false,
    require_expense_approval: true,
    print_subscription_receipts: false,
    print_subscription_payments: true,
    print_quick_service_receipts: false,
    print_inbody_receipts: true,
    print_spa_receipts: false,
    print_locker_receipts: false,
    print_event_receipts: true,
    receipt_paper_size: 'a4',
    receipt_a4_copies: 2,
    receipt_language: 'en',
    updated_at: new Date('2026-08-26T00:00:00Z'),
    updated_by: null,
  };
  const prisma = {
    club_gym_policies: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new ClubGymPoliciesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_gym_policies.findUnique.mockResolvedValue(storedRow);
    prisma.club_gym_policies.create.mockResolvedValue(storedRow);
    prisma.club_gym_policies.update.mockResolvedValue(storedRow);
  });

  it('returns grace sessions disabled by default', async () => {
    await expect(service.get()).resolves.toMatchObject({ allowGraceSessions: false });
  });

  it('persists only the grace-session setting when it changes', async () => {
    prisma.club_gym_policies.update.mockResolvedValueOnce({
      ...storedRow,
      allow_grace_sessions: true,
      updated_by: 7,
    });

    await expect(service.update({ allowGraceSessions: true, updatedBy: 7 })).resolves.toMatchObject({
      allowGraceSessions: true,
    });
    expect(prisma.club_gym_policies.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { allow_grace_sessions: true, updated_by: 7 },
    });
  });

  it('maps the central printing and expense approval policy', async () => {
    await expect(service.get()).resolves.toMatchObject({
      requireExpenseApproval: true,
      printSubscriptionPayments: true,
      printInbodyReceipts: true,
      printEventReceipts: true,
      receiptPaperSize: 'a4',
      receiptA4Copies: 2,
      receiptLanguage: 'en',
    });
  });

  it('saves employee financial privacy independently and returns the saved state', async () => {
    prisma.club_gym_policies.update.mockResolvedValueOnce({
      ...storedRow, restrict_employee_financial_visibility: true,
    });
    await expect(service.update({ restrictEmployeeFinancialVisibility: true, updatedBy: 7 })).resolves.toMatchObject({
      restrictEmployeeFinancialVisibility: true,
    });
    expect(prisma.club_gym_policies.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { restrict_employee_financial_visibility: true, updated_by: 7 },
    });
  });

  it('normalizes persisted receipt settings on update', async () => {
    prisma.club_gym_policies.update.mockResolvedValueOnce({
      ...storedRow, receipt_paper_size: 'thermal', receipt_a4_copies: 1, receipt_language: 'ar',
    });
    await service.update({ receiptPaperSize: 'thermal', receiptA4Copies: 1, receiptLanguage: 'ar' });
    expect(prisma.club_gym_policies.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ receipt_paper_size: 'thermal', receipt_a4_copies: 1, receipt_language: 'ar' }),
    }));
  });
});
