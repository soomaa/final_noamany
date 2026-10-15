import { BadRequestException } from '@nestjs/common';
import {
  assertAllowedAttendanceDeviceAddress,
  isAllowedAttendanceDeviceAddress,
} from './device-network.util';

describe('attendance device network policy', () => {
  const allowed = ['10.20.0.0/16', '192.168.40.25/32', '2001:db8:1234::/48'];

  it('allows only literal addresses inside an explicit CIDR', () => {
    expect(isAllowedAttendanceDeviceAddress('10.20.4.7', allowed)).toBe(true);
    expect(isAllowedAttendanceDeviceAddress('192.168.40.25', allowed)).toBe(true);
    expect(isAllowedAttendanceDeviceAddress('2001:db8:1234::9', allowed)).toBe(true);
    expect(isAllowedAttendanceDeviceAddress('10.21.4.7', allowed)).toBe(false);
  });

  it('rejects hostnames, URL syntax, and empty allowlists', () => {
    expect(isAllowedAttendanceDeviceAddress('attendance.internal', allowed)).toBe(false);
    expect(isAllowedAttendanceDeviceAddress('http://10.20.4.7', allowed)).toBe(false);
    expect(isAllowedAttendanceDeviceAddress('10.20.4.7:4370', allowed)).toBe(false);
    expect(isAllowedAttendanceDeviceAddress('10.20.4.7', [])).toBe(false);
  });

  it('always rejects loopback, unspecified, link-local, multicast, and metadata endpoints', () => {
    const broad = ['0.0.0.0/0', '::/0'];
    for (const blocked of [
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'ff02::1',
    ]) {
      expect(isAllowedAttendanceDeviceAddress(blocked, broad)).toBe(false);
    }
  });

  it('fails closed with a public-safe validation error', () => {
    expect(() => assertAllowedAttendanceDeviceAddress('127.0.0.1', allowed)).toThrow(
      BadRequestException,
    );
  });
});
