import { BadRequestException } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';

type IpFamily = 'ipv4' | 'ipv6';

const ALWAYS_BLOCKED = [
  '0.0.0.0/8',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '::/128',
  '::1/128',
  '::ffff:0:0/96',
  'fe80::/10',
  'ff00::/8',
] as const;

function familyOf(address: string): IpFamily | null {
  const version = isIP(address);
  return version === 4 ? 'ipv4' : version === 6 ? 'ipv6' : null;
}

function matchesCidr(address: string, cidr: string): boolean {
  const [network, rawPrefix, ...rest] = cidr.trim().split('/');
  if (!network || !rawPrefix || rest.length) return false;
  const family = familyOf(address);
  if (!family || familyOf(network) !== family) return false;
  const prefix = Number(rawPrefix);
  const max = family === 'ipv4' ? 32 : 128;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return false;
  try {
    const list = new BlockList();
    list.addSubnet(network, prefix, family);
    return list.check(address, family);
  } catch {
    return false;
  }
}

function isAlwaysBlocked(address: string): boolean {
  return ALWAYS_BLOCKED.some((cidr) => matchesCidr(address, cidr));
}

export function parseAttendanceDeviceCidrs(value: string | undefined | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isAllowedAttendanceDeviceAddress(address: string, allowedCidrs: readonly string[]): boolean {
  const normalized = address.trim();
  if (!familyOf(normalized) || normalized !== address || isAlwaysBlocked(normalized)) return false;
  return allowedCidrs.some((cidr) => matchesCidr(normalized, cidr));
}

export function assertAllowedAttendanceDeviceAddress(
  address: string,
  allowedCidrs: readonly string[],
): string {
  if (!isAllowedAttendanceDeviceAddress(address, allowedCidrs)) {
    throw new BadRequestException(
      'عنوان جهاز الحضور غير مسموح. استخدم IP صريحًا داخل ATTENDANCE_DEVICE_ALLOWED_CIDRS.',
    );
  }
  return address;
}
