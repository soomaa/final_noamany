import { Link } from 'react-router-dom';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEventLiveContext } from './event-live-context';
import { useLocale } from '@/store/locale';

type Props = {
  label?: string;
  variant?: 'button' | 'menu-item' | 'ghost';
  className?: string;
};

/** العودة لصفحة إدارة الفعالية (تبويب العرض الحي) */
export function EventLiveBackLink({
  label,
  variant = 'button',
  className,
}: Props) {
  const { ui } = useLocale();
  const { eventId } = useEventLiveContext();
  const resolvedLabel = label ?? ui('عودة لإدارة الفعالية');
  const href = `/club/events/${eventId}?tab=live`;

  if (variant === 'menu-item') {
    return (
      <Link
        to={href}
        className={`flex items-center gap-3 py-2.5 text-[hsl(var(--grad-cream))] hover:text-white ${className ?? ''}`}
      >
        <LayoutGrid className="h-4 w-4 text-[hsl(var(--grad-gold))]" />
        <span className="font-semibold">{resolvedLabel}</span>
      </Link>
    );
  }

  if (variant === 'ghost') {
    return (
      <Link
        to={href}
        className={`inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
      >
        <ArrowRight className="h-4 w-4" />
        {resolvedLabel}
      </Link>
    );
  }

  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link to={href}>
        <ArrowRight className="h-4 w-4 ml-2" />
        {resolvedLabel}
      </Link>
    </Button>
  );
}
