import { useMemo } from 'react';
import type { CafeCategory } from '@/types/cafe';
import { useLocale } from '@/store/locale';
import { CafeCategoryIcon } from '@/components/cafe/cafe-category-icon';

interface PosCategoryGridProps {
  categories: CafeCategory[];
  activeCategoryId: string;
  onSelect: (categoryId: string) => void;
}

interface CategoryChoice {
  id: string;
  name: string;
  emoji: string;
}

export function PosCategoryGrid({ categories, activeCategoryId, onSelect }: PosCategoryGridProps) {
  const { ui, locale } = useLocale();
  const choices = useMemo<CategoryChoice[]>(
    () => [
      { id: 'all', name: ui('الكل'), emoji: 'icon:utensils' },
      ...categories.map((category) => ({
        id: String(category.id),
        name: locale === 'en' ? category.nameEn?.trim() || category.nameAr : category.nameAr,
        emoji: category.emoji || 'icon:utensils',
      })),
    ],
    [categories, locale, ui],
  );

  return (
    <aside className="md:sticky md:top-4 md:w-[200px]">
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-2.5">
        {choices.map((choice) => {
          const selected = choice.id === activeCategoryId;
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => onSelect(choice.id)}
              className={`group relative flex min-h-[4.25rem] w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border px-3.5 text-start shadow-[0_5px_18px_-14px_rgba(240,120,32,.45)] transition hover:-translate-y-0.5 hover:shadow-md ${
                selected
                  ? '!border-primary !bg-primary !text-primary-foreground shadow-lg shadow-primary/25'
                  : 'border-orange-200/80 bg-gradient-to-l from-card to-orange-50/70 hover:border-orange-300 dark:border-orange-900/40 dark:from-card dark:to-orange-950/15'
              }`}
              aria-pressed={selected}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-2 start-0 w-1.5 rounded-e-full ${
                  selected ? 'bg-white/85' : 'bg-orange-500/70'
                }`}
              />
              <span
                className={`min-w-0 truncate text-sm font-black ${
                  selected ? '!text-white' : 'text-foreground'
                }`}
              >
                {choice.name}
              </span>
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full text-orange-700 shadow-sm ring-1 transition-transform group-hover:scale-105 ${
                  selected
                    ? 'bg-white ring-white/60'
                    : 'bg-white ring-orange-100 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-900'
                }`}
                aria-hidden="true"
              >
                <CafeCategoryIcon value={choice.emoji} className="size-5.5" />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
