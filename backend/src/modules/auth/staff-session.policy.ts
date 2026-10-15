import { createHash, timingSafeEqual } from 'node:crypto';

const TTL_PATTERN = /^(\d+)(s|m|h|d)$/;
const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseTtlMilliseconds(value: string | number | undefined): number {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) return value * 1_000;
    throw new Error('invalid refresh token TTL');
  }
  const match = value?.trim().match(TTL_PATTERN);
  if (!match) throw new Error('invalid refresh token TTL');
  const amount = Number(match[1]);
  const milliseconds = amount * UNIT_MS[match[2]];
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error('invalid refresh token TTL');
  }
  return milliseconds;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeDigestEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface StoredStaffSessionState {
  userId: number;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

export function isSessionUsable(
  session: StoredStaffSessionState,
  input: {
    userId: number;
    familyId: string;
    token: string;
    now: Date;
  },
): boolean {
  return (
    session.userId === input.userId &&
    session.familyId === input.familyId &&
    session.consumedAt == null &&
    session.revokedAt == null &&
    session.expiresAt.getTime() > input.now.getTime() &&
    safeDigestEqual(session.tokenHash, hashRefreshToken(input.token))
  );
}
