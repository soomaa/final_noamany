import { Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A member blocked by the gym is flagged wherever reception finds them — search results, pickers,
 * the member screen — until the block is lifted (client, 22 Nov: «لو عملت سيرش عن العميل اللي ليه
 * بلوك من أي شاشة في السيستم يظهرلي انه معمول ليه بلوك»).
 */
export function BlockedChip({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white', className)}>
      <Ban className="size-3" aria-hidden="true" />
      محظور
    </span>
  );
}

export function BlockedMemberBanner({ reason, className }: { reason?: string | null; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-start gap-2 rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive', className)}>
      <Ban className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold">العضو ده عليه بلوك — ممنوع من الدخول لحد ما البلوك يتشال</p>
        {reason ? <p className="mt-0.5 break-words">السبب: {reason}</p> : null}
      </div>
    </div>
  );
}
