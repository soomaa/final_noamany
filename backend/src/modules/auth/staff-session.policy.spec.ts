import {
  hashRefreshToken,
  isSessionUsable,
  parseTtlMilliseconds,
} from './staff-session.policy';

describe('staff session policy', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['2h', 7_200_000],
    ['7d', 604_800_000],
    [3600, 3_600_000],
  ])('parses supported JWT TTL %p', (ttl, expected) => {
    expect(parseTtlMilliseconds(ttl)).toBe(expected);
  });

  it.each(['', 'forever', '0m', '-2h', 0, -1])('rejects unsafe TTL %p', (ttl) => {
    expect(() => parseTtlMilliseconds(ttl)).toThrow('invalid refresh token TTL');
  });

  it('stores a deterministic digest rather than the refresh token', () => {
    const token = 'signed.refresh.token';
    const digest = hashRefreshToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(digest);
  });

  it('accepts only unconsumed, unrevoked, unexpired sessions with matching identity', () => {
    const now = new Date('2026-08-26T08:00:00.000Z');
    const base = {
      userId: 7,
      familyId: 'family',
      tokenHash: hashRefreshToken('token'),
      expiresAt: new Date('2026-08-27T08:00:00.000Z'),
      consumedAt: null,
      revokedAt: null,
    };

    expect(isSessionUsable(base, { userId: 7, familyId: 'family', token: 'token', now })).toBe(true);
    expect(isSessionUsable({ ...base, consumedAt: now }, { userId: 7, familyId: 'family', token: 'token', now })).toBe(false);
    expect(isSessionUsable({ ...base, revokedAt: now }, { userId: 7, familyId: 'family', token: 'token', now })).toBe(false);
    expect(isSessionUsable({ ...base, expiresAt: now }, { userId: 7, familyId: 'family', token: 'token', now })).toBe(false);
    expect(isSessionUsable(base, { userId: 8, familyId: 'family', token: 'token', now })).toBe(false);
    expect(isSessionUsable(base, { userId: 7, familyId: 'other', token: 'token', now })).toBe(false);
    expect(isSessionUsable(base, { userId: 7, familyId: 'family', token: 'wrong', now })).toBe(false);
  });
});
