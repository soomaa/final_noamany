import { createHash, timingSafeEqual } from 'crypto';

/**
 * Legacy CodeIgniter password hash: sha1(md5(plaintext)) → 40-char hex.
 * Verified against the production dump:
 *   sha1(md5('10203040')) === '2c36e4664978d67a0feae1abff87060c39c87165' (admin)
 *   sha1(md5('102030'))   === '957b0e0fc8997db58df90b87a17be424806d6d8d' (bulk employee users)
 */
export function legacyHash(plain: string): string {
  const md5 = createHash('md5').update(plain).digest('hex');
  return createHash('sha1').update(md5).digest('hex');
}

/** Constant-time comparison of a candidate plaintext against a stored legacy hash. */
export function legacyMatches(plain: string, storedHash: string): boolean {
  const a = Buffer.from(legacyHash(plain), 'utf8');
  const b = Buffer.from((storedHash ?? '').toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** A stored hash is "legacy" when it is not a bcrypt hash. */
export function isBcryptHash(hash: string | null | undefined): boolean {
  return !!hash && /^\$2[aby]\$/.test(hash);
}
