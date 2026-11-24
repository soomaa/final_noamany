import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { wa_clients } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { decidePermit, localClock, withinHours } from './wa-control.policy';
import type { WaPermitRequestDto, WaPermitResultDto } from './wa-control.dto';

const COUNTED = { not: 'failed' } as const;

/** Defaults for the WhatsApp Web DOM; the panel can override any of them without a release. */
export const DEFAULT_SELECTORS: Record<string, string> = {
  composer: 'footer div[contenteditable="true"]',
  sendButton: 'footer button[aria-label="Send"], footer button[aria-label="إرسال"], footer [data-icon="send"], footer [data-icon="wds-ic-send-filled"]',
  dialog: 'div[role="dialog"], [data-animate-modal-popup="true"]',
  dialogOk: 'div[role="dialog"] button, [data-animate-modal-popup="true"] button',
  outgoing: '#main div.message-out',
  pendingIcon: '[data-icon="msg-time"]',
  sentIcon: '[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-dblcheck-ack"]',
  qrCode: 'canvas[aria-label*="QR" i], div[data-ref] canvas',
  appReady: '#side, #pane-side',
};

/**
 * MetaFit's platform WhatsApp control («واتساب» super-admin page), run inside Noamany's own
 * database: Noamany is one gym, so there is exactly one sending allowance (`wa_clients` row),
 * created with MetaFit's defaults the first time it is needed. Limits, pacing, sending hours,
 * the one-sender lock and the permit ledger behave exactly as on MetaFit.
 */
@Injectable()
export class WaControlService {
  constructor(private readonly prisma: PrismaService) {}

  /** The gym's allowance row (created on first use). */
  async gymClient(): Promise<wa_clients> {
    const existing = await this.prisma.wa_clients.findFirst({ orderBy: { id: 'asc' } });
    if (existing) return existing;
    return this.prisma.wa_clients.create({ data: { name: 'Noamany Fitness Center' } });
  }

  async selectors() {
    const row = await this.prisma.wa_control_settings.findUnique({ where: { id: 1 } });
    const custom = (row?.selectors ?? {}) as Record<string, string>;
    return { defaults: DEFAULT_SELECTORS, custom, effective: { ...DEFAULT_SELECTORS, ...custom } };
  }

  // ── sender (browser extension) ──────────────────────────────────────────────

  async status(client: wa_clients) {
    const now = new Date();
    await this.prisma.wa_clients.update({ where: { id: client.id }, data: { last_seen_at: now } });
    const usage = await this.usage(client, now);
    return { ...this.view(client, usage, now), selectors: (await this.selectors()).effective };
  }

  async permit(clientId: number, body: WaPermitRequestDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Serialise permits per number: limits and the pacing gap must hold under concurrency.
      await tx.$queryRaw`SELECT id FROM wa_clients WHERE id = ${clientId} FOR UPDATE`;
      const client = await tx.wa_clients.findUniqueOrThrow({ where: { id: clientId } });
      const clock = localClock(now, client.timezone);
      const [usedToday, usedMonth] = await Promise.all([
        tx.wa_permits.count({ where: { client_id: clientId, day: clock.day, status: COUNTED } }),
        tx.wa_permits.count({ where: { client_id: clientId, month: clock.month, status: COUNTED } }),
      ]);
      const decision = decidePermit({ client, senderId: body.senderId, usedToday, usedMonth, now });
      if (!decision.ok) {
        await tx.wa_clients.update({ where: { id: clientId }, data: { last_seen_at: now } });
        const { ok: _ok, ...denial } = decision;
        return { granted: false as const, ...denial };
      }
      const permitId = randomUUID();
      await tx.wa_permits.create({
        data: {
          id: permitId,
          client_id: clientId,
          day: clock.day,
          month: clock.month,
          sender_label: body.senderLabel?.slice(0, 160) ?? null,
          phone_tail: body.phoneTail ?? null,
          ref: body.ref ?? null,
        },
      });
      await tx.wa_clients.update({
        where: { id: clientId },
        data: {
          last_seen_at: now,
          lock_holder: body.senderId,
          lock_label: body.senderLabel?.slice(0, 160) ?? null,
          lock_expires_at: new Date(now.getTime() + decision.lockSec * 1000),
          next_allowed_at: new Date(now.getTime() + decision.delaySec * 1000),
        },
      });
      return {
        granted: true as const,
        permitId,
        delaySec: decision.delaySec,
        remainingToday: Math.max(0, client.daily_limit - usedToday - 1),
        remainingMonth: Math.max(0, client.monthly_limit - usedMonth - 1),
      };
    });
  }

  async report(clientId: number, permitId: string, body: WaPermitResultDto) {
    const result = await this.prisma.wa_permits.updateMany({
      where: { id: permitId, client_id: clientId },
      data: { status: body.status, reason: body.reason?.slice(0, 80) ?? null, reported_at: new Date() },
    });
    if (!result.count) throw new NotFoundException('التصريح غير موجود');
    return { ok: true };
  }

  async release(clientId: number, senderId: string) {
    await this.prisma.wa_clients.updateMany({
      where: { id: clientId, lock_holder: senderId },
      data: { lock_holder: null, lock_label: null, lock_expires_at: null },
    });
    return { ok: true };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async usage(client: wa_clients, now: Date) {
    const clock = localClock(now, client.timezone);
    const [today, month, failedToday] = await Promise.all([
      this.prisma.wa_permits.count({ where: { client_id: client.id, day: clock.day, status: COUNTED } }),
      this.prisma.wa_permits.count({ where: { client_id: client.id, month: clock.month, status: COUNTED } }),
      this.prisma.wa_permits.count({ where: { client_id: client.id, day: clock.day, status: 'failed' } }),
    ]);
    return { today, month, failedToday };
  }

  private view(row: wa_clients, usage: { today: number; month: number; failedToday: number }, now: Date) {
    const lockActive = !!row.lock_holder && !!row.lock_expires_at && row.lock_expires_at > now;
    return {
      id: row.id,
      name: row.name,
      tenantId: row.tenant_id,
      keyPrefix: row.key_prefix,
      enabled: row.enabled,
      dailyLimit: row.daily_limit,
      monthlyLimit: row.monthly_limit,
      minDelaySec: row.min_delay_sec,
      maxDelaySec: row.max_delay_sec,
      pauseEvery: row.pause_every,
      pauseSec: row.pause_sec,
      sendFrom: row.send_from,
      sendTo: row.send_to,
      timezone: row.timezone,
      notes: row.notes,
      withinHours: withinHours(localClock(now, row.timezone).minutes, row.send_from, row.send_to),
      usage,
      lock: lockActive ? { label: row.lock_label, expiresAt: row.lock_expires_at } : null,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }

}
