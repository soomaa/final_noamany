import { Delete, X } from 'lucide-react';
import { useLocale } from '@/store/locale';
import type { ReactNode } from 'react';
import { toArabicDigits } from '@/lib/utils';
import { keyboardKeypadKey } from '@/lib/touch-keypad';

export function TouchKeypad({ value, title, decimal, summary, press, close, showDone = true, hideClose = false }: {
  value: string; title: string; decimal: boolean; summary?: ReactNode; press: (key: string) => void; close: () => void;
  showDone?: boolean;
  hideClose?: boolean;
}) {
  const { ui } = useLocale();
  return <div className="space-y-3" onKeyDown={event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], fieldset:disabled')) return;
    const key = keyboardKeypadKey(event.key);
    if (key === null) return;
    event.preventDefault();
    press(key);
  }}>
    <div className="flex items-center justify-between gap-3"><b className="text-sm">{title}</b>{!hideClose && <button type="button" onClick={close} aria-label={ui('إغلاق لوحة الأرقام')} className="grid size-11 place-items-center rounded-lg hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><X className="size-5" /></button>}</div>
    <div dir="ltr" className="nums overflow-x-auto rounded-xl bg-muted px-4 py-3 text-end text-3xl font-bold" aria-live="polite">{toArabicDigits(value || '0')}</div>
    {summary}
    <div dir="ltr" className="grid grid-cols-3 gap-2">
      {['1','2','3','4','5','6','7','8','9', decimal ? '.' : 'clear','0','backspace'].map((key) => <button key={key} type="button" onClick={() => press(key)} aria-label={key === 'backspace' ? ui('حذف آخر رقم') : key === 'clear' ? ui('مسح') : key} className="grid min-h-12 touch-manipulation place-items-center rounded-xl border border-border bg-background text-2xl font-bold transition-colors hover:bg-muted active:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{key === 'backspace' ? <Delete className="size-6" /> : key === 'clear' ? <span className="text-sm">{ui('مسح')}</span> : key}</button>)}
    </div>
    <div className="flex gap-2"><button type="button" onClick={() => press('clear')} className="min-h-11 flex-1 rounded-xl border px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary">{ui('مسح الكل')}</button>{showDone && <button type="button" onClick={close} className="min-h-11 flex-1 rounded-xl bg-primary px-4 font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring">{ui('تم')}</button>}</div>
  </div>;
}
