import { Controller, Get, Header, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { HealthService } from './common/health/health.service';
import { RequestMetricsService } from './common/metrics/request-metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly healthService: HealthService,
    private readonly metrics: RequestMetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return this.healthService.liveness();
  }

  @Public()
  @Get('health/live')
  liveness() {
    return this.healthService.liveness();
  }

  @Public()
  @Get('health/ready')
  readiness() {
    return this.healthService.readiness();
  }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsEndpoint(@Headers('authorization') authorization: string | undefined) {
    this.metrics.assertAuthorized(
      authorization,
      this.config.get<string | null>('observability.metricsToken'),
    );
    return this.metrics.renderPrometheus();
  }
}
