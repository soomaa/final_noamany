import { BadRequestException } from '@nestjs/common';
import { ClubCommissionSettingsService } from './club-commission-settings.service';

describe('ClubCommissionSettingsService activation transfer', () => {
  function setup() {
    const prisma = {
      club_sales_rep_settings: { findUnique: jest.fn().mockResolvedValue({ employee_id: 8, is_active: true }) },
      club_sales_crm_leads: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([{ branch_id: 1 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      club_subscriptions: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ branch_id: 1 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    const employees = { salesReps: jest.fn().mockResolvedValue([
      { id: 9, name: 'بديل', branchIds: [1], isActive: true },
    ]) };
    return { service: new ClubCommissionSettingsService(prisma as never, employees as never), prisma };
  }

  it('previews owned active work before deactivation', async () => {
    const { service } = setup();
    await expect((service as any).previewSalesRepDeactivation(8, '2026-09-09')).resolves.toEqual({
      leads: 2, activeSubscriptions: 1, total: 3,
    });
  });

  it('refuses deactivation without an eligible transfer target', async () => {
    const { service, prisma } = setup();
    await expect((service as any).setSalesRepActive(8, false, null, '2026-09-09'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
