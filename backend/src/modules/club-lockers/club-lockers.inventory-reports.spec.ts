import { ClubLockersService } from './club-lockers.service';
import { ForbiddenException } from '@nestjs/common';

describe('ClubLockersService inventory reports', () => {
  it('stores customer and subscription data with a newly created finding', async () => {
    const create = jest.fn(async ({ data }: any) => data);
    const service = new ClubLockersService(
      { club_locker_inventory_reports: { create } } as any,
      {} as any,
      { resolveListFilter: jest.fn().mockReturnValue([3]), isBranchAllowed: jest.fn().mockReturnValue(true) } as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'inventorySnapshot').mockResolvedValue([
      { id: 11, lockerNumber: '11', isAvailable: false, latestCustomerName: 'العميل الحالي', latestCustomerPhone: '01011111111', previousCustomerName: 'العميل السابق', previousCustomerPhone: '01022222222', latestSubscriptionStartDate: '2026-10-01', latestSubscriptionEndDate: '2026-11-01' },
    ]);

    await service.createInventoryReport({
      branchId: 3,
      employeeId: 22,
      items: [{ lockerId: 11, observedStatus: 'occupied', notes: 'تم الجرد' }],
    }, { sub: 5 } as any);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({
          locker_id: 11,
          latest_customer_name: 'العميل الحالي',
          latest_customer_phone: '01011111111',
          previous_customer_name: 'العميل السابق',
          previous_customer_phone: '01022222222',
          latest_subscription_start_date: '2026-10-01',
          latest_subscription_end_date: '2026-11-01',
        })] },
      }),
    }));
  });

  it('replaces a report findings with the edited locker statuses', async () => {
    const savedItems: Array<{ report_id: number; locker_id: number; observed_status: string; notes: string | null }> = [
      { report_id: 7, locker_id: 11, observed_status: 'available', notes: 'قبل التعديل' },
    ];

    const report = {
      id: 7, branch_id: 3, employee_id: 22, notes: 'ملاحظة قديمة',
      items: [{ locker_id: 11, latest_customer_name: 'العميل وقت الجرد', latest_customer_phone: '01011111111', previous_customer_name: null, previous_customer_phone: null, latest_subscription_start_date: '2026-10-01', latest_subscription_end_date: '2026-11-01' }],
    };
    const prisma: any = {
      club_locker_inventory_reports: {
        findUnique: jest.fn().mockResolvedValue(report),
        update: jest.fn(async ({ data }: { data: { employee_id: number | null; notes: string | null } }) => ({
          ...report,
          ...data,
          items: savedItems.filter((item) => item.report_id === report.id),
        })),
      },
      club_lockers: {
        findMany: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]),
      },
      club_locker_inventory_report_items: {
        deleteMany: jest.fn(async ({ where }: { where: { report_id: number } }) => {
          for (let index = savedItems.length - 1; index >= 0; index -= 1) {
            if (savedItems[index].report_id === where.report_id) savedItems.splice(index, 1);
          }
        }),
        createMany: jest.fn(async ({ data }: { data: typeof savedItems }) => savedItems.push(...data)),
      },
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work(prisma)),
    };
    const service = new ClubLockersService(prisma as any, {} as any, { isBranchAllowed: jest.fn().mockReturnValue(true) } as any, {} as any, {} as any);
    jest.spyOn(service, 'inventorySnapshot').mockResolvedValue([
      { id: 11, lockerNumber: '11', isAvailable: false, latestCustomerName: 'عميل أحدث', latestCustomerPhone: '01099999999', previousCustomerName: null, previousCustomerPhone: null, latestSubscriptionStartDate: '2026-11-01', latestSubscriptionEndDate: '2026-12-01' },
      { id: 12, lockerNumber: '12', isAvailable: true, latestCustomerName: 'عميل جديد', latestCustomerPhone: '01022222222', previousCustomerName: null, previousCustomerPhone: null, latestSubscriptionStartDate: '2026-10-02', latestSubscriptionEndDate: '2026-11-02' },
    ]);

    const result = await service.updateInventoryReport(7, {
      employeeId: 29,
      notes: 'تمت المراجعة',
      items: [
        { lockerId: 11, observedStatus: 'occupied', notes: 'مؤجر' },
        { lockerId: 12, observedStatus: 'maintenance', notes: 'القفل يحتاج صيانة' },
      ],
    } as any, { sub: 5 } as any);

    expect(result).toMatchObject({ employee_id: 29, notes: 'تمت المراجعة' });
    expect(result).toMatchObject({
      items: [
        { locker_id: 11, observed_status: 'occupied', notes: 'مؤجر', latest_customer_name: 'العميل وقت الجرد', latest_customer_phone: '01011111111' },
        { locker_id: 12, observed_status: 'maintenance', notes: 'القفل يحتاج صيانة', latest_customer_name: 'عميل جديد', latest_customer_phone: '01022222222' },
      ],
    });
  });

  it('does not delete a report from another branch', async () => {
    const deleteReport = jest.fn();
    const service = new ClubLockersService(
      { club_locker_inventory_reports: { findUnique: jest.fn().mockResolvedValue({ id: 7, branch_id: 3 }), delete: deleteReport } } as any,
      {} as any,
      { isBranchAllowed: jest.fn().mockReturnValue(false) } as any,
      {} as any,
      {} as any,
    );

    await expect(service.deleteInventoryReport(7, { sub: 5 } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteReport).not.toHaveBeenCalled();
  });
});
