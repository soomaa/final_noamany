import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class RequestMetricsService {
  private inFlight = 0;
  private errors = 0;
  private durationSeconds = 0;
  private durationCount = 0;
  private readonly requests = new Map<string, number>();

  startRequest(method: string): (status: number, durationMs: number) => void {
    this.inFlight += 1;
    let finished = false;
    const normalizedMethod = /^[A-Z]{3,8}$/.test(method.toUpperCase())
      ? method.toUpperCase()
      : 'OTHER';
    return (status: number, durationMs: number) => {
      if (finished) return;
      finished = true;
      this.inFlight = Math.max(0, this.inFlight - 1);
      const statusClass = status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : 'other';
      const key = `${normalizedMethod}|${statusClass}`;
      this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
      if (status >= 500) this.errors += 1;
      this.durationSeconds += Math.max(0, durationMs) / 1_000;
      this.durationCount += 1;
    };
  }

  assertAuthorized(authorization: string | undefined, configuredToken: string | null | undefined) {
    if (!configuredToken) {
      throw new ServiceUnavailableException('Metrics endpoint is not configured');
    }
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(configuredToken))) {
      throw new UnauthorizedException('Invalid metrics credentials');
    }
  }

  renderPrometheus(): string {
    const memory = process.memoryUsage();
    const lines = [
      '# HELP hr_http_requests_total Completed HTTP requests.',
      '# TYPE hr_http_requests_total counter',
    ];
    for (const [key, count] of [...this.requests.entries()].sort()) {
      const [method, statusClass] = key.split('|');
      lines.push(`hr_http_requests_total{method="${method}",status_class="${statusClass}"} ${count}`);
    }
    lines.push(
      '# HELP hr_http_errors_total Completed requests with a 5xx response.',
      '# TYPE hr_http_errors_total counter',
      `hr_http_errors_total ${this.errors}`,
      '# HELP hr_http_in_flight Requests currently being processed.',
      '# TYPE hr_http_in_flight gauge',
      `hr_http_in_flight ${this.inFlight}`,
      '# HELP hr_http_request_duration_seconds Request duration summary.',
      '# TYPE hr_http_request_duration_seconds summary',
      `hr_http_request_duration_seconds_sum ${this.durationSeconds.toFixed(6)}`,
      `hr_http_request_duration_seconds_count ${this.durationCount}`,
      '# HELP hr_process_uptime_seconds Process uptime.',
      '# TYPE hr_process_uptime_seconds gauge',
      `hr_process_uptime_seconds ${process.uptime().toFixed(0)}`,
      '# HELP hr_process_resident_memory_bytes Resident memory.',
      '# TYPE hr_process_resident_memory_bytes gauge',
      `hr_process_resident_memory_bytes ${memory.rss}`,
      '# HELP hr_process_heap_used_bytes JavaScript heap used.',
      '# TYPE hr_process_heap_used_bytes gauge',
      `hr_process_heap_used_bytes ${memory.heapUsed}`,
      '',
    );
    return lines.join('\n');
  }
}
