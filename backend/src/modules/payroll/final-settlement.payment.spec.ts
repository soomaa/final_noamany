import { FinalSettlementService } from './final-settlement.service';

describe('FinalSettlementService bank payment truth', () => {
  const row = {
    id: 4, settlement_number: 44, status: 'posted', net_payable: 900,
    branch_id: 2, termination_date: new Date('2026-08-01T00:00:00Z'),
  };

  function serviceWith(bankResult: object) {
    const tx = {
      hr_final_settlements: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...row, status: 'paid' }),
      },
    };
    const prisma = {
      hr_final_settlements: { findFirst: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const ledger = { ensureReady: jest.fn(), postFinalSettlementPayment: jest.fn() };
    const audit = { log: jest.fn() };
    const bank = { getFinalSettlement: jest.fn().mockResolvedValue(bankResult) };
    const service = new FinalSettlementService(
      prisma as never, {} as never, {} as never, {} as never, audit as never,
      ledger as never, undefined, bank as never,
    );
    return { service, prisma, tx, ledger, bank };
  }

  it('fails closed without a complete settlement and reference', async () => {
    const { service, prisma, ledger } = serviceWith({ status: 'partially_settled', settledAmount: 500 });
    await expect(service.pay(4)).rejects.toThrow('مرجع بنكي');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ledger.postFinalSettlementPayment).not.toHaveBeenCalled();
  });

  it('stores immutable bank evidence before marking the settlement paid', async () => {
    const evidence = { status: 'settled', settledAmount: 900, reference: 'BANK-FS-44' };
    const { service, tx, ledger } = serviceWith(evidence);
    await service.pay(4, 9);
    expect(tx.hr_final_settlements.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bank_reference: 'BANK-FS-44', payment_snapshot: evidence }),
    }));
    expect(ledger.postFinalSettlementPayment).toHaveBeenCalled();
  });
});
