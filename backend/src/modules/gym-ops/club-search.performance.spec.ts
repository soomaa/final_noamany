import { ClubSearchService } from './club-search.service';

function member(id: number, memberCode = String(id)) {
  return { id, member_code: memberCode, name: `Member ${id}`, phone: null, card_number: null,
    branch_id: 2, gender: 'female', is_active: true };
}
function fixture() {
  const prisma = {
    club_members: { findMany: jest.fn().mockResolvedValue([]) },
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    club_attendance: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const entitlement = { validate: jest.fn().mockResolvedValue({ allowed: true }) };
  return { prisma, entitlement, service: new ClubSearchService(prisma as never, entitlement as never) };
}

describe('member search performance and compatibility', () => {
  it('avoids substring scanning and all history reads when indexed matches fill a brief page', async () => {
    const { prisma, service, entitlement } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([member(7), member(70), member(71)]);
    const hits = await service.universalSearch('7', [2], 3, 'female', true);
    expect(hits.map((h) => h.memberCode)).toEqual(['7', '70', '71']);
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
    expect(prisma.club_attendance.findMany).not.toHaveBeenCalled();
    expect(entitlement.validate).not.toHaveBeenCalled();
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ is_deleted: false }, { branch_id: { in: [2] } }, { gender: 'female' }]) },
      select: expect.not.objectContaining({ notes: true, profile_picture: true }),
    }));
  });

  it('retains substring name results without loading subscriptions for suggestions', async () => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([
      { ...member(5, 'B000005'), name: 'منى محمد' },
    ]);
    const hits = await service.universalSearch('منى', [2], 5, 'female', true);
    expect(hits[0]).toEqual(expect.objectContaining({ name: 'منى محمد', matchType: 'name' }));
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
  });

  it.each(['7', '٧', '۷'])('prioritizes partial codes over exact phones/cards for first digit %s', async (query) => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany
      .mockResolvedValueOnce([{ ...member(2, 'B000002'), phone: '7' },
        { ...member(3, 'B000003'), card_number: '7' }])
      .mockResolvedValueOnce([member(17, 'A000017'), member(7, 'A000007')]);
    const hits = await service.universalSearch(query, [2], 2, 'female', true);
    expect(hits.map(hit => hit.memberCode)).toEqual(['A000007', 'A000017']);
    expect(hits.every(hit => hit.matchType === 'code')).toBe(true);
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.club_members.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { AND: [{ is_deleted: false }, { branch_id: { in: [2] } },
        { gender: 'female' }, { member_code: { contains: '7' } }] },
    }));
  });

  it('falls back to mobile matches when no code matches the first digit', async () => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...member(2, 'A000002'), phone: '01077777777' }]);
    expect((await service.universalSearch('7', [2], 5, 'female', true))[0].phone).toBe('01077777777');
    expect(await service.universalSearch('م', [2], 5, 'female', true)).toEqual([]);
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(3);
  });

  it('loads metadata only for ranked visible members and only their latest attendance', async () => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([member(15), member(51), member(5)])
      .mockResolvedValueOnce([{ id: 5, attendances: [{ check_in_time: new Date('2026-10-06T08:00:00Z') }] }]);
    prisma.club_subscriptions.findMany.mockResolvedValueOnce([{
      member_id: 5, subscription_type: 'Monthly', subscription_start_date: '2000-01-01',
      subscription_end_date: '2099-01-01', is_linked_to_sessions: false,
      sessions_count: null, sessions_used: 0, remaining_amount: 50,
    }]);
    const hits = await service.universalSearch('5', [2], 1, 'female');
    expect(hits[0]).toEqual(expect.objectContaining({ memberCode: '5', activeSubscriptionType: 'Monthly',
      remainingAmount: 50, lastCheckIn: '2026-10-06T08:00:00.000Z' }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: { in: [5] }, branch_id: { in: [2] } },
    }));
    expect(prisma.club_members.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      select: { id: true, attendances: { where: { branch_id: { in: [2] } },
        orderBy: { check_in_time: 'desc' }, take: 1, select: { check_in_time: true } } },
    }));
    expect(prisma.club_attendance.findMany).not.toHaveBeenCalled();
  });

  it('protects an exact full code from the broad candidate cap and normalizes mixed digits', async () => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([member(90, 'B000090')])
      .mockResolvedValueOnce(Array.from({ length: 15 }, (_, i) => member(i + 1, `X90${i}`)));
    expect((await service.universalSearch('b٠٠٠۰۹۰', [2], 5, undefined, true))[0].memberCode).toBe('B000090');
  });

  it('normalizes formatted Arabic phones and keeps branch-scoped variants', async () => {
    const { prisma, service } = fixture();
    await service.universalSearch('+٢٠ ١٠١٢٣٤٥٦٧٨', [2], 5, undefined, true);
    expect(prisma.club_members.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { AND: expect.arrayContaining([{ branch_id: { in: [2] } }, { OR: expect.arrayContaining([
        { phone: '01012345678' }, { phone: '201012345678' },
      ]) }]) },
    }));
  });

  it('keeps the entitlement endpoint available and validates the selected member', async () => {
    const { prisma, service, entitlement } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([member(7)]);
    const result = await service.searchWithEntitlement('7', [2], 'female');
    expect(result.entitlement).toEqual({ allowed: true });
    expect(entitlement.validate).toHaveBeenCalledWith({ memberId: 7, branchId: 2 });
  });

  it('bounds malformed limits and stops before history reads for empty results', async () => {
    const { prisma, service } = fixture();
    expect(await service.universalSearch('zz', [], Number.NaN, undefined, true)).toEqual([]);
    expect(prisma.club_members.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 20 }));
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
  });

  it('uses padded branch-code prefixes and ranks the numeric identity first without fallback scans', async () => {
    const { prisma, service } = fixture();
    prisma.club_members.findMany.mockResolvedValueOnce([
      member(70, 'B000070'), member(71, 'B000071'), member(7, 'B000007'),
    ]);
    const hits = await service.universalSearch('٧', [2], 3, 'female', true);
    expect(hits.map(hit => hit.memberCode)).toEqual(['B000007', 'B000070', 'B000071']);
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ OR: expect.arrayContaining([
        { member_code: 'B000007' }, { member_code: { startsWith: 'B00007' } },
        { member_code: { startsWith: 'B7' } },
      ]) }]) },
    }));
  });

  it('starts the broad fallback while the partial-code scan is still pending', async () => {
    const { prisma, service } = fixture();
    let release!: (rows: ReturnType<typeof member>[]) => void;
    let broadStarted!: () => void;
    const started = new Promise<void>(resolve => { broadStarted = resolve; });
    prisma.club_members.findMany.mockResolvedValueOnce([])
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockImplementationOnce(async () => { broadStarted(); return []; });
    const pending = service.universalSearch('7', [2], 5, 'female', true);
    await started;
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(3);
    release([member(7, 'B000007')]);
    expect((await pending)[0].memberCode).toBe('B000007');
  });

  it('reads only requested, scoped subscription labels without repeating any member/history search', async () => {
    const { prisma, service, entitlement } = fixture();
    prisma.club_subscriptions.findMany.mockResolvedValueOnce([
      { member_id: 7, subscription_type: 'Monthly', subscription_start_date: '2000-01-01',
        subscription_end_date: '2099-01-01', is_linked_to_sessions: false,
        sessions_count: null, sessions_used: 0 },
      { member_id: 70, subscription_type: 'Old', subscription_start_date: '2000-01-01',
        subscription_end_date: '2001-01-01', is_linked_to_sessions: false,
        sessions_count: null, sessions_used: 0 },
    ]);
    expect(await service.subscriptionLabels([7, 7, 70, -1], [2], 'female')).toEqual([
      { id: 7, activeSubscriptionType: 'Monthly' },
    ]);
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: { in: [7, 70] }, branch_id: { in: [2] },
        member: { is_deleted: false, branch_id: { in: [2] }, gender: 'female' } },
    }));
    expect(prisma.club_members.findMany).not.toHaveBeenCalled();
    expect(prisma.club_attendance.findMany).not.toHaveBeenCalled();
    expect(entitlement.validate).not.toHaveBeenCalled();
    expect(await service.subscriptionLabels([7], [], 'female')).toEqual([]);
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledTimes(1);
  });
});
