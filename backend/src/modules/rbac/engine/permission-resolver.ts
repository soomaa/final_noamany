/**
 * PURE inheritance engine — no Nest/Prisma imports so it is trivially unit-testable.
 *
 * Model:
 *   - A stored cell is an explicit Allow/Deny on (resourceKey, actionKey) for ONE role.
 *   - Inherit = no stored cell. Effective value is computed by walking up the resource tree.
 *
 * Rules implemented (per the spec):
 *   1. Nearest-explicit-ancestor wins (self -> parent -> ... -> root; first explicit decides).
 *   2. No explicit ancestor  => denied by default.
 *   3. Multiple roles        => union; Allow wins across roles.
 *   4. User exceptions        => add Allows, then remove Denies (Deny wins), exact cell only.
 */

export type Effect = 'allow' | 'deny';

export interface StoredCell {
  resourceKey: string;
  actionKey: string;
  effect: Effect;
}

export interface ResolveInput {
  /** resourceKey -> applicable action keys (defines the cells that exist in the matrix). */
  resourceActions: Map<string, string[]>;
  /** resourceKey -> parentKey | null. */
  ancestry: Map<string, string | null>;
}

const cellId = (resourceKey: string, actionKey: string) => `${resourceKey}:${actionKey}`;

/** Index a role's stored cells by `${resourceKey}:${actionKey}` for O(1) lookup. */
export function indexCells(cells: StoredCell[]): Map<string, Effect> {
  const map = new Map<string, Effect>();
  for (const c of cells) map.set(cellId(c.resourceKey, c.actionKey), c.effect);
  return map;
}

/**
 * Resolve ONE (resource, action) for ONE role: walk self -> ancestors, first explicit wins.
 * Returns the deciding effect, or `undefined` when nothing is explicit (=> default deny).
 */
export function resolveCell(
  resourceKey: string,
  actionKey: string,
  indexed: Map<string, Effect>,
  ancestry: Map<string, string | null>,
): { effect: Effect; sourceKey: string } | undefined {
  let cursor: string | null | undefined = resourceKey;
  const seen = new Set<string>(); // cycle guard
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const hit = indexed.get(cellId(cursor, actionKey));
    if (hit) return { effect: hit, sourceKey: cursor };
    cursor = ancestry.get(cursor) ?? null;
  }
  return undefined;
}

/** The full effective Allow-set of permission keys (`resource:action`) for ONE role. */
export function effectiveForRole(cells: StoredCell[], input: ResolveInput): Set<string> {
  const indexed = indexCells(cells);
  const allowed = new Set<string>();
  for (const [resourceKey, actions] of input.resourceActions) {
    for (const actionKey of actions) {
      const r = resolveCell(resourceKey, actionKey, indexed, input.ancestry);
      if (r?.effect === 'allow') allowed.add(cellId(resourceKey, actionKey));
    }
  }
  return allowed;
}

/** Allow-wins union across roles. */
export function unionRoles(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const k of s) out.add(k);
  return out;
}

/** Apply per-user exceptions on top of the role union: add Allows, then remove Denies. */
export function applyExceptions(base: Set<string>, exceptions: StoredCell[]): Set<string> {
  const out = new Set(base);
  for (const e of exceptions) if (e.effect === 'allow') out.add(cellId(e.resourceKey, e.actionKey));
  for (const e of exceptions) if (e.effect === 'deny') out.delete(cellId(e.resourceKey, e.actionKey));
  return out;
}

/**
 * Full pipeline for a non-super-admin user.
 * @param roleCellSets  one StoredCell[] per active role
 * @param exceptions    the user's exception cells
 */
export function effectiveForUser(
  roleCellSets: StoredCell[][],
  exceptions: StoredCell[],
  input: ResolveInput,
): Set<string> {
  const perRole = roleCellSets.map((cells) => effectiveForRole(cells, input));
  return applyExceptions(unionRoles(perRole), exceptions);
}

/**
 * Detailed per-cell resolution for the MATRIX UI of a single role/exception editor.
 * Returns, for every applicable cell, the explicit effect (if any) and the inherited
 * effective state with the ancestor it came from — so the UI can draw ghost/dashed cells.
 */
export interface CellState {
  resourceKey: string;
  actionKey: string;
  explicit: Effect | null; // stored value on THIS resource (null = inherit)
  effective: Effect; // resolved value (default deny)
  inheritedFrom: string | null; // ancestor key that decided it (null if self or default)
}

export function resolveMatrix(cells: StoredCell[], input: ResolveInput): CellState[] {
  const indexed = indexCells(cells);
  const states: CellState[] = [];
  for (const [resourceKey, actions] of input.resourceActions) {
    for (const actionKey of actions) {
      const explicit = indexed.get(cellId(resourceKey, actionKey)) ?? null;
      const r = resolveCell(resourceKey, actionKey, indexed, input.ancestry);
      states.push({
        resourceKey,
        actionKey,
        explicit,
        effective: r?.effect ?? 'deny',
        inheritedFrom: r && r.sourceKey !== resourceKey ? r.sourceKey : null,
      });
    }
  }
  return states;
}
