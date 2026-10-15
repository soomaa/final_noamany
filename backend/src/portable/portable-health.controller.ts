import { Controller, Get, Header, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from '../common/health/health.service';
import { RequestMetricsService } from '../common/metrics/request-metrics.service';

@Controller()
export class PortableHealthController {
  constructor(
    private readonly health: HealthService,
    private readonly metrics: RequestMetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('health')
  liveness() { return this.health.liveness(); }

  @Public()
  @Get('health/live')
  live() { return this.health.liveness(); }

  @Public()
  @Get('health/ready')
  ready() { return this.health.readiness(); }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  prometheus(@Headers('authorization') authorization?: string) {
    this.metrics.assertAuthorized(authorization, this.config.get<string | null>('observability.metricsToken'));
    return this.metrics.renderPrometheus();
  }
}
