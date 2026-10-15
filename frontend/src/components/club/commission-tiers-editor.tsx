import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CommissionTier } from '@/lib/sales-commission';
import { useLocale } from '@/store/locale';

export function CommissionTiersEditor({
  tiers,
  onChange,
  disabled,
}: {
  tiers: CommissionTier[];
  onChange: (tiers: CommissionTier[]) => void;
  disabled?: boolean;
}) {
  const { ui } = useLocale();

  const update = (index: number, patch: Partial<CommissionTier>) => {
    onChange(tiers.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3">
      <div className="hidden gap-2 text-xs font-semibold text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
        <span>{ui('من %')}</span>
        <span>{ui('إلى %')}</span>
        <span>{ui('عمولة %')}</span>
        <span>{ui('اسم الشريحة')}</span>
        <span className="sr-only">{ui('حذف')}</span>
      </div>
      {tiers.map((tier, index) => (
        <div
          key={`${tier.label ?? 'tier'}-${index}`}
          className="grid gap-2 rounded-[10px] border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto] sm:items-end"
        >
          <div className="space-y-1">
            <Label className="sm:sr-only">{ui('من %')}</Label>
            <Input
              className="nums"
              type="number"
              min={0}
              disabled={disabled}
              value={tier.minAchievementPct}
              onChange={(e) => update(index, { minAchievementPct: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="sm:sr-only">{ui('إلى %')}</Label>
            <Input
              className="nums"
              type="number"
              min={0}
              disabled={disabled}
              value={tier.maxAchievementPct ?? ''}
              placeholder={ui('بدون حد')}
              onChange={(e) => update(index, { maxAchievementPct: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="sm:sr-only">{ui('عمولة %')}</Label>
            <Input
              className="nums"
              type="number"
              min={0}
              max={100}
              disabled={disabled}
              value={tier.commissionPercent}
              onChange={(e) => update(index, { commissionPercent: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="sm:sr-only">{ui('اسم الشريحة')}</Label>
            <Input
              disabled={disabled}
              value={tier.label ?? ''}
              placeholder={ui('اسم الشريحة')}
              onChange={(e) => update(index, { label: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || tiers.length <= 1}
            aria-label={ui('حذف الشريحة')}
            onClick={() => onChange(tiers.filter((_, i) => i !== index))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...tiers, { minAchievementPct: 0, maxAchievementPct: null, commissionPercent: 0, label: '' }])}
      >
        <Plus className="size-4" />
        {ui('إضافة شريحة')}
      </Button>
    </div>
  );
}
