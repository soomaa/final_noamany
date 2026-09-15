import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtUser } from "../types/jwt-user";

/**
 * Resolves the set of branches a user is allowed to read/write.
 *
 * Strict isolation rules:
 *  - level === 1 (super-admin) → ALL branches (no restriction).
 *  - a non-admin with no branch assigned (branch 0/null) → NO branches (fail closed).
 *  - every other non-admin → exactly the branch stored in their JWT.
 *
 * `null` from allowedBranchIds() means "ALL / unrestricted".
 */
@Injectable()
export class BranchScopeService {
  /**
   * Normalized employee scope: 0 = men, 1 = women. This is an
   * authorization constraint, not a UI default. System administrators keep
   * their existing unrestricted audience.
   */
  memberGenderFilter(user: JwtUser | undefined | null): 'male' | 'female' | null {
    if (!user || user.level === 1) return null;
    if (user.man_women_type === 0) return 'male';
    if (user.man_women_type === 1) return 'female';
    throw new ForbiddenException('نطاق القسم غير مضبوط لهذا المستخدم');
  }

  isMemberGenderAllowed(user: JwtUser | undefined | null, gender: string | null | undefined): boolean {
    const required = this.memberGenderFilter(user);
    return required === null || gender === required;
  }

  /** `null` ⇒ unrestricted super-admin. `[]` ⇒ fail-closed/no branch access. */
  allowedBranchIds(user: JwtUser | undefined | null): number[] | null {
    if (!user) return [];
    if (user.level === 1) return null; // super-admin sees everything
    const base = Number(user.branch ?? 0);
    if (!Number.isInteger(base) || base <= 0) return [];

    return [base];
  }

  /** True if the user may access data for `branchId`. Unrestricted users may access any. */
  isBranchAllowed(user: JwtUser | undefined | null, branchId: number): boolean {
    const allowed = this.allowedBranchIds(user);
    if (allowed === null) return true;
    return allowed.includes(Number(branchId));
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
