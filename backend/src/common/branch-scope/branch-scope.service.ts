import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtUser } from "../types/jwt-user";
import { isSystemAdmin } from '../utils/system-admin.util';

/**
 * Resolves the set of branches a user is allowed to read/write.
 *
 * Strict isolation rules:
 *  - level === 1 or an active RBAC super-admin role → ALL branches (no restriction).
 *  - a non-admin with no branch assigned (branch 0/null) → NO branches (fail closed).
 *  - every other non-admin → exactly the branch stored in their JWT, plus that branch's
 *    built-in sub-branches (Tanta main → Tanta Up / Tanta Down). A sub-branch user stays
 *    limited to the sub-branch.
 *
 * `null` from allowedBranchIds() means "ALL / unrestricted".
 */
/** Parent branch → its sub-branches. Tanta Up (5) and Tanta Down (6) belong to Tanta main (2). */
export const SUB_BRANCH_IDS: Readonly<Record<number, readonly number[]>> = { 2: [5, 6] };

@Injectable()
export class BranchScopeService {
  /**
   * Employee scope: 1 = men, 2 = women, 3 = both. This is an authorization
   * constraint, not a UI default. System administrators keep their existing
   * unrestricted audience.
   */
  memberGenderFilter(user: JwtUser | undefined | null): 'male' | 'female' | null {
    if (!user || isSystemAdmin(user)) return null;
    if (user.member_sections?.length) {
      if (user.member_sections.includes('male') && user.member_sections.includes('female')) return null;
      return user.member_sections[0];
    }
    // 0 is retained as men only for legacy claims. A value of 3 deliberately
    // has no gender filter, while branch scoping still applies.
    if (user.man_women_type === 0 || user.man_women_type === 1) return 'male';
    if (user.man_women_type === 2) return 'female';
    if (user.man_women_type === 3) return null;
    throw new ForbiddenException('نطاق القسم غير مضبوط لهذا المستخدم');
  }

  isMemberGenderAllowed(user: JwtUser | undefined | null, gender: string | null | undefined): boolean {
    const required = this.memberGenderFilter(user);
    return required === null || gender === required;
  }

  /** `null` ⇒ unrestricted super-admin. `[]` ⇒ fail-closed/no branch access. */
  allowedBranchIds(user: JwtUser | undefined | null): number[] | null {
    if (!user) return [];
    if (isSystemAdmin(user)) return null; // super-admin sees everything
    const base = Number(user.branch ?? 0);
    if (!Number.isInteger(base) || base <= 0) return [];

    return [base, ...(SUB_BRANCH_IDS[base] ?? [])];
  }

  /** True if the user may access data for `branchId`. Unrestricted users may access any. */
  isBranchAllowed(user: JwtUser | undefined | null, branchId: number): boolean {
    const allowed = this.allowedBranchIds(user);
    if (allowed === null) return true;
    return allowed.includes(Number(branchId));
  }

  /** Throw 403 unless the user may access `branchId`. A null/0 branch is treated as foreign for non-admins. */
  assertBranchAllowed(
    user: JwtUser | undefined | null,
    branchId: number | null | undefined,
    message = 'لا تملك صلاحية الوصول لبيانات هذا الفرع',
  ): void {
    const allowed = this.allowedBranchIds(user);
    if (allowed === null) return;
    if (branchId == null || !allowed.includes(Number(branchId))) throw new ForbiddenException(message);
  }

  /**
   * Intersect a client-requested branch with the user's scope for LIST filtering.
   * Returns the branch id(s) to filter by, or null for "no branch restriction".
   *  - super-admin + specific request → that exact branch
   *  - super-admin + no/all request   → null (all branches)
   *  - scoped user + no/all request   → their exact branch
   *  - scoped user + in-scope request → their exact branch
   *  - scoped user + foreign request  → their exact branch defensively; the global
   *    guard rejects the explicit foreign request with 403 before the service runs.
   */
  resolveListFilter(
    user: JwtUser | undefined | null,
    requested?: number | string | "all" | null,
  ): number[] | null {
    const allowed = this.allowedBranchIds(user);
    // Query params arrive as strings; normalize '', 'all', null and non-numeric to "no request".
    const n =
      requested == null || requested === "all" || requested === ""
        ? NaN
        : Number(requested);
    const req = Number.isFinite(n) ? n : null;
    if (allowed === null) return req == null ? null : [req];
    if (req == null) return allowed; // default a scoped user to their branches
    if (!allowed.includes(req)) return allowed;
    return [req];
  }
}
