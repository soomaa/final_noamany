import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clubEventsApi } from '@/lib/api/club-events';
import { apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';

interface EventOption {
  id: number;
  title: string;
  eventNumber: string;
}

/**
 * Fullscreen-friendly reception/kiosk check-in screen. QR camera scanning is a nice-to-have
 * (not implemented here); a manual/scanner-gun code-entry input is the mandatory baseline —
 * most USB/Bluetooth QR scanners act as keyboard input devices and simply type the code + Enter,
 * which this input handles via onKeyDown/auto-submit.
 */
export function CheckinScreen() {
  const { ui, dir } = useLocale();
  const [eventId, setEventId] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: events } = useQuery({
    queryKey: ['club-events', 'checkin-eligible'],
    queryFn: () => clubEventsApi.listEvents({ status: 'published', pageSize: 100 }),
  });

  const eventOptions: EventOption[] = events?.data ?? [];

  const mutation = useMutation({
    mutationFn: (scannedCode: string) =>
      clubEventsApi.checkinScan({ code: scannedCode, eventId: Number(eventId) }),
    onSuccess: (data) => {
      setResult({ ok: true, message: `${ui('تم تسجيل الحضور')} — ${data?.registrationNumber ?? ''}` });
      setCode('');
    },
    onError: (err) => {
      setResult({ ok: false, message: apiError(err) });
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [eventId]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && code.trim() && eventId) {
      mutation.mutate(code.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-muted/30" dir={dir}>
      <div className="w-full max-w-md space-y-2">
        <label className="text-sm font-medium">{ui('الفعالية')}</label>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="h-12 text-base"><SelectValue placeholder={ui('اختر الفعالية')} /></SelectTrigger>
          <SelectContent>
            {eventOptions.map(ev => (
              <SelectItem key={ev.id} value={String(ev.id)}>{ev.title} — {ev.eventNumber}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full max-w-md space-y-2">
        <label className="text-sm font-medium">{ui('امسح رمز QR أو أدخل الكود')}</label>
        <Input
          ref={inputRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!eventId || mutation.isPending}
          placeholder={ui('امسح الكود...')}
          autoFocus
          className="h-16 text-2xl text-center tracking-widest"
        />
      </div>

      {result && (
        <div
          className={
            'w-full max-w-md rounded-lg p-6 text-center flex flex-col items-center gap-3 ' +
            (result.ok ? 'bg-green-50 border border-green-300' : 'bg-red-50 border border-red-300')
          }
        >
          {result.ok ? (
            <CheckCircle2 className="h-16 w-16 text-green-600" />
          ) : (
            <XCircle className="h-16 w-16 text-red-600" />
          )}
          <p className={'text-lg font-medium ' + (result.ok ? 'text-green-700' : 'text-red-700')}>
            {result.message}
          </p>
        </div>
      )}

      {!eventId && (
        <p className="text-sm text-muted-foreground">{ui('اختر فعالية أولاً لبدء تسجيل الحضور')}</p>
      )}
    </div>
  );
}
