import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { signWebhookPayload } from './webhook.utils';

const DELIVERY_TIMEOUT_MS = 15_000;

@Injectable()
export class WebhookDeliveryService {
  private readonly log = new Logger(WebhookDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** POST signed payload to the endpoint URL; throws on failure (for BullMQ retry). */
  async deliver(deliveryId: number): Promise<void> {
    const delivery = await this.prisma.webhook_deliveries.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    if (!delivery?.endpoint) throw new NotFoundException(`Webhook delivery ${deliveryId} not found`);
    if (!delivery.endpoint.is_active) {
      await this.markSkipped(deliveryId, 'Endpoint disabled');
      return;
    }

    const envelope = {
      id: delivery.id,
      event: delivery.event_type,
      createdAt: delivery.created_at.toISOString(),
      data: delivery.payload,
    };
    const rawBody = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Noamany-Webhooks/1.0',
      'X-Noamany-Event': delivery.event_type,
      'X-Noamany-Delivery': String(delivery.id),
      'X-Noamany-Timestamp': timestamp,
    };

    if (delivery.endpoint.secret) {
      headers['X-Noamany-Signature'] = signWebhookPayload(
        delivery.endpoint.secret,
        timestamp,
        rawBody,
      );
    }

    const attempt = delivery.attempts + 1;

    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      const responseText = await response.text().catch(() => '');
      const ok = response.ok;

      await this.prisma.webhook_deliveries.update({
        where: { id: deliveryId },
        data: {
          status: ok ? 'delivered' : 'failed',
          attempts: attempt,
          response_code: response.status,
          delivered_at: ok ? new Date() : null,
          error_message: ok ? null : (responseText.slice(0, 500) || `HTTP ${response.status}`),
        },
      });

      if (!ok) {
        throw new Error(`Webhook HTTP ${response.status}: ${responseText.slice(0, 120)}`);
      }

      this.log.log(
        `Delivered #${deliveryId} ${delivery.event_type} → ${delivery.endpoint.url} (${response.status})`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.webhook_deliveries.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          attempts: attempt,
          error_message: message.slice(0, 500),
        },
      });
      this.log.warn(`Delivery #${deliveryId} failed (attempt ${attempt}): ${message}`);
      throw e;
    }
  }

  private async markSkipped(deliveryId: number, reason: string) {
    await this.prisma.webhook_deliveries.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        attempts: 1,
        error_message: reason,
      },
    });
  }
}
