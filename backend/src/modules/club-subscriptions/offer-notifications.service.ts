import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Members are notified in batches so one big branch cannot build a single huge INSERT. */
const INSERT_CHUNK = 500;

export interface OfferNotificationTarget {
  subscriptionTypeId: number;
  packageName: string;
  /** Null when the package applies to every branch. */
  branchIds: number[] | null;
  promoPrice: number;
  originalPrice: number;
  endsAt: Date | null;
  /** The admin's own "رسالة العرض", used verbatim when present. */
  marketingMessage: string | null;
  createdBy?: number | null;
}

/**
 * Writes an offer into `am_member_notifications`, the inbox the member app
 * already reads, the moment an admin turns a package promo on.
 *
 * Notifying never fails the promo: a valid discount must not be rejected
 * because the inbox write failed.
 */
@Injectable()
export class OfferNotificationsService {
  private readonly logger = new Logger(OfferNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private body(target: OfferNotificationTarget): string {
    if (target.marketingMessage) return target.marketingMessage;

    const saving = target.originalPrice - target.promoPrice;
    const percent =
      target.originalPrice > 0 ? Math.round((saving / target.originalPrice) * 100) : 0;
    const price = `${target.promoPrice} بدلاً من ${target.originalPrice} جنيه`;
    const discount = percent > 0 ? ` — خصم ${percent}%` : '';
    if (target.endsAt == null) return `${price}${discount}`;

    const days = Math.max(
      1,
      Math.ceil((target.endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    return `${price}${discount}. العرض ساري لمدة ${days} يوم.`;
  }

  async notifyNewOffer(target: OfferNotificationTarget): Promise<{ sent: number }> {
    try {
      const where: Prisma.club_membersWhereInput = {
        is_deleted: false,
        is_active: true,
        app_user_id: { not: null },
        ...(target.branchIds != null ? { branch_id: { in: target.branchIds } } : {}),
      };
      const members = await this.prisma.club_members.findMany({
        where,
        select: { id: true, branch_id: true },
      });
      if (members.length === 0) return { sent: 0 };

      const base = {
        title: `عرض جديد: ${target.packageName}`,
        body: this.body(target),
        type: 'offer',
        data: JSON.stringify({
          target: 'package',
          subscriptionTypeId: target.subscriptionTypeId,
        }),
        created_by: target.createdBy ?? null,
      };

      let sent = 0;
      for (let i = 0; i < members.length; i += INSERT_CHUNK) {
        const chunk = members.slice(i, i + INSERT_CHUNK);
        const result = await this.prisma.am_member_notifications.createMany({
          data: chunk.map((m) => ({ ...base, member_id: m.id, branch_id: m.branch_id })),
        });
        sent += result.count;
      }
      return { sent };
    } catch (error) {
      this.logger.error(
        `Offer notification failed for package ${target.subscriptionTypeId}: ${String(error)}`,
      );
      return { sent: 0 };
    }
  }
}
