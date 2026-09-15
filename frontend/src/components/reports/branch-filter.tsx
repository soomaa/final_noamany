import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useLocale } from '@/store/locale';

interface BranchFilterProps {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Shared branch dropdown used across all report pages. Value "all" (or empty) means every branch.
 */
export function BranchFilter({ value, onChange }: BranchFilterProps) {
  const { ui } = useLocale();
  const { data: branches } = useBranches();

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{ui('الفرع')}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-52 items-center rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="all">{ui('كل الفروع')}</option>
        {(branches ?? []).map((b) => (
          <option key={b.id} value={String(b.id)}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Convert "all" or empty to undefined so we don't send a branch param when the user picked "all". */
export function normalizeBranchParam(v: string): number | undefined {
  if (!v || v === 'all') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
