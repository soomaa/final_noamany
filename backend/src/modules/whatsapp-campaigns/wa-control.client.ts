import { Injectable, Logger } from '@nestjs/common';
import { WaControlService } from './wa-control/wa-control.service';

/**
 * This gym's WhatsApp allowance: monthly and daily limits, pacing, sending hours, sender lock
 * and kill switch.
 *
 * With WA_CONTROL_URL (e.g. https://gymorasystem.metacodecx.com) and WA_CONTROL_KEY (wak_…) set,
 * it is held by Gymora SaaS (super-admin «واتساب» page → client «Noamany») and asked
 * server-to-server before every message. Without them it falls back to the local allowance row
 * (`wa_clients`, see wa-control/wa-control.service.ts).
 */
export interface ControlStatus {
  name: string;
  enabled: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  sendFrom: string;
  sendTo: string;
  withinHours: boolean;
  usage: { today: number; month: number; failedToday: number };
  lock: { label: string | null; expiresAt: string } | null;
  selectors: Record<string, string>;
}

export type PermitResponse =
  | { granted: true; permitId: string; delaySec: number; remainingToday: number; remainingMonth: number }
  | { granted: false; code: string; message: string; retryAfterSec: number | null; lockedBy?: string | null };

export class ControlUnavailableError extends Error {}

const NOT_SUBSCRIBED = 'الجيم غير مشترك في رسائل واتساب — تواصل مع إدارة المنصة';
const REMOTE_TIMEOUT_MS = 10_000;

@Injectable()
export class WaControlClient {
  private readonly log = new Logger(WaControlClient.name);

  constructor(private readonly wa: WaControlService) {
    this.log.log(this.remote ? `WhatsApp limits from Gymora SaaS (${this.remote.base})` : 'WhatsApp limits from the local allowance (WA_CONTROL_URL/WA_CONTROL_KEY not set)');
  }

  get configured(): boolean {
    return true;
  }

  async status(): Promise<ControlStatus> {
    if (this.remote) return this.call<ControlStatus>('GET', '/status');
    const client = await this.client();
    if (!client) throw new ControlUnavailableError(NOT_SUBSCRIBED);
    return (await this.wa.status(client)) as unknown as ControlStatus;
  }

  async permit(body: { senderId: string; senderLabel: string; phoneTail: string; ref: string }): Promise<PermitResponse> {
    if (this.remote) return this.call<PermitResponse>('POST', '/permits', body);
    const client = await this.client();
    if (!client) return { granted: false, code: 'not_subscribed', message: NOT_SUBSCRIBED, retryAfterSec: null };
    return (await this.wa.permit(client.id, body)) as PermitResponse;
  }

  async report(permitId: string, status: 'sent' | 'failed' | 'uncertain', reason?: string | null) {
    const result = { status, ...(reason ? { reason: reason.slice(0, 80) } : {}) };
    try {
      if (this.remote) {
        await this.call('POST', `/permits/${encodeURIComponent(permitId)}/result`, result);
        return;
      }
      const client = await this.client();
      if (client) await this.wa.report(client.id, permitId, result);
    } catch (err) {
      // Counting already happened at permit time; a lost report only mislabels one row.
      this.log.warn(`permit report failed (${permitId}): ${err instanceof Error ? err.message : err}`);
    }
  }

  async release(senderId: string) {
    try {
      if (this.remote) {
        await this.call('POST', '/release', { senderId });
        return;
      }
      const client = await this.client();
      if (client) await this.wa.release(client.id, senderId);
    } catch (err) {
      this.log.warn(`lock release failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Gymora SaaS control endpoint, when both env vars are set. */
  private get remote(): { base: string; key: string } | null {
    const url = process.env.WA_CONTROL_URL?.trim();
    const key = process.env.WA_CONTROL_KEY?.trim();
    return url && key ? { base: url.replace(/\/+$/, ''), key } : null;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const remote = this.remote!;
    let response: Response;
    try {
      response = await fetch(`${remote.base}/api/public/wa-control${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${remote.key}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ControlUnavailableError(`تعذّر الاتصال بجيمورا: ${err instanceof Error ? err.message : err}`);
    }
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    if (!response.ok) {
      const message = Array.isArray(data.message) ? data.message.join('، ') : data.message;
      throw new ControlUnavailableError(message || `جيمورا رجّعت خطأ ${response.status}`);
    }
    return data as T;
  }

  /** Noamany is a single gym: its one local allowance row (created with MetaFit's defaults). */
  private client() {
    return this.wa.gymClient();
  }
}
