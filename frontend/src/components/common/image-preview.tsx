import { Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/store/locale';

interface PreviewState {
  src: string | null;
  title: string;
  open: (src: string, title?: string) => void;
  close: () => void;
}

const usePreview = create<PreviewState>((set) => ({
  src: null,
  title: '',
  open: (src, title) => set({ src, title: title?.trim() || fileName(src) }),
  close: () => set({ src: null }),
}));

/** Open an image in the in-app preview (large, closable) instead of a new window. */
export function openImagePreview(src: string, title?: string) {
  usePreview.getState().open(src, title);
}

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)(?:[?#].*)?$/i;

function fileName(src: string) {
  if (src.startsWith('data:') || src.startsWith('blob:')) return '';
  try {
    return decodeURIComponent(new URL(src, location.href).pathname.split('/').pop() ?? '');
  } catch {
    return '';
  }
}

/** A link target that is an image file (by extension or data URL). */
export function isImageHref(href: string | null | undefined): href is string {
  if (!href) return false;
  if (href.startsWith('data:image/')) return true;
  try {
    return IMAGE_PATH.test(new URL(href, location.href).pathname);
  } catch {
    return false;
  }
}

/**
 * Mount once at the app root. Shows the preview, and turns every click on a link to an image
 * into that preview, so no screen opens an image full-window (in the desktop app that replaced
 * the whole program with no way back). Ctrl / Cmd / Shift / middle click still behave normally.
 */
export function ImagePreviewHost() {
  const { ui } = useLocale();
  const { src, title, close } = usePreview();
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => setZoomed(false), [src]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.hasAttribute('download') || link.dataset.noPreview != null) return;
      const href = link.getAttribute('href');
      if (!isImageHref(href)) return;
      event.preventDefault();
      openImagePreview(link.href, link.getAttribute('title') ?? link.textContent ?? undefined);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <Dialog open={src != null} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent
        size="xl"
        aria-describedby={undefined}
        className="flex max-h-[92vh] w-[min(94vw,1200px)] max-w-none flex-col gap-3 p-3 sm:p-4 [&>button:last-child]:hidden"
      >
        <div className="flex items-center gap-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{title || ui('معاينة الصورة')}</DialogTitle>
          <Button variant="ghost" size="icon" aria-label={ui(zoomed ? 'تصغير' : 'تكبير')} title={ui(zoomed ? 'تصغير' : 'تكبير')} onClick={() => setZoomed((z) => !z)}>
            {zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
          </Button>
          {src ? (
            <Button asChild variant="ghost" size="icon" aria-label={ui('تحميل')} title={ui('تحميل')}>
              <a href={src} download={title || true} data-no-preview="">
                <Download className="size-4" />
              </a>
            </Button>
          ) : null}
          <Button variant="outline" size="icon" aria-label={ui('إغلاق')} title={ui('إغلاق')} onClick={close}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted/40">
          {src ? (
            <img
              src={src}
              alt={title}
              onClick={() => setZoomed((z) => !z)}
              className={zoomed
                ? 'mx-auto max-w-none cursor-zoom-out'
                : 'mx-auto block max-h-[calc(92vh-5.5rem)] w-auto max-w-full cursor-zoom-in object-contain'}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
