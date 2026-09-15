import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobQueueService, WEBHOOK_DELIVER_JOB } from '../jobs/job-queue.service';
import { WEBHOOK_EVENT_TYPES, WebhookEventType } from './webhook.utils';

export { WebhookEventType, WEBHOOK_EVENT_TYPES };

@Injectable()
export class WebhookService {
  private readonly log = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueueService,
  ) {}

  listEventTypes() {
    return WEBHOOK_EVENT_TYPES.filter((e) => e !== '*');
  }

  async listEndpoints() {
    const rows = await this.prisma.webhook_endpoints.findMany({ orderBy: { id: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      events: (r.events as string[] | null) ?? [],
      hasSecret: !!r.secret,
      isActive: r.is_active,
      createdAt: r.created_at,
    }));
  }

  async createEndpoint(body: { name: string; url: string; events: string[]; secret?: string }) {
    if (!body.url.startsWith('http://') && !body.url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must start with http:// or https://');
    }
    return this.prisma.webhook_endpoints.create({
      data: {
        name: body.name,
        url: body.url,
        events: body.events as unknown as Prisma.InputJsonValue,
        secret: body.secret ?? null,
      },
    });
  }

  async toggleEndpoint(id: number, active: boolean) {
    return this.prisma.webhook_endpoints.update({ where: { id }, data: { is_active: active } });
  }

  async removeEndpoint(id: number) {
    await this.prisma.webhook_endpoints.delete({ where: { id } });
    return { success: true };
  }

  async listDeliveries(limit = 50) {
    const rows = await this.prisma.webhook_deliveries.findMany({
      orderBy: { id: 'desc' },
      take: limit,
      include: { endpoint: { select: { name: true, url: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      endpointId: r.endpoint_id,
      endpointName: r.endpoint.name,
      endpointUrl: r.endpoint.url,
      eventType: r.event_type,
      status: r.status,
      attempts: r.attempts,
      responseCode: r.response_code,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
    }));
  }

  /** Enqueue HTTP delivery for each matching active endpoint. */
  async dispatch(event: WebhookEventType, payload: Record<string, unknown>): Promise<void> {
    const endpoints = await this.prisma.webhook_endpoints.findMany({ where: { is_active: true } });

    for (const ep of endpoints) {
      const events = (ep.events as string[] | null) ?? [];
      if (!events.includes(event) && !events.includes('*')) continue;

      const delivery = await this.prisma.webhook_deliveries.create({
        data: {
          endpoint_id: ep.id,
          event_type: event,
          payload: payload as Prisma.InputJsonValue,
          status: 'pending',
        },
      });

      await this.jobs.enqueue(
        WEBHOOK_DELIVER_JOB,
        { deliveryId: delivery.id },
        { jobId: `webhook-${delivery.id}` },
      );

      this.log.debug(`Queued delivery #${delivery.id} ${event} → ${ep.url}`);
    }
  }

  /** Send a test ping to one endpoint (creates a delivery row). */
  async testEndpoint(id: number) {
    const ep = await this.prisma.webhook_endpoints.findUnique({ where: { id } });
    if (!ep) throw new NotFoundException('Webhook endpoint not found');

    const delivery = await this.prisma.webhook_deliveries.create({
      data: {
        endpoint_id: id,
        event_type: 'ping',
        payload: {
          message: 'Noamany webhook test',
          timestamp: new Date().toISOString(),
        },
        status: 'pending',
      },
    });

    await this.jobs.enqueue(
      WEBHOOK_DELIVER_JOB,
      { deliveryId: delivery.id },
      { jobId: `webhook-test-${delivery.id}` },
    );

    return { deliveryId: delivery.id, queued: true };
  }
}
