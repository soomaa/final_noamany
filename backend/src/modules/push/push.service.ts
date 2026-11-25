import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createSign } from 'crypto';
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
/** Android channel the member app (أنا نعماني) creates for its notifications. */
export const MEMBER_ANDROID_CHANNEL_ID = 'noamany_default';

/** FCM topics the member app subscribes to (returned by POST /member/device-token). */
export const MEMBER_TOPIC_ALL = 'noamany_members';
export const memberBranchTopic = (branchId: number) => `noamany_branch_${branchId}`;
export const memberGenderTopic = (gender: 'male' | 'female') => `noamany_gender_${gender}`;

/** Push to the member app: notification { title, body } + data { type, id, title, body, link? } (all strings). */
export interface MemberPushPayload {
  type: string;
  id: string | number;
  title: string;
  body: string;
  link?: string | null;
  /** push_sends.id — the app reports it back to POST /member/notification-opened. */
  sendId?: number | null;
  /** https image shown in the notification (FCM notification.image). */
  imageUrl?: string | null;
}

export type MemberDeliveryStatus = 'sent' | 'failed' | 'invalid' | 'no_device';

export interface MemberPushResult {
  /** devices FCM accepted (or, without a Firebase key, that were logged). */
  sent: number;
  /** devices FCM rejected as UNREGISTERED / invalid token; marked invalid_at. */
  invalid: number;
  /** valid devices registered for the targeted members before the send. */
  devices: number;
}

type FcmTarget = { token: string } | { topic: string } | { condition: string };
type FcmOutcome = 'sent' | 'invalid' | 'failed';

const FCM_TIMEOUT_MS = 10_000;

export const hashDeviceToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** Never log a device token in full. */
const shortToken = (token: string) => `${token.slice(0, 10)}…(${token.length})`;

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
    await this.post(PushService.fcmMessage(token, payload), `token=${shortToken(token)} title="${payload.title}"`);
  }

  /**
   * POST one FCM v1 message. Never throws. 'invalid' = FCM says the token is dead
   * (UNREGISTERED, SENDER_ID_MISMATCH, or INVALID_ARGUMENT about the registration token).
   */
  private async post(message: object, label: string): Promise<FcmOutcome> {
    const account = this.serviceAccount();
    if (!account) {
      this.logger.log(`FCM(not configured) → ${label}`);
      return 'sent';
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
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(FCM_TIMEOUT_MS),
        },
      );
      if (response.ok) return 'sent';
      const text = await response.text();
      if (PushService.isDeadTokenError(text)) {
        this.logger.log(`FCM token rejected (${response.status}) → ${label}`);
        return 'invalid';
      }
      this.recordError(`FCM send failed (${response.status}) → ${label}: ${text.slice(0, 300)}`);
    } catch (error) {
      this.recordError(`FCM send failed → ${label}: ${(error as Error).message}`);
    }
    return 'failed';
  }

  /** FCM v1 error body → is it about the device token itself (so the token should be dropped)? */
  static isDeadTokenError(text: string): boolean {
    let error: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } | undefined;
    try {
      error = (JSON.parse(text) as { error?: typeof error }).error;
    } catch {
      return false;
    }
    if (!error) return false;
    const codes = [error.status, ...(error.details ?? []).map((d) => d.errorCode)];
    if (codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')) return true;
    // INVALID_ARGUMENT is also what a malformed message gets; only drop the token when FCM blames it.
    return codes.includes('INVALID_ARGUMENT') && /token/i.test(error.message ?? '');
  }

  // ── Member app (أنا نعماني) ────────────────────────────────────────────────────

  /**
   * Register / refresh a member-app device token. A token belongs to one device, so it is
   * re-pointed to this member if another member registered it before; last_seen_at is refreshed
   * and a previously rejected token becomes valid again. Returns the topics to subscribe to.
   */
  async registerMemberDevice(
    memberId: number,
    input: { token: string; platform: 'android' | 'ios'; appVersion?: string | null },
  ): Promise<{ ok: true; topics: string[] }> {
    const token = input.token.trim();
    const now = new Date();
    const data = {
      member_id: memberId,
      token,
      platform: input.platform,
      app_version: input.appVersion?.trim() || null,
      last_seen_at: now,
      invalid_at: null,
    };
    await this.prisma.club_member_device_tokens.upsert({
      where: { token_hash: hashDeviceToken(token) },
      create: { ...data, token_hash: hashDeviceToken(token), created_at: now },
      update: data,
    });
    return { ok: true, topics: await this.memberTopics(memberId) };
  }

  /** Remove a device token of this member (logout / notifications off). */
  async removeMemberDevice(memberId: number, token: string): Promise<{ ok: true; removed: number }> {
    const res = await this.prisma.club_member_device_tokens.deleteMany({
      where: { token_hash: hashDeviceToken(token.trim()), member_id: memberId },
    });
    return { ok: true, removed: res.count };
  }

  /** noamany_members, noamany_branch_<branch_id>, noamany_gender_<male|female> (when known). */
  async memberTopics(memberId: number): Promise<string[]> {
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { branch_id: true, gender: true },
    });
    const topics = [MEMBER_TOPIC_ALL];
    if (member?.branch_id != null) topics.push(memberBranchTopic(member.branch_id));
    if (member?.gender === 'male' || member?.gender === 'female') topics.push(memberGenderTopic(member.gender));
    return topics;
  }

  /** Push to every valid device of the given members; dead tokens get invalid_at. Never throws. */
  async sendToMembers(memberIds: number[], payload: MemberPushPayload): Promise<MemberPushResult> {
    return (await this.deliverToMembers(memberIds, () => payload)).result;
  }

  /**
   * Per-member delivery (the payload may differ per member, e.g. {first_name}). Devices are sent
   * `concurrency` at a time; dead tokens get invalid_at. A member is 'sent' when any of their
   * devices accepted it. Never throws.
   */
  async deliverToMembers(
    memberIds: number[],
    payloadFor: (memberId: number) => MemberPushPayload,
    concurrency = 10,
  ): Promise<{ result: MemberPushResult; perMember: Map<number, MemberDeliveryStatus> }> {
    const result: MemberPushResult = { sent: 0, invalid: 0, devices: 0 };
    const perMember = new Map<number, MemberDeliveryStatus>();
    const ids = [...new Set(memberIds)].filter((id) => Number.isInteger(id) && id > 0);
    ids.forEach((id) => perMember.set(id, 'no_device'));
    if (ids.length === 0) return { result, perMember };
    try {
      const devices: { id: number; member_id: number; token: string }[] = [];
      for (let i = 0; i < ids.length; i += 1000) {
        devices.push(...(await this.prisma.club_member_device_tokens.findMany({
          where: { member_id: { in: ids.slice(i, i + 1000) }, invalid_at: null },
          select: { id: true, member_id: true, token: true },
        })));
      }
      result.devices = devices.length;
      const outcomes = new Map<number, FcmOutcome[]>();
      const dead: number[] = [];
      let next = 0;
      const worker = async () => {
        while (next < devices.length) {
          const device = devices[next++];
          const payload = payloadFor(device.member_id);
          const outcome = await this.post(
            PushService.memberFcmMessage({ token: device.token }, payload),
            `member=${device.member_id} token=${shortToken(device.token)} type=${payload.type} title="${payload.title}"`,
          );
          if (outcome === 'sent') result.sent += 1;
          if (outcome === 'invalid') dead.push(device.id);
          outcomes.set(device.member_id, [...(outcomes.get(device.member_id) ?? []), outcome]);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, devices.length)) }, worker));
      for (const [memberId, list] of outcomes) {
        perMember.set(memberId, list.includes('sent') ? 'sent' : list.every((o) => o === 'invalid') ? 'invalid' : 'failed');
      }
      for (let i = 0; i < dead.length; i += 1000) {
        await this.prisma.club_member_device_tokens.updateMany({
          where: { id: { in: dead.slice(i, i + 1000) } },
          data: { invalid_at: new Date() },
        });
      }
      result.invalid = dead.length;
    } catch (error) {
      this.recordError(`Member push failed: ${(error as Error).message}`);
    }
    return { result, perMember };
  }

  /** Push to an FCM topic (noamany_members / noamany_branch_<id> / noamany_gender_<g>). Never throws. */
  async sendToTopic(topic: string, payload: MemberPushPayload): Promise<boolean> {
    return this.sendToTopicTarget({ topic }, payload);
  }

  /** Push to one topic or a topic condition ("'a' in topics && 'b' in topics", ≤ 5 topics). Never throws. */
  async sendToTopicTarget(target: { topic: string } | { condition: string }, payload: MemberPushPayload): Promise<boolean> {
    const label = 'topic' in target ? `topic=${target.topic}` : `condition=${target.condition}`;
    const outcome = await this.post(
      PushService.memberFcmMessage(target, payload),
      `${label} type=${payload.type} title="${payload.title}"`,
    );
    return outcome === 'sent';
  }

  /** Last FCM failure since the process started (shown on the settings tab). */
  lastError: { message: string; at: Date } | null = null;

  private recordError(message: string) {
    this.lastError = { message: message.slice(0, 500), at: new Date() };
    this.logger.warn(message);
  }

  /** Whether a usable service-account key is installed (never exposes the key itself). */
  firebaseStatus(): { configured: boolean; projectId: string | null; keyFileSet: boolean } {
    const account = this.serviceAccount();
    return {
      configured: !!account,
      projectId: account?.project_id ?? null,
      keyFileSet: !!process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim(),
    };
  }

  static memberFcmMessage(target: FcmTarget, payload: MemberPushPayload) {
    const data: Record<string, string> = {
      type: String(payload.type),
      id: String(payload.id),
      title: payload.title,
      body: payload.body,
    };
    if (payload.link) data.link = String(payload.link);
    if (payload.sendId != null) data.sendId = String(payload.sendId);
    const image = payload.imageUrl && /^https:\/\//i.test(payload.imageUrl) ? payload.imageUrl : null;
    return {
      ...target,
      notification: { title: payload.title, body: payload.body, ...(image ? { image } : {}) },
      data,
      android: { priority: 'HIGH', notification: { channel_id: MEMBER_ANDROID_CHANNEL_ID, sound: 'default' } },
      apns: image
        ? { payload: { aps: { sound: 'default', 'mutable-content': 1 } }, fcm_options: { image } }
        : { payload: { aps: { sound: 'default' } } },
    };
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

  private pendingToken: Promise<string> | null = null;

  /**
   * OAuth token for the FCM scope from a self-signed service-account JWT, reused until near expiry.
   * Concurrent sends share one in-flight token request.
   */
  private async fcmAccessToken(account: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt > now + 60) return this.accessToken.value;
    this.pendingToken ??= this.requestAccessToken(account, now).finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async requestAccessToken(account: ServiceAccount, now: number): Promise<string> {
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
      signal: AbortSignal.timeout(FCM_TIMEOUT_MS),
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
