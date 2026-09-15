import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PAGE_KEY } from '../decorators/requires-page.decorator';
import { REQUIRES_PERMISSION_KEY } from '../decorators/requires-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../types/jwt-user';
import { PermissionEngineService } from '../../modules/rbac/engine/permission-engine.service';

/**
 * Two enforcement modes, both opt-in per route (un-decorated routes stay open to any
 * authenticated user — faithful to the legacy default):
 *
 *  1. @RequiresPermission('resource:action', …)  — ENTERPRISE RBAC. OR logic across keys;
 *     resolved through the inheritance engine; super-admins bypass. Takes precedence.
 *  2. @RequiresPage('Some/Link')                 — LEGACY page-grant check (old tables).
 *
 * Method-level metadata overrides class-level (getAllAndOverride).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const permKeys = this.reflector.getAllAndOverride<string[]>(REQUIRES_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (permKeys?.length) {
      const req = context.switchToHttp().getRequest();
      const user = req.user as JwtUser;
      if (!user) throw new ForbiddenException('ليس لديك صلاحية');
      const ok = await this.engine.canAny(user.sub, permKeys);
      if (!ok) throw new ForbiddenException('ليس لديك صلاحية للوصول');
      return true;
    }

    return this.legacyPageCheck(context);
  }

  /** Legacy @RequiresPage enforcement against the old permissions/pages tables. */
  private async legacyPageCheck(context: ExecutionContext): Promise<boolean> {
    const pageLink = this.reflector.getAllAndOverride<string>(REQUIRES_PAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!pageLink) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtUser;
    if (!user) throw new ForbiddenException('ليس لديك صلاحية');

    const page = await this.prisma.pages.findFirst({
      where: { page_link: pageLink },
      select: { page_id: true },
    });
    if (!page) throw new ForbiddenException('ليس لديك صلاحية');

    const grant = await this.prisma.permissions.findUnique({
      where: { user_id_page_id_fk: { user_id: user.sub, page_id_fk: page.page_id } },
      select: { user_id: true },
    });
    if (!grant) throw new ForbiddenException('ليس لديك صلاحية');
    return true;
  }
}
