import { randomBytes } from 'node:crypto';

const DISPOSABLE_DATABASE_PATTERN = /^one80_hr_e2e_[a-f0-9]{16}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function generateDisposableDatabaseName(
  random: () => Buffer = () => randomBytes(8),
): string {
  const value = random();
  if (value.length !== 8) {
    throw new Error('migration rehearsal requires exactly eight random bytes');
  }
  return `one80_hr_e2e_${value.toString('hex')}`;
}

export function assertDisposableDatabaseName(databaseName: string): string {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('refusing non-disposable database name');
  }
  return databaseName;
}

export function buildTargetDatabaseUrl(adminUrl: string, databaseName: string): string {
  assertDisposableDatabaseName(databaseName);
  const parsed = new URL(adminUrl);
  if (parsed.protocol !== 'mysql:' || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('migration rehearsal requires a loopback MySQL host');
  }
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

export function redactRehearsalError(value: string): string {
  return value.replace(/\bmysql:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]');
}
