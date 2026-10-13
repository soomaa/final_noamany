import { ConflictException } from '@nestjs/common';
import { ClubReceiptsService } from './club-receipts.service';

const receiptInput = {
  memberName: 'أحمد محمد',
  memberId: 7,
  paymentMethod: 'cash',
  receiptNumber: 'MANUAL-42',
};

function createPrisma(receiptExists = false) {
  return {
    club_subscriptions: {
      findUnique: jest.fn().mockResolvedValue({
        id: 3,
        member_id: 7,
        branch_id: 2,
        payment_method: 'cash',
        subscription_type: 'اشتراك شهري',
        created_by: 5,
        subscription_value: 1000,
        discount_enabled: false,
        discount_value: 0,
        waived_amount: 0,
        transferred_credit_amount: 0,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    club_receipts: {
      findUnique: jest.fn().mockResolvedValue(receiptExists ? { id: 9 } : null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ receipt_number: data.receipt_number })),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 1000 } }),
    },
    $queryRaw: jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ maxNum: 0 }])
      .mockResolvedValueOnce(undefined),
  };
}

describe('ClubReceiptsService receipt numbers', () => {
  it('previewing twice does not reserve a number or change receipt rows', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) =>
        Promise.resolve(strings.join('').includes('MAX(') ? [{ maxNum: 4 }] : [{ locked: 1 }]),
      ),
      club_receipts: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };
    const service = new ClubReceiptsService(prisma as never);
    await expect(service.nextReceiptNumber()).resolves.toBe('5');
    await expect(service.nextReceiptNumber()).resolves.toBe('5');
    expect(prisma.club_receipts.create).not.toHaveBeenCalled();
    expect(prisma.club_receipts.update).not.toHaveBeenCalled();
    expect(prisma.club_receipts.delete).not.toHaveBeenCalled();
  });

  it('continues the shared sequence with a plain numeric receipt number', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ maxNum: 4 }])
        .mockResolvedValueOnce(undefined),
    };
    const service = new ClubReceiptsService(prisma as never);

    await expect(service.nextReceiptNumber()).resolves.toBe('5');
  });

  it('stores the entered receipt number instead of generating one', async () => {
    const prisma = createPrisma();
    const service = new ClubReceiptsService(prisma as never);

    await service.createForSubscription(3, 1000, receiptInput as any);

    expect(prisma.club_receipts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ receipt_number: 'MANUAL-42' }),
    }));
  });

  it('generates the next receipt number when the cashier does not enter one', async () => {
    const prisma = createPrisma();
    const service = new ClubReceiptsService(prisma as never);
    const { receiptNumber: _receiptNumber, ...automaticReceiptInput } = receiptInput;

    await service.createForSubscription(3, 1000, automaticReceiptInput);

    expect(prisma.club_receipts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ receipt_number: '1' }),
    }));
  });

  it('rejects a manual receipt number that is already in use', async () => {
    const prisma = createPrisma(true);
    const service = new ClubReceiptsService(prisma as never);

    await expect(service.createForSubscription(3, 1000, receiptInput as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.club_receipts.create).not.toHaveBeenCalled();
  });
});
