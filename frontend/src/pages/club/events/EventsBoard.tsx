import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { clubEventsApi } from '@/lib/api/club-events';
import { EVENTS_ROUTES } from '@/lib/events-routes';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const STATUS_TABS = [
  { key: '', label: uiStatic('الكل') },
  { key: 'draft', label: uiStatic('مسودة') },
  { key: 'published', label: uiStatic('منشور') },
  { key: 'ongoing', label: uiStatic('جارٍ') },
  { key: 'completed', label: uiStatic('منتهي') },
] as const;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  ongoing: 'bg-teal-100 text-teal-700',
  completed: 'bg-slate-100 text-slate-700',
  closed: 'bg-slate-200 text-slate-800',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft: uiStatic('مسودة'),
  pending_approval: uiStatic('بانتظار الاعتماد'),
  approved: uiStatic('معتمدة'),
  rejected: uiStatic('مرفوضة'),
  published: uiStatic('منشورة'),
  ongoing: uiStatic('جارية'),
  completed: uiStatic('منتهية'),
  closed: uiStatic('مغلقة'),
  cancelled: uiStatic('ملغاة'),
};

interface EventRow {
  id: number;
  eventNumber: string;
  title: string;
  kind: string;
  status: string;
  startDate: string;
  registrationsCount: number;
}

export function EventsBoard() {
  const { ui, dir } = useLocale();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['club-events', statusFilter],
    queryFn: () =>
      clubEventsApi.listEvents(statusFilter ? { status: statusFilter } : undefined),
  });

  const events: EventRow[] = data?.data ?? [];

  return (
    <div className="p-6 space-y-4" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{ui('الفعاليات والأنشطة')}</h1>
        <Link
          to={EVENTS_ROUTES.create}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {ui('إنشاء فعالية')}
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b pb-0">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={
              'px-4 py-2 text-sm border-b-2 transition-colors ' +
              (statusFilter === tab.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('جاري التحميل...')}</div>
      ) : isError ? (
        <div className="text-sm text-red-500 py-8 text-center">{ui('حدث خطأ أثناء تحميل البيانات')}</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('لا توجد فعاليات')}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('رقم الفعالية')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('العنوان')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('النوع')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الحالة')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('تاريخ البدء')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('المسجلون')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الإجراءات')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map(event => (
                <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{event.eventNumber ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{event.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{event.kind ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' +
                        (STATUS_BADGE_CLASSES[event.status] ?? 'bg-gray-100 text-gray-700')
                      }
                    >
                      {STATUS_LABELS[event.status] ?? event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{event.startDate ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{event.registrationsCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={EVENTS_ROUTES.detail(event.id)}
                      className="text-primary hover:underline text-sm"
                    >
                      {ui('عرض')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
