import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Loader2, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/** One punch photo with the details shown under it in the preview. */
export interface PunchPhotoItem {
  key: string;
  src: string;
  label: string;
  kind: 'in' | 'out';
  employeeName?: string;
  empCode?: string | number;
  department?: string;
  jobTitle?: string;
  branchName?: string;
  weekday?: string;
  actionDate?: string;
  time?: string;
  lateMin?: number;
  lat?: number;
  lng?: number;
}

/** Small clickable photo for table cells; opens the preview instead of a new tab. */
export function PunchPhotoThumb({ src, label, onOpen }: { src?: string | null; label: string; onOpen: () => void }) {
  if (!src) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      className="mx-auto block overflow-hidden rounded-xl border shadow-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <img src={src} alt={label} className="size-[72px] object-cover" loading="lazy" decoding="async" />
    </button>
  );
}

interface PunchPhotoPreviewProps {
  items: PunchPhotoItem[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  onShowMap?: (item: PunchPhotoItem) => void;
}

/** Large photo with the punch details underneath; arrows/keyboard move between the page's photos. */
export function PunchPhotoPreview({ items, index, onIndexChange, onShowMap }: PunchPhotoPreviewProps) {
  const { ui } = useLocale();
  const item = index != null ? items[index] : undefined;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const hasPrev = index != null && index > 0;
  const hasNext = index != null && index < items.length - 1;

  useEffect(() => setStatus('loading'), [item?.src]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (event: KeyboardEvent) => {
      // RTL: the right arrow goes back, the left arrow goes forward.
      if (event.key === 'ArrowRight' && hasPrev) onIndexChange(index - 1);
      if (event.key === 'ArrowLeft' && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndexChange]);

  // Warm the neighbours so moving between photos is instant.
  useEffect(() => {
    if (index == null) return;
    for (const neighbour of [items[index - 1], items[index + 1]]) {
      if (neighbour) new Image().src = neighbour.src;
    }
  }, [index, items]);

  const detail = (label: string, value?: string | number | null, className = '') =>
    value == null || value === '' ? null : (
      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <div className="text-xs text-muted-foreground">{ui(label)}</div>
        <div className={`font-semibold ${className}`}>{typeof value === 'number' ? toArabicDigits(value) : value}</div>
      </div>
    );

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent size="lg" className="max-h-[94vh] overflow-y-auto">
        {item && <>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{item.employeeName ?? ui('صورة البصمة')}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.kind === 'in' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}>{ui(item.label)}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="relative flex h-[min(60vh,560px)] items-center justify-center overflow-hidden rounded-xl bg-black/90">
            {status === 'loading' && <Loader2 className="absolute size-8 animate-spin text-white/70" />}
            {status === 'error'
              ? <div className="flex flex-col items-center gap-2 text-white/70"><ImageOff className="size-10" />{ui('تعذر تحميل الصورة')}</div>
              : <img
                  key={item.src}
                  src={item.src}
                  alt={ui(item.label)}
                  decoding="async"
                  onLoad={() => setStatus('ready')}
                  onError={() => setStatus('error')}
                  className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
                />}
            {/* Reading order is right-to-left: previous on the right, next on the left. */}
            {hasPrev && <Button size="icon" variant="secondary" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full opacity-90" aria-label={ui('السابقة')} onClick={() => onIndexChange(index! - 1)}><ChevronRight className="size-5" /></Button>}
            {hasNext && <Button size="icon" variant="secondary" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full opacity-90" aria-label={ui('التالية')} onClick={() => onIndexChange(index! + 1)}><ChevronLeft className="size-5" /></Button>}
            <span className="nums absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {`${toArabicDigits(index! + 1)} ${ui('من')} ${toArabicDigits(items.length)}`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {detail('كود الموظف', item.empCode != null ? toArabicDigits(String(item.empCode)) : undefined, 'nums text-primary')}
            {detail('الإدارة', item.department)}
            {detail('الوظيفة', item.jobTitle)}
            {detail('الفرع', item.branchName)}
            {detail('اليوم والتاريخ', [item.weekday, item.actionDate && toArabicDigits(item.actionDate)].filter(Boolean).join(' — '), 'nums')}
            {detail(item.kind === 'in' ? 'وقت الحضور' : 'وقت الانصراف', item.time && toArabicDigits(item.time), `nums ${item.kind === 'in' ? 'text-success' : 'text-info'}`)}
            {item.kind === 'in' && detail('التأخير (د)', item.lateMin != null ? Math.max(0, item.lateMin) : undefined, 'nums text-destructive')}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {onShowMap && item.lat != null && item.lng != null && (
              <Button variant="outline" size="sm" onClick={() => onShowMap(item)}><MapPin className="size-4" />{ui('عرض الموقع')}</Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <a href={item.src} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{ui('فتح الصورة بالحجم الكامل')}</a>
            </Button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
