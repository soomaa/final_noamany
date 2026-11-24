import { useId, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import {
  arabicVoiceStatus,
  getEntrySoundSettings,
  playEntrySound,
  setEntrySoundSettings,
  subscribeEntrySoundSettings,
  type EntrySoundMode,
} from '@/lib/entry-sounds';
import type { EntryVoiceCue } from '@/lib/entry-voice';

/**
 * «أصوات الدخول» — per device: on/off, volume, chime or spoken voice, and test buttons.
 * Shown on the reception page and the barcode check-in tab.
 */
export function EntrySoundSettings({ className }: { className?: string }) {
  const { ui, dir } = useLocale();
  const id = useId();
  const settings = useSyncExternalStore(subscribeEntrySoundSettings, getEntrySoundSettings);
  const voice = useSyncExternalStore(subscribeEntrySoundSettings, arabicVoiceStatus);
  const [unavailable, setUnavailable] = useState(false);
  const audible = settings.enabled && settings.volume > 0;

  const preview = async (cue: EntryVoiceCue) => {
    setUnavailable(!await playEntrySound(cue));
  };

  const modes: Array<{ value: EntrySoundMode; label: string }> = [
    { value: 'chime', label: ui('نغمة') },
    { value: 'voice', label: ui('صوت بيقول مقبول ومرفوض') },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('size-10 shrink-0', className)}
          aria-label={ui('أصوات الدخول')}
          title={ui('أصوات الدخول')}
        >
          {audible ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" dir={dir} className="w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-xl" aria-label={ui('أصوات الدخول')}>
        <div className="space-y-1">
          <h3 className="font-semibold">{ui('أصوات الدخول')}</h3>
          <p className="text-sm text-muted-foreground">{ui('صوت لما العضو يدخل، وصوت تاني لما الدخول يترفض أو الاشتراك منتهي.')}</p>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label htmlFor={`${id}-enabled`}>{ui('تشغيل الأصوات')}</Label>
          <Switch
            id={`${id}-enabled`}
            checked={settings.enabled}
            onCheckedChange={(enabled) => {
              setUnavailable(false);
              setEntrySoundSettings({ enabled });
              if (enabled && settings.volume > 0) void preview('granted');
            }}
          />
        </div>
        <fieldset className="space-y-2" disabled={!settings.enabled}>
          <legend className="text-sm font-medium">{ui('الصوت')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((mode) => (
              <Button
                key={mode.value}
                type="button"
                variant={settings.mode === mode.value ? 'brand' : 'outline'}
                className="min-h-11 whitespace-normal text-xs leading-5"
                aria-pressed={settings.mode === mode.value}
                onClick={() => { setUnavailable(false); setEntrySoundSettings({ mode: mode.value }); }}
              >
                {mode.label}
              </Button>
            ))}
          </div>
          {settings.mode === 'voice' && voice !== 'ready' && voice !== 'loading' ? (
            <p role="status" className="text-xs leading-5 text-amber-700 dark:text-amber-300">
              {ui('الجهاز ده مافيهوش صوت عربي، فهيشتغل بالنغمة بس. تقدر تضيف صوت عربي من إعدادات النطق في الجهاز.')}
            </p>
          ) : null}
        </fieldset>
        <div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-volume`}>{ui('مستوى الصوت')}</Label>
            <output htmlFor={`${id}-volume`} className="nums text-sm" dir="ltr">{toArabicDigits(settings.volume)}%</output>
          </div>
          <input
            id={`${id}-volume`}
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.volume}
            aria-valuetext={`${settings.volume}%`}
            disabled={!settings.enabled}
            className="min-h-11 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => { setUnavailable(false); setEntrySoundSettings({ volume: Number(event.target.value) }); }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" className="min-h-11 px-2 text-xs" disabled={!audible} onClick={() => void preview('granted')}>{ui('جرّب مقبول')}</Button>
          <Button type="button" variant="outline" className="min-h-11 px-2 text-xs" disabled={!audible} onClick={() => void preview('rejected')}>{ui('جرّب مرفوض')}</Button>
          <Button type="button" variant="outline" className="min-h-11 px-2 text-xs" disabled={!audible} onClick={() => void preview('expired')}>{ui('جرّب منتهي')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{ui('الإعداد ده محفوظ على الجهاز ده بس.')}</p>
        {unavailable && <p role="status" className="text-sm text-destructive">{ui('المتصفح منع الصوت. اضغط في أي مكان في الصفحة وجرّب تاني، واتأكد إن صوت الجهاز مفتوح.')}</p>}
      </PopoverContent>
    </Popover>
  );
}
