import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { DateTimeText } from '@/components/common/formatters';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'submitted' | 'cancelled';
  label: string;
  at?: string;
  by?: string;
  note?: string;
}

interface RequestTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const ICONS = {
  pending: Circle,
  approved: CheckCircle2,
  rejected: XCircle,
  submitted: CheckCircle2,
  cancelled: XCircle,
};

const COLORS = {
  pending: 'text-warning',
  approved: 'text-success',
  rejected: 'text-destructive',
  submitted: 'text-primary',
  cancelled: 'text-muted-foreground',
};

export function RequestTimeline({ events, className }: RequestTimelineProps) {
  return (
    <ol className={cn('space-y-4', className)}>
      {events.map((event, i) => {
        const Icon = ICONS[event.status] ?? Circle;
        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Icon className={cn('size-5 shrink-0', COLORS[event.status])} />
              {i < events.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="pb-4">
              <p className="font-medium">{event.label}</p>
              {event.at && (
                <p className="text-xs text-muted-foreground">
                  <DateTimeText value={event.at} />
                  {event.by ? ` — ${event.by}` : ''}
                </p>
              )}
              {event.note && <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
