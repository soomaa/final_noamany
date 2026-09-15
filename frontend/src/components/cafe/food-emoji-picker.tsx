import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/store/locale';
import { CAFE_CATEGORY_ICON_GROUPS } from '@/components/cafe/cafe-category-icon';

interface FoodEmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  onClose: () => void;
}

export function FoodEmojiPicker({ value, onChange, onClose }: FoodEmojiPickerProps) {
  const { ui } = useLocale();

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/35 shadow-inner dark:border-sky-900/60 dark:bg-sky-950/10">
      <div className="flex items-center justify-between border-b border-sky-200 bg-background px-3 py-2 dark:border-sky-900/60">
        <div>
          <p className="text-sm font-semibold">{ui('اختاري أيقونة الفئة')}</p>
          <p className="text-xs text-muted-foreground">{ui('أيقونات مطعم وكافيه باللون الأزرق — الاختيار لكِ')}</p>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={ui('إغلاق')}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="max-h-[min(52dvh,480px)] space-y-5 overflow-y-auto p-3">
        {CAFE_CATEGORY_ICON_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-bold text-sky-800 dark:text-sky-300">{ui(group.title)}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.items.map((item) => {
                const Icon = item.icon;
                const selected = item.value === value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onChange(item.value)}
                    className={`relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-background px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md ${
                      selected ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-200 dark:bg-sky-950/35 dark:ring-sky-900' : 'border-sky-100 dark:border-sky-900/40'
                    }`}
                    aria-label={`${ui('اختيار')} ${ui(item.label)}`}
                    aria-pressed={selected}
                  >
                    <span className={`grid size-11 place-items-center rounded-full ${selected ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'}`}>
                      <Icon className="size-6" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="text-[10px] font-bold leading-4">{ui(item.label)}</span>
                    {selected ? (
                      <span className="absolute end-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-sky-600 text-white">
                        <Check className="size-3.5" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
