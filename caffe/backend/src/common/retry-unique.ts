import { Prisma } from '@prisma/client';

/**
 * Retry `fn` when it fails with a unique-constraint violation (Prisma P2002).
 *
 * Use for `max()+1` / `count()+1` business numbers (payroll مسيّرة رقم, loan تسلسل, receipt no):
 * two concurrent callers can read the same max and mint the same number — with the column marked
 * `@unique`, the loser gets P2002 instead of a silent duplicate, and this retries with a recomputed
 * number. `fn` MUST recompute the number on each call (do the read + insert inside `fn`).
 */
export async function retryOnUniqueViolation<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && i < attempts - 1) {
        continue;
      }
      throw e;
    }
  }
}
