import { ClubReceiptsCrudService } from './club-receipts-crud.service';

describe('ClubReceiptsCrudService receipt period filters', () => {
  it('passes member, branch, and inclusive receipt-date filters to the receipt query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { club_receipts: { findMany, count: jest.fn().mockResolvedValue(0) } };
    const branchScope = { allowedBranchIds: jest.fn().mockReturnValue(null) };
    const service = new ClubReceiptsCrudService(prisma as never, {} as never, {} as never, branchScope as never);

    await service.list({
      memberId: 9,
      branchId: 2,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      page: 1,
      pageSize: 50,
      skip: 0,
      take: 50,
    } as never);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({ member_id: 9, receipt_date: { gte: '2026-08-01', lte: '2026-08-31' } }),
        ]),
      }),
    }));
    const query = findMany.mock.calls[0][0];
    expect(query.where.AND[1].OR[0]).toEqual({
      subscription_id: { not: null },
      subscription: { is: { branch_id: { in: [2] } } },
    });
    expect(query.where.AND[1].OR[1]).toEqual(expect.objectContaining({
      subscription_id: null,
      locker_subscription_id: { not: null },
    }));
  });
});
