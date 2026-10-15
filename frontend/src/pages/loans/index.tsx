import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Trash2, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { usePermission } from '@/hooks/use-permission';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { localToday } from '@/lib/formatters';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface LoanRow {
  id: number;
  employeeName?: string;
  amount?: number;
  remaining?: number;
  installments?: number;
  status?: string;
  createdAt?: string;
}

interface LoanInstallment {
  id: number;
  no: number;
  month?: number;
  year?: number;
  dueDate?: string;
  amount: number;
  paid: boolean;
  pending?: boolean;
  datePaid?: string | null;
}

interface LoanSchedule {
  loan?: { employeeName?: string; amount?: number; status?: string };
  installments: LoanInstallment[];
  summary?: { total: number; paid: number; remaining: number };
}

const LOAN_STATUS_TABS = [
  { value: '', label: uiStatic('كل الطلبات') },
  { value: 'incoming', label: uiStatic('الواردة') },
  { value: 'approved', label: uiStatic('المقبولة') },
  { value: 'rejected', label: uiStatic('المرفوضة') },
];

export function LoansPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('finance.loans:create');
  const canDelete = can('finance.loans:delete');
  const canApprove = can('finance.loans:approve');
  const canReject = can('finance.loans:reject');
  const canPay = can('finance.loans:update');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LoanRow>('loans', params);
  const { data: empOptions = [] } = useEmployeeOptions(canCreate);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ empId: '', amount: '', installments: '12', reason: '' });
  const [scheduleLoan, setScheduleLoan] = useState<LoanRow | null>(null);
  const [schedule, setSchedule] = useState<LoanSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/loans/${id}`),
    { success: ui('تم حذف السلفة'), invalidate: ['loans'] },
  );

  const handleDelete = async (row: LoanRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف السلفة'),
      description: `${ui('هل تريد حذف سلفة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const loadSchedule = async (row: LoanRow) => {
    setScheduleLoan(row);
    setScheduleLoading(true);
    try {
      const { data } = await api.get<LoanSchedule>(`/loans/${row.id}/schedule`);
      setSchedule(data);
    } catch (e) {
      toast.error(apiError(e));
      setScheduleLoan(null);
    } finally {
      setScheduleLoading(false);
    }
  };

  const payInstallment = async (questId: number) => {
    if (!canPay || !scheduleLoan) return;
    const ok = await confirm({
      title: ui('سداد القسط'),
      description: ui('سيتم تسجيل سداد هذا القسط خارج المسيرة وترحيله محاسبياً.'),
      confirmLabel: ui('سداد'),
    });
    if (!ok) return;
    setPayingId(questId);
    try {
      await api.patch(`/loans/installments/${questId}/pay`, {});
      toast.success(ui('تم سداد القسط'));
      await loadSchedule(scheduleLoan);
      await refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPayingId(null);
    }
  };

  const changeStatus = async (row: LoanRow, action: 'approve' | 'reject') => {
    if (action === 'approve' ? !canApprove : !canReject) return;
    await api.patch(`/loans/${row.id}/${action}`);
    toast.success(action === 'approve' ? ui('تم الاعتماد') : ui('تم الرفض'));
    await refetch();
  };

  const columns: ColumnDef<LoanRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    {
      accessorKey: 'amount',
      header: ui('المبلغ'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'remaining',
      header: ui('المتبقي'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'installments',
      header: ui('الأقساط'),
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
        const key = s === 'paid' ? 'paid' : s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending';
        return <StatusBadge status={key} />;
      },
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('الأقساط')} onClick={() => void loadSchedule(row.original)}>
            <Wallet className="size-4" />
          </Button>
          {row.original.status !== 'approved' && row.original.status !== 'paid' && canApprove ? (
            <Button permissionResource="finance.loans" permissionAction="approve" variant="ghost" size="icon" aria-label={ui('اعتماد')} onClick={() => void changeStatus(row.original, 'approve')}>
              <Check className="size-4 text-emerald-600" />
            </Button>
          ) : null}
          {row.original.status !== 'rejected' && canReject ? (
            <Button permissionResource="finance.loans" permissionAction="reject" variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => void changeStatus(row.original, 'reject')}>
              <X className="size-4 text-amber-600" />
            </Button>
          ) : null}
          {canDelete ? (
            <Button permissionResource="finance.loans" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('السلف')} />
        <NotImplementedState title={ui('السلف قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('السلف')}
        description={ui('إدارة سلف وقروض الموظفين')}
        actions={canCreate ? (
          <Button permissionResource="finance.loans" permissionAction="create" variant="brand" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> {ui('سلفة جديدة')}
          </Button>
        ) : undefined}
      />
      <ListStatusTabs tabs={LOAN_STATUS_TABS} />
      <FilterBar searchPlaceholder={ui('بحث في السلف…')} />
      <DataTable
        exportSource={{ resource: 'loans', params }}
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
        emptyTitle={ui('لا توجد سلف')}
      />
      <Dialog open={createOpen && canCreate} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('سلفة جديدة')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5"><Combobox value={createForm.empId} onValueChange={(v) => setCreateForm((f) => ({ ...f, empId: v }))} options={empOptions} placeholder={ui('اختر الموظف…')} /></div>
            </div>
            <div><Label>{ui('المبلغ')}</Label><Input className="mt-1.5 nums" value={createForm.amount} onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>{ui('عدد الأقساط')}</Label><Input className="mt-1.5 nums" value={createForm.installments} onChange={(e) => setCreateForm((f) => ({ ...f, installments: e.target.value }))} /></div>
            <div><Label>{ui('السبب')}</Label><Input className="mt-1.5" value={createForm.reason} onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button permissionAction={null} variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>
            <Button permissionResource="finance.loans" permissionAction="create" onClick={async () => {
              if (!canCreate) return;
              try {
                await api.post('/loans', {
                  empId: Number(createForm.empId),
                  amount: Number(createForm.amount),
                  installments: Number(createForm.installments),
                  reason: createForm.reason,
                  deductionStartDate: localToday(),
                });
                toast.success(ui('تم إنشاء السلفة'));
                setCreateOpen(false);
                void refetch();
              } catch (e) {
                toast.error(apiError(e));
              }
            }}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={scheduleLoan != null} onOpenChange={(open) => { if (!open) { setScheduleLoan(null); setSchedule(null); } }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{ui('جدول الأقساط')} — {scheduleLoan?.employeeName ?? '…'}</SheetTitle>
            <SheetDescription>
              {schedule?.summary
                ? `${ui('المتبقي')} ${toArabicDigits(schedule.summary.remaining)} / ${toArabicDigits(schedule.summary.total)}`
                : ui('أقساط السلفة المعتمدة')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-2">
            {scheduleLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : null}
            {(schedule?.installments ?? []).map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{ui('قسط')} <span className="nums">{toArabicDigits(q.no)}</span></p>
                  <p className="text-muted-foreground">
                    <DateText value={q.dueDate} /> · <Money value={q.amount} />
                  </p>
                </div>
                {q.paid ? (
                  <StatusBadge status="paid" />
                ) : canPay ? (
                  <Button size="sm" disabled={payingId === q.id} onClick={() => void payInstallment(q.id)}>
                    {ui('سداد')}
                  </Button>
                ) : (
                  <StatusBadge status="pending" />
                )}
              </div>
            ))}
            {!scheduleLoading && !(schedule?.installments ?? []).length ? (
              <p className="text-sm text-muted-foreground">{ui('لا توجد أقساط')}</p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
