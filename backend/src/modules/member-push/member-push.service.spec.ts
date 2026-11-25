import { Prisma } from '@prisma/client';
import { MemberPushService } from './member-push.service';
import { cairoToUtc } from './member-push.util';

describe('MemberPushService', () => {
  const settings = { id: 1, quiet_enabled: true, quiet_start: '23:00', quiet_end: '08:00', quiet_mode: 'defer', default_type: 'general', daily_limit: 3, last_error: null, last_error_at: null };
  const campaign = {
    id: 7, name: 'عيد ميلاد', preset: 'birthday', title: 'كل سنة وانت طيب {first_name}', body: 'من {branch}', type: 'general',
    link: null, image_url: null, audience: JSON.stringify({ kind: 'birthday', branchIds: [], gender: null, days: null, memberIds: [] }),
    in_app: true, schedule_kind: 'daily', run_at: null, time_of_day: '09:00', weekdays: null, month_day: null, interval_days: null,
    start_date: null, end_date: null, status: 'active', next_run_at: cairoToUtc('2026-11-25', '09:00'), last_run_at: null,
    last_send_id: null, created_by: 1, created_at: new Date('2026-11-01T00:00:00Z'), updated_at: new Date(),
  };
  let prisma: Record<string, any>;
  let push: Record<string, jest.Mock>;
  let service: MemberPushService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]) })),
      push_settings: { findUnique: jest.fn().mockResolvedValue(settings), update: jest.fn() },
      push_campaigns: { findMany: jest.fn().mockResolvedValue([campaign]), update: jest.fn() },
      push_sends: {
        create: jest.fn(async ({ data }) => ({ id: 99, ...data })),
        update: jest.fn(async ({ data }) => ({ id: 99, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      push_send_recipients: { groupBy: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([{ branch_id: 3, branch_name: 'المعادي' }]) },
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 42, name: 'منى أحمد', branch_id: 3, date_of_birth: '1990-11-25' }]) },
      club_member_device_tokens: { groupBy: jest.fn().mockResolvedValue([{ member_id: 42, _count: { _all: 1 } }]) },
      am_member_notifications: { createMany: jest.fn() },
    };
    push = {
      deliverToMembers: jest.fn(async (ids: number[], payloadFor: (id: number) => unknown) => {
        if (ids.length) payloadFor(42);
        return { result: { sent: ids.length, invalid: 0, devices: ids.length }, perMember: new Map(ids.map((id) => [id, 'sent'])) };
      }),
      sendToTopicTarget: jest.fn().mockResolvedValue(true),
    };
    (push as unknown as { lastError: null }).lastError = null;
    service = new MemberPushService(prisma as never, push as never);
  });

  it('runs a due schedule once, personalised per member by token, and moves to the next slot', async () => {
    const now = cairoToUtc('2026-11-25', '09:00');
    const res = await service.runDue(now);
    expect(res).toEqual([{ campaignId: 7, sendId: 99, outcome: 'done' }]);
    expect(prisma.push_sends.create).toHaveBeenCalledWith({ data: expect.objectContaining({ run_key: `c7:${now.toISOString()}`, trigger: 'schedule', campaign_id: 7 }) });
    expect(push.sendToTopicTarget).not.toHaveBeenCalled();
    const payload = push.deliverToMembers.mock.calls[0][1](42);
    expect(payload).toEqual(expect.objectContaining({ title: 'كل سنة وانت طيب منى', body: 'من المعادي', sendId: 99 }));
    expect(prisma.am_member_notifications.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ member_id: 42, title: 'كل سنة وانت طيب منى', data: '{"sendId":99}' })],
    });
    expect(prisma.push_campaigns.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ next_run_at: cairoToUtc('2026-11-26', '09:00'), status: 'active', last_send_id: 99 }),
    });
  });

  it('never sends the same slot twice (unique run_key)', async () => {
    prisma.push_sends.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const res = await service.runDue(cairoToUtc('2026-11-25', '09:01'));
    expect(res).toEqual([{ campaignId: 7, sendId: null, outcome: 'duplicate' }]);
    expect(push.deliverToMembers).not.toHaveBeenCalled();
  });

  it('defers inside quiet hours', async () => {
    prisma.push_campaigns.findMany.mockResolvedValue([{ ...campaign, next_run_at: cairoToUtc('2026-11-25', '23:10') }]);
    const res = await service.runDue(cairoToUtc('2026-11-25', '23:15'));
    expect(res).toEqual([{ campaignId: 7, sendId: null, outcome: 'deferred' }]);
    expect(prisma.push_sends.create).not.toHaveBeenCalled();
  });

  it('skips members that reached the daily limit', async () => {
    prisma.push_send_recipients.groupBy.mockResolvedValue([{ member_id: 42, _count: { _all: 3 } }]);
    const send = { id: 99, trigger: 'manual', in_app: false, created_by: 1 } as never;
    const done = await service.deliver(send, { kind: 'members', branchIds: [], gender: null, days: null, memberIds: [42] }, [{ id: 42, name: 'منى', branchId: 3 }],
      { title: 't', body: 'b', type: 'general', link: null, imageUrl: null });
    expect(push.deliverToMembers.mock.calls[0][0]).toEqual([]);
    expect(done).toEqual(expect.objectContaining({ limited_count: 1, sent_count: 0 }));
  });

  it('sends a plain all-members message to the topic', async () => {
    const send = { id: 99, trigger: 'manual', in_app: false, created_by: 1 } as never;
    await service.deliver(send, { kind: 'all', branchIds: [3], gender: null, days: null, memberIds: [] }, [{ id: 42, name: 'منى', branchId: 3 }],
      { title: 't', body: 'b', type: 'offer', link: 'noamany://offers', imageUrl: null });
    expect(push.sendToTopicTarget).toHaveBeenCalledWith({ topic: 'noamany_branch_3' }, expect.objectContaining({ type: 'offer', sendId: 99, link: 'noamany://offers' }));
    expect(push.deliverToMembers).not.toHaveBeenCalled();
  });
});
