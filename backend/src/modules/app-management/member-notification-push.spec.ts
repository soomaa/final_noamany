import { AppManagementService } from './app-management.service';

describe('AppManagementService member notification push', () => {
  const prisma = {
    club_members: { findFirst: jest.fn(), findMany: jest.fn() },
    am_member_notifications: { create: jest.fn(), createMany: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue('/uploads') };
  const push = {
    sendToMembers: jest.fn().mockResolvedValue({ sent: 1, invalid: 0, devices: 1 }),
    sendToTopic: jest.fn().mockResolvedValue(true),
  };
  const service = new AppManagementService(prisma as never, config as never, undefined, push as never);
  const row = {
    id: 55, member_id: 42, branch_id: 3, title: 'عرض', body: 'خصم ٢٠٪', type: 'offer', data: null,
    image_url: null, is_read: false, read_at: null, created_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_members.findFirst.mockResolvedValue({ id: 42, branch_id: 3 });
    prisma.club_members.findMany.mockResolvedValue([{ id: 1, branch_id: 3 }, { id: 2, branch_id: 3 }]);
    prisma.am_member_notifications.create.mockResolvedValue(row);
    prisma.am_member_notifications.createMany.mockResolvedValue({ count: 2 });
  });

  it('pushes to the targeted member with the notification id and data.link', async () => {
    const res = await service.createMemberNotification({
      title: 'عرض', body: 'خصم ٢٠٪', type: 'offer', memberId: 42, data: '{"link":"noamany://offers/5"}',
    } as never);
    expect(push.sendToMembers).toHaveBeenCalledWith([42], {
      type: 'offer', id: 55, title: 'عرض', body: 'خصم ٢٠٪', link: 'noamany://offers/5',
    });
    expect(push.sendToTopic).not.toHaveBeenCalled();
    expect(res.push).toEqual({ sent: 1, invalid: 0, devices: 1 });
  });

  it('pushes a branch broadcast to the branch topic and a full broadcast to noamany_members', async () => {
    await service.createMemberNotification({ title: 't', body: 'b', broadcast: true, branchId: 3 } as never);
    expect(push.sendToTopic).toHaveBeenLastCalledWith('noamany_branch_3', expect.objectContaining({ id: 0, type: 'general' }));

    await service.createMemberNotification({ title: 't', body: 'b', broadcast: true } as never);
    expect(push.sendToTopic).toHaveBeenLastCalledWith('noamany_members', expect.objectContaining({ title: 't', body: 'b' }));
    expect(push.sendToMembers).not.toHaveBeenCalled();
  });

  it('saves the in-app row without a push when sendPush is false', async () => {
    const res = await service.createMemberNotification({ title: 't', body: 'b', memberId: 42, sendPush: false } as never);
    expect(prisma.am_member_notifications.create).toHaveBeenCalled();
    expect(push.sendToMembers).not.toHaveBeenCalled();
    expect(res.push).toBeNull();
  });

  it('test push goes to that member\'s devices', async () => {
    await expect(service.testMemberPush(42)).resolves.toEqual({ sent: 1, invalid: 0, devices: 1 });
    expect(push.sendToMembers).toHaveBeenCalledWith([42], expect.objectContaining({ type: 'test' }));
  });
});
