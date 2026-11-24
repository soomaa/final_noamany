import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { SearchableSelect } from '@/components/common/searchable-select';
import { FlowStatusChip, RequestFlowDialog, type FlowKind, type FlowStatus } from '@/components/requests/request-flow';
import { Button } from '@/components/ui/button';
import { useBranches } from '@/hooks/use-branches';
import { usePaginatedList } from '@/lib/api-hooks';
import { uiStatic } from '@/lib/ui-static';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface InboxRow {
  key: string;
  kind: FlowKind;
  kindLabel: string;
  id: number;
  employeeName?: string | null;
  branchName?: string | null;
  summary: string;
  flowStatus: FlowStatus;
  flowStatusLabel: string;
  currentTo?: string | null;
  returned: boolean;
  returnComment?: string | null;
  createdAt?: string | null;
  routedToMe: boolean;
  override: boolean;
  canAction: boolean;
}

interface InboxResponse {
  data: InboxRow[];
  total: number;
  isHr?: boolean;
  scope?: 'all' | 'mine';
  counts?: { total: number; byType: Record<FlowKind, number>; byStage: Record<string, number> };
}

const STAGES = [
  { value: '', label: uiStatic('كل المراحل') },
  { value: 'manager', label: uiStatic('بانتظار المدير') },
  { value: 'hr', label: uiStatic('بانتظار HR') },
  { value: 'dept', label: uiStatic('بانتظار مدير الإدارة') },
  { value: 'returned', label: uiStatic('مرتجع') },
];

/**
 * «بانتظار الموافقة»: every open leave / permission / overtime request. HR and admins see all
 * of them (also those routed to someone else — acting is logged as an override); others see
 * what waits for them and what was returned to them.
 */
export function RequestsInboxPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InboxRow>('requests/inbox', params);
  const inbox = data as InboxResponse | undefined;
  const { data: branches = [] } = useBranches();
  const [open, setOpen] = useState<{ kind: FlowKind; id: number } | null>(null);
  const counts = inbox?.counts;

  const typeTabs = [
    { value: '', label: ui('الكل'), count: counts?.total },
    { value: 'leave', label: ui('إجازات'), count: counts?.byType.leave },
    { value: 'permission', label: ui('أذونات'), count: counts?.byType.permission },
    { value: 'overtime', label: ui('ساعات / شيفتات إضافية'), count: counts?.byType.overtime },
  ].map((t) => ({ ...t, label: t.count != null ? `${t.label} (${toArabicDigits(t.count)})` : t.label }));

  const columns: ColumnDef<InboxRow>[] = [
    { accessorKey: 'kindLabel', header: ui('النوع'), cell: ({ getValue }) => ui(String(getValue() ?? '')) },
    { accessorKey: 'employeeName', header: ui('الموظف'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'branchName', header: ui('الفرع'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'summary',
      header: ui('التفاصيل'),
      cell: ({ row }) => (
        <div className="flex max-w-[22rem] flex-col">
          <span className="truncate">{row.original.summary}</span>
          {row.original.returned && row.original.returnComment && (
            <span className="truncate text-xs text-orange-700 dark:text-orange-300">{row.original.returnComment}</span>
          )}
        </div>
      ),
    },
    { accessorKey: 'createdAt', header: ui('التاريخ'), cell: ({ getValue }) => <DateText value={getValue() as string | undefined} /> },
    {
      accessorKey: 'flowStatus',
      header: ui('الحالة'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <FlowStatusChip status={row.original.flowStatus} label={row.original.flowStatusLabel} />
          {row.original.currentTo && <span className="text-xs text-muted-foreground">{row.original.currentTo}</span>}
        </div>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <Button size="sm" variant={row.original.canAction ? 'brand' : 'outline'} onClick={() => setOpen({ kind: row.original.kind, id: row.original.id })}>
          <Eye className="size-4" />
          {row.original.canAction ? ui('مراجعة') : row.original.returned && row.original.routedToMe ? ui('تعديل') : ui('تفاصيل')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={ui('بانتظار الموافقة')}
        description={
          inbox?.isHr
            ? ui('كل الطلبات المفتوحة (إجازات، أذونات، إضافي) — تقدر تاخد قرار في أي طلب ويتسجل كتجاوز')
            : ui('الطلبات المحولة ليك والطلبات اللي رجعتلك للتعديل')
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/requests"><ArrowRight className="size-4" />{ui('طلبات الموظفين')}</Link>
          </Button>
        }
      />
      <ListStatusTabs tabs={typeTabs} paramKey="type" />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchableSelect
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={params.filters.stage ?? ''}
          onChange={(e) => setParams({ filters: { stage: e.target.value }, page: 1 })}
          aria-label={ui('المرحلة')}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}{s.value && counts?.byStage[s.value] != null ? ` (${toArabicDigits(counts.byStage[s.value])})` : ''}
            </option>
          ))}
        </SearchableSelect>
        <SearchableSelect
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={params.filters.branchId ?? ''}
          onChange={(e) => setParams({ filters: { branchId: e.target.value }, page: 1 })}
          aria-label={ui('الفرع')}
        >
          <option value="">{ui('كل الفروع')}</option>
          {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name ?? `#${b.id}`}</option>)}
        </SearchableSelect>
      </div>
      <DataTable
        columns={columns}
        data={inbox?.data ?? []}
        total={inbox?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('مفيش طلبات بانتظار الموافقة')}
      />
      <RequestFlowDialog target={open} onOpenChange={(o) => !o && setOpen(null)} onChanged={() => void refetch()} />
    </div>
  );
}
