import { ExternalLink, Loader2, Upload, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFileUpload, uploadUrl, type UploadCategory } from './use-uploads';
import { useLocale } from '@/store/locale';

interface UploadFieldProps {
  category: UploadCategory;
  /** Current stored path (e.g. employees.personal_photo). */
  value?: string | null;
  onChange: (path: string | null) => void;
  accept?: string;
  className?: string;
  /** Render an image preview (emp-photo / signature / iban scans). */
  preview?: boolean;
  label?: string;
}

/**
 * Self-contained upload control: on file select it uploads immediately to
 * /api/uploads/:category, stores the returned { path } via onChange, shows a
 * spinner while uploading, and previews the existing/just-uploaded file.
 */
export function UploadField({
  category,
  value,
  onChange,
  accept,
  className,
  preview = true,
  label,
}: UploadFieldProps) {
  const { ui } = useLocale();
  const resolvedLabel = label ?? ui('اسحب الملف هنا أو انقر للاختيار');
  const { upload, uploading } = useFileUpload();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const url = uploadUrl(value);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const path = await upload(category, file);
    if (path) onChange(path);
  };

  const isImage = preview && url && !/\.pdf($|\?)/i.test(url);

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-busy={uploading}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handleFile(e.dataTransfer.files[0] ?? null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="mb-2 size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{ui('جارٍ الرفع…')}</p>
          </>
        ) : isImage ? (
          <img src={url!} alt="" className="max-h-40 rounded-lg object-contain" />
        ) : (
          <>
            <Upload className="mb-2 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{resolvedLabel}</p>
          </>
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </div>
      {url && !uploading && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 truncate text-primary hover:underline"
          >
            {fileName ?? ui('الملف الحالي')} <ExternalLink className="size-3.5 shrink-0" />
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              onChange(null);
              setFileName(null);
            }}
            aria-label={ui('إزالة')}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
