import type { AccountLevel, AccountNode, AccountRow, AccountType } from '@/types/accounting';

/**
 * Pure model behind the chart-of-accounts screen.
 *
 * The screen loads the chart one page at a time (so a 900-account chart doesn't block
 * the first paint) and rebuilds the hierarchy on the client from whatever has arrived
 * so far. Every function here is therefore written to cope with a *partial* set: an
 * account whose parent has not loaded yet still has to appear, or rows would silently
 * vanish between pages.
 */

/** Order the five roots the way an income statement reads, not alphabetically. */
export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
];

export const ACCOUNT_LEVEL_ORDER: AccountLevel[] = ['main', 'sub-main', 'sub'];

/**
 * Compare two account codes segment by segment ("1.2" before "1.10"), so a chart
 * numbered 1 / 1.01 / 1.01.002 sorts the way an accountant reads it rather than
 * the way a string comparison would.
 */
export function compareAccountCodes(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn) && ln !== rn) return ln - rn;
    if (!Number.isFinite(ln) || !Number.isFinite(rn)) {
      const cmp = l.localeCompare(r);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Rebuild the hierarchy from a flat, possibly partial list.
 *
 * A row whose parent is missing from `rows` is surfaced as a root instead of being
 * dropped — mid-load that is the difference between "still loading" and "gone".
 */
export function buildAccountTree(rows: AccountRow[]): AccountNode[] {
  const byId = new Map<number, AccountNode>();
  for (const row of rows) {
    // Later pages win, so a refetch that corrects a balance is not ignored.
    byId.set(row.id, { ...row, children: [] });
  }
  const roots: AccountNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId != null ? byId.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: AccountNode[]) => {
    list.sort((a, b) => compareAccountCodes(a.code, b.code));
    for (const node of list) sortRec(node.children);
  };
  sortRec(roots);
  return roots;
}

export function flattenAccounts(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** A child sits one rung below its parent; `sub` is the floor, not an error. */
export function childLevelOf(parentLevel: AccountLevel | undefined): AccountLevel {
  if (parentLevel === 'main') return 'sub-main';
  return 'sub';
}

/** Depth-derived level, used when the server did not supply one (e.g. an optimistic row). */
export function levelForDepth(depth: number): AccountLevel {
  if (depth <= 0) return 'main';
  if (depth === 1) return 'sub-main';
  return 'sub';
}
