import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { JwtUser } from '../../common/types/jwt-user';

/**
 * Respect the configured finance data scope. Branch isolation is applied by each caller.
 * Missing scope and explicit own scope stay restricted to the current creator.
 */
export async function resolveFinanceCreatorScope(
  permissions: PermissionEngineService,
  user: JwtUser | undefined,
  requestedUserId?: string | number | null,
  resource = 'financial-reports',
): Promise<{
  isSystemAdmin: boolean;
  lockedUser: boolean;
  selectedUserId: number | null;
}> {
  // No JWT user → lock to an impossible id (never unscoped "see all").
  if (!user) {
    return { isSystemAdmin: false, lockedUser: true, selectedUserId: -1 };
  }
  const isSystemAdmin = await permissions.isSuperAdmin(user.sub);
  const dataScope = isSystemAdmin ? 'global' : await permissions.scopeFor(user.sub, resource);
  const canViewBranch = isSystemAdmin || dataScope === 'global' || dataScope === 'branch';
  const parsed = Number(requestedUserId);
  const selectedUserId =
    canViewBranch && Number.isInteger(parsed) && parsed > 0
      ? parsed
      : canViewBranch
        ? null
        : user.sub;
  return {
    isSystemAdmin,
    lockedUser: !canViewBranch,
    selectedUserId,
  };
}

export function createdByFilter(
  selectedUserId: number | null,
): { created_by: number } | Record<string, never> {
  return selectedUserId != null ? { created_by: selectedUserId } : {};
}
