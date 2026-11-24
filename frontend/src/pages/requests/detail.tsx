import { useMemo, useState } from 'react';
import { ArrowRight, Check, LogOut, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DateText } from '@/components/common/formatters';
import { PageHeader } from '@/components/common/page-header';
import { RequestTimeline, type TimelineEvent } from '@/components/common/request-timeline';
import { PrintView } from '@/components/common/print-view';
import { RequestStatusChip } from '@/components/requests/request-flow';
import { useBranches } from '@/hooks/use-branches';
import { toArabicDigits } from '@/lib/utils';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { isNotImplemented, useResource } from '@/lib/api-hooks';
import { getRequestType, type RequestTypeKey } from '@/lib/i18n-constants';
import { queryClient } from '@/lib/query';
import { useLocale } from '@/store/locale';
import { EmployeeExitDialog, type ExitType } from '@/components/employees/employee-exit-dialog';

/** Pre-filled exit record for an approved resignation (GET /requests/:id/exit-draft). */
interface ExitDraft {
  empId: number;
  employeeName?: string | null;
  exitType: ExitType;
  noticeGivenDate: string;
  lastWorkingDate: string;
  requiredNoticeDays: number;
  noticeShortfallDays: number;
  reason?: string | null;
  existingExitId?: number | null;
  message?: string;
}

/** Readable names for the request form fields (pages/requests/new.tsx). Ids without a name stay hidden. */
const PAYLOAD_LABELS: Record<string, string> = {
  date_from: 'من',
  date_to: 'إلى',
  permission_date: 'التاريخ',
  time_from: 'من الساعة',
  time_to: 'إلى الساعة',
  amount: 'المبلغ',
  installments: 'عدد الأقساط',
  purpose: 'الغرض',
  directed_to: 'موجّه إلى',
  last_work_day: 'آخر يوم عمل',
  target_branch_id: 'الفرع المطلوب',
  new_job_title: 'المسمى الوظيفي الجديد',
  new_salary: 'الراتب المقترح',
  field_name: 'البيان المطلوب تعديله',
  old_value: 'القيمة الحالية',
  new_value: 'القيمة الجديدة',
  overtime_date: 'تاريخ الإضافي',
  hours: 'عدد الساعات',
  reason: 'السبب',
  notes: 'ملاحظات',
};

interface RequestDetail {
  id: number;
  type: RequestTypeKey;
  typeLabel?: string;
  employeeName?: string;
  status: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
  timeline?: TimelineEvent[];
  exitPending?: boolean;
}

export function RequestDetailPage() {
  const { t, ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useResource<RequestDetail>('requests', id);
  const { data: branches = [] } = useBranches();
  const [exitDraft, setExitDraft] = useState<ExitDraft | null>(null);
  // Stable objects: the dialog resets its form whenever these change.
  const exitEmployee = useMemo(
    () => (exitDraft ? { id: exitDraft.empId, name: exitDraft.employeeName ?? data?.employeeName ?? '' } : null),
    [exitDraft, data?.employeeName],
  );
  const exitDefaults = useMemo(
    () =>
      exitDraft
        ? {
            exitType: exitDraft.exitType,
            noticeGivenDate: exitDraft.noticeGivenDate,
            lastWorkingDate: exitDraft.lastWorkingDate,
            requiredNoticeDays: exitDraft.requiredNoticeDays,
            reason: exitDraft.reason ?? undefined,
            notes: `${ui('من طلب استقالة')} #${id}`,
          }
        : undefined,
    [exitDraft, id, ui],
  );

  /** Resignation: open the exit dialog pre-filled (the record is created only when HR saves it). */
  const openExit = async (draft?: ExitDraft | null) => {
    try {
      const d = draft ?? (await api.get<ExitDraft>(`/requests/${id}/exit-draft`)).data;
      if (!d) return;
      if (d.existingExitId) {
        toast.info(d.message ?? ui('للموظف سجل انتهاء خدمة بالفعل'));
        return;
      }
      setExitDraft(d);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const approve = async () => {
    const ok = await confirmWithPreview(
      { title: ui('اعتماد الطلب؟'), confirmLabel: ui('اعتماد') },
      async () => {
        const { data } = await api.patch(`/requests/${id}/approve?dryRun=true`);
        return { rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows, warning: (data as { warning?: string }).warning };
      },
      async () => {
        const { data: approved } = await api.patch<{ exitDraft?: ExitDraft | null }>(`/requests/${id}/approve`);
        toast.success(ui('تم الاعتماد'));
        void queryClient.invalidateQueries({ queryKey: ['requests'] });
        void refetch();
        if (approved?.exitDraft) {
          toast.info(approved.exitDraft.message ?? ui('سجل انتهاء الخدمة'));
          void openExit(approved.exitDraft);
        }
      },
    );
    if (!ok) return;
  };

  const reject = async () => {
    const ok = await confirm({ title: ui('رفض الطلب؟'), variant: 'destructive', confirmLabel: ui('رفض') });
    if (!ok) return;
    try {
      await api.patch(`/requests/${id}/reject`);
      toast.success(ui('تم الرفض'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('تفاصيل الطلب')} />
        <NotImplementedState />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) return <NotImplementedState title={ui('الطلب غير موجود')} />;

  const typeMeta = getRequestType(t, data.type);
  const typeLabel = typeMeta?.label ?? data.typeLabel ?? data.type;
  // Only what the server recorded; nothing is invented when it has no history.
  const timeline: TimelineEvent[] = (data.timeline ?? []).map((event) => ({ ...event, label: ui(event.label) }));
  const payloadValue = (key: string, value: unknown): string => {
    if (key === 'target_branch_id') return branches.find((b) => String(b.id) === String(value))?.name ?? String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return toArabicDigits(String(value));
  };
  const payloadRows = Object.entries(data.payload ?? {})
    .filter(([key, value]) => PAYLOAD_LABELS[key] && value != null && value !== '')
    .map(([key, value]) => ({ key, label: ui(PAYLOAD_LABELS[key]), value: payloadValue(key, value) }));

  const content = (
    <div className={timeline.length ? 'grid gap-6 lg:grid-cols-3' : 'space-y-4'}>
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{typeLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">{ui('الموظف')}</dt><dd className="font-medium">{data.employeeName ?? '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{ui('التاريخ')}</dt><dd><DateText value={data.createdAt} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">{ui('الحالة')}</dt><dd><RequestStatusChip status={data.status} /></dd></div>
            </dl>
            {payloadRows.length > 0 && (
              <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                {payloadRows.map((row) => (
                  <div key={row.key} className={row.key === 'reason' || row.key === 'notes' ? 'sm:col-span-2' : undefined}>
                    <dt className="text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="whitespace-pre-wrap font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
        {data.type === 'salary-certificate' && data.status === 'approved' && (
          <Card>
            <CardHeader><CardTitle className="text-base">{ui('تعريف مرتب — للطباعة')}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{ui('اطبع الطلب المعتمد ببيانات الموظف والغرض والجهة الموجّه إليها.')}</p>
              <Button variant="outline" className="no-print" onClick={() => window.print()}>{ui('طباعة التعريف')}</Button>
            </CardContent>
          </Card>
        )}
      </div>
      {timeline.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{ui('مسار الطلب')}</CardTitle></CardHeader>
          <CardContent>
            <RequestTimeline events={timeline} />
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={data.employeeName ? `${typeLabel} — ${data.employeeName}` : typeLabel}
        description={`${ui('رقم الطلب')} ${toArabicDigits(id ?? '')}`}
        actions={
          <div className="flex flex-wrap gap-2 no-print">
            {data.status === 'pending' && (
              <>
                <Button size="sm" onClick={() => void approve()}><Check className="size-4" />{ui('اعتماد')}</Button>
                <Button size="sm" variant="destructive" onClick={() => void reject()}><X className="size-4" />{ui('رفض')}</Button>
              </>
            )}
            {data.type === 'resignation' && data.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={() => void openExit()}><LogOut className="size-4" />{ui('تسجيل انتهاء الخدمة')}</Button>
            )}
            <Button variant="outline" size="sm" asChild><Link to="/requests"><ArrowRight className="size-4" />{ui('العودة')}</Link></Button>
          </div>
        }
      />
      {data.type === 'salary-certificate' ? <PrintView title={ui('تعريف مرتب')}>{content}</PrintView> : content}
      <EmployeeExitDialog
        open={exitDraft != null}
        onOpenChange={(o) => !o && setExitDraft(null)}
        employee={exitEmployee}
        defaults={exitDefaults}
        onSaved={() => void refetch()}
      />
    </div>
  );
}
