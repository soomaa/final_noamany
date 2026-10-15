import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiError } from '@/lib/api';
import { clubEventsApi } from '@/lib/api/club-events';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/page-header';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RegistrationsTab } from './RegistrationsTab';
import { EventLiveHub } from './live/EventLiveHub';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type EventStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'ongoing'
  | 'completed'
  | 'closed'
  | 'cancelled';

/** Mirrors backend TRANSITIONS in club-events.service.ts — kept in sync intentionally. */
const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  approved: ['published', 'cancelled'],
  rejected: ['draft'],
  published: ['ongoing', 'cancelled'],
  ongoing: ['completed', 'cancelled'],
  completed: ['closed'],
  closed: [],
  cancelled: [],
};

const PRE_COMPLETED: EventStatus[] = ['draft', 'pending_approval', 'approved', 'published', 'ongoing'];

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

const TRANSITION_BUTTON_LABEL: Record<string, string> = {
  pending_approval: uiStatic('إرسال للاعتماد'),
  approved: uiStatic('اعتماد'),
  rejected: uiStatic('رفض'),
  published: uiStatic('نشر'),
  ongoing: uiStatic('بدء الفعالية'),
  completed: uiStatic('إنهاء الفعالية'),
  closed: uiStatic('إغلاق'),
  draft: uiStatic('إعادة إلى مسودة'),
  cancelled: uiStatic('إلغاء'),
};

/** Transitions that require a reason/notes field in the confirmation dialog. */
const REASON_REQUIRED = new Set<string>(['rejected', 'cancelled']);

interface EventDetail {
  id: number;
  eventNumber: string;
  title: string;
  description: string | null;
  kind: string;
  branchId: number;
  venueName: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  maxCapacity: number;
  waitlistCapacity: number;
  registrationsCount: number;
  attendedCount: number;
  status: string;
  isFree: boolean;
  allowGuests: boolean;
  requiresGuardianConsent: boolean;
  registrationOpen: boolean;
  category: { id: number; nameAr: string; nameEn: string | null; kind: string } | null;
  tiers?: Array<{
    id: number;
    name: string;
    audience: string;
    price: number;
    earlyBirdPrice: number | null;
    earlyBirdUntil: string | null;
  }>;
}

const TABS = [
  { key: 'overview', label: uiStatic('نظرة عامة') },
  { key: 'live', label: uiStatic('العرض الحي') },
  { key: 'registrations', label: uiStatic('التسجيلات') },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function StatusTransitionDialog({
  eventId,
  toStatus,
  open,
  onOpenChange,
}: {
  eventId: number;
  toStatus: EventStatus | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { ui, dir } = useLocale();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => clubEventsApi.changeEventStatus(eventId, { status: toStatus!, reason: reason || undefined }),
    onSuccess: () => {
      toast.success(ui('تم تحديث حالة الفعالية'));
      void qc.invalidateQueries({ queryKey: ['club-event', String(eventId)] });
      void qc.invalidateQueries({ queryKey: ['club-events'] });
      setReason('');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  if (!toStatus) return null;
  const reasonRequired = REASON_REQUIRED.has(toStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" aria-describedby={undefined} dir={dir}>
        <DialogHeader>
          <DialogTitle>{TRANSITION_BUTTON_LABEL[toStatus] ?? ui('تغيير الحالة')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{reasonRequired ? ui('السبب *') : ui('ملاحظات (اختياري)')}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ui('إلغاء')}
          </Button>
          <Button
            variant={toStatus === 'cancelled' || toStatus === 'rejected' ? 'destructive' : 'default'}
            disabled={mutation.isPending || (reasonRequired && !reason.trim())}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? ui('جاري الحفظ...') : ui('تأكيد')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventWorkspace() {
  const { ui, dir } = useLocale();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('overview');
  const [pendingStatus, setPendingStatus] = useState<EventStatus | null>(null);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'registrations' || t === 'live' || t === 'overview') {
      setTab(t);
    }
  }, [searchParams]);

  const { data: event, isLoading } = useQuery({
    queryKey: ['club-event', id],
    queryFn: () => clubEventsApi.getEvent(id!) as Promise<EventDetail>,
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">{ui('جاري التحميل...')}</div>;
  if (!event) return <div className="p-6 text-sm text-muted-foreground">{ui('لم يتم العثور على الفعالية')}</div>;

  const status = event.status as EventStatus;
  const nextStatuses = TRANSITIONS[status] ?? [];
  const canCancel = PRE_COMPLETED.includes(status) && !nextStatuses.includes('cancelled');
  const availableActions = [...nextStatuses, ...(canCancel ? (['cancelled'] as EventStatus[]) : [])];

  return (
    <div className="p-6 space-y-4" dir={dir}>
      <PageHeader
        title={event.title}
        description={event.eventNumber}
        actions={
          <div className="flex items-center gap-2">
            {availableActions.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'cancelled' || s === 'rejected' ? 'destructive' : 'outline'}
                onClick={() => setPendingStatus(s)}
              >
                {TRANSITION_BUTTON_LABEL[s] ?? s}
              </Button>
            ))}
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_BADGE_CLASSES[status] ?? 'bg-gray-100 text-gray-700')}>
          {STATUS_LABELS[status] ?? status}
        </span>
        {event.category && <span className="text-sm text-muted-foreground">{event.category.nameAr}</span>}
      </div>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 text-sm border-b-2 transition-colors ' +
              (tab === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">{ui('النوع: ')}</span>{event.kind}</div>
          <div><span className="text-muted-foreground">{ui('الفرع: ')}</span>{event.branchId}</div>
          <div><span className="text-muted-foreground">{ui('المكان: ')}</span>{event.venueName ?? '—'}</div>
          <div><span className="text-muted-foreground">{ui('تاريخ البدء: ')}</span>{event.startDate}</div>
          <div><span className="text-muted-foreground">{ui('تاريخ الانتهاء: ')}</span>{event.endDate}</div>
          <div><span className="text-muted-foreground">{ui('الطاقة الاستيعابية: ')}</span>{event.maxCapacity || ui('غير محدودة')}</div>
          <div><span className="text-muted-foreground">{ui('المسجلون: ')}</span>{event.registrationsCount}</div>
          <div><span className="text-muted-foreground">{ui('الحضور: ')}</span>{event.attendedCount}</div>
          <div><span className="text-muted-foreground">{ui('التسجيل متاح الآن: ')}</span>{event.registrationOpen ? ui('نعم') : ui('لا')}</div>
          <div><span className="text-muted-foreground">{ui('السماح بالضيوف: ')}</span>{event.allowGuests ? ui('نعم') : ui('لا')}</div>
          {event.description && (
            <div className="col-span-2">
              <span className="text-muted-foreground">{ui('الوصف: ')}</span>
              {event.description}
            </div>
          )}
        </div>
      )}

      {tab === 'live' && <EventLiveHub />}

      {tab === 'registrations' && <RegistrationsTab event={event} />}

      <StatusTransitionDialog
        eventId={event.id}
        toStatus={pendingStatus}
        open={pendingStatus != null}
        onOpenChange={(v) => !v && setPendingStatus(null)}
      />
    </div>
  );
}
