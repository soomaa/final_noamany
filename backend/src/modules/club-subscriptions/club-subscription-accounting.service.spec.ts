import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../accounting/ledger.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';

describe('ClubSubscriptionAccountingService', () => {
  it('prepares the chart before the write transaction and marks the posting as ready', async () => {
    const moduleLedger = {
      ensureChart: jest.fn(),
      paymentKeyFromString: jest.fn().mockReturnValue('cash'),
      postClubSubscription: jest.fn(),
    };
    const service = new ClubSubscriptionAccountingService(
      moduleLedger as unknown as ModuleLedgerService,
      {} as LedgerService,
      {} as PrismaService,
    );

    await (service as any).prepareForJournal();
    await service.postJournal({
      subscriptionNumber: 'C1',
      sourceDocId: 'R-1',
      paidAmount: 100,
      subscriptionValue: 100,
      discountValue: 0,
      discountEnabled: false,
      paymentMethod: 'cash',
      branchId: 1,
      chartReady: true,
    } as any);

    expect(moduleLedger.ensureChart).toHaveBeenCalledTimes(1);
    expect(moduleLedger.postClubSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ chartReady: true }),
      undefined,
    );
  });
});
