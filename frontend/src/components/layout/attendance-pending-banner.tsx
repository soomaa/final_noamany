import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { cn, toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

export const EXCEPTIONS_ROUTE = '/attendance/exceptions';
export const PENDING_SUMMARY_KEY = ['attendance', 'exceptions', 'pending-summary'] as const;

export interface PendingSummary {
  open: number;
  stale: number;
  oldestOpenDate: string | null;
  since: string;
  staleAfterDays: number;
  branches: Array<{ branchId: number | null; branchName: string | null; open: number; stale: number }>;
}

/** Open «الحالات اليومية» in the caller's scope; polled every few minutes, only for deciders. */
export function usePendingExceptions() {
  const status = useAuth((s) => s.status);
  const { can, hasData } = usePermission();
  const enabled = status === 'authenticated' && hasData && can('attendance.exceptions:update');
  const query = useQuery({
    queryKey: PENDING_SUMMARY_KEY,
    queryFn: async ({ signal }) =>
      (await api.get<PendingSummary>('/attendance/exceptions/pending-summary', { signal, timeout: 30_000 })).data,
    enabled,
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return { ...query, enabled };
}

const DISMISS_KEY = 'one80.attendance-pending-banner.dismissed';

function readDismissed(): number | null {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

function waitingPhrase(count: number): string {
  if (count === 1) return 'عندك حالة حضور واحدة مستنية قرارك';
  if (count === 2) return 'عندك حالتين حضور مستنيين قرارك';
  return `عندك ${toArabicDigits(String(count))} ${count <= 10 ? 'حالات' : 'حالة'} حضور مستنية قرارك`;
}

/**
 * Thin strip on every page for managers with undecided attendance cases. Red when a case has been
 * open for more than the stale threshold (HR is notified about those). Dismissed for the browser
 * session; it comes back only if the count grows.
 */
export function AttendancePendingBanner() {
  const { ui } = useLocale();
  const { pathname } = useLocation();
  const { data, enabled } = usePendingExceptions();
  const [dismissedAt, setDismissedAt] = useState<number | null>(readDismissed);

  if (!enabled || !data || data.open <= 0) return null;
  if (pathname === EXCEPTIONS_ROUTE || pathname.startsWith(`${EXCEPTIONS_ROUTE}/`)) return null;
  if (dismissedAt != null && data.open <= dismissedAt) return null;

  const old = data.stale > 0;
  const dismiss = () => {
    setDismissedAt(data.open);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(data.open));
    } catch {
      /* private mode: dismissed until reload */
    }
  };

  return (
    <div
      role="status"
      className={cn(
        'mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        old
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
      )}
    >
      {old ? <AlertTriangle className="size-4 shrink-0" /> : <ClipboardCheck className="size-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <span className="font-medium">{ui(waitingPhrase(data.open))}</span>
        {old && (
          <span className="ms-1">
            — {ui('منها')} <span className="nums">{toArabicDigits(String(data.stale))}</span> {ui('مفتوحة من يومين أو أكتر')}
          </span>
        )}
        <span className="mx-1">—</span>
        <Link to={EXCEPTIONS_ROUTE} className="font-semibold underline underline-offset-2">
          {ui('افتح الحالات اليومية')}
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
        aria-label={ui('إخفاء')}
        title={ui('إخفاء لحد ما تقفل المتصفح')}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
