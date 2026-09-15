import { Global, Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhooksQueueBootstrap } from './webhooks.bootstrap';

@Global()
@Module({
  controllers: [WebhooksController],
  providers: [WebhookService, WebhookDeliveryService, WebhooksQueueBootstrap],
  exports: [WebhookService],
})
export class WebhooksModule {}
