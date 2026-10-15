/**
 * Client-side mirror of the backend inheritance engine (pure functions).
 * Lets the matrix show live ghost/inherited states as the admin toggles cells,
 * without round-tripping to the server. Must stay in sync with
 * backend/src/modules/rbac/engine/permission-resolver.ts.
 */
import type { Effect, RbacNode, TriState } from '@/types/rbac';

export const cellId = (resourceKey: string, actionKey: string) => `${resourceKey}:${actionKey}`;

/** childKey -> parentKey | null */
export function buildAncestry(tree: RbacNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const walk = (nodes: RbacNode[], parent: string | null) => {
    for (const n of nodes) {
      map.set(n.key, parent);
      if (n.children?.length) walk(n.children, n.key);
    }
  };
  walk(tree, null);
  return map;
}

/** resourceKey -> applicable action keys */
export function buildResourceActions(tree: RbacNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const walk = (nodes: RbacNode[]) => {
    for (const n of nodes) {
      map.set(n.key, n.actions);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return map;
}

/** Flatten a subtree into display rows with depth, honoring a collapse set. */
export interface MatrixRow {
  node: RbacNode;
  depth: number;
  hasChildren: boolean;
}
export function flattenForDisplay(roots: RbacNode[], collapsed: Set<string>): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const walk = (nodes: RbacNode[], depth: number) => {
    for (const n of nodes) {
      const hasChildren = (n.children?.length ?? 0) > 0;
      rows.push({ node: n, depth, hasChildren });
      if (hasChildren && !collapsed.has(n.key)) walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

/**
 * Resolve ONE (resource, action) against an explicit draft, walking ancestors.
 * `draft` maps cellId -> TriState; 'inherit'/absent means no explicit value here.
 * Returns the deciding effect + source ancestor key, or undefined (=> default deny).
 */
export function resolveCell(
  resourceKey: string,
  actionKey: string,
  draft: Map<string, TriState>,
  ancestry: Map<string, string | null>,
): { effect: Effect; sourceKey: string } | undefined {
  let cursor: string | null | undefined = resourceKey;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const v = draft.get(cellId(cursor, actionKey));
    if (v === 'allow' || v === 'deny') return { effect: v, sourceKey: cursor };
    cursor = ancestry.get(cursor) ?? null;
  }
  return undefined;
}

/** Does the module subtree have any effective allow (for the sidebar green dot)? */
export function moduleHasGrant(
  module: RbacNode,
  draft: Map<string, TriState>,
  ancestry: Map<string, string | null>,
): boolean {
  const stack: RbacNode[] = [module];
  while (stack.length) {
    const n = stack.pop()!;
    for (const a of n.actions) {
      if (resolveCell(n.key, a, draft, ancestry)?.effect === 'allow') return true;
    }
    if (n.children?.length) stack.push(...n.children);
  }
  return false;
}

/**
 * Next state for a matrix click.
 *
 * An inherited Allow must become an explicit Deny on the first click; turning it
 * into an explicit Allow leaves access enabled and makes “remove permission” look
 * broken. Explicit Deny still cycles back to inheritance so all three states stay
 * reachable.
 */
export function cycle(state: TriState, effective: Effect): TriState {
  if (state === 'allow') return 'deny';
  if (state === 'deny') return 'inherit';
  return effective === 'allow' ? 'deny' : 'allow';
}

/** Split a `${resourceKey}:${actionKey}` id (resourceKey may contain dots, action never has a colon). */
export function splitCell(id: string): { resourceKey: string; actionKey: string } {
  const i = id.lastIndexOf(':');
  return { resourceKey: id.slice(0, i), actionKey: id.slice(i + 1) };
}

/** Build an explicit-only draft (cellId -> allow/deny) from server cell states. */
export function draftFromCells(cells: { resourceKey: string; actionKey: string; explicit: 'allow' | 'deny' | null }[]): Map<string, TriState> {
  const m = new Map<string, TriState>();
  for (const c of cells) if (c.explicit) m.set(cellId(c.resourceKey, c.actionKey), c.explicit);
  return m;
}

/** Changed cells only: compares the server explicit map against the working draft. */
export function diffDraft(serverExplicit: Map<string, TriState>, draft: Map<string, TriState>) {
  const changes: { resourceKey: string; actionKey: string; state: TriState }[] = [];
  const allKeys = new Set([...serverExplicit.keys(), ...draft.keys()]);
  for (const k of allKeys) {
    const before = serverExplicit.get(k) ?? 'inherit';
    const after = draft.get(k) ?? 'inherit';
    if (before !== after) changes.push({ ...splitCell(k), state: after });
  }
  return changes;
}
