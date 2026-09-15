import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
}

export interface SendResult {
  /** users that had a non-empty device_token and were dispatched to. */
  sent: number;
  /** users skipped because they had no device_token. */
  skipped: number;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register / refresh a user's mobile push token.
   * Faithful to the legacy "update device_token on login" behaviour: a single
   * token per user, stored on users.device_token (NOT NULL, defaults to '').
   */
  async register(userId: number, token: string): Promise<{ userId: number }> {
    await this.prisma.users.update({
      where: { user_id: userId },
      data: { device_token: token },
    });
    return { userId };
  }

  /** Clear the caller's token (logout / opt-out). device_token is NOT NULL → reset to ''. */
  async unregister(userId: number): Promise<{ userId: number }> {
    await this.prisma.users.update({
      where: { user_id: userId },
      data: { device_token: '' },
    });
    return { userId };
  }

  /**
   * Deliver a notification to a list of users. For each target we:
   *   1) persist a tbl_notifications EVENT row (from_user/to_user, date_ar/time_ar,
   *      seen=0) — the legacy "notification fired" record.
   *   2) persist the human-readable text on a users_notifications row (message),
   *      because tbl_notifications has no title/body column in the legacy schema —
   *      the text lives in users_notifications.message.
   *   3) call dispatch() — the FCM seam — only when the user has a device_token.
   *
   * Returns counts of {sent, skipped}.  fromUserId is the admin/composer.
   */
  async sendToUsers(
    userIds: number[],
    title: string,
    body: string,
    fromUserId?: number,
  ): Promise<SendResult> {
    const now = new Date();
    const dateAr = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const timeAr = now.toTimeString().slice(0, 5); // 'HH:MM'
    const message = body ? `${title} — ${body}` : title;

    let sent = 0;
    let skipped = 0;

    for (const userId of userIds) {
      const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
      if (!user) {
        skipped += 1;
        continue;
      }

      // 1) event row (faithful columns; seen=0; date/time now)
      const event = await this.prisma.tbl_notifications.create({
        data: {
          from_user: fromUserId ?? null,
          to_user: userId,
          date_ar: dateAr,
          time_ar: timeAr,
          seen: 0,
        },
      });

      // 2) carry the actual text linked to the event row
      await this.prisma.users_notifications.create({
        data: {
          notify_id_fk: event.id,
          message,
          date: dateAr,
          approved: 0,
        },
      });

      // 3) FCM seam — only attempt a "send" when the device is registered.
      const token = user.device_token?.trim();
      if (token) {
        await this.dispatch(token, { title, body });
        sent += 1;
      } else {
        skipped += 1;
      }
    }

    return { sent, skipped };
  }

  /**
   * Broadcast to all users, or to a single branch (users.branch_id_fk = branchId).
   */
  async broadcast(
    params: { title: string; body: string; branchId?: number },
    fromUserId?: number,
  ): Promise<SendResult> {
    const where: Prisma.usersWhereInput =
      params.branchId != null ? { branch_id_fk: params.branchId } : {};

    const targets = await this.prisma.users.findMany({
      where,
      select: { user_id: true },
    });
    const userIds = targets.map((t) => t.user_id);

    return this.sendToUsers(userIds, params.title, params.body, fromUserId);
  }

  /**
   * FCM SEND SEAM — this is the single place where firebase-admin would push.
   *
   * NOTE: This rebuild ships WITHOUT live Firebase credentials, so dispatch() is
   * stubbed to log only (no network call). When credentials are provisioned,
   * replace the body below with the real send, e.g.:
   *
   *   import * as admin from 'firebase-admin';
   *   await admin.messaging().send({
   *     token,
   *     notification: { title: payload.title, body: payload.body },
   *   });
   *
   * The (token, payload) signature is intentionally already the firebase-admin
   * message shape so wiring in the real SDK is a drop-in replacement.
   */
  private async dispatch(token: string, payload: PushPayload): Promise<void> {
    // NOTE: stubbed — no firebase-admin send() yet. Log the seam so QA can trace it.
    this.logger.log(
      `FCM(stub) → token=${token.slice(0, 12)}… title="${payload.title}"`,
    );
  }
}
