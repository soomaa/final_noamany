import { AccountingReportsService } from './accounting-reports.service';

function fixture() {
  const prisma = {
    acc_accounts: { findMany: jest.fn().mockResolvedValue([
      { id: 1, code: '1', name: 'Debit', normal_balance: 'debit' },
      { id: 2, code: '2', name: 'Credit', normal_balance: 'credit' },
      { id: 3, code: '3', name: 'Empty', normal_balance: 'debit' },
    ]) },
    acc_journal_entry_lines: {
      groupBy: jest.fn().mockResolvedValue([
        { account_id: 1, _sum: { debit: 100, credit: 20 } },
        { account_id: 2, _sum: { debit: 0, credit: 50 } },
      ]),
      findMany: jest.fn().mockResolvedValue([
        { account_id: 1, debit: 10, credit: 0, description: null, entry: { date: '2026-10-12', entry_no: 'J1', description: 'Entry' } },
        { account_id: 1, debit: 0, credit: 5, description: 'Line', entry: { date: '2026-10-13', entry_no: 'J2', description: 'Entry 2' } },
        { account_id: 2, debit: 0, credit: 15, description: null, entry: { date: '2026-10-12', entry_no: 'J3', description: null } },
      ]),
    },
  };
  const scope = { resolveListFilter: jest.fn().mockReturnValue([2]) };
  return { prisma, service: new AccountingReportsService(prisma as never, scope as never) };
}

describe('batched general ledger', () => {
  it('preserves account order, debit/credit balances and ordered movements with constant query count', async () => {
    const { prisma, service } = fixture();
    const result = await service.generalLedger({ dateFrom: '2026-10-12', dateTo: '2026-10-31' } as never);
    expect(result.sections.map((section) => section.accountId)).toEqual([1, 2]);
    expect(result.sections[0]).toMatchObject({ openingBalance: 80, closingBalance: 85,
      movements: [{ balance: 90, description: 'Entry' }, { balance: 85, description: 'Line' }] });
    expect(result.sections[1]).toMatchObject({ openingBalance: 50, closingBalance: 65 });
    expect(prisma.acc_journal_entry_lines.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.acc_journal_entry_lines.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.acc_journal_entry_lines.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      entry: expect.objectContaining({ branch_id: { in: [2] }, date: { lt: '2026-10-12' } }),
    }) }));
    expect(prisma.acc_journal_entry_lines.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      entry: expect.objectContaining({ branch_id: { in: [2] }, date: { gte: '2026-10-12', lte: '2026-10-31' } }),
    }) }));
  });

  it('does not query historical openings when no start date is provided', async () => {
    const { prisma, service } = fixture();
    const result = await service.generalLedger({} as never);
    expect(prisma.acc_journal_entry_lines.groupBy).not.toHaveBeenCalled();
    expect(result.sections[0].openingBalance).toBe(0);
    expect(result.sections[0].closingBalance).toBe(5);
  });

  it('returns an empty report without loading lines when no postable accounts match', async () => {
    const { prisma, service } = fixture();
    prisma.acc_accounts.findMany.mockResolvedValue([]);
    expect(await service.generalLedger({ accountId: 999 } as never)).toEqual({ sections: [] });
    expect(prisma.acc_journal_entry_lines.findMany).not.toHaveBeenCalled();
  });
});
