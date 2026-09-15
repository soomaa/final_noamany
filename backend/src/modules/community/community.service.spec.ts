import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CommunityService } from './community.service';
import { ApproveCommunityPostDto } from './dto/community.dto';

const member = (overrides: Partial<{ memberId: number; branchId: number; name: string | null }> = {}) => ({
  sub: 1,
  memberId: 44,
  branchId: 5,
  phone: '01000000000',
  name: 'عضو الاختبار',
  type: 'member' as const,
  ...overrides,
});

const post = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  member_id: 44,
  category: 'question',
  title: 'عنوان',
  description: 'وصف',
  status: 'approved',
  admin_reply: null,
  replied_at: null,
  replied_by: null,
  rejection_reason: null,
  created_at: new Date('2026-08-25T10:00:00Z'),
  updated_at: new Date('2026-08-25T10:00:00Z'),
  member: { name: 'عضو الاختبار', profile_picture: '/member.png', branch_id: 5 },
  _count: { reactions: 0 },
  reactions: [],
  ...overrides,
});

describe('CommunityService', () => {
  const tx = {
    community_posts: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    am_member_notifications: { create: jest.fn() },
  };
  const prisma = {
    community_posts: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    community_reactions: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new CommunityService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    prisma.community_posts.create.mockResolvedValue(post({ status: 'pending' }));
    prisma.community_posts.findMany.mockResolvedValue([]);
    prisma.community_posts.count.mockResolvedValue(0);
    prisma.community_reactions.findUnique.mockResolvedValue(null);
    prisma.community_reactions.create.mockResolvedValue({ id: 1, reaction_type: 'like' });
    prisma.community_reactions.groupBy.mockResolvedValue([]);
    tx.community_posts.findUnique.mockResolvedValue(post({ status: 'pending' }));
    tx.community_posts.update.mockResolvedValue(post());
    tx.community_posts.updateMany.mockResolvedValue({ count: 1 });
    tx.am_member_notifications.create.mockResolvedValue({ id: 1 });
  });

  it('creates a pending post using member.memberId, never a body memberId', async () => {
    await service.createPost(member({ memberId: 44 }), { category: 'question', title: 'T', description: 'D', memberId: 99 } as never);

    expect(prisma.community_posts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 44, status: 'pending' }),
    }));
  });

  it('does not expose a pending post to a different member', async () => {
    prisma.community_posts.findUnique.mockResolvedValue(post({ status: 'pending' }));

    await expect(service.getMemberPost(member({ memberId: 99 }), 7)).rejects.toThrow(ForbiddenException);
  });

  it('toggles an identical reaction off and replaces a different reaction', async () => {
    prisma.community_posts.findUnique.mockResolvedValue(post());
    prisma.community_reactions.findUnique.mockResolvedValueOnce({ id: 8, reaction_type: 'like' });
    await service.setReaction(member({ memberId: 44 }), 7, { reactionType: 'like' } as never);
    expect(prisma.community_reactions.delete).toHaveBeenCalledWith({ where: { id: 8 } });

    prisma.community_reactions.findUnique.mockResolvedValueOnce({ id: 8, reaction_type: 'like' });
    await service.setReaction(member({ memberId: 44 }), 7, { reactionType: 'love' } as never);
    expect(prisma.community_reactions.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { reaction_type: 'love' } });
  });

  it('approves with reply and inserts one deep-link notification in the same transaction', async () => {
    await service.approvePost(7, 3, { adminReply: ' الإجابة ' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.community_posts.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7, status: 'pending' },
      data: expect.objectContaining({ status: 'approved', admin_reply: 'الإجابة', replied_by: 3, rejection_reason: null }),
    }));
    expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 44, type: 'community_post_replied', data: JSON.stringify({ communityPostId: 7 }) }),
    }));
  });

  it('rejects a pending post and creates a community_post_rejected notification', async () => {
    await service.rejectPost(7, 3, { rejectionReason: 'سبب المراجعة' });

    expect(tx.community_posts.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, status: 'pending' }, data: expect.objectContaining({ status: 'rejected', rejection_reason: 'سبب المراجعة' }) }));
    expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 44, type: 'community_post_rejected', data: JSON.stringify({ communityPostId: 7 }) }),
    }));
  });

  it('lists only approved posts with one aggregated reaction query and the member profile', async () => {
    prisma.community_posts.findMany.mockResolvedValue([post()]);
    prisma.community_posts.count.mockResolvedValue(1);
    prisma.community_reactions.groupBy.mockResolvedValue([
      { post_id: 7, reaction_type: 'like', _count: { _all: 2 } },
      { post_id: 7, reaction_type: 'love', _count: { _all: 1 } },
    ]);

    const result = await service.listMemberPosts(member(), { page: 1, pageSize: 20 } as never);

    expect(prisma.community_posts.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'approved' }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] }));
    expect(prisma.community_reactions.groupBy).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toMatchObject({ memberName: 'عضو الاختبار', memberProfilePicture: '/member.png', likesCount: 2, lovedItCount: 1, userReaction: null });
  });

  it('allows an approved post to an authenticated member and returns their reaction', async () => {
    prisma.community_posts.findUnique.mockResolvedValue(post({ reactions: [{ reaction_type: 'love' }] }));
    prisma.community_reactions.groupBy.mockResolvedValue([{ post_id: 7, reaction_type: 'love', _count: { _all: 3 } }]);

    await expect(service.getMemberPost(member({ memberId: 99 }), 7)).resolves.toMatchObject({ id: 7, userReaction: 'love', lovedItCount: 3 });
  });

  it('rejects reactions against non-approved posts before changing a reaction', async () => {
    prisma.community_posts.findUnique.mockResolvedValue(post({ status: 'pending' }));

    await expect(service.setReaction(member(), 7, { reactionType: 'like' } as never)).rejects.toThrow(BadRequestException);
    expect(prisma.community_reactions.findUnique).not.toHaveBeenCalled();
  });

  it('reports missing member posts as not found', async () => {
    prisma.community_posts.findUnique.mockResolvedValue(null);

    await expect(service.getMemberPost(member(), 7)).rejects.toThrow(NotFoundException);
  });

  it('lists and retrieves admin posts with requested filters and member data', async () => {
    prisma.community_posts.findMany.mockResolvedValue([post({ status: 'rejected' })]);
    prisma.community_posts.count.mockResolvedValue(1);
    prisma.community_posts.findUnique.mockResolvedValue(post({ status: 'rejected' }));

    const result = await service.listAdminPosts({ page: 1, pageSize: 20, status: 'rejected', category: 'question', search: 'عنوان' } as never);

    expect(result).toMatchObject({
      data: [{
        id: 7,
        member: { id: 44, name: 'عضو الاختبار', profilePictureUrl: '/member.png' },
        status: 'rejected',
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(result).not.toHaveProperty('items');
    await expect(service.getAdminPost(7)).resolves.toMatchObject({ id: 7, status: 'rejected', memberName: 'عضو الاختبار' });
    expect(prisma.community_posts.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'rejected', category: 'question', OR: expect.any(Array) }) }));
  });

  it('rejects a whitespace-only approval reply before changing status or notifying', async () => {
    await expect(service.approvePost(7, 3, { adminReply: '   \t  ' })).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.community_posts.updateMany).not.toHaveBeenCalled();
    expect(tx.am_member_notifications.create).not.toHaveBeenCalled();
  });

  it('trims approval replies before DTO non-empty validation', () => {
    const dto = plainToInstance(ApproveCommunityPostDto, { adminReply: '   \t  ' });

    expect(dto.adminReply).toBe('');
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('rejects admin decisions for posts that are no longer pending', async () => {
    tx.community_posts.findUnique.mockResolvedValue(post({ status: 'approved' }));

    await expect(service.approvePost(7, 3, { adminReply: 'إجابة' })).rejects.toThrow(BadRequestException);
    expect(tx.community_posts.updateMany).not.toHaveBeenCalled();
    expect(tx.am_member_notifications.create).not.toHaveBeenCalled();
  });

  it('creates one missing reaction and returns the current aggregated reaction result', async () => {
    prisma.community_posts.findUnique.mockResolvedValue(post());
    prisma.community_reactions.findUnique.mockResolvedValue(null);
    prisma.community_reactions.groupBy.mockResolvedValue([
      { post_id: 7, reaction_type: 'like', _count: { _all: 2 } },
      { post_id: 7, reaction_type: 'love', _count: { _all: 4 } },
    ]);

    await expect(service.setReaction(member(), 7, { reactionType: 'love' } as never)).resolves.toEqual({
      postId: 7,
      likesCount: 2,
      lovedItCount: 4,
      userReaction: 'love',
    });
    expect(prisma.community_reactions.create).toHaveBeenCalledTimes(1);
    expect(prisma.community_reactions.create).toHaveBeenCalledWith({
      data: { post_id: 7, member_id: 44, reaction_type: 'love' },
    });
  });

  it('writes the exact approval notification title and body', async () => {
    await service.approvePost(7, 3, { adminReply: 'الإجابة' });

    expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'تم الرد على منشورك في المجتمع',
        body: 'تم الرد على منشورك المرسل إلى إدارة المجتمع. اضغط لعرض الرد.',
      }),
    }));
  });

  it('writes the exact rejection notification title and body', async () => {
    await service.rejectPost(7, 3, { rejectionReason: 'سبب المراجعة' });

    expect(tx.am_member_notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'تحديث على منشورك في المجتمع',
        body: 'تمت مراجعة منشورك المرسل إلى إدارة المجتمع ولم تتم الموافقة عليه.',
      }),
    }));
  });

  it('rejects an invalid rejection transition without a notification', async () => {
    tx.community_posts.findUnique.mockResolvedValue(post({ status: 'rejected' }));

    await expect(service.rejectPost(7, 3, { rejectionReason: 'سبب' })).rejects.toThrow(BadRequestException);
    expect(tx.community_posts.updateMany).not.toHaveBeenCalled();
    expect(tx.am_member_notifications.create).not.toHaveBeenCalled();
  });

  it('does not notify when conditional moderation update loses a concurrent transition', async () => {
    tx.community_posts.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approvePost(7, 3, { adminReply: 'الإجابة' })).rejects.toThrow(BadRequestException);
    expect(tx.am_member_notifications.create).not.toHaveBeenCalled();
  });
});
