import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createAttendanceDeviceKey(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAttendanceDeviceKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function verifyAttendanceDeviceKey(key: string, expectedDigest: string): boolean {
  if (!key || key.length > 256 || !/^[a-f0-9]{64}$/.test(expectedDigest)) return false;
  const supplied = Buffer.from(hashAttendanceDeviceKey(key), 'hex');
  const expected = Buffer.from(expectedDigest, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
