import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Eye, Inbox, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { FlowStatusChip, RequestFlowDialog, type FlowStatus } from '@/components/requests/request-flow';
import { Button } from '@/components/ui/button';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

interface OvertimeRow {
  id: number;
  employeeName?: string | null;
  date: string;
  kind?: 'hours' | 'shift';
  kindLabel?: string;
  source?: 'employee' | 'manager';
  sourceLabel?: string;
  publisherName?: string | null;
  hours: number;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'returned';
  flowStatus?: FlowStatus;
  flowStatusLabel?: string;
  currentTo?: string | null;
  canAction?: boolean;
  canResubmit?: boolean;
  returnComment?: string | null;
  resultMessage?: string | null;
}

const TABS = [
  { value: '', label: uiStatic('طلباتي') },
  { value: 'wared', label: uiStatic('بانتظار اعتمادي') },
  { value: 'all', label: uiStatic('كل طلبات الفرع') },
];

/**
 * «طلبات الساعات الإضافية»: employee requests (direct manager → HR) and direct-manager entries
 * (→ HR). Recorded in attendance only on HR approval; the fingerprint decides what is paid.
 */
export function OvertimeRequestsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<OvertimeRow>('overtime-requests', params);
  const [open, setOpen] = useState<number | null>(null);

  const columns: ColumnDef<OvertimeRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'kindLabel',
      header: ui('النوع'),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{ui(row.original.kindLabel ?? 'ساعات إضافية')}</span>
          {row.original.source === 'manager' && (
            <span className="text-xs text-muted-foreground">{ui('من المدير')}{row.original.publisherName ? `: ${row.original.publisherName}` : ''}</span>
          )}
        </div>
      ),
    },
    { accessorKey: 'date', header: ui('التاريخ'), cell: ({ getValue }) => <DateText value={getValue() as string} /> },
    {
      accessorKey: 'hours',
      header: ui('الساعات'),
      cell: ({ row }) => (row.original.kind === 'shift' ? '—' : <span className="nums">{toArabicDigits(Number(row.original.hours))}</span>),
    },
    {
      accessorKey: 'reason',
      header: ui('السبب'),
      cell: ({ row }) => (
        <div className="flex max-w-[18rem] flex-col">
          <span className="truncate">{row.original.reason ?? '—'}</span>
          {row.original.returnComment && <span className="truncate text-xs text-orange-700 dark:text-orange-300">{row.original.returnComment}</span>}
        </div>
      ),
    },
    {
      accessorKey: 'flowStatus',
      header: ui('الحالة'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <FlowStatusChip status={row.original.flowStatus} label={row.original.flowStatusLabel} />
          {row.original.status === 'pending' && row.original.currentTo && <span className="text-xs text-muted-foreground">{row.original.currentTo}</span>}
        </div>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <Button variant={row.original.canAction || row.original.canResubmit ? 'brand' : 'outline'} size="sm" onClick={() => setOpen(row.original.id)}>
          <Eye className="size-4" />
          {row.original.canAction ? ui('مراجعة') : row.original.canResubmit ? ui('تعديل وإعادة إرسال') : ui('تفاصيل')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={ui('طلبات الساعات الإضافية')}
        description={ui('طلب الموظف: المدير المباشر ثم الموارد البشرية — إدخال المدير: الموارد البشرية. لا تُحتسب إلا الساعات التي تؤكدها البصمة')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/requests"><ArrowRight className="size-4" />{ui('طلبات الموظفين')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/requests/inbox"><Inbox className="size-4" />{ui('بانتظار الموافقة')}</Link>
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
      <RequestFlowDialog
        target={open != null ? { kind: 'overtime', id: open } : null}
        onOpenChange={(o) => !o && setOpen(null)}
        onChanged={() => void refetch()}
      />
    </div>
  );
}
