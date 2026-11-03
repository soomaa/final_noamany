import { AccountingReportsService } from './accounting-reports.service';

const line = (account_id: number, code: string, debit: number, credit: number) => ({
  account_id, debit, credit, account: { code, name: code },
});
const flow = (entries: object[]) => {
  const prisma = {
    acc_default_accounts: { findMany: jest.fn().mockResolvedValue([{ account_code: '1.01.001' }]) },
    acc_accounts: { findMany: jest.fn().mockResolvedValue([{ id: 1, code: '1.01.001', parent_id: null }]) },
    acc_journal_entries: { findMany: jest.fn().mockResolvedValue(entries) },
  };
  return new AccountingReportsService(prisma as never, { resolveListFilter: () => null } as never).cashFlow({});
};

describe('cash flow integrity', () => {
  it('excludes the unpaid financing portion of equipment from operating cash outflow', async () => {
    const report = await flow([{ id: 1, lines: [
      line(1, '1.01.001', 0, 40), line(2, '1.02.001', 100, 0), line(3, '2.01.001', 0, 60),
    ] }]);
    expect(report.investing.outflow).toBe(40);
    expect(report.operating.outflow).toBe(0);
    expect(report.netChange).toBe(-40);
  });

  it('does not inflate gross cash flows with a corrected journal and its reversal', async () => {
    const lines = [line(1, '1.01.001', 100, 0), line(2, '4.01', 0, 100)];
    const report = await flow([
      { id: 1, date: '2026-10-05', reverses_id: null, lines },
      { id: 2, date: '2026-10-05', reverses_id: 1, lines: lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })) },
      { id: 3, date: '2026-10-05', reverses_id: null, lines: [line(1, '1.01.001', 80, 0), line(2, '4.01', 0, 80)] },
    ]);
    expect(report.operating).toMatchObject({ inflow: 80, outflow: 0, net: 80 });
  });

  it('keeps the restored original when a reversal itself was reversed', async () => {
    const lines = [line(1, '1.01.001', 100, 0), line(2, '4.01', 0, 100)];
    const report = await flow([
      { id: 1, date: '2026-10-05', reverses_id: null, lines },
      { id: 2, date: '2026-10-05', reverses_id: 1, lines: lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })) },
      { id: 3, date: '2026-10-05', reverses_id: 2, lines },
    ]);
    expect(report.operating).toMatchObject({ inflow: 100, outflow: 0, net: 100 });
  });

  it('attributes a cafe sale to revenue, not to the cost-of-goods pair in the same entry', async () => {
    const report = await flow([{ id: 1, lines: [
      line(1, '1.01.001', 90, 0), line(5, '4.02.001', 10, 0), line(2, '4.02', 0, 100),
      line(3, '5.08', 60, 0), line(4, '1.01.005', 0, 60),
    ] }]);
    expect(report.operating.inflowItems).toEqual([{ code: '4.02', name: '4.02', amount: 90 }]);
    expect(report.netChange).toBe(90);
  });

  it('attributes a cafe refund to revenue, not to the returned stock', async () => {
    const report = await flow([{ id: 1, lines: [
      line(1, '1.01.001', 0, 30), line(2, '4.02', 30, 0), line(4, '1.01.005', 18, 0), line(3, '5.08', 0, 18),
    ] }]);
    expect(report.operating.outflowItems).toEqual([{ code: '4.02', name: '4.02', amount: 30 }]);
  });
});
