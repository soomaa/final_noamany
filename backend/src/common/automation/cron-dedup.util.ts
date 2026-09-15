/**
 * Dedup helper for cron/automation jobs — skip if same key ran within windowMs.
 * Uses in-memory map; sufficient for single-instance cron. For multi-instance use DB lock.
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const lastRun = new Map<string, number>();

export function shouldRunDeduped(key: string, windowMs: number): boolean {
  const now = Date.now();
  const prev = lastRun.get(key);
  if (prev != null && now - prev < windowMs) return false;
  lastRun.set(key, now);
  return true;
}

/** Mark a logical automation as already handled (e.g. SMS sent for subscription X). */
const handledKeys = new Set<string>();

export function markHandled(key: string): void {
  handledKeys.add(key);
}

export function wasHandled(key: string): boolean {
  return handledKeys.has(key);
}

export function clearHandled(key: string): void {
  handledKeys.delete(key);
}

/** Persistent-style dedup key builder. */
export function automationKey(module: string, entityId: string | number, action: string): string {
  return `${module}:${entityId}:${action}`;
}

export async function runWithMysqlLock<T>(
  prisma: PrismaService,
  key: string,
  timeoutSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ acquired: number | bigint | null }[]>`
      SELECT GET_LOCK(${key}, ${timeoutSeconds}) AS acquired
    `;
    const acquired = Number(rows[0]?.acquired ?? 0) === 1;
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      await tx.$queryRaw(Prisma.sql`SELECT RELEASE_LOCK(${key})`);
    }
  }, { maxWait: 5000, timeout: 10 * 60 * 1000 });
}
