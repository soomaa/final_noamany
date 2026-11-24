import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { liveBundle, runningBundle, updateAvailable } from '@/lib/app-version';
import { useLocale } from '@/store/locale';

/** How often an open tab looks for a new release. */
const CHECK_EVERY_MS = 2 * 60_000;
/** "Later" hides the card for this long; it comes back if the tab still has not refreshed. */
const SNOOZE_MS = 30 * 60_000;

/**
 * "A new version is available — Update" card. After a release, open tabs at the club show it
 * within two minutes, or as soon as the tab is looked at again. After the reload the running
 * and live entry names match, so the card cannot come back in a loop.
 */
export function UpdateBanner() {
  const { t } = useLocale();
  /** When the last check found a newer release (0 = never). */
  const [foundAt, setFoundAt] = useState(0);
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  useEffect(() => {
    const running = runningBundle();
    if (!running) return; // vite dev server: no hashed entry to compare
    let stopped = false;
    let inFlight = false;
    const check = async () => {
      if (stopped || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        if (updateAvailable(running, await liveBundle()) && !stopped) setFoundAt(Date.now());
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // A check after the snooze ends sets foundAt past snoozedUntil and brings the card back.
  const visible = foundAt > 0 && foundAt >= snoozedUntil;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[110] flex justify-center px-4 print:hidden sm:bottom-6"
    >
      {visible ? (
        <div
          data-testid="app-update-banner"
          className="pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border border-border bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none sm:flex-nowrap sm:ps-4"
        >
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <RefreshCw className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-6">{t('appUpdate.title')}</p>
            <p className="text-xs leading-5 text-muted-foreground">{t('appUpdate.body')}</p>
          </div>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 flex-1 text-muted-foreground sm:h-9 sm:flex-none"
              onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}
            >
              {t('appUpdate.later')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-11 flex-1 font-bold sm:h-9 sm:flex-none"
              onClick={() => window.location.reload()}
            >
              {t('appUpdate.update')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
