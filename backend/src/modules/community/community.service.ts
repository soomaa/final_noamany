import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityPostStatus, CommunityReactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import {
  ApproveCommunityPostDto,
  CreateCommunityPostDto,
  ListAdminCommunityPostsDto,
  ListMemberCommunityPostsDto,
  RejectCommunityPostDto,
  SetCommunityReactionDto,
} from './dto/community.dto';

type CommunityPostRow = {
  id: number;
  member_id: number;
  category: string;
  title: string;
  description: string;
  status: string;
  admin_reply: string | null;
  replied_at: Date | null;
  replied_by: number | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
  member?: { name?: string; profile_picture?: string | null; branch_id: number };
  reactions?: Array<{ reaction_type: CommunityReactionType }>;
};

type ReactionCounts = Map<number, { likesCount: number; lovedItCount: number }>;

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(member: MemberJwtUser, dto: CreateCommunityPostDto) {
    const row = await this.prisma.community_posts.create({
      data: {
        member_id: member.memberId,
        category: dto.category,
        title: dto.title.trim(),
        description: dto.description.trim(),
        status: CommunityPostStatus.pending,
      },
    });
    return this.mapPost(row, { likesCount: 0, lovedItCount: 0 }, null);
  }

  async listMemberPosts(member: MemberJwtUser, query: ListMemberCommunityPostsDto) {
    const where: Prisma.community_postsWhereInput = {
      status: CommunityPostStatus.approved,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search?.trim() ? {
        OR: [
          { title: { contains: query.search.trim() } },
          { description: { contains: query.search.trim() } },
          { member: { name: { contains: query.search.trim() } } },
        ],
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.community_posts.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        include: {
          member: { select: { name: true, profile_picture: true, branch_id: true } },
          reactions: { where: { member_id: member.memberId }, select: { reaction_type: true } },
        },
      }),
      this.prisma.community_posts.count({ where }),
    ]);
    const counts = await this.reactionCounts(rows.map((row) => row.id));
    return {
      items: rows.map((row) => this.mapPost(row, counts.get(row.id), row.reactions[0]?.reaction_type ?? null)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getMemberPost(member: MemberJwtUser, id: number) {
    const row = await this.prisma.community_posts.findUnique({
      where: { id },
      include: {
        member: { select: { name: true, profile_picture: true, branch_id: true } },
        reactions: { where: { member_id: member.memberId }, select: { reaction_type: true } },
      },
    });
    if (!row) throw new NotFoundException('منشور المجتمع غير موجود');
    if (row.status !== CommunityPostStatus.approved && row.member_id !== member.memberId) {
      throw new ForbiddenException('لا تملك صلاحية عرض هذا المنشور');
    }
    const counts = await this.reactionCounts([id]);
    return this.mapPost(row, counts.get(id), row.reactions[0]?.reaction_type ?? null);
  }

  async setReaction(member: MemberJwtUser, postId: number, dto: SetCommunityReactionDto) {
    const post = await this.prisma.community_posts.findUnique({ where: { id: postId }, select: { id: true, status: true } });
    if (!post) throw new NotFoundException('منشور المجتمع غير موجود');
    if (post.status !== CommunityPostStatus.approved) throw new BadRequestException('لا يمكن التفاعل إلا مع المنشورات المعتمدة');

    const key = { post_id_member_id: { post_id: postId, member_id: member.memberId } };
    const existing = await this.prisma.community_reactions.findUnique({ where: key });
    let userReaction: CommunityReactionType | null;
    if (!existing) {
      await this.prisma.community_reactions.create({ data: { post_id: postId, member_id: member.memberId, reaction_type: dto.reactionType } });
      userReaction = dto.reactionType;
    } else if (existing.reaction_type === dto.reactionType) {
      await this.prisma.community_reactions.delete({ where: { id: existing.id } });
      userReaction = null;
    } else {
      await this.prisma.community_reactions.update({ where: { id: existing.id }, data: { reaction_type: dto.reactionType } });
      userReaction = dto.reactionType;
    }
    const counts = await this.reactionCounts([postId]);
    const current = counts.get(postId) ?? { likesCount: 0, lovedItCount: 0 };
    return { postId, ...current, userReaction };
  }

  async listAdminPosts(query: ListAdminCommunityPostsDto) {
    const where: Prisma.community_postsWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search?.trim() ? {
        OR: [
          { title: { contains: query.search.trim() } },
          { description: { contains: query.search.trim() } },
          { member: { name: { contains: query.search.trim() } } },
        ],
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.community_posts.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        include: {
          member: { select: { name: true, profile_picture: true, branch_id: true } },
          reactions: false,
        },
      }),
      this.prisma.community_posts.count({ where }),
    ]);
    const counts = await this.reactionCounts(rows.map((row) => row.id));
    return {
      data: rows.map((row) => ({
        ...this.mapPost(row, counts.get(row.id), null),
        member: {
          id: row.member_id,
          name: row.member?.name ?? '',
          profilePictureUrl: row.member?.profile_picture ?? null,
        },
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getAdminPost(id: number) {
    const row = await this.prisma.community_posts.findUnique({
      where: { id },
      include: {
        member: { select: { name: true, profile_picture: true, branch_id: true } },
        reactions: false,
      },
    });
    if (!row) throw new NotFoundException('منشور المجتمع غير موجود');
    const counts = await this.reactionCounts([id]);
    return this.mapPost(row, counts.get(id), null);
  }

  async approvePost(id: number, adminId: number, dto: ApproveCommunityPostDto) {
    const adminReply = dto.adminReply.trim();
    if (!adminReply) throw new BadRequestException('رد الإدارة مطلوب');

    return this.prisma.$transaction(async (tx) => {
      const post = await tx.community_posts.findUnique({
        where: { id },
        include: { member: { select: { branch_id: true } } },
      });
      this.assertPending(post);
      const repliedAt = new Date();
      const updated = await tx.community_posts.updateMany({
        where: { id, status: CommunityPostStatus.pending },
        data: {
          status: CommunityPostStatus.approved,
          admin_reply: adminReply,
          replied_at: repliedAt,
          replied_by: adminId,
          rejection_reason: null,
        },
      });
      if (updated.count !== 1) throw new BadRequestException('لا يمكن مراجعة منشور غير معلّق');
      await tx.am_member_notifications.create({
        data: {
          member_id: post.member_id,
          branch_id: post.member.branch_id,
          title: 'تم الرد على منشورك في المجتمع',
          body: 'تم الرد على منشورك المرسل إلى إدارة المجتمع. اضغط لعرض الرد.',
          type: 'community_post_replied',
          data: JSON.stringify({ communityPostId: id }),
          created_by: adminId,
        },
      });
      return this.mapPost({
        ...post,
        status: CommunityPostStatus.approved,
        admin_reply: adminReply,
        replied_at: repliedAt,
        replied_by: adminId,
        rejection_reason: null,
      }, { likesCount: 0, lovedItCount: 0 }, null);
    });
  }

  async rejectPost(id: number, adminId: number, dto: RejectCommunityPostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.community_posts.findUnique({
        where: { id },
        include: { member: { select: { branch_id: true } } },
      });
      this.assertPending(post);
      const rejectionReason = dto.rejectionReason?.trim() || null;
      const updated = await tx.community_posts.updateMany({
        where: { id, status: CommunityPostStatus.pending },
        data: {
          status: CommunityPostStatus.rejected,
          rejection_reason: rejectionReason,
        },
      });
      if (updated.count !== 1) throw new BadRequestException('لا يمكن مراجعة منشور غير معلّق');
      await tx.am_member_notifications.create({
        data: {
          member_id: post.member_id,
          branch_id: post.member.branch_id,
          title: 'تحديث على منشورك في المجتمع',
          body: 'تمت مراجعة منشورك المرسل إلى إدارة المجتمع ولم تتم الموافقة عليه.',
          type: 'community_post_rejected',
          data: JSON.stringify({ communityPostId: id }),
          created_by: adminId,
        },
      });
      return this.mapPost({
        ...post,
        status: CommunityPostStatus.rejected,
        rejection_reason: rejectionReason,
      }, { likesCount: 0, lovedItCount: 0 }, null);
    });
  }

  private assertPending(post: { status: CommunityPostStatus } | null): asserts post is { status: CommunityPostStatus; member_id: number; member: { branch_id: number } } {
    if (!post) throw new NotFoundException('منشور المجتمع غير موجود');
    if (post.status !== CommunityPostStatus.pending) throw new BadRequestException('لا يمكن مراجعة منشور غير معلّق');
  }

  private async reactionCounts(postIds: number[]): Promise<ReactionCounts> {
    if (!postIds.length) return new Map();
    const rows = await this.prisma.community_reactions.groupBy({
      by: ['post_id', 'reaction_type'],
      where: { post_id: { in: postIds } },
      _count: { _all: true },
    });
    const counts: ReactionCounts = new Map();
    for (const row of rows) {
      const current = counts.get(row.post_id) ?? { likesCount: 0, lovedItCount: 0 };
      if (row.reaction_type === CommunityReactionType.like) current.likesCount = row._count._all;
      else current.lovedItCount = row._count._all;
      counts.set(row.post_id, current);
    }
    return counts;
  }

  private mapPost(row: CommunityPostRow, counts?: { likesCount: number; lovedItCount: number }, userReaction: CommunityReactionType | null = null) {
    return {
      id: row.id,
      memberId: row.member_id,
      memberName: row.member?.name ?? null,
      memberProfilePicture: row.member?.profile_picture ?? null,
      category: row.category,
      title: row.title,
      description: row.description,
      status: row.status,
      adminReply: row.admin_reply,
      repliedAt: row.replied_at,
      repliedBy: row.replied_by,
      rejectionReason: row.rejection_reason,
      likesCount: counts?.likesCount ?? 0,
      lovedItCount: counts?.lovedItCount ?? 0,
      userReaction,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
