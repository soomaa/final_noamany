import { Injectable, Logger } from '@nestjs/common';

export type MessageChannel = 'sms' | 'email' | 'whatsapp';

export interface OutboundMessage {
  channel: MessageChannel;
  to: string;
  subject?: string;
  body: string;
  memberId?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Pluggable messaging seam — logs by default; wire Twilio/SMTP/WhatsApp via env when ready.
 */
@Injectable()
export class MessagingProviderService {
  private readonly log = new Logger(MessagingProviderService.name);

  async send(msg: OutboundMessage): Promise<{ sent: boolean; provider: string; messageId?: string }> {
    const provider = process.env.MESSAGING_PROVIDER ?? 'log';

    if (provider === 'log' || !process.env.MESSAGING_API_KEY) {
      this.log.log(
        `[${msg.channel}] to=${msg.to} member=${msg.memberId ?? '—'} — ${msg.body.slice(0, 120)}`,
      );
      return { sent: true, provider: 'log', messageId: `log-${Date.now()}` };
    }

    // Future: Twilio / SMTP / WhatsApp Business API
    this.log.warn(`Messaging provider "${provider}" not implemented — falling back to log`);
    this.log.log(`[${msg.channel}] to=${msg.to} — ${msg.body.slice(0, 120)}`);
    return { sent: true, provider: 'log-stub', messageId: `stub-${Date.now()}` };
  }
}
