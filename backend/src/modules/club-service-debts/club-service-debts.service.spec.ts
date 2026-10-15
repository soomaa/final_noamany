import { ClubServiceDebtsService } from './club-service-debts.service';

describe('ClubServiceDebtsService', () => {
  it('records the collected amount and creates a debt for the unpaid service balance', async () => {
    const tx = {
      club_service_debts: {
        create: jest.fn().mockResolvedValue({
          id: 9,
          debt_number: 'DEBT-2026-000001',
          total_amount: 100,
          paid_amount: 40,
          remaining_amount: 60,
        }),
      },
      club_receipts: {
        create: jest.fn().mockResolvedValue({
          id: 12,
          receipt_number: 'REC-2026-000001',
          amount: 40,
          payments: [
            { method: 'cash', amount: 25 },
            { method: 'card', amount: 15 },
          ],
        }),
      },
    };
    const ledger = { postClubServiceSale: jest.fn().mockResolvedValue(undefined) };
    const receipts = { nextReceiptNumber: jest.fn().mockResolvedValue('REC-2026-000001') };
    const service = new ClubServiceDebtsService(
      {} as never,
      ledger as never,
      receipts as never,
      { isBranchAllowed: () => true } as never,
    );

    const result = await service.recordSale(
      {
        sourceType: 'inbody',
        sourceRef: 'INB-2026-000001',
        branchId: 1,
        memberId: 7,
        customerName: 'Fatma',
        totalAmount: 100,
        paidAmount: 40,
        paymentMethod: 'cash',
        payments: [
          { method: 'cash', amount: 25 },
          { method: 'card', amount: 15 },
        ],
        transactionDate: '2026-08-28',
        description: 'InBody',
      },
      tx as never,
    );

    expect(result.remainingAmount).toBe(60);
    expect(tx.club_service_debts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ total_amount: 100, paid_amount: 40, remaining_amount: 60 }),
    }));
    expect(tx.club_receipts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 40 }),
    }));
    expect(ledger.postClubServiceSale).toHaveBeenCalledWith(expect.objectContaining({
      totalAmount: 100,
      collectedAmount: 40,
      payments: [
        { method: 'cash', amount: 25 },
        { method: 'card', amount: 15 },
      ],
    }), tx);
  });
});
