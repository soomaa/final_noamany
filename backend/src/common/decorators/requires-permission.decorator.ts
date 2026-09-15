import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'requiresPermission';

/**
 * Enterprise RBAC guard hint. Each argument is a full permission key
 * `${resourceKey}:${actionKey}` (e.g. 'employees.list:view'). Multiple keys use
 * OR logic — the user passes if they hold ANY one of them. Super-admins always pass.
 *
 * Method-level metadata OVERRIDES class-level (NestJS getAllAndOverride), so a class
 * can declare a baseline `:view` and a mutation method can require `:create`/`:delete`.
 */
export const RequiresPermission = (...keys: string[]) => SetMetadata(REQUIRES_PERMISSION_KEY, keys);
