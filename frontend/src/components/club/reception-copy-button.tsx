import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';

export function ReceptionCopyButton({ value, label, resolveValue }: {
  value: string | null | undefined;
  label: string;
  resolveValue?: () => Promise<string | null>;
}) {
  const { ui } = useLocale();
  const [copying, setCopying] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-busy={copying || undefined}
      disabled={!value || copying}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setCopying(true);
        try {
          const text = resolveValue ? await resolveValue() : value;
          // Never put a masked placeholder into the clipboard as if it were a phone number.
          if (!text || /[*•]/.test(text)) throw new Error('Value unavailable');
          await navigator.clipboard.writeText(text);
          toast.success(ui('تم النسخ'));
        } catch {
          toast.error(ui('تعذر النسخ؛ تأكد من صلاحية عرض القيمة أو انسخها يدويًا'));
        } finally {
          setCopying(false);
        }
      }}
    >
      {copying ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Copy aria-hidden="true" className="size-4" />}
    </button>
  );
}
