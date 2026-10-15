import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PERMISSION_KEY } from '../decorators/requires-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtUser } from '../types/jwt-user';
import { PermissionEngineService } from '../../modules/rbac/engine/permission-engine.service';
import { isPortableHrResourceKey } from '../../ports/rbac/hr-permission-catalog.adapter';
import { SCOPED_HR_DATA_KEY } from './scoped-hr-data.decorator';
import { HR_SCOPE_SAFE_LOOKUP_KEY } from './hr-scope-safe-lookup.decorator';

/**
 * Defense-in-depth for portable modules: a non-global RBAC scope may reach only
 * controllers that explicitly declare server-side data predicates. Unmarked
 * endpoints remain global-only, so a newly added list cannot silently leak data.
 */
@Injectable()
export class HrDataScopeEnforcementGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly permissions: PermissionEngineService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const keys = this.reflector.getAllAndOverride<string[]>(REQUIRES_PERMISSION_KEY, targets);
    if (!keys?.length) return true;
    const hrKeys = keys.filter((key) => {
      const separator = key.lastIndexOf(':');
      return separator > 0 && isPortableHrResourceKey(key.slice(0, separator));
    });
    // ONE80 also hosts club, cafe, inventory and accounting resources. Their
    // branch predicates are enforced by their domain services/BranchScopeGuard;
    // this defense-in-depth contract belongs only to portable HR resources.
    if (!hrKeys.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: JwtUser }>().user;
    if (!user) throw new ForbiddenException('ليس لديك صلاحية');
    if (await this.permissions.isSuperAdmin(user.sub)) return true;

    const safeLookup =
      this.reflector.get<boolean>(HR_SCOPE_SAFE_LOOKUP_KEY, context.getHandler()) === true;
    if (safeLookup) return true;

    // Only method-level metadata is accepted. A class marker would make every
    // future handler scoped by inheritance and can silently expose global
    // configuration or directories without a predicate.
    const scopedHandler =
      this.reflector.get<boolean>(SCOPED_HR_DATA_KEY, context.getHandler()) ===
      true;
    for (const key of hrKeys) {
      const separator = key.lastIndexOf(':');
      if (separator <= 0) continue;
      const resource = key.slice(0, separator);
      const action = key.slice(separator + 1);
      if (!(await this.permissions.can(user.sub, resource, action))) continue;
      const scope = await this.permissions.scopeFor(user.sub, resource);
      if (scope === 'global' || scopedHandler) return true;
    }
    throw new ForbiddenException('هذا المسار يتطلب نطاق بيانات عام أو predicate نطاق معلن');
  }
}
