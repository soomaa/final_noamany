import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user';

/** A legacy level-1 account or an active RBAC Super Admin role has system-wide authority. */
export function isSystemAdmin(user: JwtUser | undefined | null): boolean {
  return user?.level === 1 || user?.is_super_admin === true;
}

export function assertSystemAdmin(user: JwtUser): void {
  if (!isSystemAdmin(user)) {
    throw new ForbiddenException('هذا الإجراء متاح لمدير النظام فقط');
  }
}
