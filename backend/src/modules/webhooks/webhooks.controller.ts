import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JobQueueService } from '../jobs/job-queue.service';
import { WebhookService } from './webhook.service';

@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhookService,
    private readonly jobs: JobQueueService,
  ) {}

  @Get('meta')
  @RequiresPermission('admin.webhooks:view')
  meta() {
    return {
      eventTypes: this.webhooks.listEventTypes(),
      queueBackend: this.jobs.isRedisEnabled() ? 'bullmq' : 'inline',
    };
  }

  @Get('endpoints')
  @RequiresPermission('admin.webhooks:view')
  listEndpoints() {
    return this.webhooks.listEndpoints();
  }

  @Post('endpoints')
  @RequiresPermission('admin.webhooks:manage')
  createEndpoint(@Body() body: { name: string; url: string; events: string[]; secret?: string }) {
    return this.webhooks.createEndpoint(body);
  }

  @Patch('endpoints/:id/toggle')
  @RequiresPermission('admin.webhooks:manage')
  toggle(@Param('id', ParseIntPipe) id: number, @Query('active') active: string) {
    return this.webhooks.toggleEndpoint(id, active === 'true' || active === '1');
  }

  @Delete('endpoints/:id')
  @RequiresPermission('admin.webhooks:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.webhooks.removeEndpoint(id);
  }

  @Post('endpoints/:id/test')
  @RequiresPermission('admin.webhooks:manage')
  test(@Param('id', ParseIntPipe) id: number) {
    return this.webhooks.testEndpoint(id);
  }

  @Get('deliveries')
  @RequiresPermission('admin.webhooks:view')
  deliveries(@Query('limit') limit?: string) {
    return this.webhooks.listDeliveries(limit ? Number(limit) : 50);
  }
}
