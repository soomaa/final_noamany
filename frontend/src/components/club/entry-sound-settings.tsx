import { formatDisplayNumber } from '@/lib/number-display';
import { useId, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useClubT } from '@/hooks/use-club-t';
import { useLocale } from '@/store/locale';
import { getEntrySoundSettings, playEntrySound, setEntrySoundSettings, subscribeEntrySoundSettings } from '@/lib/entry-sounds';
import type { EntrySound } from '@/lib/entry-sound-player';

export function EntrySoundSettings() {
  const ct = useClubT();
  const { dir } = useLocale();
  const id = useId();
  const settings = useSyncExternalStore(subscribeEntrySoundSettings, getEntrySoundSettings);
  const [unavailable, setUnavailable] = useState(false);
  const audible = settings.enabled && settings.volume > 0;

  const preview = async (sound: EntrySound) => {
    setUnavailable(!await playEntrySound(sound));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button permissionAction={null} variant="outline" size="icon" className="size-11 shrink-0" aria-label={ct('entrySounds.title')} title={ct('entrySounds.title')}>
          {audible ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" dir={dir} className="w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-xl" aria-label={ct('entrySounds.title')}>
        <div className="space-y-1">
          <h3 className="font-semibold">{ct('entrySounds.title')}</h3>
          <p className="text-sm text-muted-foreground">{ct('entrySounds.description')}</p>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label htmlFor={`${id}-enabled`}>{ct('entrySounds.enabled')}</Label>
          <Switch id={`${id}-enabled`} checked={settings.enabled} onCheckedChange={(enabled) => {
            setUnavailable(false);
            setEntrySoundSettings({ enabled });
            if (enabled && settings.volume > 0) void preview('granted');
          }} />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-volume`}>{ct('entrySounds.volume')}</Label>
            <output htmlFor={`${id}-volume`} className="text-sm tabular-nums" dir="ltr">{formatDisplayNumber(settings.volume)}%</output>
          </div>
          <input id={`${id}-volume`} type="range" min="0" max="100" step="5" value={settings.volume}
            aria-valuetext={`${settings.volume}%`} disabled={!settings.enabled}
            className="min-h-11 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => { setUnavailable(false); setEntrySoundSettings({ volume: Number(event.target.value) }); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button permissionAction={null} variant="outline" className="min-h-11 flex-1" disabled={!audible} onClick={() => void preview('granted')}>{ct('entrySounds.testGranted')}</Button>
          <Button permissionAction={null} variant="outline" className="min-h-11 flex-1" disabled={!audible} onClick={() => void preview('rejected')}>{ct('entrySounds.testRejected')}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{ct('entrySounds.deviceHint')}</p>
        {unavailable && <p role="status" className="text-sm text-destructive">{ct('entrySounds.unavailable')}</p>}
      </PopoverContent>
    </Popover>
  );
}
