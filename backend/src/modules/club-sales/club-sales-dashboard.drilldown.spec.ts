import { ClubSalesDashboardService } from './club-sales-dashboard.service';

describe('sales dashboard drill-down branch isolation', () => {
  it('applies the manager branch scope to activities and closed deals', async () => {
    const prisma = {
      club_sales_crm_leads: { findMany: jest.fn().mockResolvedValue([]) },
      club_sales_crm_lead_follow_ups: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const branchScope = { resolveListFilter: jest.fn().mockReturnValue([3]) };
    const employees = { isSalesEmployee: jest.fn().mockResolvedValue(false) };
    const service = new ClubSalesDashboardService(
      prisma as never,
      branchScope as never,
      employees as never,
      {} as never,
    );

    await service.drilldown(18, { dateFrom: '2026-08-01', dateTo: '2026-08-31', range: 'custom' }, { sub: 1 } as never);

    expect(prisma.club_sales_crm_lead_follow_ups.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        lead: expect.objectContaining({ branch_id: { in: [3] } }),
      }),
    }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [3] } }),
    }));
  });

  it('summarizes typed sales activity frequency for the selected period', async () => {
    const activities = [
      { id: 1, lead_id: 10, note: 'اتصال ناجح', status: 'in_progress', activity_type: 'call', answered: true, interests: 'سنوي', next_follow_up_at: null, created_at: new Date('2026-08-05T10:00:00Z'), lead: { id: 10, full_name: 'عميل 1' } },
      { id: 2, lead_id: 10, note: 'لم يتم الرد', status: 'in_progress', activity_type: 'call', answered: false, interests: null, next_follow_up_at: null, created_at: new Date('2026-08-06T10:00:00Z'), lead: { id: 10, full_name: 'عميل 1' } },
      { id: 3, lead_id: 11, note: 'محادثة', status: 'follow_later', activity_type: 'conversation', answered: null, interests: 'حصص', next_follow_up_at: new Date('2026-09-01T10:00:00Z'), created_at: new Date('2026-08-07T10:00:00Z'), lead: { id: 11, full_name: 'عميل 2' } },
      { id: 4, lead_id: 12, note: 'مقابلة', status: 'in_progress', activity_type: 'meeting', answered: null, interests: 'PT', next_follow_up_at: null, created_at: new Date('2026-08-08T10:00:00Z'), lead: { id: 12, full_name: 'عميل 3' } },
    ];
    const prisma = {
      club_sales_crm_leads: { findMany: jest.fn().mockResolvedValue([]) },
      club_sales_crm_lead_follow_ups: { findMany: jest.fn().mockResolvedValue(activities) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ClubSalesDashboardService(
      prisma as never,
      { resolveListFilter: jest.fn().mockReturnValue([1]) } as never,
      { isSalesEmployee: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
    );

    const result = await service.drilldown(
      77,
      { dateFrom: '2026-08-01', dateTo: '2026-08-31', range: 'custom' },
      { sub: 1 } as never,
    );

    expect(result.activitySummary).toEqual({
      total: 4,
      calls: 2,
      answeredCalls: 1,
      conversations: 1,
      meetings: 1,
    });
    expect(result.activity[2]).toEqual(expect.objectContaining({
      activityType: 'conversation',
      interests: 'حصص',
      nextFollowUpAt: new Date('2026-09-01T10:00:00Z'),
    }));
    expect(prisma.club_sales_crm_lead_follow_ups.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ created_at: { gte: expect.any(Date), lte: expect.any(Date) } }),
    }));
  });
});
