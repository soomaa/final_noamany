import { AccountingReportsService } from './accounting-reports.service';
import { JournalEntriesService } from './journal-entries.service';
import { LedgerService } from './ledger.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isBalanced } from './accounting.utils';
import { UpsertJournalEntryDto } from './dto/accounting.dto';

describe('financial audit: journal integrity', () => {
  it('requires equality to the cent while ignoring binary floating-point noise', () => {
    expect(isBalanced(1, 1.01)).toBe(false);
    expect(isBalanced(0.01, 0.02)).toBe(false);
    expect(isBalanced(0.1 + 0.2, 0.3)).toBe(true);
    expect(isBalanced(Infinity, Infinity)).toBe(false);
  });

  it('rejects negative automatic journal lines before writing anything', async () => {
    const tx = { acc_journal_entries: { findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _max: { source_version: null } }), create: jest.fn() } };
    const service = new LedgerService({} as never);
    await expect(service.postEntry({ sourceModule: 'finance', sourceDocType: 'test', sourceDocId: 1,
      date: '2026-10-05', description: 'invalid', lines: [
        { accountCode: 'cash', debit: -100, credit: 0 },
        { accountCode: 'revenue', debit: 0, credit: -100 },
      ] }, tx as never)).rejects.toThrow('غير سالبة');
    expect(tx.acc_journal_entries.create).not.toHaveBeenCalled();
  });

  it.each(['2026-02-30', 'invalid', '2026-10-05T12:00:00'])('rejects invalid manual entry date %s', async (date) => {
    const dto = plainToInstance(UpsertJournalEntryDto, { date, lines: [] });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'date')).toBe(true);
  });

  function drafts(status = 'posted', totalDebit = 100) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      acc_journal_entries: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, branch_id: 2, date: '2026-10-05', status,
          total_debit: totalDebit, total_credit: 100,
          lines: [{ account_id: 1, debit: 100, credit: 0 }, { account_id: 2, debit: 0, credit: 100 }] }),
        update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(),
      },
      acc_journal_entry_lines: { deleteMany: jest.fn() },
    };
    const prisma = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
    const ledger = { assertPeriodOpenForDate: jest.fn(), resolveAccountIdByCodeOrKey: jest.fn().mockResolvedValue(1) };
    const scope = { allowedBranchIds: () => [2], resolveListFilter: () => [2] };
    return { tx, service: new JournalEntriesService(prisma as never, ledger as never, scope as never) };
  }

  it.each(['update', 'remove', 'post'] as const)('locks and rechecks state before %s', async (action) => {
    const { service, tx } = drafts();
    const call = action === 'update' ? service.update(1, { date: '2026-10-05', lines: [] })
      : action === 'remove' ? service.remove(1) : service.post(1, 9);
    await expect(call).rejects.toThrow('مرحّل');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.acc_journal_entries.findUnique.mock.invocationCallOrder[0]);
    expect(tx.acc_journal_entries.update).not.toHaveBeenCalled();
    expect(tx.acc_journal_entries.delete).not.toHaveBeenCalled();
    expect(tx.acc_journal_entries.updateMany).not.toHaveBeenCalled();
    expect(tx.acc_journal_entry_lines.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a draft whose stored header differs from its actual lines', async () => {
    const { service, tx } = drafts('draft', 101);
    await expect(service.post(1, 9)).rejects.toThrow('غير متوازن');
    expect(tx.acc_journal_entries.updateMany).not.toHaveBeenCalled();
  });
});

describe('financial audit: historical balances', () => {
  const accounts = [
    { id: 1, code: '1.02.001', name: 'Equipment', account_type: 'asset', normal_balance: 'debit', is_active: false, is_postable: false },
    { id: 2, code: '1.02.008', name: 'Depreciation', account_type: 'asset', normal_balance: 'credit', is_active: true, is_postable: true },
    { id: 3, code: '3.01', name: 'Capital', account_type: 'equity', normal_balance: 'credit', is_active: true, is_postable: true },
  ];
  function fixture() {
    const prisma = {
      acc_accounts: { findMany: jest.fn().mockImplementation(({ where = {} } = {}) => accounts.filter(a =>
        (!where.is_active || a.is_active) && (!where.is_postable || a.is_postable)
        && (!where.account_type || where.account_type.in.includes(a.account_type)))) },
      acc_journal_entry_lines: { aggregate: jest.fn().mockImplementation(({ where }) => {
        const id = typeof where.account_id === 'number' ? where.account_id : where.account_id.in[0];
        return { _sum: id === 1 ? { debit: 100, credit: 0 } : { debit: 0, credit: id === 2 ? 20 : 80 } };
      }) },
    };
    return { prisma, service: new AccountingReportsService(prisma as never, { resolveListFilter: () => [2] } as never) };
  }

  it('keeps inactive and parent account history in a balanced trial balance', async () => {
    const { service } = fixture();
    const report = await service.trialBalance({ dateTo: '2026-10-05' });
    expect(report.rows).toHaveLength(3);
    expect(report.summary).toMatchObject({ totalDebit: 100, totalCredit: 100, isBalanced: true });
  });

  it('subtracts contra assets and includes disabled historical assets in the balance sheet', async () => {
    const { service, prisma } = fixture();
    const report = await service.balanceSheet({ asOfDate: '2026-10-05' });
    expect(report).toMatchObject({ totalAssets: 80, totalLiabilitiesEquity: 80, isBalanced: true });
    expect(report.assets.items).toContainEqual({ code: '1.02.008', name: 'Depreciation', amount: -20 });
    expect(prisma.acc_journal_entry_lines.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      entry: expect.objectContaining({ branch_id: { in: [2] }, date: { lte: '2026-10-05' }, status: { in: ['posted', 'reversed'] } }),
    }) }));
  });

  it('recognizes cash subaccounts even when their mapped parent is disabled', async () => {
    const accounts = [{ id: 1, code: 'CASH', parent_id: null, is_active: false }, { id: 2, code: 'CASH.1', parent_id: 1 }];
    const prisma = {
      acc_default_accounts: { findMany: jest.fn().mockResolvedValue([{ account_code: 'CASH' }]) },
      acc_accounts: { findMany: jest.fn().mockImplementation(({ where }) => where ? [accounts[0]] : accounts) },
      acc_journal_entries: { findMany: jest.fn().mockResolvedValue([{ lines: [
        { account_id: 2, debit: 100, credit: 0, account: { code: 'CASH.1', name: 'Cash' } },
        { account_id: 3, debit: 0, credit: 100, account: { code: '4.01', name: 'Revenue' } },
      ] }]) },
    };
    const report = await new AccountingReportsService(prisma as never, { resolveListFilter: () => null } as never).cashFlow({});
    expect(report.netChange).toBe(100);
    expect(prisma.acc_journal_entries.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      lines: { some: { account_id: { in: [1, 2] } } },
    }) }));
  });
});
