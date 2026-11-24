import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { isSystemAdminUser } from '@/lib/user-scope';
import { SearchableSelect } from '@/components/common/searchable-select';

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
  const user = useAuth((state) => state.user);
  // Staff are locked to their own branch (the server enforces it); "all" then means "my branch".
  const scoped = !!user && !isSystemAdminUser(user);
  const locked = scoped && (branches?.length ?? 0) <= 1;

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{ui('الفرع')}</Label>
      <SearchableSelect
        value={locked ? 'all' : value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-52 items-center rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-90"
      >
        <option value="all">{scoped ? ((branches?.length ?? 0) > 1 ? ui('كل فروعي') : user?.branch_name ? `${ui('فرع')} ${user.branch_name}` : ui('فرعي')) : ui('كل الفروع')}</option>
        {(branches ?? []).map((b) => (
          <option key={b.id} value={String(b.id)}>
            {b.name}
          </option>
        ))}
      </SearchableSelect>
    </div>
  );
}

/** Convert "all" or empty to undefined so we don't send a branch param when the user picked "all". */
export function normalizeBranchParam(v: string): number | undefined {
  if (!v || v === 'all') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
