import { Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface FileDropzoneProps {
  accept?: string;
  maxSizeMb?: number;
  value?: File | null;
  onChange: (file: File | null) => void;
  className?: string;
  label?: string;
}

export function FileDropzone({ accept, maxSizeMb = 10, value, onChange, className, label }: FileDropzoneProps) {
  const { ui } = useLocale();
  const resolvedLabel = label ?? ui('اسحب الملف هنا أو انقر للاختيار');
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (file: File) => {
      if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
        setError(ui(`الحد الأقصى ${maxSizeMb} ميجابايت`));
        return false;
      }
      setError(null);
      return true;
    },
    [maxSizeMb, ui],
  );

  const handleFile = (file: File | null) => {
    if (!file) {
      onChange(null);
      return;
    }
    if (validate(file)) onChange(file);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onKeyDown={(e) => e.key === 'Enter' && document.getElementById('file-input')?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors',
          drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Upload className="mb-2 size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{resolvedLabel}</p>
        <input
          id="file-input"
          type="file"
          className="hidden"
          accept={accept}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {value && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          <span className="truncate">{value.name}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label={ui('إزالة')}>
            <X className="size-4" />
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
