import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { RequestMetricsService } from './request-metrics.service';

describe('RequestMetricsService', () => {
  it('exports low-cardinality request, error, duration and process metrics', () => {
    const metrics = new RequestMetricsService();
    const finishOk = metrics.startRequest('GET');
    const finishError = metrics.startRequest('POST');
    finishOk(200, 12);
    finishError(503, 40);
    const output = metrics.renderPrometheus();
    expect(output).toContain('hr_http_requests_total{method="GET",status_class="2xx"} 1');
    expect(output).toContain('hr_http_requests_total{method="POST",status_class="5xx"} 1');
    expect(output).toContain('hr_http_errors_total 1');
    expect(output).toContain('hr_http_in_flight 0');
    expect(output).not.toContain('/api/');
  });

  it('requires a configured constant-time bearer token', () => {
    const metrics = new RequestMetricsService();
    expect(() => metrics.assertAuthorized(undefined, null)).toThrow(ServiceUnavailableException);
    expect(() => metrics.assertAuthorized('Bearer wrong', 'correct-secret')).toThrow(UnauthorizedException);
    expect(() => metrics.assertAuthorized('Bearer correct-secret', 'correct-secret')).not.toThrow();
  });
});
