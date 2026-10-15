import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobQueueService, WEBHOOK_DELIVER_JOB } from '../jobs/job-queue.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Injectable()
export class WebhooksQueueBootstrap implements OnModuleInit {
  constructor(
    private readonly jobs: JobQueueService,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  onModuleInit() {
    this.jobs.register(WEBHOOK_DELIVER_JOB, async (data) => {
      const { deliveryId } = data as { deliveryId: number };
      await this.delivery.deliver(deliveryId);
    });
  }
}
