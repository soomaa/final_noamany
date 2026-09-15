import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Menu } from 'lucide-react';
import { EventLiveNavItems, type LiveScreen } from './EventLiveNavMenu';
import { useLocale } from '@/store/locale';

type Props = {
  current: LiveScreen;
  /** عناصر إضافية (إجراءات المحطة مثلاً) */
  children?: ReactNode;
  actionsLabel?: string;
};

/** زر قائمة ثابت وواضح — يظهر دائماً فوق المحتوى */
export function EventLiveFloatingNav({ current, children, actionsLabel }: Props) {
  const { ui } = useLocale();
  return (
    <div className="fixed top-3 left-3 z-[300] print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={ui('قائمة التنقل')}
            className="flex items-center gap-2 h-11 px-4 rounded-full bg-white/95 text-[hsl(213,74%,14%)] border-2 border-[hsl(var(--grad-gold))] shadow-[0_4px_24px_rgba(0,0,0,0.45)] font-bold text-sm hover:bg-white active:scale-95 transition-transform"
          >
            <Menu className="h-5 w-5 text-[hsl(var(--grad-gold-dark))]" />
            {ui('القائمة')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={10}
          className="z-[400] w-60 rounded-2xl border border-[hsl(var(--grad-gold))]/40 bg-[hsl(var(--grad-green-ink))]/98 backdrop-blur-xl text-[hsl(var(--grad-cream))] shadow-2xl"
        >
          <DropdownMenuLabel className="text-[10px] tracking-widest text-[hsl(var(--grad-gold))]/80 uppercase">
            {ui('التنقل بين الشاشات')}
          </DropdownMenuLabel>
          <EventLiveNavItems current={current} />
          {children ? (
            <>
              <DropdownMenuSeparator className="bg-[hsl(var(--grad-gold))]/20" />
              <DropdownMenuLabel className="text-[10px] tracking-widest text-[hsl(var(--grad-gold))]/80 uppercase">
                {actionsLabel ?? ui('إجراءات')}
              </DropdownMenuLabel>
              {children}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
