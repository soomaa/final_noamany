import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user';

/** Legacy users.level === 1 — full system administrator. */
export function assertSystemAdmin(user: JwtUser): void {
  if (user.level !== 1) {
    throw new ForbiddenException('هذا الإجراء متاح لمدير النظام فقط');
  }
}
