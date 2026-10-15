import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtUser } from '../types/jwt-user';

/**
 * Resolves the set of branches a user is allowed to read/write.
 *
 * Rules (faithful to the legacy level model):
 *  - level === 1 (super-admin) → ALL branches (no restriction).
 *  - a non-admin user with no branch assigned (branch 0/null) → NO branches. Isolation
 *    fails closed; only an explicit level-1 account is company-wide.
 *  - otherwise → the user's own branch, expanded through the virtual-parent fanout
 *    explicit host configuration. The portable default has no fan-out.
 *
 * `null` from allowedBranchIds() means "ALL / unrestricted".
 */
@Injectable()
export class BranchScopeService {
  constructor(private readonly config: ConfigService) {}

  /** `null` ⇒ unrestricted (super-admin or trusted internal call). Otherwise concrete allowed ids. */
  allowedBranchIds(user: JwtUser | undefined | null): number[] | null {
    if (!user) return null;
    if (user.level === 1) return null; // super-admin sees everything
    if (user.branchIds) {
      return [...new Set(user.branchIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    }
    const base = Number(user.branch ?? 0);
    if (!base) return []; // unassigned non-admin ⇒ no branch data (fail closed)

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
