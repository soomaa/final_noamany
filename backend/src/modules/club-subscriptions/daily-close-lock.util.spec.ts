import { assertClubAccountingDayOpen } from './daily-close-lock.util';

describe('assertClubAccountingDayOpen', () => {
  const client = {
    business_audit_log: { findMany: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('blocks a new money mutation after the all-audience day was closed', async () => {
    client.business_audit_log.findMany.mockResolvedValue([
      { entity_id: '2026-09-09:5:all', action: 'daily_close_close' },
    ]);
    await expect(assertClubAccountingDayOpen(client as never, {
      date: '2026-09-09', branchId: 5, gender: 'male',
    })).rejects.toThrow('اليوم المالي مقفل');
  });

  it('allows a money mutation after an explicit append-only reopen event', async () => {
    client.business_audit_log.findMany.mockResolvedValue([
      { entity_id: '2026-09-09:5:male', action: 'daily_close_reopen' },
      { entity_id: '2026-09-09:5:male', action: 'daily_close_close' },
    ]);
    await expect(assertClubAccountingDayOpen(client as never, {
      date: '2026-09-09', branchId: 5, gender: 'male',
    })).resolves.toBeUndefined();
  });
});
