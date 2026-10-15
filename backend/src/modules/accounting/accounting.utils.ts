import { AccountType, JournalEntryStatus, NormalBalance, Prisma } from '@prisma/client';

/**
 * Both rows are part of the audit trail: a reversed original plus its posted
 * reversing entry must net to zero in every financial statement.
 */
export const LEDGER_REPORT_STATUSES: JournalEntryStatus[] = ['posted', 'reversed'];

export function roundMoney(n: number | Prisma.Decimal): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Math.round(v * 100) / 100;
}

export function isBalanced(totalDebit: number, totalCredit: number): boolean {
  return Math.abs(totalDebit - totalCredit) <= 0.01;
}

export function normalBalanceForType(type: AccountType): NormalBalance {
  if (type === 'asset' || type === 'expense') return 'debit';
  return 'credit';
}

export function netBalance(
  debit: number,
  credit: number,
  normalBalance: NormalBalance,
): number {
  if (normalBalance === 'debit') return roundMoney(debit - credit);
  return roundMoney(credit - debit);
}

export function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/**
 * Depth-derived label the chart-of-accounts screen shows next to each row:
 * a root is `main`, its direct children are `sub-main`, everything deeper is `sub`.
 */
export type AccountLevel = 'main' | 'sub-main' | 'sub';

export function accountLevelForDepth(depth: number): AccountLevel {
  if (depth <= 0) return 'main';
  if (depth === 1) return 'sub-main';
  return 'sub';
}

export interface AccountNode {
  id: number;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId: number | null;
  isPostable: boolean;
  category: string | null;
  description: string | null;
  branchId: number | null;
  isActive: boolean;
  /** Depth-derived level, filled in by the service before the tree leaves the API. */
  accountLevel?: AccountLevel;
  /** Net balance including every descendant, in this account's own normal-balance sign. */
  balance?: number;
  children: AccountNode[];
}

export function buildAccountTree<T extends { id: number; parent_id: number | null }>(
  rows: T[],
  mapper: (row: T) => Omit<AccountNode, 'children'>,
): AccountNode[] {
  const nodes = new Map<number, AccountNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...mapper(row), children: [] });
  }
  const roots: AccountNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId != null && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: AccountNode[]) => {
    list.sort((a, b) => a.code.localeCompare(b.code));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function collectDescendantIds(
  accounts: { id: number; parent_id: number | null }[],
  rootId: number,
): number[] {
  const byParent = new Map<number | null, number[]>();
  for (const a of accounts) {
    const p = a.parent_id;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(a.id);
  }
  const ids: number[] = [];
  const walk = (id: number) => {
    ids.push(id);
    for (const child of byParent.get(id) ?? []) walk(child);
  };
  walk(rootId);
  return ids;
}
