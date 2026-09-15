import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface LeaveRow {
  id: number;
  requestNumber?: number;
  submittedAt?: string;
  employeeName?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  status?: string;
  canAction?: boolean;
  canManage?: boolean;
  currentTo?: string;
  reason?: string;
  returnToWorkDate?: string;
  addressSinceAgaza?: string;
}

const LEAVE_STATUS_TABS = [
  { value: '', label: uiStatic('كل الطلبات') },
  { value: 'sader', label: uiStatic('الصادرة') },
  { value: 'wared', label: uiStatic('الواردة') },
  { value: 'accept', label: uiStatic('المقبولة') },
  { value: 'reject', label: uiStatic('المرفوضة') },
];

export function LeavesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveRow>('leaves', params);
  const [detailsFor, setDetailsFor] = useState<LeaveRow | null>(null);
  const [editing, setEditing] = useState<LeaveRow | null>(null);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', returnToWorkDate: '', reason: '', addressSinceAgaza: '' });

  const approveMutation = useMutationWithToast(
    (id: number) => api.post(`/leaves/${id}/approve`),
    { success: ui('تم اعتماد الإجازة'), invalidate: ['leaves'] },
  );

  const rejectMutation = useMutationWithToast(
    (id: number) => api.post(`/leaves/${id}/reject`),
    { success: ui('تم رفض الإجازة'), invalidate: ['leaves'] },
  );

  const updateMutation = useMutationWithToast(
    ({ id, ...body }: { id: number; startDate: string; endDate: string; returnToWorkDate: string; reason: string; addressSinceAgaza: string }) =>
      api.patch(`/leaves/${id}`, body),
    { success: ui('تم تعديل طلب الإجازة'), invalidate: ['leaves'], onSuccess: () => setEditing(null) },
  );

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/leaves/${id}`),
    { success: ui('تم حذف طلب الإجازة نهائيًا'), invalidate: ['leaves'] },
  );

  const handleApprove = async (row: LeaveRow) => {
    const ok = await confirm({
      title: ui('اعتماد الإجازة'),
      description: `${ui('هل تريد اعتماد إجازة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('اعتماد'),
    });
    if (ok) approveMutation.mutate(row.id);
  };

  const handleReject = async (row: LeaveRow) => {
    const ok = await confirm({
      title: ui('رفض الإجازة'),
      description: `${ui('هل تريد رفض إجازة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('رفض'),
      variant: 'destructive',
    });
    if (ok) rejectMutation.mutate(row.id);
  };

  const handleDelete = async (row: LeaveRow) => {
    const ok = await confirm({
      title: ui('حذف طلب الإجازة'),
      description: ui('سيُحذف هذا الطلب نهائيًا ولا يمكن استعادته. هل تريد المتابعة؟'),
      confirmLabel: ui('حذف نهائي'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openEdit = (row: LeaveRow) => {
    setEditing(row);
    setEditForm({
      startDate: row.startDate ?? '',
      endDate: row.endDate ?? '',
      returnToWorkDate: row.returnToWorkDate ?? '',
      reason: row.reason ?? '',
      addressSinceAgaza: row.addressSinceAgaza ?? '',
    });
  };

  const columns: ColumnDef<LeaveRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'requestNumber',
      header: ui('رقم الطلب'),
      cell: ({ getValue }) => {
        const value = getValue() as number | undefined;
        return value != null ? <span className="nums font-medium">{toArabicDigits(value)}</span> : '—';
      },
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'leaveType', header: ui('نوع الإجازة') },
    {
      accessorKey: 'startDate',
      header: ui('من'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'endDate',
      header: ui('إلى'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'days',
      header: ui('الأيام'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        const key = s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending';
        return <StatusBadge status={key} />;
      },
    },
    {
      accessorKey: 'currentTo',
      header: ui('الطلب الآن عند'),
      cell: ({ getValue }) => getValue<string | undefined>() ?? '—',
    },
    {
      accessorKey: 'submittedAt',
      header: ui('تاريخ التقديم'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => {
        const leave = row.original;
        return (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setDetailsFor(leave)}>
              <Eye className="size-4" /> {ui('تفاصيل')}
            </Button>
            {leave.canManage && <>
              <Button variant="outline" size="sm" disabled={updateMutation.isPending} onClick={() => openEdit(leave)}>
                <Pencil className="size-4" /> {ui('تعديل')}
              </Button>
              <Button variant="outline" size="sm" disabled={deleteMutation.isPending} onClick={() => void handleDelete(leave)}>
                <Trash2 className="size-4 text-destructive" /> {ui('حذف')}
              </Button>
            </>}
            {leave.canAction && <>
              <Button
                variant="outline"
                size="sm"
                disabled={approveMutation.isPending}
                onClick={() => void handleApprove(leave)}
              >
                <Check className="size-4 text-success" /> {ui('اعتماد')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={rejectMutation.isPending}
                onClick={() => void handleReject(leave)}
              >
                <X className="size-4 text-destructive" /> {ui('رفض')}
              </Button>
            </>}
          </div>
        );
      },
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('الإجازات')} />
        <NotImplementedState title={ui('الإجازات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('الإجازات')}
        description={ui('متابعة واعتماد طلبات الإجازات')}
        actions={
          <Button variant="brand" size="sm" asChild>
            <Link to="/leaves/new">
              <Plus className="size-4" /> {ui('طلب إجازة')}
            </Link>
          </Button>
        }
      />
      <ListStatusTabs tabs={LEAVE_STATUS_TABS} paramKey="mode" />
      <FilterBar
        searchPlaceholder={ui('بحث في الإجازات…')}
        fields={[
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'pending', label: ui('قيد الانتظار') },
              { value: 'incoming', label: ui('واردة') },
              { value: 'approved', label: ui('معتمد') },
              { value: 'rejected', label: ui('مرفوض') },
            ],
          },
        ]}
      />
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
        emptyTitle={ui('لا توجد طلبات إجازة')}
      />

      <Dialog open={detailsFor != null} onOpenChange={(open) => !open && setDetailsFor(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('تفاصيل طلب الإجازة')}</DialogTitle>
            <DialogDescription>{ui('بيانات ومسار طلب الإجازة الحالي')}</DialogDescription>
          </DialogHeader>
          {detailsFor && <div className="grid gap-4 sm:grid-cols-2">
            {[
              [ui('رقم الطلب'), detailsFor.requestNumber != null ? toArabicDigits(detailsFor.requestNumber) : '—'],
              [ui('الموظف'), detailsFor.employeeName ?? '—'],
              [ui('نوع الإجازة'), detailsFor.leaveType ?? '—'],
              [ui('من'), <DateText value={detailsFor.startDate} />],
              [ui('إلى'), <DateText value={detailsFor.endDate} />],
              [ui('مباشرة العمل'), <DateText value={detailsFor.returnToWorkDate} />],
              [ui('عدد الأيام'), detailsFor.days != null ? toArabicDigits(detailsFor.days) : '—'],
              [ui('تاريخ التقديم'), <DateText value={detailsFor.submittedAt} />],
              [ui('الطلب الآن عند'), detailsFor.currentTo ?? '—'],
              [ui('السبب / الملاحظات'), detailsFor.reason ?? '—'],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-medium">{value}</p>
            </div>)}
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('تعديل طلب الإجازة')}</DialogTitle>
            <DialogDescription>{ui('يمكن تعديل الطلب قبل أن يبدأ مراجعته فقط')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><label className="text-sm font-medium">{ui('من')}</label><Input type="date" value={editForm.startDate} onChange={(event) => setEditForm((current) => ({ ...current, startDate: event.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">{ui('إلى')}</label><Input type="date" min={editForm.startDate || undefined} value={editForm.endDate} onChange={(event) => setEditForm((current) => ({ ...current, endDate: event.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">{ui('مباشرة العمل')}</label><Input type="date" value={editForm.returnToWorkDate} onChange={(event) => setEditForm((current) => ({ ...current, returnToWorkDate: event.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">{ui('العنوان أثناء الإجازة')}</label><Input value={editForm.addressSinceAgaza} onChange={(event) => setEditForm((current) => ({ ...current, addressSinceAgaza: event.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><label className="text-sm font-medium">{ui('السبب / الملاحظات')}</label><Input value={editForm.reason} onChange={(event) => setEditForm((current) => ({ ...current, reason: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{ui('إلغاء')}</Button>
            <Button variant="brand" disabled={!editing || !editForm.startDate || !editForm.endDate || updateMutation.isPending} onClick={() => editing && updateMutation.mutate({ id: editing.id, ...editForm })}>
              {ui('حفظ التعديل')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
