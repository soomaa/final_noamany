import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Menu, QrCode, Monitor, PartyPopper, Settings, LayoutGrid } from 'lucide-react';
import { useEventLiveBasePath, useEventLiveContext } from './event-live-context';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type LiveScreen = 'display' | 'checkin' | 'program' | 'settings' | 'guest' | 'kiosk';

export type { LiveScreen };

type Props = {
  variant?: 'dark' | 'light';
  current?: LiveScreen;
  className?: string;
};

const NAV_ITEMS: { key: LiveScreen; path: string; label: string; icon: typeof QrCode }[] = [
  { key: 'display', path: '/display', label: uiStatic('شاشة العرض'), icon: Monitor },
  { key: 'checkin', path: '/checkin', label: uiStatic('محطة التسجيل'), icon: QrCode },
  { key: 'program', path: '/program', label: uiStatic('فقرات البرنامج'), icon: PartyPopper },
  { key: 'settings', path: '/settings', label: uiStatic('الإعدادات'), icon: Settings },
];

const darkItemClass =
  'gap-3 cursor-pointer focus:bg-[hsl(var(--grad-green))]/20 focus:text-[hsl(var(--grad-cream))] text-[hsl(var(--grad-cream))]';
const lightItemClass = 'gap-3 cursor-pointer';

/** عناصر التنقل — تُدمج داخل قائمة موجودة أو تُعرض وحدها */
export function EventLiveNavItems({
  current,
  variant = 'dark',
}: {
  current?: LiveScreen;
  variant?: 'dark' | 'light';
}) {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const basePath = useEventLiveBasePath();
  const { eventId } = useEventLiveContext();
  const itemClass = variant === 'light' ? lightItemClass : darkItemClass;

  return (
    <>
      {NAV_ITEMS.map(({ key, path, label, icon: Icon }) => {
        if (key === current) return null;
        return (
          <DropdownMenuItem
            key={key}
            className={itemClass}
            onSelect={() => {
              // تأخير بسيط لضمان إغلاق القائمة قبل التنقل
              setTimeout(() => navigate(`${basePath}${path}`), 0);
            }}
          >
            <Icon className="h-4 w-4 text-[hsl(var(--grad-gold))]" />
            <span className="font-semibold">{label}</span>
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator
        className={variant === 'light' ? undefined : 'bg-[hsl(var(--grad-gold))]/20'}
      />
      <DropdownMenuItem
        className={itemClass}
        onSelect={() => {
          setTimeout(() => navigate(`/club/events/${eventId}?tab=live`), 0);
        }}
      >
        <LayoutGrid className="h-4 w-4 text-[hsl(var(--grad-gold))]" />
        <span className="font-semibold">{ui('عودة لإدارة الفعالية')}</span>
      </DropdownMenuItem>
    </>
  );
}

/** زر القائمة للتنقل بين شاشات العرض الحي */
export function EventLiveNavMenu({ variant = 'dark', current, className }: Props) {
  const { ui } = useLocale();
  const active = current;

  const trigger =
    variant === 'light' ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={ui('قائمة التنقل')}
        className={className}
      >
        <Menu className="h-4 w-4 ml-2" />
        {ui('التنقل')}
      </Button>
    ) : (
      <button
        type="button"
        aria-label={ui('قائمة التنقل')}
        className={
          className ??
          'group flex items-center justify-center h-10 w-10 rounded-full border border-[hsl(var(--grad-gold))]/40 bg-[hsl(var(--grad-green-ink))]/70 backdrop-blur-md shadow-lg shadow-black/40 text-[hsl(var(--grad-cream))] hover:bg-[hsl(var(--grad-green-ink))]/90 hover:border-[hsl(var(--grad-gold))]/70 transition-all'
        }
      >
        <Menu className="h-5 w-5 text-[hsl(var(--grad-gold))] transition-transform group-hover:rotate-90" />
      </button>
    );

  const contentClass =
    variant === 'light'
      ? 'z-[200] w-56 rounded-xl border-border bg-card text-foreground shadow-lg'
      : 'z-[200] w-56 rounded-2xl border-[hsl(var(--grad-gold))]/30 bg-[hsl(var(--grad-green-ink))]/95 backdrop-blur-xl text-[hsl(var(--grad-cream))] shadow-2xl shadow-black/50';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={contentClass}>
        <DropdownMenuLabel
          className={
            variant === 'light'
              ? 'text-xs text-muted-foreground'
              : 'text-[10px] tracking-widest text-[hsl(var(--grad-gold))]/80 uppercase'
          }
        >
          {ui('التنقل بين الشاشات')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator
          className={variant === 'light' ? undefined : 'bg-[hsl(var(--grad-gold))]/20'}
        />
        <EventLiveNavItems current={active} variant={variant} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
