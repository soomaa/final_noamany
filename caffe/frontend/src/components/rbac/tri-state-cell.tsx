import { Check, Minus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Effect } from '@/types/rbac';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface TriStateCellProps {
  applicable: boolean;
  explicit: Effect | null; // null = inherit
  effective: Effect;
  /** source ancestor display label, or uiStatic('الأدوار') for exception baseline; null if self/default. */
  inheritedFromLabel: string | null;
  sensitive: boolean;
  editable: boolean;
  onClick: () => void;
}

/**
 * One matrix cell. Cycles Inherit → Allow → Deny on click. Visuals:
 *  - explicit Allow  : solid green ✓
 *  - explicit Deny   : solid red ✗
 *  - inherit→allow   : faded green dashed ghost ✓ (tooltip names the source)
 *  - inherit→deny    : faded gray dashed − (tooltip: inherited / default deny)
 *  - sensitive + allowed-by-inheritance: amber ring warning
 */
export function TriStateCell({
  applicable,
  explicit,
  effective,
  inheritedFromLabel,
  sensitive,
  editable,
  onClick,
}: TriStateCellProps) {
  const { ui } = useLocale();
  if (!applicable) {
    return <span className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground/40">—</span>;
  }

  const inherited = explicit === null;
  const allowed = effective === 'allow';
  const warnInherited = sensitive && inherited && allowed;

  let visual: React.ReactNode;
  let ring = '';
  if (!inherited && explicit === 'allow') {
    visual = <Check className="size-4 text-white" strokeWidth={3} />;
    ring = 'bg-emerald-500 border-emerald-500';
  } else if (!inherited && explicit === 'deny') {
    visual = <X className="size-4 text-white" strokeWidth={3} />;
    ring = 'bg-red-500 border-red-500';
  } else if (allowed) {
    // inherited allow → ghost
    visual = <Check className="size-3.5 text-emerald-600/70" strokeWidth={3} />;
    ring = cn('border-dashed border-emerald-400/70 bg-emerald-50', warnInherited && 'ring-2 ring-amber-400/80');
  } else {
    // inherited / default deny
    visual = <Minus className="size-3.5 text-muted-foreground/60" strokeWidth={3} />;
    ring = 'border-dashed border-border bg-muted/40';
  }

  const tip = inherited
    ? allowed
      ? inheritedFromLabel
        ? `${ui('مسموح (موروث من: ')}${inheritedFromLabel})`
        : ui('مسموح (موروث)')
      : inheritedFromLabel
        ? `${ui('رفض (موروث من: ')}${inheritedFromLabel})`
        : ui('رفض افتراضي (غير ممنوح)')
    : explicit === 'allow'
      ? ui('سماح صريح')
      : ui('رفض صريح');

  const button = (
    <button
      type="button"
      disabled={!editable}
      onClick={onClick}
      aria-label={tip}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all',
        ring,
        editable ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default opacity-90',
      )}
    >
      {visual}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
