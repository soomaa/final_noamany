import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { AlertTriangle, Camera, CheckCircle2, ScanBarcode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type ScanPhase = 'starting' | 'scanning' | 'success' | 'error';

interface CameraBarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
  /** Panel title; defaults to «مسح بالكاميرا». */
  title?: string;
  /** Close after the first read (reception / topbar). The check-in desk keeps scanning. */
  closeOnDetect?: boolean;
}

/** Camera access needs https or localhost, and a browser that exposes getUserMedia. */
export function cameraUnavailableReason(ui: (text: string) => string): string | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) {
    return ui('الكاميرا بتشتغل بس لو النظام مفتوح على https أو localhost. افتح رابط النظام الآمن (https) وجرّب تاني.');
  }
  if (!navigator.mediaDevices?.getUserMedia) return ui('المتصفح ده مش بيدعم الكاميرا. جرّب Chrome أو Safari.');
  return null;
}

function cameraErrorMessage(error: unknown, ui: (text: string) => string): string {
  const name = error instanceof DOMException ? error.name : '';
  const raw = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return ui('إذن الكاميرا مرفوض. اسمح للمتصفح يستخدم الكاميرا من إعدادات الموقع (علامة القفل جنب الرابط) وبعدين اضغط «جرّب تاني».');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return ui('مفيش كاميرا متاحة على الجهاز ده.');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return ui('الكاميرا مستخدمة في برنامج تاني. اقفله وجرّب تاني.');
  }
  return cameraUnavailableReason(ui) ?? (raw || ui('تعذر تشغيل الكاميرا. اتأكد من الإذن وجرّب تاني.'));
}

function createReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 800,
  });
}

export function CameraBarcodeScanner({ open, onOpenChange, onDetected, title, closeOnDetect = false }: CameraBarcodeScannerProps) {
  const { ui } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [phase, setPhase] = useState<ScanPhase>('starting');
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  onDetectedRef.current = onDetected;

  // Only the camera is read here; the USB handheld keeps typing into the page's own input.
  const closeOnDetectRef = useRef(closeOnDetect);
  closeOnDetectRef.current = closeOnDetect;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
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
    const reader = createReader();
    handledRef.current = false;
    setPhase('starting');
    setError('');
    setLastCode('');

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;
      const unavailable = cameraUnavailableReason(ui);
      if (unavailable) {
        setError(unavailable);
        setPhase('error');
        return;
      }
      try {
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          video,
          (result) => {
            if (!result || cancelled || handledRef.current) return;
            const code = result.getText().trim();
            if (!code) return;
            handledRef.current = true;
            setLastCode(code);
            setPhase('success');
            onDetectedRef.current(code);
            window.clearTimeout(resumeTimer);
            if (closeOnDetectRef.current) {
              resumeTimer = window.setTimeout(() => { if (!cancelled) onOpenChangeRef.current(false); }, 600);
              return;
            }
            resumeTimer = window.setTimeout(() => {
              if (cancelled) return;
              handledRef.current = false;
              setLastCode('');
              setPhase('scanning');
            }, 1400);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setPhase('scanning');
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
      stopCamera();
    };
    // Retry remounts the camera; ui is used only for error copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryKey]);

  if (!open) return null;

  // Portalled to <body>: a `fixed` panel inside the topbar (backdrop-blur + overflow-hidden) would
  // otherwise be positioned and clipped by the header instead of the viewport.
  return createPortal(
    <div
      // `pointer-events-auto` is not decoration. This panel lives outside the member card's
      // dialog, and a modal Radix dialog sets `pointer-events: none` on the whole body while
      // it is open — so without opting back in, the panel rendered on top of the card but was
      // completely inert: tapping the X did nothing. Reception scans a member, the card opens,
      // and from that moment the scanner could not be closed. Same trap, same fix, as
      // components/ui/popover.tsx.
      className="pointer-events-auto fixed inset-x-4 bottom-4 z-[60] overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)] sm:inset-x-auto sm:end-4 sm:w-[22rem]"
      role="dialog"
      aria-modal="false"
      aria-labelledby="camera-scanner-title"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 space-y-1">
          <p id="camera-scanner-title" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <ScanBarcode className="size-4" />
            </span>
            {title ?? ui('مسح بالكاميرا')}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ui('وجّه الكاميرا الخلفية على باركود أو QR كارت العضو')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          title={ui('إغلاق الكاميرا')}
          aria-label={ui('إغلاق الكاميرا')}
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
          <div className="camera-barcode-scan-line pointer-events-none absolute inset-x-[14%] h-0.5 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary))]" />
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
              <p className="text-xs leading-relaxed text-amber-100/80">
                {ui('لو عندك سكانر USB، امسح الكارت بيه مباشرة أو اكتب الكود في خانة البحث.')}
              </p>
              <Button
                type="button"
                variant="outline"
                      onClick={() => setRetryKey((value) => value + 1)}
              >
                {ui('جرّب تاني')}
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
        <span>{closeOnDetect ? ui('بيقفل بعد أول قراءة') : ui('بيفضل شغال لحد ما تقفله')}</span>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A camera button that opens the scanner — for when there is no USB scanner (or no power for it)
 * and reception works from the branch phone.
 */
export function CameraScanButton({
  onDetected,
  closeOnDetect = false,
  title,
  className,
  showLabel = false,
}: {
  onDetected: (code: string) => void;
  closeOnDetect?: boolean;
  title?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={showLabel ? 'default' : 'icon'}
        className={cn(showLabel ? 'min-h-10 gap-2' : 'size-10 shrink-0', className)}
        title={ui('مسح الكارت بالكاميرا')}
        aria-label={ui('مسح الكارت بالكاميرا')}
        aria-pressed={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Camera className="size-4" aria-hidden />
        {showLabel ? ui('الكاميرا') : null}
      </Button>
      <CameraBarcodeScanner open={open} onOpenChange={setOpen} onDetected={onDetected} closeOnDetect={closeOnDetect} title={title} />
    </>
  );
}
