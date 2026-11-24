import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
}

/** The fields of a Firebase service-account key file that the FCM v1 send needs. */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Android channel the employee app creates for its own notifications. */
const ANDROID_CHANNEL_ID = 'com.metacodex.noamanyhr';

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
   * Push only (no notification rows): for workflows that already wrote their own in-app
   * notification (leaves, permissions, overtime and employee requests). Best-effort: never
   * throws, so a push failure can never fail the request that triggered it.
   */
  async pushToUsers(userIds: Array<number | null | undefined>, title: string, body: string): Promise<number> {
    let sent = 0;
    try {
      const ids = [...new Set(userIds.filter((id): id is number => typeof id === 'number' && id > 0))];
      if (!ids.length) return 0;
      const users = await this.prisma.users.findMany({
        where: { user_id: { in: ids } },
        select: { user_id: true, device_token: true },
      });
      for (const user of users) {
        const token = user.device_token?.trim();
        if (!token) continue;
        try {
          await this.dispatch(token, { title, body });
          sent += 1;
        } catch (error) {
          this.logger.warn(`push to user ${user.user_id} failed: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`pushToUsers failed: ${(error as Error).message}`);
    }
    return sent;
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

  private account: ServiceAccount | null | undefined;
  private accessToken: { value: string; expiresAt: number } | null = null;

  /**
   * FCM HTTP v1 send. Needs a Firebase service-account key (project of the employee app's
   * google-services.json) at FIREBASE_SERVICE_ACCOUNT_FILE; without one it only logs, as before.
   * The message carries both a notification block (shown by the phone when the app is closed)
   * and the same title/body in data (read by the app when it is open). A failed push is logged
   * and never fails the caller: the notification row is already saved.
   */
  private async dispatch(token: string, payload: PushPayload): Promise<void> {
    const account = this.serviceAccount();
    if (!account) {
      this.logger.log(`FCM(not configured) → token=${token.slice(0, 12)}… title="${payload.title}"`);
      return;
    }
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await this.fcmAccessToken(account)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: PushService.fcmMessage(token, payload) }),
        },
      );
      if (!response.ok) {
        this.logger.warn(`FCM send failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
      }
    } catch (error) {
      this.logger.warn(`FCM send failed: ${(error as Error).message}`);
    }
  }

  static fcmMessage(token: string, payload: PushPayload) {
    return {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { title: payload.title, body: payload.body },
      android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL_ID, sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    };
  }

  private serviceAccount(): ServiceAccount | null {
    if (this.account !== undefined) return this.account;
    const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim();
    this.account = null;
    if (!file) return null;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceAccount>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        this.account = parsed as ServiceAccount;
      } else {
        this.logger.warn(`FIREBASE_SERVICE_ACCOUNT_FILE is not a service-account key: ${file}`);
      }
    } catch (error) {
      this.logger.warn(`Cannot read FIREBASE_SERVICE_ACCOUNT_FILE ${file}: ${(error as Error).message}`);
    }
    return this.account;
  }

  /** OAuth token for the FCM scope from a self-signed service-account JWT, reused until near expiry. */
  private async fcmAccessToken(account: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt > now + 60) return this.accessToken.value;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !body.access_token) {
      throw new Error(`FCM token request failed (${response.status}): ${body.error ?? 'no access_token'}`);
    }
    this.accessToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 3600) };
    return body.access_token;
  }
}
