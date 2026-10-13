import { INJECTABLE_WATERMARK } from '@nestjs/common/constants';
import { CustomerServiceService } from './customer-service.service';

describe('CustomerServiceService', () => {
  it('is injectable so PrismaService is available to its request handlers', () => {
    expect(Reflect.getMetadata(INJECTABLE_WATERMARK, CustomerServiceService)).toBe(true);
  });

  it('filters contacted subscriptions by their contact date before pagination', async () => {
    const feedbacks = {
      findMany: jest.fn().mockResolvedValue([{ subscription_id: 42 }]),
    };
    const subscriptions = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      cs_feedbacks: feedbacks,
      club_subscriptions: subscriptions,
      $transaction: jest.fn().mockResolvedValue([1, []]),
    } as any;

    await new CustomerServiceService(prisma).listSubscriptions({
      page: 1,
      pageSize: 20,
      contactStatus: 'contacted',
      contactFromDate: '2026-09-01',
      contactToDate: '2026-09-30',
    } as any);

    expect(feedbacks.findMany).toHaveBeenCalledWith({
      where: { created_at: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30T23:59:59.999Z') } },
      select: { subscription_id: true },
      distinct: ['subscription_id'],
    });
    expect(subscriptions.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [42] } }) }));
  });
});
