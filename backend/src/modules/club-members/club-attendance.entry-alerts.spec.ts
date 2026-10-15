import { ClubAttendanceService } from './club-attendance.service';

describe('reception entry alerts', () => {
  const input = { memberId: 1, branchId: 2, message: 'الاشتراك منتهي', severity: 'block' as const, source: 'gate' as const };
  function setup() {
    const db = { club_entry_alerts: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 7, member_id: 1, branch_id: 2, ...input, created_at: new Date() }]) },
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Demo', member_code: 'TEST' }]) } };
    const service = new ClubAttendanceService(db as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, { resolveListFilter: jest.fn().mockReturnValue([2]) } as never);
    return { db, service };
  }
  it('persists denials and deduplicates repeat scans inside two minutes', async () => {
    const { service, db } = setup();
    await service.reportEntryAlert(input);
    expect(db.club_entry_alerts.create).toHaveBeenCalledWith({ data: expect.objectContaining({ member_id: 1, branch_id: 2, severity: 'block' }) });
    db.club_entry_alerts.create.mockClear(); db.club_entry_alerts.findFirst.mockResolvedValue({ id: 7 });
    await service.reportEntryAlert(input);
    expect(db.club_entry_alerts.create).not.toHaveBeenCalled();
  });
  it('only serves reception its own branch and limits the feed to ten recent alerts', async () => {
    const { service, db } = setup();
    const alerts = await service.listEntryAlerts({ sub: 3, level: 2, branch: 2 } as never, '2');
    expect(db.club_entry_alerts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [2] }, created_at: expect.any(Object) }), take: 10 }));
    expect(alerts[0].memberName).toBe('Demo');
    await expect(service.listEntryAlerts({ sub: 3, level: 2, branch: 2 } as never, '1')).rejects.toThrow();
  });
  it('notification storage failure cannot authorize entry or crash the denial response', async () => {
    const { service, db } = setup();
    db.club_entry_alerts.findFirst.mockRejectedValue(new Error('test unavailable'));
    jest.spyOn((service as unknown as { entryAlertLog: { error: (message: string) => void } }).entryAlertLog, 'error').mockImplementation(() => {});
    await expect(service.reportEntryAlert(input)).resolves.toBeUndefined();
  });
});
