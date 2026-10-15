import { ArrowRight, Check, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DateText } from '@/components/common/formatters';
import { PageHeader } from '@/components/common/page-header';
import { RequestTimeline, type TimelineEvent } from '@/components/common/request-timeline';
import { PrintView } from '@/components/common/print-view';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { isNotImplemented, useResource } from '@/lib/api-hooks';
import { getRequestType, type RequestTypeKey } from '@/lib/i18n-constants';
import { queryClient } from '@/lib/query';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';

interface RequestDetail {
  id: number;
  type: RequestTypeKey;
  typeLabel?: string;
  employeeName?: string;
  status: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
  effectSnapshot?: SalaryCertificateSnapshot | null;
  timeline?: TimelineEvent[];
}

interface SalaryCertificateSnapshot {
  employeeName?: string | null;
  employeeCode?: number | null;
  jobTitle?: string | null;
  issuedOn?: string | null;
  directedTo?: string | null;
  purpose?: string | null;
  basicSalary?: number;
  allowances?: number;
  deductions?: number;
  grossSalary?: number;
  netBeforeStatutory?: number;
  company?: {
    institute_name?: string;
    address?: string;
    currency?: string;
    currency_symbol?: string;
  } | null;
}

export function RequestDetailPage() {
  const { can } = usePermission();
  const canPrint = can('leaves.requests:print');
  const canApprove = can('leaves.requests:approve');
  const canReject = can('leaves.requests:reject');
  const { t, ui, locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useResource<RequestDetail>('requests', id);

  const approve = async () => {
    const ok = await confirmWithPreview(
      { title: ui('اعتماد الطلب؟'), confirmLabel: ui('اعتماد') },
      async () => {
        const { data } = await api.patch(`/requests/${id}/approve?dryRun=true`);
        return { rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows, warning: (data as { warning?: string }).warning };
      },
      async () => {
        await api.patch(`/requests/${id}/approve`);
        toast.success(ui('تم الاعتماد'));
        void queryClient.invalidateQueries({ queryKey: ['requests'] });
        void refetch();
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
  const statusKey = data.status === 'approved' ? 'approved' : data.status === 'rejected' ? 'rejected' : 'pending';
  const timeline: TimelineEvent[] = data.timeline ?? [
    { id: '1', status: 'submitted', label: ui('تم تقديم الطلب'), at: data.createdAt },
    { id: '2', status: 'pending', label: ui('قيد المراجعة') },
  ];
  const certificate = data.type === 'salary-certificate' ? data.effectSnapshot : null;
  const formatAmount = (value?: number) =>
    new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value ?? 0);

  const content = (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{typeMeta?.label ?? data.typeLabel ?? data.type}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">{ui('الموظف')}</dt><dd className="font-medium">{data.employeeName ?? '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{ui('التاريخ')}</dt><dd><DateText value={data.createdAt} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">{ui('الحالة')}</dt><dd><StatusBadge status={statusKey} /></dd></div>
            </dl>
            {data.payload && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(data.payload, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>
        {canPrint && data.type === 'salary-certificate' && data.status === 'approved' && certificate && (
          <Card>
            <CardHeader><CardTitle className="text-base">{ui('تعريف مرتب — للطباعة')}</CardTitle></CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="space-y-2 leading-7">
                <p className="font-medium">{certificate.company?.institute_name ?? ui('الشركة')}</p>
                <p className="break-words">
                  {ui('تشهد الشركة بأن')} <strong>{certificate.employeeName ?? data.employeeName ?? '—'}</strong>{' '}
                  {ui('يعمل لديها بوظيفة')} <strong>{certificate.jobTitle ?? '—'}</strong>.
                </p>
                {certificate.directedTo ? <p>{ui('موجّه إلى')}: {certificate.directedTo}</p> : null}
                {certificate.purpose ? <p>{ui('الغرض')}: {certificate.purpose}</p> : null}
              </div>
              <dl className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
                <div><dt className="text-muted-foreground">{ui('الراتب الأساسي')}</dt><dd className="nums font-semibold">{formatAmount(certificate.basicSalary)} {certificate.company?.currency_symbol}</dd></div>
                <div><dt className="text-muted-foreground">{ui('البدلات')}</dt><dd className="nums font-semibold">{formatAmount(certificate.allowances)} {certificate.company?.currency_symbol}</dd></div>
                <div><dt className="text-muted-foreground">{ui('إجمالي الراتب')}</dt><dd className="nums font-semibold">{formatAmount(certificate.grossSalary)} {certificate.company?.currency_symbol}</dd></div>
                <div><dt className="text-muted-foreground">{ui('الصافي قبل الاستقطاعات النظامية')}</dt><dd className="nums font-semibold">{formatAmount(certificate.netBeforeStatutory)} {certificate.company?.currency_symbol}</dd></div>
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground">
                <span>{ui('تاريخ الإصدار')}: {certificate.issuedOn ?? '—'}</span>
                <Button variant="outline" onClick={() => window.print()} className="no-print">{ui('طباعة التعريف')}</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{ui('مسار الطلب')}</CardTitle></CardHeader>
        <CardContent>
          <RequestTimeline events={timeline} />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`${ui('طلب')} #${id}`}
        description={typeMeta?.label}
        actions={
          <div className="flex flex-wrap gap-2 no-print">
            {data.status === 'pending' && (canApprove || canReject) && (
              <>
                {canApprove ? <Button size="sm" onClick={() => void approve()}><Check className="size-4" />{ui('اعتماد')}</Button> : null}
                {canReject ? <Button size="sm" variant="destructive" onClick={() => void reject()}><X className="size-4" />{ui('رفض')}</Button> : null}
              </>
            )}
            <Button variant="outline" size="sm" asChild><Link to="/requests"><ArrowRight className="size-4" />{ui('العودة')}</Link></Button>
          </div>
        }
      />
      {data.type === 'salary-certificate' ? <PrintView title={ui('تعريف مرتب')}>{content}</PrintView> : content}
    </div>
  );
}
