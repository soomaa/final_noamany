import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UseGuards } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user';

/** Settings shared by every branch: only the system admin (level 1) may change them. */
@Injectable()
export class SystemOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as JwtUser | undefined;
    if (!user || user.level !== 1) {
      throw new ForbiddenException('الإعداد ده مشترك بين الفروع، وتعديله متاح لمدير النظام فقط');
    }
    return true;
  }
}

export const SystemOwnerOnly = () => UseGuards(SystemOwnerGuard);
