import {
  BarChart3,
  Banknote,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Dumbbell,
  FileText,
  Fingerprint,
  FolderOpen,
  HandCoins,
  type LucideIcon,
  Settings,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Users,
  UserX,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  buildAncestry,
  cellId,
  cycle,
  flattenForDisplay,
  resolveCell,
} from '@/lib/rbac-resolve';
import type { Effect, RbacCatalog, RbacNode, TriState } from '@/types/rbac';
import { TriStateCell } from './tri-state-cell';
import { useLocale } from '@/store/locale';

const MODULE_ICONS: Record<string, LucideIcon> = {
  Briefcase,
  Building2,
  Users,
  Fingerprint,
  Banknote,
  CalendarDays,
  HandCoins,
  FileText,
  UserX,
  BarChart3,
  Settings,
  Dumbbell,
  ShoppingCart,
  TrendingUp,
  Calculator,
  Smartphone,
};

const TYPE_ICON: Record<RbacNode['type'], LucideIcon> = {
  module: Building2,
  group: FolderOpen,
  page: FileText,
};

const DEPTH_BG = ['bg-primary/[0.06]', 'bg-muted/40', 'bg-background'];

/** Emoji glyphs for the matrix column headers (keyed by action key; 'all' = the bulk toggle). */
const ACTION_EMOJI: Record<string, string> = {
  all: '☑️',
  view: '👁️',
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  approve: '✅',
  reject: '❌',
  export: '📤',
  print: '🖨️',
  audit: '📜',
  configure: '⚙️',
  execute: '▶️',
  manage: '🛠️',
  use: '🧩',
};

export interface PermissionMatrixProps {
  catalog: RbacCatalog;
  mode: 'role' | 'exception';
  /** explicit cell states keyed by `${resourceKey}:${actionKey}` (allow/deny; absent = inherit). */
  draft: Map<string, TriState>;
  onChange: (next: Map<string, TriState>) => void;
  /** exception mode only: role-derived baseline effect per cell. */
  baseline?: Map<string, Effect>;
  editable: boolean;
}

export function PermissionMatrix({ catalog, mode, draft, onChange, baseline, editable }: PermissionMatrixProps) {
  const { ui } = useLocale();
  const modules = catalog.tree;
  const [activeKey, setActiveKey] = useState<string>(modules[0]?.key ?? '');
  useEffect(() => {
    if (!modules.some((m) => m.key === activeKey) && modules[0]) setActiveKey(modules[0].key);
  }, [modules, activeKey]);

  const ancestry = useMemo(() => buildAncestry(catalog.tree), [catalog.tree]);
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (nodes: RbacNode[]) => nodes.forEach((n) => { m.set(n.key, n.nameAr); if (n.children) walk(n.children); });
    walk(catalog.tree);
    return m;
  }, [catalog.tree]);

  // Sub-groups (e.g. HR sections) collapsed by default.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (nodes: RbacNode[]) =>
      nodes.forEach((n) => {
        if (n.type === 'group') s.add(n.key);
        if (n.children) walk(n.children);
      });
    walk(catalog.tree);
    return s;
  });

  const actionOrder = useMemo(() => new Map(catalog.actions.map((a, i) => [a.key, i])), [catalog.actions]);
  const actionByKey = useMemo(() => new Map(catalog.actions.map((a) => [a.key, a])), [catalog.actions]);

  const activeModule = modules.find((m) => m.key === activeKey) ?? modules[0];

  /** Effective resolution for a cell (mode-aware). */
  const effectiveOf = (resourceKey: string, actionKey: string): { explicit: Effect | null; effective: Effect; fromLabel: string | null } => {
    const explicit = (draft.get(cellId(resourceKey, actionKey)) ?? null) as Effect | null;
    if (mode === 'role') {
      const r = resolveCell(resourceKey, actionKey, draft, ancestry);
      const fromLabel = r && r.sourceKey !== resourceKey ? nameMap.get(r.sourceKey) ?? r.sourceKey : null;
      return { explicit, effective: r?.effect ?? 'deny', fromLabel };
    }
    // exception mode: flat; baseline = roles
    const base = baseline?.get(cellId(resourceKey, actionKey)) ?? 'deny';
    if (explicit) return { explicit, effective: explicit, fromLabel: null };
    return { explicit: null, effective: base, fromLabel: base === 'allow' ? ui('الأدوار') : null };
  };

  const moduleHasGrant = (mod: RbacNode): boolean => {
    const stack = [mod];
    while (stack.length) {
      const n = stack.pop()!;
      for (const a of n.actions) if (effectiveOf(n.key, a).effective === 'allow') return true;
      if (n.children?.length) stack.push(...n.children);
    }
    return false;
  };

  const rows = useMemo(
    () => (activeModule ? flattenForDisplay([activeModule], collapsed) : []),
    [activeModule, collapsed],
  );

  // Columns = union of applicable actions in the active module subtree, in catalog order.
  const columns = useMemo(() => {
    if (!activeModule) return [];
    const set = new Set<string>();
    const stack = [activeModule];
    while (stack.length) {
      const n = stack.pop()!;
      n.actions.forEach((a) => set.add(a));
      if (n.children?.length) stack.push(...n.children);
    }
    return [...set].sort((a, b) => (actionOrder.get(a) ?? 99) - (actionOrder.get(b) ?? 99));
  }, [activeModule, actionOrder]);

  const setCell = (resourceKey: string, actionKey: string, next: TriState) => {
    const map = new Map(draft);
    const k = cellId(resourceKey, actionKey);
    if (next === 'inherit') map.delete(k);
    else map.set(k, next);
    onChange(map);
  };

  const toggleCell = (resourceKey: string, actionKey: string) => {
    if (!editable) return;
    const current = (draft.get(cellId(resourceKey, actionKey)) ?? 'inherit') as TriState;
    const effective = effectiveOf(resourceKey, actionKey).effective;
    setCell(resourceKey, actionKey, cycle(current, effective));
  };

  /** This node + every descendant (self first), for the cascading "All" toggle. */
  const collectSubtree = (node: RbacNode): RbacNode[] => {
    const out: RbacNode[] = [];
    const stack = [node];
    while (stack.length) {
      const n = stack.pop()!;
      out.push(n);
      if (n.children?.length) stack.push(...n.children);
    }
    return out;
  };

  /**
   * Row "All": if every applicable cell is effectively allowed, explicitly deny it;
   * otherwise explicitly allow it. Clearing to inheritance can leave access enabled
   * through an ancestor, which is surprising when the operator is removing access.
   * Scope is mode-aware: role cells inherit down the tree, so setting the parent already cascades — keep it
   * to a single explicit cell and let inheritance (which respects a child's explicit deny) do the rest.
   * Exceptions are exact-cell with NO inheritance, so "select all" on a parent must set every descendant
   * page explicitly, otherwise the child pages stay denied and never appear for the user.
   */
  const toggleRowAll = (node: RbacNode) => {
    if (!editable) return;
    const map = new Map(draft);
    const targets = mode === 'exception' ? collectSubtree(node) : [node];
    const allAllowed = targets.every((n) =>
      n.actions.every((a) => effectiveOf(n.key, a).effective === 'allow'),
    );
    for (const n of targets) {
      for (const a of n.actions) {
        const k = cellId(n.key, a);
        map.set(k, allAllowed ? 'deny' : 'allow');
      }
    }
    onChange(map);
  };

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });

  if (!modules.length) {
    return <div className="p-10 text-center text-sm text-muted-foreground">{ui('لا توجد موارد.')}</div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-[70vh] flex-col gap-0 md:flex-row">
        {/* Module sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 border-e border-border bg-muted/20 p-2 md:block">
          <p className="px-2 py-2 text-xs text-muted-foreground">{ui('اختر وحدة لتعديل صلاحياتها.')}</p>
          <nav className="space-y-1">
            {modules.map((m) => {
              const Icon = MODULE_ICONS[m.icon ?? ''] ?? Building2;
              const active = m.key === activeKey;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setActiveKey(m.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    active ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate text-start">{m.nameAr}</span>
                  {moduleHasGrant(m) && (
                    <span className={cn('size-2 rounded-full', active ? 'bg-white' : 'bg-emerald-500')} />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Module switcher (mobile) */}
        <div className="border-b border-border p-2 md:hidden">
          <select
            value={activeKey}
            onChange={(e) => setActiveKey(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {modules.map((m) => (
              <option key={m.key} value={m.key}>
                {m.nameAr}
                {moduleHasGrant(m) ? ' •' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Matrix */}
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="border-b border-border">
                <th className="sticky start-0 z-20 bg-card px-3 py-2 text-start font-semibold">{ui('الشاشة / الوحدة')}</th>
                <th className="px-2 py-2 text-center font-medium text-muted-foreground">
                  <span className="block text-base leading-none">{ACTION_EMOJI.all}</span>
                  <span className="mt-0.5 block text-[11px]">{ui('الكل')}</span>
                </th>
                {columns.map((a) => {
                  const def = actionByKey.get(a);
                  return (
                    <th
                      key={a}
                      className={cn(
                        'px-2 py-2 text-center font-medium',
                        def?.sensitive ? 'bg-amber-50 text-amber-700' : 'text-muted-foreground',
                      )}
                    >
                      <span className="block text-base leading-none">{ACTION_EMOJI[a] ?? ''}</span>
                      <span className="mt-0.5 block text-[11px]">{def?.labelAr ?? a}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth, hasChildren }) => {
                const RowIcon = TYPE_ICON[node.type];
                const applicable = new Set(node.actions);
                const rowAllAllowed = node.actions.length > 0
                  && node.actions.every((a) => effectiveOf(node.key, a).effective === 'allow');
                return (
                  <tr key={node.key} className={cn('border-b border-border/60 hover:bg-accent/40', DEPTH_BG[Math.min(depth, 2)])}>
                    <td className="sticky start-0 z-[1] px-3 py-1.5" style={{ paddingInlineStart: 12 + depth * 18 }}>
                      <div className={cn('flex items-center gap-2', DEPTH_BG[Math.min(depth, 2)])}>
                        {hasChildren ? (
                          <button type="button" onClick={() => toggleCollapse(node.key)} className="text-muted-foreground hover:text-foreground">
                            {collapsed.has(node.key) ? <ChevronLeft className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        ) : (
                          <span className="inline-block w-4" />
                        )}
                        <RowIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className={cn('truncate', depth === 0 && 'font-semibold')}>{node.nameAr}</span>
                        {node.type === 'page' && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{ui('صفحة')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => toggleRowAll(node)}
                        className={cn(
                          'rounded border border-border px-2 py-0.5 text-[11px] transition-colors',
                          editable ? 'hover:bg-primary hover:text-primary-foreground' : 'opacity-50',
                        )}
                      >
                        {rowAllAllowed ? ui('إلغاء') : ui('تحديد')}
                      </button>
                    </td>
                    {columns.map((a) => {
                      const isApplicable = applicable.has(a);
                      const { explicit, effective, fromLabel } = isApplicable
                        ? effectiveOf(node.key, a)
                        : { explicit: null as Effect | null, effective: 'deny' as Effect, fromLabel: null };
                      return (
                        <td key={a} className="px-2 py-1.5 text-center">
                          <TriStateCell
                            applicable={isApplicable}
                            explicit={explicit}
                            effective={effective}
                            inheritedFromLabel={fromLabel}
                            sensitive={actionByKey.get(a)?.sensitive ?? false}
                            editable={editable}
                            onClick={() => toggleCell(node.key, a)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
