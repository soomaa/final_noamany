import { randomUUID } from 'node:crypto';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveCorrelationId(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && SAFE_CORRELATION_ID.test(normalized) ? normalized : randomUUID();
}
