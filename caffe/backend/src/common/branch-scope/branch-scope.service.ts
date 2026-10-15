import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtUser } from '../types/jwt-user';

/**
 * Resolves the set of branches a user is allowed to read/write.
 *
 * Rules (faithful to the legacy level model):
 *  - level === 1 (super-admin) → ALL branches (no restriction).
 *  - a user with no branch assigned (branch 0/null) → ALL (unassigned = unrestricted,
 *    matches pre-isolation behaviour so we never lock out an admin-ish account).
 *  - otherwise → the user's own branch, expanded through the virtual-parent fanout
 *    config (e.g. branch 3 → {3,6,7}). This is what scopes a branch manager.
 *
 * `null` from allowedBranchIds() means "ALL / unrestricted".
 */
@Injectable()
export class BranchScopeService {
  constructor(private readonly config: ConfigService) {}

  /** `null` ⇒ unrestricted (super-admin / unassigned). Otherwise the concrete allowed ids. */
  allowedBranchIds(user: JwtUser | undefined | null): number[] | null {
    if (!user) return null;
    if (user.level === 1) return null; // super-admin sees everything
    const base = Number(user.branch ?? 0);
    if (!base) return null; // unassigned branch ⇒ unrestricted (avoid locking out admins)

    const fanout = this.config.get<Record<number, number[]>>('dashboard.branchFanout') ?? {};
    const expanded = fanout[base];
    const ids = new Set<number>([base]);
    if (Array.isArray(expanded)) expanded.forEach((b) => ids.add(Number(b)));
    return [...ids];
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
   *  - unrestricted user + specific request → that request (honoured as-is)
   *  - unrestricted user + no/all request   → null (all branches)
   *  - scoped user + no/all request          → the user's allowed set (default scope)
   *  - scoped user + specific in-scope request → that single branch
   *  - scoped user + specific out-of-scope    → throws is handled by the guard; here we
   *    fall back to the allowed set defensively.
   */
  resolveListFilter(
    user: JwtUser | undefined | null,
    requested?: number | string | 'all' | null,
  ): number[] | null {
    const allowed = this.allowedBranchIds(user);
    // Query params arrive as strings; normalize '', 'all', null and non-numeric to "no request".
    const n = requested == null || requested === 'all' || requested === '' ? NaN : Number(requested);
    const req = Number.isFinite(n) ? n : null;
    if (allowed === null) return req == null ? null : [req];
    if (req == null) return allowed; // default a scoped user to their branches
    return allowed.includes(req) ? [req] : allowed;
  }
}
