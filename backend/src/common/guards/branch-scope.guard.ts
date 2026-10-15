import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { BranchScopeService } from '../branch-scope/branch-scope.service';
import { JwtUser } from '../types/jwt-user';

/**
 * Global guard: a branch-scoped user (e.g. a branch manager) may not read or write
 * another branch's data by passing a foreign branch id. Any request that explicitly
 * targets a branch outside the user's allowed set is rejected with 403.
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
    'branchId',
    'branch_id',
    'branch_id_fk',
    'mainBranchId',
    'main_branch_id',
    'subBranchId',
    'sub_branch_id',
    'branch',
  ];

  /** Branch arrays used by package/settings forms. */
  private static readonly BRANCH_ARRAY_KEYS = ['branchIds', 'branch_ids'];

  /**
   * Request bodies can carry branch selectors below the first level (for example
   * trainerSchedules[].slots[].branchId or branchPrices[].branchId). Walk the plain JSON
   * body so nested cross-branch writes are rejected by the same global guard.
   */
  private branchTargets(value: unknown, seen = new Set<object>()): number[] {
    if (value == null || typeof value !== 'object') return [];
    if (seen.has(value as object)) return [];
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.branchTargets(item, seen));
    }

    const bag = value as Record<string, unknown>;
    const targets: number[] = [];
    for (const key of BranchScopeGuard.BRANCH_KEYS) {
      const raw = bag[key];
      if (raw == null || raw === '' || raw === 'all') continue;
      const branchId = Number(raw);
      // Non-numeric (e.g. a name) or 0/"unassigned" → not a concrete foreign branch.
      if (Number.isFinite(branchId) && branchId > 0) targets.push(branchId);
    }
    for (const key of BranchScopeGuard.BRANCH_ARRAY_KEYS) {
      const raw = bag[key];
      if (!Array.isArray(raw)) continue;
      for (const item of raw) {
        const branchId = Number(item);
        if (Number.isFinite(branchId) && branchId > 0) targets.push(branchId);
      }
    }

    for (const nested of Object.values(bag)) {
      if (nested != null && typeof nested === 'object') {
        targets.push(...this.branchTargets(nested, seen));
      }
    }
    return targets;
  }

  constructor(private readonly scope: BranchScopeService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req?.user as JwtUser | undefined;
    const allowed = this.scope.allowedBranchIds(user);

    // Expose the resolved scope for services that opt into default scoping.
    req.branchScope = allowed;

    if (allowed === null) return true; // unrestricted (super-admin / unassigned)

    for (const target of this.branchTargets([req.query, req.body])) {
      if (!allowed.includes(target)) {
        throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
      }
    }
    return true;
  }
}
