import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { JwtUser } from '../../common/types/jwt-user';

/**
 * Finance creator scope — same idea as daily cashier report:
 * non-admins are locked to their own user id; system admins may view everyone
 * or optionally filter by `requestedUserId`.
 */
export async function resolveFinanceCreatorScope(
  permissions: PermissionEngineService,
  user: JwtUser | undefined,
  requestedUserId?: string | number | null,
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
  const parsed = Number(requestedUserId);
  const selectedUserId =
    isSystemAdmin && Number.isInteger(parsed) && parsed > 0
      ? parsed
      : isSystemAdmin
        ? null
        : user.sub;
  return {
    isSystemAdmin,
    lockedUser: !isSystemAdmin,
    selectedUserId,
  };
}

export function createdByFilter(
  selectedUserId: number | null,
): { created_by: number } | Record<string, never> {
  return selectedUserId != null ? { created_by: selectedUserId } : {};
}

