import { ClubDashboardService } from './club-dashboard.service';

type SqlLike = { strings?: readonly string[]; sql?: string };

/** Flattens the tagged-template call of $queryRaw (strings + nested Prisma.sql fragments). */
function renderedSql(call: unknown[]): string {
  const [strings, ...values] = call as [readonly string[], ...unknown[]];
  const fragments = values.map((value) => {
    const sql = value as SqlLike;
    if (typeof sql?.sql === 'string') return sql.sql;
    if (Array.isArray(sql?.strings)) return sql.strings.join('?');
    return '?';
  });
  return strings.reduce((out, part, index) => out + part + (fragments[index] ?? ''), '');
}

function ledgerRows(service: ClubDashboardService) {
  return (service as unknown as {
    financialLedgerRows: (start: string, end: string, branches: number[] | null) => Promise<unknown>;
  }).financialLedgerRows.bind(service);
}

describe('ClubDashboardService branch isolation', () => {
  it('shows a user with no branches nothing instead of every branch', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([]);
    const service = new ClubDashboardService({ $queryRaw } as never, {} as never, {} as never);

    await ledgerRows(service)('2026-09-01', '2026-09-30', []);

    expect(renderedSql($queryRaw.mock.calls[0])).toContain('AND 1 = 0');
  });

  it('keeps an unrestricted user unfiltered and a scoped user on its branches', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([]);
    const service = new ClubDashboardService({ $queryRaw } as never, {} as never, {} as never);

    await ledgerRows(service)('2026-09-01', '2026-09-30', null);
    await ledgerRows(service)('2026-09-01', '2026-09-30', [2]);

    const [all, scoped] = $queryRaw.mock.calls.map((call) => renderedSql(call));
    expect(all).not.toContain('e.branch_id IN');
    expect(all).not.toContain('1 = 0');
    expect(scoped).toContain('e.branch_id IN');
  });
});
