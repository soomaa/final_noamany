import type { ColumnDef } from '@tanstack/react-table';
import { differenceInDays, parseISO } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
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
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const DOC_TYPES = [
  { value: '1', label: uiStatic('هوية') },
  { value: '2', label: uiStatic('جواز') },
  { value: '3', label: uiStatic('رخصة') },
  { value: '4', label: uiStatic('عقد') },
  { value: '5', label: uiStatic('شهادة') },
];

interface DocumentRow {
  id: number;
  employeeName?: string;
  title?: string;
  docType?: string;
  expiryDate?: string;
  status?: string;
}

function getExpiryStatus(expiryDate?: string): 'expired' | 'expiring' | 'active' | null {
  if (!expiryDate) return null;
  try {
    const expiry = parseISO(expiryDate);
    const days = differenceInDays(expiry, new Date());
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'active';
  } catch {
    return null;
  }
}

export function DocumentsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<DocumentRow>('documents', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/documents/${id}`),
    { success: ui('تم حذف المستند'), invalidate: ['documents'] },
  );

  const { data: employees } = useQuery({
    queryKey: ['employees', 'document-form'],
    queryFn: async () => {
      const { data: r } = await api.get<{ data: { id: number; employee?: string }[] }>('/employees', {
        params: { pageSize: 200 },
      });
      return r.data ?? [];
    },
  });
  const employeeOptions = useMemo(
    () => (employees ?? []).map((e) => ({ value: String(e.id), label: e.employee ?? String(e.id) })),
    [employees],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ empId: '', title: '', docType: '', expiryDate: '' });
  const [saving, setSaving] = useState(false);

  const saveDocument = async () => {
    if (!form.empId || !form.title.trim()) {
      toast.error(ui('الموظف وعنوان المستند مطلوبان'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/documents', {
        empId: Number(form.empId),
        title: form.title.trim(),
        docType: form.docType ? Number(form.docType) : undefined,
        expiryDate: form.expiryDate || undefined,
      });
      toast.success(ui('تم إضافة المستند'));
      setCreateOpen(false);
      setForm({ empId: '', title: '', docType: '', expiryDate: '' });
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: DocumentRow) => {
    const ok = await confirm({
      title: ui('حذف المستند'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا المستند')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<DocumentRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('المستند') },
    { accessorKey: 'docType', header: ui('النوع') },
    {
      accessorKey: 'expiryDate',
      header: ui('تاريخ الانتهاء'),
      cell: ({ row }) => {
        const expiry = row.original.expiryDate;
        const expiryStatus = getExpiryStatus(expiry);
        return (
          <span
            className={cn(
              'nums',
              expiryStatus === 'expired' && 'font-medium text-destructive',
              expiryStatus === 'expiring' && 'font-medium text-warning',
            )}
          >
            <DateText value={expiry} />
          </span>
        );
      },
    },
    {
      id: 'expiryStatus',
      header: ui('حالة الصلاحية'),
      cell: ({ row }) => {
        const expiryStatus = getExpiryStatus(row.original.expiryDate);
        if (!expiryStatus) return '—';
        if (expiryStatus === 'expired') return <StatusBadge status="expired" />;
        if (expiryStatus === 'expiring') return <StatusBadge status="expiring" />;
        return <StatusBadge status="active" />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('المستندات')} />
        <NotImplementedState title={ui('المستندات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('المستندات')}
        description={ui('متابعة مستندات الموظفين وتنبيهات انتهاء الصلاحية')}
        actions={
          <Button variant="brand" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> {ui('مستند جديد')}
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder={ui('بحث في المستندات…')}
        fields={[
          {
            key: 'expiry',
            label: ui('الصلاحية'),
            type: 'select',
            options: [
              { value: 'expired', label: ui('منتهية') },
              { value: 'expiring', label: ui('تنتهي قريباً') },
              { value: 'valid', label: ui('سارية') },
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
        emptyTitle={ui('لا توجد مستندات')}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('مستند جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>{ui('الموظف')}</Label>
              <select className={selectCls} value={form.empId} onChange={(e) => setForm((f) => ({ ...f, empId: e.target.value }))}>
                <option value="">{ui('اختر الموظف')}</option>
                {employeeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>{ui('عنوان المستند')}</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>{ui('النوع')}</Label>
              <select className={selectCls} value={form.docType} onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}>
                <option value="">—</option>
                {DOC_TYPES.map((o) => <option key={o.value} value={o.value}>{ui(o.label)}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>{ui('تاريخ الانتهاء')}</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>
            <Button variant="brand" onClick={() => void saveDocument()} disabled={saving}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
