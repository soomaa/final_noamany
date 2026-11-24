import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Check, Eye, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

interface OvertimeHistory {
  at: string;
  byName?: string | null;
  action: string;
  stage?: string | null;
  note?: string | null;
}

interface OvertimeRow {
  id: number;
  employeeName?: string | null;
  date: string;
  hours: number;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  statusLabel?: string;
  stageLabel?: string | null;
  currentTo?: string | null;
  canAction?: boolean;
  decisionReason?: string | null;
  resultMessage?: string | null;
  createdAt?: string | null;
  history?: OvertimeHistory[];
}

const TABS = [
  { value: '', label: uiStatic('طلباتي') },
  { value: 'wared', label: uiStatic('بانتظار اعتمادي') },
  { value: 'all', label: uiStatic('كل طلبات الفرع') },
];

const ACTION_LABEL: Record<string, string> = {
  submit: uiStatic('تقديم الطلب'),
  accept: uiStatic('اعتماد'),
  reject: uiStatic('رفض'),
  skip: uiStatic('تخطي'),
  cancel: uiStatic('إلغاء'),
  recorded: uiStatic('تسجيل الساعات في الحضور'),
};

/** «طلبات الساعات الإضافية»: employee requests, direct manager → HR, then recorded in attendance. */
export function OvertimeRequestsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<OvertimeRow>('overtime-requests', params);
  const [details, setDetails] = useState<OvertimeRow | null>(null);
  const [deciding, setDeciding] = useState<{ row: OvertimeRow; action: 'accept' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');

  const actionMutation = useMutationWithToast(
    ({ id, action, reason }: { id: number; action: 'accept' | 'reject'; reason?: string }) =>
      api.post(`/overtime-requests/${id}/action`, { action, reason }),
    {
      success: ui('تم حفظ القرار'),
      invalidate: ['overtime-requests'],
      onSuccess: () => {
        setDeciding(null);
        setReason('');
      },
    },
  );

  const columns: ColumnDef<OvertimeRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'date', header: ui('التاريخ'), cell: ({ getValue }) => <DateText value={getValue() as string} /> },
    { accessorKey: 'hours', header: ui('الساعات'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(Number(getValue()))}</span> },
    { accessorKey: 'reason', header: ui('السبب'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'currentTo',
      header: ui('الطلب الآن عند'),
      cell: ({ row }) =>
        row.original.status === 'pending' ? `${row.original.stageLabel ?? ''}${row.original.currentTo ? ` — ${row.original.currentTo}` : ''}` : '—',
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ row }) => {
        const s = row.original.status;
        return <StatusBadge status={s === 'approved' ? 'approved' : s === 'pending' ? 'pending' : 'rejected'} label={row.original.statusLabel} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setDetails(row.original)}>
            <Eye className="size-4" /> {ui('تفاصيل')}
          </Button>
          {row.original.canAction && <>
            <Button variant="outline" size="sm" onClick={() => setDeciding({ row: row.original, action: 'accept' })}>
              <Check className="size-4 text-success" /> {ui('اعتماد')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeciding({ row: row.original, action: 'reject' })}>
              <X className="size-4 text-destructive" /> {ui('رفض')}
            </Button>
          </>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={ui('طلبات الساعات الإضافية')}
        description={ui('المدير المباشر ثم الموارد البشرية — لا تُحتسب إلا الساعات التي تؤكدها البصمة')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/requests"><ArrowRight className="size-4" />{ui('طلبات الموظفين')}</Link>
            </Button>
            <Button variant="brand" asChild>
              <Link to="/requests/new/overtime"><Plus className="size-4" />{ui('طلب ساعات إضافية')}</Link>
            </Button>
          </div>
        }
      />
      <ListStatusTabs tabs={TABS} paramKey="mode" />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('لا توجد طلبات ساعات إضافية')}
      />

      <Dialog open={deciding != null} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{deciding?.action === 'accept' ? ui('اعتماد طلب الساعات الإضافية') : ui('رفض طلب الساعات الإضافية')}</DialogTitle>
            <DialogDescription>
              {deciding && `${deciding.row.employeeName ?? ''} — ${toArabicDigits(deciding.row.hours)} ${ui('ساعة')} (${deciding.row.date})`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{ui('ملاحظة')}</label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
            {deciding?.action === 'accept' && (
              <p className="text-sm text-muted-foreground">{ui('عند الاعتماد النهائي تُسجل الساعات في الحضور وتُطبق مراجعة البصمة.')}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>{ui('إلغاء')}</Button>
            <Button
              variant={deciding?.action === 'reject' ? 'destructive' : 'brand'}
              disabled={!deciding || actionMutation.isPending}
              onClick={() => deciding && actionMutation.mutate({ id: deciding.row.id, action: deciding.action, reason: reason.trim() || undefined })}
            >
              {deciding?.action === 'accept' ? ui('اعتماد') : ui('رفض')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={details != null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('تفاصيل طلب الساعات الإضافية')}</DialogTitle>
            <DialogDescription>{details?.employeeName ?? ''}</DialogDescription>
          </DialogHeader>
          {details && <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [ui('التاريخ'), <DateText value={details.date} />],
                [ui('الساعات'), toArabicDigits(details.hours)],
                [ui('الحالة'), details.statusLabel ?? details.status],
                [ui('السبب'), details.reason ?? '—'],
                [ui('نتيجة التسجيل'), details.resultMessage ?? '—'],
                [ui('ملاحظة القرار'), details.decisionReason ?? '—'],
              ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-medium">{value}</p>
              </div>)}
            </div>
            <ol className="space-y-1 text-sm">
              {(details.history ?? []).map((h, index) => (
                <li key={index} className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground"><DateText value={h.at} /></span>
                  <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                  {h.byName && <span>— {h.byName}</span>}
                  {h.note && <span className="text-muted-foreground">({h.note})</span>}
                </li>
              ))}
            </ol>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
