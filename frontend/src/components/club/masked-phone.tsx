import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { isMaskedValue } from '@/lib/masked-value';
import { phoneNational } from '@/lib/phone-display';
import { maskPhoneLocally, revealPhonePath } from '@/lib/phone-mask';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/** How long a revealed number stays on screen before it goes back to stars. */
export const REVEAL_TTL_MS = 60_000;

type RevealIds = { memberId?: number | null; leadId?: number | null };

/**
 * Fetches one real number through the audited endpoint. Resolves to `null` when the
 * record has no number; rejects when the caller is not allowed to read it.
 */
export async function revealPhone(ids: RevealIds): Promise<string | null> {
  const path = revealPhonePath(ids);
  if (!path) return null;
  const { data } = await api.get<{ phone: string | null }>(path);
  return data?.phone ?? null;
}

/**
 * The real number behind a value that may be masked — for call and WhatsApp buttons, which
 * cannot act on stars. A masked value goes through the audited reveal; `null` when the record
 * has no number or the caller may not read it.
 */
export async function resolvePhone(value: string | null | undefined, ids: RevealIds): Promise<string | null> {
  if (!value) return null;
  if (!isMaskedValue(value)) return value;
  try {
    return await revealPhone(ids);
  } catch {
    return null;
  }
}

/**
 * Opens a contact link built from a number that may need revealing first. The window is opened
 * synchronously, inside the click, so a popup blocker does not eat it while the reveal is in flight.
 */
export async function openContactLink(
  value: string | null | undefined,
  ids: RevealIds,
  build: (phone: string) => string | null,
  onUnavailable: () => void,
) {
  // Not 'noopener': with it window.open returns null by spec and the link could not be set.
  // The opener is cut by hand instead, before anything is loaded into the tab.
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  const phone = await resolvePhone(value, ids);
  const href = phone ? build(phone) : null;
  if (!href) {
    win?.close();
    onUnavailable();
    return;
  }
  if (win) win.location.href = href;
  else window.location.href = href;
}

/**
 * A phone number in a list: stars by default, an eye beside it, the real number only
 * after a click — for one record at a time, and only for a minute.
 *
 * Two layers, on purpose:
 * - The server sends stars to anyone without the reveal grant, so the network tab holds
 *   nothing more than the screen. For them the eye calls the audited reveal endpoint,
 *   which allows the rep who owns the record (and records the read).
 * - For someone who holds the grant the server sends the real number, but the list still
 *   shows stars and the eye simply uncovers it. A screenshot of any list, by anyone, is
 *   therefore worthless; a single number is one click away for whoever may see it.
 *
 * The component never lands a click on the row it sits in: revealing a number must not
 * open the record, acknowledge the follow-up, or select the hit.
 */
export function MaskedPhone({
  value,
  memberId,
  leadId,
  className,
  dir = 'ltr',
  onRevealed,
}: {
  value: string | null | undefined;
  /** Pass exactly one id. With neither, a server-masked value simply stays masked. */
  memberId?: number | null;
  leadId?: number | null;
  className?: string;
  dir?: 'ltr' | 'rtl';
  /** The real number once shown, `null` again when it is hidden — for dial/WhatsApp links. */
  onRevealed?: (phone: string | null) => void;
}) {
  const { ui } = useLocale();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  // A different record in the same slot starts hidden again.
  useEffect(() => {
    setRevealed(null);
    clearTimer();
  }, [value, memberId, leadId]);
  useEffect(() => clearTimer, []);

  if (!value) return <span className={className}>—</span>;

  const serverMasked = isMaskedValue(value);
  const path = revealPhonePath({ memberId, leadId });
  // Holding the grant: the number is already here, the eye just uncovers it.
  const canReveal = !serverMasked || path != null;

  const hide = () => {
    clearTimer();
    setRevealed(null);
    onRevealed?.(null);
  };

  const show = (phone: string) => {
    setRevealed(phone);
    onRevealed?.(phone);
    clearTimer();
    timer.current = window.setTimeout(hide, REVEAL_TTL_MS);
  };

  const toggle = async (e: MouseEvent | KeyboardEvent) => {
    // Inside a row that is itself a link or a button, the eye is its own control.
    e.preventDefault();
    e.stopPropagation();
    if (loading || !canReveal) return;
    if (revealed) return hide();
    if (!serverMasked) return show(value);
    setLoading(true);
    try {
      const phone = await revealPhone({ memberId, leadId });
      if (phone) show(phone);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') void toggle(e);
  };

  const text = revealed
    ? formatDigits(phoneNational(revealed))
    : serverMasked
      ? value
      : maskPhoneLocally(value);

  return (
    <span className={cn('nums inline-flex items-center gap-1.5', className)} dir={dir}>
      <span className={cn(revealed && 'select-all')}>{text}</span>
      {canReveal && (
        <span
          role="button"
          tabIndex={0}
          aria-label={ui(revealed ? 'إخفاء الرقم' : 'اضغط لإظهار الرقم')}
          title={ui(revealed ? 'إخفاء الرقم' : 'اضغط لإظهار الرقم')}
          aria-busy={loading || undefined}
          onClick={(e) => void toggle(e)}
          onKeyDown={onKeyDown}
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center rounded p-0.5 opacity-60 transition',
            'hover:bg-primary/10 hover:text-primary hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            loading && 'cursor-progress',
          )}
        >
          {loading
            ? <Loader2 className="size-3.5 animate-spin" />
            : revealed
              ? <EyeOff className="size-3.5" />
              : <Eye className="size-3.5" />}
        </span>
      )}
    </span>
  );
}
