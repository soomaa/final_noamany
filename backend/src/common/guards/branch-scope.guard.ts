import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from '@nestjs/core';
import { ClubBranchGroupService, ClubBranchGroupReader } from '../branch-groups/club-branch-group.service';
import { CLUB_GROUP_OPERATION, clubOperationBranchIds } from '../branch-groups/club-operation-scope';
import { BranchScopeService } from "../branch-scope/branch-scope.service";
import { JwtUser } from "../types/jwt-user";

/**
 * Global guard: non-admins are restricted to their branch. Explicitly marked club
 * refund/transfer routes may target branches in the same active persisted group.
 * Requests outside the applicable allowed set are rejected with 403.
 *
 * This closes the active cross-branch access vector on every endpoint at once. It only
 * REJECTS clearly-unauthorized requests — it never changes a service's own logic, so it
 * cannot over-block a legitimate in-scope request. (Passive over-exposure for a scoped
 * user who omits the branch param is handled by per-module default scoping via
 * BranchScopeService.resolveListFilter.)
 *
 * Runs after JwtAuthGuard (which sets request.user) and PermissionsGuard.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  /** Query/body keys across the app that denote a target branch. */
  private static readonly BRANCH_KEYS = [
    "branchId",
    "branch_id",
    "mainBranchId",
    "main_branch_id",
    "subBranchId",
    "sub_branch_id",
    "branch",
  ];

  constructor(
    private readonly scope: BranchScopeService,
    private readonly reflector: Reflector = new Reflector(),
    @Inject(ClubBranchGroupService) private readonly branchGroups: Pick<ClubBranchGroupReader, 'siblingBranchIds'> = { siblingBranchIds: async (id) => [id] },
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user as JwtUser | undefined;
    // Public routes run through the global guard chain without an authenticated user.
    // Authentication is handled by JwtAuthGuard; branch scoping has nothing to do here.
    if (!user) return true;

    const groupOperation = context.getHandler && this.reflector.getAllAndOverride<boolean>(CLUB_GROUP_OPERATION, [context.getHandler(), context.getClass()]);
    const allowed = groupOperation
      ? await clubOperationBranchIds(this.scope, this.branchGroups, user)
      : this.scope.allowedBranchIds(user);

    // Expose the resolved scope for services that opt into default scoping.
    req.branchScope = allowed;

    if (allowed === null) return true; // unrestricted super-admin
    if (allowed.length === 0) {
      throw new ForbiddenException(
        "يجب ربط حساب المستخدم بفرع قبل استخدام النظام",
      );
    }

    for (const key of BranchScopeGuard.BRANCH_KEYS) {
      for (const bag of [req.query, req.body]) {
        if (!bag || typeof bag !== "object") continue;
        const raw = bag[key];
        if (raw == null || raw === "" || raw === "all") continue;
        const value = Number(raw);
        // Non-numeric (e.g. a name) or 0/"unassigned" → not a concrete foreign branch.
        if (!Number.isFinite(value) || value === 0) continue;
        if (!allowed.includes(value)) {
          throw new ForbiddenException(
            "لا تملك صلاحية الوصول لبيانات هذا الفرع",
          );
        }
      }
    }
    return true;
  }
}
