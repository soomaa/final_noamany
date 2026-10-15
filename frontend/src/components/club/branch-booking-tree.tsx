import { Building2, ChevronDown, ChevronLeft, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { uiStatic } from '@/lib/ui-static';
import { cn, toArabicDigits } from '@/lib/utils';
import type { Branch } from '@/types/org';
import type { BookingBoardBranch } from '@/types/fitness';

interface TreeNode {
  id: number;
  name: string;
  children: TreeNode[];
}

/** Build the branch hierarchy from `parentId`, treating any orphan as a root. */
function buildTree(branches: Branch[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>(
    branches.map((branch) => [branch.id, { id: branch.id, name: branch.name ?? `#${branch.id}`, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const branch of branches) {
    const node = nodes.get(branch.id)!;
    const parent = branch.parentId ? nodes.get(branch.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function Counts({ stats }: { stats: BookingBoardBranch | undefined }) {
  if (!stats) return null;
  return (
    <span className="nums flex shrink-0 items-center gap-1 text-[10px]">
      <span
        className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary"
        title={uiStatic('مواعيد محجوزة')}
      >
        {toArabicDigits(stats.bookedSessions)}
      </span>
      <span
        className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400"
        title={uiStatic('مواعيد متاحة')}
      >
        {toArabicDigits(stats.freeSlots)}
      </span>
    </span>
  );
}

function TreeRow({
  node,
  depth,
  selected,
  statsById,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string;
  statsById: Map<number, BookingBoardBranch>;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isSelected = selected === String(node.id);
  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg pe-2 transition-colors',
          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
        )}
        style={{ paddingInlineStart: depth * 12 }}
      >
        {node.children.length ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={open ? uiStatic('طي') : uiStatic('توسيع')}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <button
          type="button"
          onClick={() => onSelect(String(node.id))}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-start text-sm"
        >
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </button>
        <Counts stats={statsById.get(node.id)} />
      </div>
      {open && node.children.length ? (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              statsById={statsById}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The branch column of the board: the real `tbl_branches` hierarchy, each row carrying that
 * branch's booked-versus-open count for the day being viewed, so a manager can see where the
 * free capacity is before opening it.
 */
export function BranchBookingTree({
  branches,
  stats,
  value,
  onChange,
}: {
  branches: Branch[];
  stats: BookingBoardBranch[];
  value: string;
  onChange: (value: string) => void;
}) {
  const tree = useMemo(() => buildTree(branches), [branches]);
  const statsById = useMemo(() => new Map(stats.map((row) => [row.branchId, row])), [stats]);
  const totals = useMemo(() => stats.reduce(
    (sum, row) => ({
      bookedSessions: sum.bookedSessions + row.bookedSessions,
      freeSlots: sum.freeSlots + row.freeSlots,
    }),
    { bookedSessions: 0, freeSlots: 0 },
  ), [stats]);

  return (
    <nav className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold">{uiStatic('الفروع')}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{uiStatic('محجوز · متاح')}</p>
      </div>
      <ul className="max-h-[52vh] overflow-y-auto p-2">
        <li>
          <div
            className={cn(
              'flex items-center gap-1 rounded-lg pe-2 transition-colors',
              value === 'all' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
            )}
          >
            <span className="w-6" />
            <button
              type="button"
              onClick={() => onChange('all')}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 text-start text-sm font-medium"
            >
              <Layers className="size-3.5 shrink-0" />
              {uiStatic('كل الفروع')}
            </button>
            <Counts
              stats={{
                branchId: 0,
                branchName: '',
                parentId: 0,
                bookedSeats: 0,
                trainers: 0,
                ...totals,
              }}
            />
          </div>
        </li>
        {tree.map((node) => (
          <TreeRow key={node.id} node={node} depth={0} selected={value} statsById={statsById} onSelect={onChange} />
        ))}
        {!tree.length ? (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">{uiStatic('لا توجد فروع متاحة')}</li>
        ) : null}
      </ul>
    </nav>
  );
}
