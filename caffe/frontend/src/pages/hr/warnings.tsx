import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface WarningRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  status?: string;
  details?: string;
}

interface WarningType {
  id: number;
  title: string;
}

const STATUS_LABELS: Record<string, string> = {
  start: uiStatic('بداية'),
  send_to_hr: uiStatic('للموارد البشرية'),
  send_to_emp: uiStatic('للموظف'),
};

const STATUS_KEYS: Record<string, StatusKey> = {
  start: 'pending',
  send_to_hr: 'info',
  send_to_emp: 'approved',
};

export function WarningsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<WarningRow>('hr/warnings', params);
  const { data: types } = useQuery({
    queryKey: ['hr/warnings', 'types'],
    queryFn: async () => {
      const { data: d } = await api.get<WarningType[]>('/hr/warnings/types');
      return d;
    },
  });
  const { data: empOptions } = useEmployeeOptions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ empId: '', typeId: '', details: '' });

  const sendHr = useMutationWithToast((id: number) => api.patch(`/hr/warnings/${id}/send-hr`), {
    success: ui('تم إرسال الإنذار للموارد البشرية'),
    invalidate: ['hr/warnings'],
  });
  const sendEmp = useMutationWithToast((id: number) => api.patch(`/hr/warnings/${id}/send-emp`), {
    success: ui('تم إرسال الإنذار للموظف'),
    invalidate: ['hr/warnings'],
  });
  const remove = useMutationWithToast((id: number) => api.delete(`/hr/warnings/${id}`), {
    success: ui('تم حذف الإنذار'),
    invalidate: ['hr/warnings'],
  });

  const typeOptions = (types ?? []).map((t) => ({ value: String(t.id), label: t.title }));

  const createWarning = async () => {
    if (!form.empId || !form.typeId) {
      toast.error(ui('اختر الموظف ونوع الإنذار'));
      return;
    }
    try {
      await api.post('/hr/warnings', {
        empId: Number(form.empId),
        typeId: Number(form.typeId),
        details: form.details || undefined,
      });
      toast.success(ui('تم تسجيل الإنذار'));
      setDialogOpen(false);
      setForm({ empId: '', typeId: '', details: '' });
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<WarningRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('نوع الإنذار') },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        const key = STATUS_KEYS[v ?? ''] ?? 'pending';
        return <StatusBadge status={key} label={STATUS_LABELS[v ?? ''] ?? v} />;
      },
    },
    {
      id: 'actions',
      header: ui('إجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.status === 'start' && (
            <Button variant="outline" size="sm" onClick={() => sendHr.mutate(row.original.id)}>
              <Send className="size-3.5" /> HR
            </Button>
          )}
          {row.original.status === 'send_to_hr' && (
            <Button variant="outline" size="sm" onClick={() => sendEmp.mutate(row.original.id)}>
              <Send className="size-3.5" /> {ui('موظف')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              if (
                await confirm({
                  title: ui('حذف الإنذار'),
                  description: ui('هل تريد حذف هذا الإنذار؟'),
                  confirmLabel: ui('حذف'),
                  variant: 'destructive',
                })
              ) {
                remove.mutate(row.original.id);
              }
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        eyebrow={ui('الموارد البشرية')}
        title={ui('الإنذارات')}
        description={ui('إنذارات الموظفين ومتابعة مسار الاعتماد')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('الإنذارات — قيد الإعداد على الخادم')}
        stats={[{ title: ui('إجمالي الإنذارات'), value: data?.total ?? 0, icon: <AlertTriangle className="size-5" />, colorIndex: 4 }]}
        statsLoading={isLoading}
        searchPlaceholder={ui('بحث في الإنذارات…')}
        actions={
          <Button variant="brand" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {ui('إنذار جديد')}
          </Button>
        }
      >
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
          emptyTitle={ui('لا توجد إنذارات')}
        />
      </ListPageShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('إنذار جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{ui('الموظف')}</Label>
              <Combobox
                options={empOptions ?? []}
                value={form.empId}
                onValueChange={(v: string) => setForm((f) => ({ ...f, empId: v }))}
                placeholder={ui('اختر الموظف')}
                searchPlaceholder={ui('بحث بالاسم…')}
              />
            </div>
            <div className="space-y-2">
              <Label>{ui('نوع الإنذار')}</Label>
              <Combobox
                options={typeOptions}
                value={form.typeId}
                onValueChange={(v: string) => setForm((f) => ({ ...f, typeId: v }))}
                placeholder={ui('اختر النوع')}
              />
            </div>
            <div className="space-y-2">
              <Label>{ui('التفاصيل')}</Label>
              <Textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                rows={3}
                placeholder={ui('وصف الإنذار…')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void createWarning()}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
