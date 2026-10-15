import {
  createAttendanceDeviceKey,
  hashAttendanceDeviceKey,
  verifyAttendanceDeviceKey,
} from './attendance-device-ingest.util';

describe('attendance device ingest credentials', () => {
  it('generates a high-entropy key and stores/verifies only its digest', () => {
    const key = createAttendanceDeviceKey();
    const digest = hashAttendanceDeviceKey(key);
    expect(key.length).toBeGreaterThanOrEqual(43);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(key);
    expect(verifyAttendanceDeviceKey(key, digest)).toBe(true);
    expect(verifyAttendanceDeviceKey(`${key}x`, digest)).toBe(false);
  });

  it('fails malformed keys closed without throwing timing comparison errors', () => {
    expect(verifyAttendanceDeviceKey('', 'not-a-digest')).toBe(false);
    expect(verifyAttendanceDeviceKey('x', '')).toBe(false);
  });
});
