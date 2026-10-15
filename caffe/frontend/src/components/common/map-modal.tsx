import { useLocale } from '@/store/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface MapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat?: number | string | null;
  lng?: number | string | null;
  employeeName?: string | null;
}

export function MapModal({ open, onOpenChange, lat, lng, employeeName }: MapModalProps) {
  const { ui } = useLocale();
  const hasCoords = lat != null && lng != null && lat !== '' && lng !== '';
  const src = hasCoords
    ? `https://maps.google.com/maps?q=${lat},${lng}&hl=ar&z=14&output=embed`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{employeeName ? `${ui('موقع')} ${employeeName}` : ui('الموقع الجغرافي')}</DialogTitle>
        </DialogHeader>
        {src ? (
          <iframe
            title={ui('خريطة الموقع')}
            src={src}
            className="h-[360px] w-full rounded-lg border border-border"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">{ui('لا تتوفر إحداثيات GPS لهذا السجل.')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
