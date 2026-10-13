import { ClubDashboardService } from './club-dashboard.service';

describe('ClubDashboardService executive cache', () => {
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([3]),
  };

  const makeService = () =>
    new ClubDashboardService({} as never, branchScope as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('deduplicates identical dashboard requests during the short cache window', async () => {
    const service = makeService();
    const build = jest
      .spyOn(service as unknown as { buildExecutive: () => Promise<unknown> }, 'buildExecutive')
      .mockResolvedValue({ ok: true });
    const query = { startDate: '2026-08-01', endDate: '2026-08-14', branchId: '3' };
    const user = { sub: 42 } as never;

    const [first, second] = await Promise.all([
      service.executive(query, user),
      service.executive(query, user),
    ]);

    expect(first).toEqual({ ok: true });
    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('removes rejected work so the next request can retry', async () => {
    const service = makeService();
    const build = jest
      .spyOn(service as unknown as { buildExecutive: () => Promise<unknown> }, 'buildExecutive')
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ ok: true });
    const query = { startDate: '2026-08-01', endDate: '2026-08-14' };
    const user = { sub: 7 } as never;

    await expect(service.executive(query, user)).rejects.toThrow('temporary');
    await expect(service.executive(query, user)).resolves.toEqual({ ok: true });
    expect(build).toHaveBeenCalledTimes(2);
  });
});
