import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { Time12Input } from '@/components/common/time-12-input';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface PermissionRow {
  id: number;
  eznRkm?: number;
  no3Ezn?: number;
  no3EznTitle?: string;
  employeeName?: string;
  date?: string;
  fromTime?: string;
  toTime?: string;
  minutes?: number;
  currentTo?: string;
  status?: string;
}

const MODE_TABS = [
  { value: '', label: uiStatic('كل الطلبات') },
  { value: 'sader', label: uiStatic('الصادرة') },
  { value: 'wared', label: uiStatic('الواردة') },
  { value: 'accept', label: uiStatic('المقبولة') },
  { value: 'reject', label: uiStatic('المرفوضة') },
];

const STATUS_KEY: Record<string, StatusKey> = {
  approved: 'approved',
  rejected: 'rejected',
  investigating: 'info',
  pending: 'pending',
};

const NO3_OPTIONS = [
  { value: '1', label: uiStatic('استئذان شخصي') },
  { value: '2', label: uiStatic('استئذان للعمل') },
];

const FATRA_OPTIONS = [
  { value: '', label: uiStatic('بدون تحديد') },
  { value: '1', label: uiStatic('فترة صباحية') },
  { value: '2', label: uiStatic('فترة مسائية') },
];

interface EznForm {
  empId: string;
  no3Ezn: string;
  eznDate: string;
  fromHour: string;
  toHour: string;
  fatraFk: string;
  reason: string;
}

const EMPTY_FORM: EznForm = {
  empId: '',
  no3Ezn: '1',
  eznDate: '',
  fromHour: '',
  toHour: '',
  fatraFk: '',
  reason: '',
};

export function PermissionsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PermissionRow>('permissions', params);
  const { data: empOptions } = useEmployeeOptions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<EznForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const approveMutation = useMutationWithToast(
    (id: number) => api.post(`/permissions/${id}/approve`),
    { success: ui('تم اعتماد الإذن'), invalidate: ['permissions'] },
  );

  const rejectMutation = useMutationWithToast(
    (id: number) => api.post(`/permissions/${id}/reject`),
    { success: ui('تم رفض الإذن'), invalidate: ['permissions'] },
  );

  const createEzn = async () => {
    if (!form.empId) {
      toast.error(ui('اختر الموظف'));
      return;
    }
    if (!form.eznDate || !form.fromHour || !form.toHour || !form.reason.trim()) {
      toast.error(ui('أكمل التاريخ والوقت والسبب'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/permissions', {
        empId: Number(form.empId),
        no3Ezn: Number(form.no3Ezn),
        eznDate: form.eznDate,
        fromHour: form.fromHour,
        toHour: form.toHour,
        reason: form.reason.trim(),
        fatraFk: form.fatraFk ? Number(form.fatraFk) : undefined,
      });
      toast.success(ui('تم تقديم طلب الإذن'));
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<PermissionRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'no3EznTitle', header: ui('النوع'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'date',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    { accessorKey: 'fromTime', header: ui('من'), cell: ({ getValue }) => <span className="nums">{formatTime((getValue() as string) ?? '')}</span> },
    { accessorKey: 'toTime', header: ui('إلى'), cell: ({ getValue }) => <span className="nums">{formatTime((getValue() as string) ?? '')}</span> },
    {
      accessorKey: 'minutes',
      header: ui('المدة (د)'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return <span className="nums">{v != null ? toArabicDigits(v) : '—'}</span>;
      },
    },
    { accessorKey: 'currentTo', header: ui('محول إلى'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        return <StatusBadge status={STATUS_KEY[s ?? ''] ?? 'pending'} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => {
        const pending = row.original.status === 'pending' || !row.original.status;
        if (!pending) return '—';
        return (
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate(row.original.id)}
            >
              <Check className="size-4 text-success" /> {ui('اعتماد')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rejectMutation.isPending}
              onClick={() => rejectMutation.mutate(row.original.id)}
            >
              <X className="size-4 text-destructive" /> {ui('رفض')}
            </Button>
          </div>
        );
      },
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('الأذونات')} />
        <NotImplementedState title={ui('الأذونات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <>
      <div>
        <PageHeader
          title={ui('الأذونات')}
          description={ui('طلبات ومتابعة أذونات الموظفين')}
          actions={
            <Button variant="brand" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> {ui('طلب إذن جديد')}
            </Button>
          }
        />
        <ListStatusTabs tabs={MODE_TABS} paramKey="mode" />
        <FilterBar searchPlaceholder={ui('بحث في الأذونات…')} />
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
          emptyTitle={ui('لا توجد أذونات')}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ui('طلب إذن جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{ui('الموظف')}<span className="text-destructive"> *</span></Label>
              <Combobox
                options={empOptions ?? []}
                value={form.empId}
                onValueChange={(v: string) => setForm((f) => ({ ...f, empId: v }))}
                placeholder={ui('اختر الموظف')}
                searchPlaceholder={ui('بحث بالاسم…')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{ui('نوع الإذن')}<span className="text-destructive"> *</span></Label>
                <Combobox
                  options={NO3_OPTIONS}
                  value={form.no3Ezn}
                  onValueChange={(v: string) => setForm((f) => ({ ...f, no3Ezn: v }))}
                  placeholder={ui('اختر النوع')}
                />
              </div>
              <div className="space-y-2">
                <Label>{ui('الفترة')}</Label>
                <Combobox
                  options={FATRA_OPTIONS}
                  value={form.fatraFk}
                  onValueChange={(v: string) => setForm((f) => ({ ...f, fatraFk: v }))}
                  placeholder={ui('بدون تحديد')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{ui('التاريخ')}<span className="text-destructive"> *</span></Label>
              <Input
                type="date"
                value={form.eznDate}
                onChange={(e) => setForm((f) => ({ ...f, eznDate: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{ui('من الساعة')}<span className="text-destructive"> *</span></Label>
                <Time12Input value={form.fromHour} onValueChange={(value) => setForm((f) => ({ ...f, fromHour: value }))} />
              </div>
              <div className="space-y-2">
                <Label>{ui('إلى الساعة')}<span className="text-destructive"> *</span></Label>
                <Time12Input value={form.toHour} onValueChange={(value) => setForm((f) => ({ ...f, toHour: value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{ui('السبب')}<span className="text-destructive"> *</span></Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={3}
                placeholder={ui('سبب طلب الإذن…')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void createEzn()} disabled={saving}>
              {saving ? ui('جارٍ الإرسال…') : ui('تقديم الطلب')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
