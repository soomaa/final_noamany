import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { LeadScopeService } from '../../common/lead-scope/lead-scope.service';
import { newestActivityPerLead, type LeadActivity } from './lead-last-activity';

const MAX_BODY = 2000;

@Injectable()
export class LeadCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadScope: LeadScopeService,
  ) {}

  /**
   * The single gate in front of every comment and history read/write on a lead.
   *
   * Scoping here rather than at each call site is deliberate: the notes on a lead are the
   * sales conversation — what the customer pays, what they objected to, what they were
   * offered — so one missed call site leaks exactly the thing hiding the lead was meant to
   * protect. A rep asking about somebody else's lead is told it does not exist.
   */
  private async assertLead(leadId: number, user?: JwtUser) {
    const scope = await this.leadScope.whereFor(user);
    const lead = await this.prisma.club_leads.findFirst({
      where: { id: leadId, is_deleted: false, ...scope },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('العضو المحتمل غير موجود');
  }

  async list(leadId: number, user?: JwtUser) {
    await this.assertLead(leadId, user);
    const rows = await this.prisma.club_lead_comments.findMany({
      where: { lead_id: leadId },
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: r.author_name,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  }

  /**
   * The client's full activity log: typed sales contacts (calls, conversations,
   * meetings) from `/sales` merged with the free-text comments the admin screen
   * writes, newest first. Two sources because they are written by two screens, one
   * timeline because staff read it as one story.
   */
  async history(leadId: number, user?: JwtUser) {
    await this.assertLead(leadId, user);
    const [followUps, comments] = await Promise.all([
      this.prisma.club_lead_follow_ups.findMany({
        where: { lead_id: leadId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_lead_comments.findMany({
        where: { lead_id: leadId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return [
      ...followUps.map((r) => ({
        id: `f${r.id}`,
        kind: 'activity' as const,
        activityType: r.activity_type,
        answered: r.answered,
        body: r.note,
        interests: r.interests,
        status: r.status,
        nextFollowUpAt: r.next_follow_up_at,
        authorName: r.author_name,
        createdAt: r.created_at,
      })),
      ...comments.map((r) => ({
        id: `c${r.id}`,
        kind: 'comment' as const,
        activityType: 'comment',
        answered: null,
        body: r.body,
        interests: null,
        status: null,
        nextFollowUpAt: null,
        authorName: r.author_name,
        createdAt: r.created_at,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Newest typed contact per lead — the "last action" column on the admin list. */
  /**
   * The newest activity per lead, for the list's "last action" column.
   *
   * Both tables, not one: this used to read the typed follow-ups alone, so a rep who left
   * a comment saw the column stay "—" and reported the comment as lost. `history()` merged
   * the two all along; this is the same merge for the list.
   */
  async lastActivityByLead(leadIds: number[]): Promise<Map<number, LeadActivity>> {
    if (!leadIds.length) return new Map<number, LeadActivity>();
    const [followUps, comments] = await Promise.all([
      this.prisma.club_lead_follow_ups.findMany({
        where: { lead_id: { in: leadIds } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { lead_id: true, activity_type: true, note: true, author_name: true, created_at: true },
      }),
      this.prisma.club_lead_comments.findMany({
        where: { lead_id: { in: leadIds } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { lead_id: true, body: true, author_name: true, created_at: true },
      }),
    ]);
    return newestActivityPerLead(followUps, comments);
  }

  async add(leadId: number, body: string, user: JwtUser) {
    await this.assertLead(leadId, user);

    const text = String(body ?? '').trim();
    if (!text) throw new BadRequestException('نص التعليق مطلوب');
    if (text.length > MAX_BODY) {
      throw new BadRequestException(`التعليق طويل جداً — الحد الأقصى ${MAX_BODY} حرف`);
    }

    // Snapshot the author's name: the log must stay readable after staff leave.
    const author = user.sub
      ? await this.prisma.users.findUnique({
          where: { user_id: user.sub },
          select: { name: true, username: true },
        })
      : null;

    const row = await this.prisma.club_lead_comments.create({
      data: {
        lead_id: leadId,
        body: text,
        created_by: user.sub ?? null,
        author_name: author?.name?.trim() || author?.username || null,
      },
    });

    // Touch the lead so "last activity" ordering reflects the new comment.
    await this.prisma.club_leads.update({
      where: { id: leadId },
      data: { updated_at: new Date() },
    });

    return {
      id: row.id,
      body: row.body,
      authorName: row.author_name,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }
}
