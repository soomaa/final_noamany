import { AlertTriangle, CheckCircle2, ScanBarcode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { detectBarcodeFrame, releaseLateCameraStream } from '@/lib/camera-scan-frame';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type ScanPhase = 'starting' | 'scanning' | 'success' | 'error';
type BarcodeResult = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: ImageBitmapSource) => Promise<BarcodeResult[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

interface CameraBarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
  footerHint?: string;
}

function cameraErrorMessage(error: unknown, ui: (text: string) => string): string {
  const name = error instanceof DOMException ? error.name : '';
  const raw = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return ui('اسمح للمتصفح باستخدام الكاميرا من إعدادات الموقع ثم أعد المحاولة.');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return ui('لا توجد كاميرا متاحة على هذا الجهاز.');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return ui('الكاميرا مشغولة في برنامج آخر. أغلقه ثم أعد المحاولة.');
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return ui('الكاميرا تعمل على localhost أو https فقط.');
  }
  return raw || ui('تعذر تشغيل الكاميرا. تأكد من الصلاحيات وحاول مرة أخرى.');
}

export function CameraBarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  title,
  description,
  footerHint,
}: CameraBarcodeScannerProps) {
  const { ui } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const handledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [phase, setPhase] = useState<ScanPhase>('starting');
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onOpenChange, open]);

  const stopCamera = () => {
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (video) video.srcObject = null;
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      handledRef.current = false;
      setPhase('starting');
      setError('');
      setLastCode('');
      return;
    }

    let cancelled = false;
    let resumeTimer = 0;
    let frame = 0;
    handledRef.current = false;
    setPhase('starting');
    setError('');
    setLastCode('');

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (!window.BarcodeDetector) throw new Error(ui('المتصفح لا يدعم قراءة الباركود من الكاميرا. استخدم Chrome أو Edge حديثًا.'));
        const detector = new window.BarcodeDetector({ formats: ['code_128', 'qr_code', 'ean_13', 'ean_8', 'code_39', 'itf', 'upc_a', 'upc_e', 'data_matrix'] });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (releaseLateCameraStream(stream, cancelled)) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) {
          stopCamera();
          return;
        }
        const scan = async () => {
          if (cancelled) return;
          const result = await detectBarcodeFrame(detector, video);
          if (result.error) {
            if (cancelled) return;
            stopCamera();
            setError(cameraErrorMessage(result.error, ui));
            setPhase('error');
            return;
          }
          const code = result.code;
          if (code && !handledRef.current) {
            handledRef.current = true;
            setLastCode(code);
            setPhase('success');
            onDetectedRef.current(code);
            window.clearTimeout(resumeTimer);
            resumeTimer = window.setTimeout(() => { if (!cancelled) { handledRef.current = false; setLastCode(''); setPhase('scanning'); } }, 1400);
          }
          if (!cancelled) frame = window.requestAnimationFrame(() => void scan());
        };
        setPhase('scanning');
        void scan();
      } catch (cause) {
        if (cancelled) return;
        setError(cameraErrorMessage(cause, ui));
        setPhase('error');
      }
    };

    const wait = window.setTimeout(() => {
      void start();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(wait);
      window.clearTimeout(resumeTimer);
      window.cancelAnimationFrame(frame);
      stopCamera();
    };
    // Retry remounts the camera; ui is used only for error copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryKey]);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-4 end-4 z-40 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)]"
      role="dialog"
      aria-modal="false"
      aria-labelledby="persistent-scanner-title"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 space-y-1">
          <p id="persistent-scanner-title" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <ScanBarcode className="size-4" />
            </span>
            {title ?? ui('سكانر مستمر')}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description ?? ui('مفتوح حتى يُغلق يدويًا — بعد قفل بطاقة العضو يعود المسح تلقائيًا')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          permissionAction={null}
          className="size-8 shrink-0"
          title={ui('إغلاق السكانر')}
          onClick={() => onOpenChange(false)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative mx-4 mb-3 overflow-hidden rounded-2xl bg-zinc-950 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]">
        <video
          ref={videoRef}
          className={cn(
            'aspect-[4/3] w-full object-cover',
            phase === 'error' ? 'opacity-0' : 'opacity-100',
          )}
          muted
          playsInline
          autoPlay
        />

        {phase !== 'error' ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                background:
                  'linear-gradient(to bottom, rgb(0 0 0 / 0.5) 0%, transparent 18%, transparent 82%, rgb(0 0 0 / 0.5) 100%), linear-gradient(to left, rgb(0 0 0 / 0.5) 0%, transparent 16%, transparent 84%, rgb(0 0 0 / 0.5) 100%)',
              }}
            />
            <span className="pointer-events-none absolute start-[12%] top-[12%] h-9 w-9 rounded-tl-md border-s-[3px] border-t-[3px] border-primary bg-transparent" />
            <span className="pointer-events-none absolute end-[12%] top-[12%] h-9 w-9 rounded-tr-md border-e-[3px] border-t-[3px] border-primary bg-transparent" />
            <span className="pointer-events-none absolute bottom-[12%] start-[12%] h-9 w-9 rounded-bl-md border-s-[3px] border-b-[3px] border-primary bg-transparent" />
            <span className="pointer-events-none absolute bottom-[12%] end-[12%] h-9 w-9 rounded-br-md border-e-[3px] border-b-[3px] border-primary bg-transparent" />
          </>
        ) : null}

        {phase === 'scanning' ? (
          <div className="reception-barcode-scan-line pointer-events-none absolute inset-x-[14%] h-0.5 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary))]" />
        ) : null}

        {phase === 'starting' ? (
          <div className="absolute inset-0 grid place-items-center bg-zinc-950/55 text-sm font-medium text-amber-50">
            {ui('جاري تشغيل الكاميرا…')}
          </div>
        ) : null}

        {phase === 'success' ? (
          <div className="absolute inset-0 grid place-items-center bg-zinc-950/70 px-6 text-center">
            <div className="space-y-2">
              <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
              <p className="text-base font-semibold text-amber-50">{ui('تم قراءة الباركود')}</p>
              <p className="nums text-lg font-bold tracking-wide text-primary">{lastCode}</p>
            </div>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="absolute inset-0 grid place-items-center px-6 py-10 text-center">
            <div className="max-w-sm space-y-3">
              <AlertTriangle className="mx-auto size-10 text-amber-400" />
              <p className="text-sm leading-relaxed text-amber-50">{error}</p>
              <Button
                type="button"
                variant="brand"
                permissionAction={null}
                onClick={() => setRetryKey((value) => value + 1)}
              >
                {ui('إعادة المحاولة')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              phase === 'scanning' && 'animate-pulse bg-emerald-500',
              phase === 'starting' && 'animate-pulse bg-primary',
              phase === 'success' && 'bg-emerald-500',
              phase === 'error' && 'bg-destructive',
            )}
          />
          {phase === 'scanning'
            ? ui('جاري المسح')
            : phase === 'success'
              ? ui('تمت القراءة')
              : phase === 'error'
                ? ui('تعذر التشغيل')
                : ui('جاري التحضير')}
        </span>
        <span>
          {phase === 'error'
            ? ui('قارئ USB يظل متاحًا من أي شاشة')
            : footerHint ?? ui('يُغلق يدويًا فقط')}
        </span>
      </div>
    </div>
  );
}
