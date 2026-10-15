import { ModuleLedgerService } from './module-ledger.service';
import { LedgerPostInput } from './ledger.service';

describe('house hospitality accounting (ضيافة المكان)', () => {
  function setup() {
    const entries: LedgerPostInput[] = [];
    const ledger = { postEntry: jest.fn(async (entry: LedgerPostInput) => { entries.push(entry); }) };
    const service = new ModuleLedgerService(ledger as never, { ensureSeeded: jest.fn() } as never);
    return { service, entries };
  }
  const balances = (entries: LedgerPostInput[]) => {
    const b: Record<string, number> = {};
    for (const entry of entries) for (const line of entry.lines) {
      b[line.accountCode] = Math.round(((b[line.accountCode] ?? 0) + line.debit - line.credit) * 100) / 100;
    }
    return Object.fromEntries(Object.entries(b).filter(([, v]) => v !== 0));
  };

  it('books cost to hospitality expense against inventory — no revenue, no receivable', async () => {
    const { service, entries } = setup();
    await service.postHospitalitySale({
      saleNumber: 'QS-1', branchId: 1, saleDate: '2026-09-12', cogsAmount: 70, hostName: 'الحاج', createdBy: 9,
    });
    expect(entries).toHaveLength(1);
    // Only the real cost of goods moves: hospitality expense up, inventory down.
    expect(balances(entries)).toEqual({ hospitality_expense: 70, inventory: -70 });
    // Never touches revenue / receivable / cash.
    const codes = entries[0].lines.map((l) => l.accountCode);
    expect(codes).not.toContain('sales_revenue');
    expect(codes).not.toContain('accounts_receivable');
    expect(codes).not.toContain('cash');
  });

  it('records the directed-by host in the entry description', async () => {
    const { service, entries } = setup();
    await service.postHospitalitySale({ saleNumber: 'QS-2', branchId: 1, saleDate: '2026-09-12', cogsAmount: 40, hostName: 'كابتن تامر', createdBy: 9 });
    expect(entries[0].description).toContain('كابتن تامر');
  });

  it('posts nothing when there is no cost (inventory tracking off / zero cost)', async () => {
    const { service, entries } = setup();
    await service.postHospitalitySale({ saleNumber: 'QS-3', branchId: 1, saleDate: '2026-09-12', cogsAmount: 0, createdBy: 9 });
    expect(entries).toHaveLength(0);
  });
});
