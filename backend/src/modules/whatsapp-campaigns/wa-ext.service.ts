import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { wa_devices } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { newDeviceToken, sha256 } from './wa-campaigns.service';
import { isStopReply, toWhatsAppPhone } from './wa-campaigns.utils';
import { ControlUnavailableError, WaControlClient } from './wa-control.client';

/** A message stuck in "sending" this long was never reported — mark it, never resend it. */
const STALE_SENDING_MS = 10 * 60_000;
/** A «إيقاف» reply only counts from someone this branch messaged recently — not from any chat on the phone. */
const STOP_REPLY_WINDOW_DAYS = 30;

/**
 * The browser extension's side of the queue. It only ever sees one message at a time, and
 * only after Gymora granted a permit for it.
 */
@Injectable()
export class WaExtService {
  private readonly log = new Logger(WaExtService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly control: WaControlClient,
  ) {}

  async pair(code: string) {
    const device = await this.prisma.wa_devices.findFirst({
      where: { pair_code_hash: sha256(code), pair_expires_at: { gt: new Date() }, revoked_at: null },
    });
    if (!device) throw new UnauthorizedException('كود الربط غلط أو انتهت صلاحيته — اعمل كود جديد من صفحة واتساب');
    const token = newDeviceToken();
    await this.prisma.wa_devices.update({
      where: { id: device.id },
      data: { token_hash: sha256(token), pair_code_hash: null, pair_expires_at: null, paired_at: new Date(), last_seen_at: new Date() },
    });
    return { token, device: await this.deviceView(device) };
  }

  async state(device: wa_devices) {
    await this.touch(device.id);
    const campaigns = await this.prisma.wa_campaigns.findMany({
      where: { branch_id: device.branch_id, status: { in: ['running', 'paused', 'ready'] } },
      orderBy: { id: 'asc' },
      take: 20,
    });
    const grouped = campaigns.length
      ? await this.prisma.wa_messages.groupBy({ by: ['campaign_id', 'status'], where: { campaign_id: { in: campaigns.map((c) => c.id) } }, _count: { _all: true } })
      : [];
    const count = (id: number, status: string) => grouped.find((g) => g.campaign_id === id && g.status === status)?._count._all ?? 0;
    let control: Record<string, unknown> | null = null;
    let controlError: string | null = null;
    try {
      control = (await this.control.status()) as unknown as Record<string, unknown>;
    } catch (err) {
      controlError = err instanceof Error ? err.message : String(err);
    }
    return {
      device: await this.deviceView(device),
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        queued: count(c.id, 'queued'),
        sent: count(c.id, 'sent'),
        failed: count(c.id, 'failed'),
        uncertain: count(c.id, 'uncertain'),
      })),
      control,
      controlError,
    };
  }

  /**
   * Claim the next queued message of a running campaign in this device's branch, then ask
   * Gymora for a permit. A refused permit puts the message straight back in the queue.
   */
  async next(device: wa_devices, campaignId?: number) {
    await this.touch(device.id);
    await this.recoverStale();
    if (!this.control.configured) {
      return { wait: true as const, code: 'not_configured', message: 'خدمة التحكم في واتساب مش متظبطة على السيرفر', retryAfterSec: null };
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await this.prisma.wa_messages.findFirst({
        where: {
          status: 'queued',
          campaign: { status: 'running', branch_id: device.branch_id, ...(campaignId ? { id: campaignId } : {}) },
        },
        orderBy: [{ campaign_id: 'asc' }, { id: 'asc' }],
      });
      if (!candidate) return { idle: true as const };
      const claimed = await this.prisma.wa_messages.updateMany({
        where: { id: candidate.id, status: 'queued' },
        data: { status: 'sending', device_id: device.id, claimed_at: new Date() },
      });
      if (claimed.count !== 1) continue; // another device took it first

      const unclaim = () =>
        this.prisma.wa_messages.updateMany({
          where: { id: candidate.id, status: 'sending', device_id: device.id },
          data: { status: 'queued', device_id: null, claimed_at: null },
        });
      let permit;
      try {
        permit = await this.control.permit({
          senderId: device.id,
          senderLabel: `${await this.branchName(device.branch_id)} — ${device.label}`,
          phoneTail: candidate.phone.slice(-4),
          ref: `pharos:c${candidate.campaign_id}:m${candidate.id}`,
        });
      } catch (err) {
        await unclaim();
        const message = err instanceof ControlUnavailableError ? err.message : 'تعذّر الاتصال بخدمة التحكم';
        return { wait: true as const, code: 'control_unreachable', message, retryAfterSec: 30 };
      }
      if (!permit.granted) {
        await unclaim();
        return { wait: true as const, code: permit.code, message: permit.message, retryAfterSec: permit.retryAfterSec, lockedBy: permit.lockedBy ?? null };
      }
      await this.prisma.wa_messages.update({ where: { id: candidate.id }, data: { permit_id: permit.permitId } });
      return {
        message: { id: candidate.id, campaignId: candidate.campaign_id, name: candidate.member_name, phone: candidate.phone, body: candidate.body },
        delaySec: permit.delaySec,
        remainingToday: permit.remainingToday,
      };
    }
    return { wait: true as const, code: 'busy', message: 'الطابور مشغول، هنحاول تاني', retryAfterSec: 5 };
  }

  async result(device: wa_devices, messageId: number, status: 'sent' | 'failed' | 'uncertain', reason?: string) {
    await this.touch(device.id);
    const message = await this.prisma.wa_messages.findFirst({ where: { id: messageId, device_id: device.id, status: 'sending' } });
    if (!message) throw new NotFoundException('الرسالة مش محجوزة للجهاز ده');
    await this.prisma.wa_messages.update({
      where: { id: messageId },
      data: { status, reason: reason?.slice(0, 80) ?? null, ...(status === 'sent' ? { sent_at: new Date() } : {}) },
    });
    if (message.permit_id) await this.control.report(message.permit_id, status, reason);
    await this.finishIfDone(message.campaign_id);
    return { ok: true };
  }

  /**
   * The extension saw an incoming «إيقاف» (or "stop") reply. If this branch messaged that number recently, the
   * number joins the do-not-message list and anything still queued for it is cancelled.
   */
  async stopReply(device: wa_devices, rawPhone: string, text: string) {
    await this.touch(device.id);
    const phone = toWhatsAppPhone(rawPhone);
    if (!phone || !isStopReply(text)) return { optedOut: false as const };
    const since = new Date(Date.now() - STOP_REPLY_WINDOW_DAYS * 86400_000);
    const ours = await this.prisma.wa_messages.findFirst({
      where: { phone, branch_id: device.branch_id, status: { in: ['sent', 'uncertain'] }, created_at: { gte: since } },
      select: { id: true },
    });
    if (!ours) return { optedOut: false as const };
    await this.prisma.$transaction([
      this.prisma.wa_opt_outs.upsert({
        where: { phone },
        create: { phone, reason: 'رد «إيقاف» على واتساب' },
        update: {},
      }),
      this.prisma.wa_messages.updateMany({ where: { phone, status: 'queued' }, data: { status: 'cancelled', reason: 'opted_out' } }),
    ]);
    this.log.log(`opt-out by reply …${phone.slice(-4)}`);
    return { optedOut: true as const };
  }

  async release(device: wa_devices) {
    await this.control.release(device.id);
    return { ok: true };
  }

  private async recoverStale() {
    const stale = await this.prisma.wa_messages.findMany({
      where: { status: 'sending', claimed_at: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
      select: { id: true, permit_id: true, campaign_id: true },
      take: 50,
    });
    for (const m of stale) {
      const updated = await this.prisma.wa_messages.updateMany({ where: { id: m.id, status: 'sending' }, data: { status: 'uncertain', reason: 'no_report' } });
      if (updated.count && m.permit_id) await this.control.report(m.permit_id, 'uncertain', 'no_report');
      await this.finishIfDone(m.campaign_id);
    }
    if (stale.length) this.log.warn(`marked ${stale.length} stale WhatsApp message(s) uncertain`);
  }

  private async finishIfDone(campaignId: number) {
    const pending = await this.prisma.wa_messages.count({ where: { campaign_id: campaignId, status: { in: ['queued', 'sending'] } } });
    if (!pending) {
      await this.prisma.wa_campaigns.updateMany({ where: { id: campaignId, status: 'running' }, data: { status: 'done', finished_at: new Date() } });
    }
  }

  private touch(id: string) {
    return this.prisma.wa_devices.update({ where: { id }, data: { last_seen_at: new Date() } });
  }

  private async deviceView(device: wa_devices) {
    return { id: device.id, label: device.label, branchId: device.branch_id, branchName: await this.branchName(device.branch_id) };
  }

  private async branchName(branchId: number) {
    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId }, select: { branch_name: true } });
    return branch?.branch_name || `فرع ${branchId}`;
  }
}
