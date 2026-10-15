import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileText, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { MultiSelect } from '@/components/common/combobox';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface CircularRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  recipientCount?: number;
}

interface CircularDetail {
  id: number;
  title?: string;
  subject?: string;
  date?: string;
  details?: {
    id: number;
    empId?: number;
    empCode?: number;
    empName?: string;
    seen?: number;
    seenDate?: string;
    seenTime?: string;
  }[];
}

export function CircularsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('affairs.circulars:create');
  const canDelete = can('affairs.circulars:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<CircularRow>('hr/circulars', params);
  const { data: empOptions = [] } = useEmployeeOptions();

  const [detailId, setDetailId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: '', subject: '', empIds: [] as string[] });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['hr/circulars', detailId],
    queryFn: async () => {
      const { data: d } = await api.get<CircularDetail>(`/hr/circulars/${detailId}`);
      return d;
    },
    enabled: detailId != null,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/circulars/${id}`),
    { success: ui('تم حذف التعميم'), invalidate: ['hr/circulars'] },
  );

  const stats = useMemo(() => {
    const rows = data?.data ?? [];
    const recipients = rows.reduce((s, r) => s + (r.recipientCount ?? 0), 0);
    return [
      { title: ui('إجمالي التعاميم'), value: toArabicDigits(data?.total ?? 0), icon: <FileText className="size-5" /> },
      { title: ui('المستلمون (هذه الصفحة)'), value: toArabicDigits(recipients), icon: <Users className="size-5" /> },
    ];
  }, [data]);

  const openCreate = () => {
    setForm({ title: '', subject: '', empIds: [] });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(ui('عنوان التعميم مطلوب'));
      return;
    }
    try {
      await api.post('/hr/circulars', {
        title: form.title,
        subject: form.subject || undefined,
        empIds: form.empIds.length ? form.empIds.map((id) => parseInt(id, 10)) : undefined,
      });
      toast.success(ui('تم إنشاء التعميم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<CircularRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'title',
      header: ui('العنوان'),
      cell: ({ row, getValue }) => (
        <button
          type="button"
          className="text-start font-medium text-primary hover:underline"
          onClick={() => setDetailId(row.original.id)}
        >
          {(getValue() as string | undefined) ?? '—'}
        </button>
      ),
    },
    {
      accessorKey: 'employeeName',
      header: ui('الموضوع'),
      cell: ({ getValue }) => (
        <span className="line-clamp-1 max-w-xs text-muted-foreground">{(getValue() as string | undefined) ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'recipientCount',
      header: ui('المستلمون'),
      cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number ?? 0)}</span>,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('عرض')} onClick={() => setDetailId(row.original.id)}>
            <Eye className="size-4" />
          </Button>
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('حذف')}
              onClick={async () => {
                const ok = await confirm({
                  title: ui('حذف التعميم'),
                  description: `${ui('هل تريد حذف «')}${row.original.title ?? ui('هذا التعميم')}${ui('»؟')}`,
                  confirmLabel: ui('حذف'),
                  variant: 'destructive',
                });
                if (ok) deleteMutation.mutate(row.original.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('التعاميم')}
        description={ui('تعاميم وقرارات إدارية للموظفين')}
        searchPlaceholder={ui('بحث في التعاميم…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          canCreate ? (
            <Button variant="brand" size="sm" onClick={openCreate}>
              <Plus className="size-4" /> {ui('تعميم جديد')}
            </Button>
          ) : undefined
        }
      >
        <DataTable
          exportSource={{ resource: 'hr/circulars', params }}
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
          emptyTitle={ui('لا توجد تعاميم')}
        />
      </ListPageShell>

      <Sheet open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail?.title ?? ui('تفاصيل التعميم')}</SheetTitle>
            <SheetDescription>
              {detail?.date && <DateText value={detail.date} />}
            </SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              {detail.subject && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: detail.subject }} />
              )}
              <div>
                <h4 className="mb-3 text-sm font-medium">{ui('حالة الاطلاع')}</h4>
                <div className="space-y-2">
                  {(detail.details ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{ui('لا يوجد مستلمون محددون.')}</p>
                  ) : (
                    detail.details!.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium">{r.empName ?? '—'}</p>
                          <p className="nums text-xs text-muted-foreground">{r.empCode != null ? toArabicDigits(r.empCode) : ''}</p>
                        </div>
                        <div className="text-end">
                          <StatusBadge status={r.seen === 1 ? 'approved' : 'pending'} label={r.seen === 1 ? ui('اطّلع') : ui('لم يطلع')} />
                          {r.seen === 1 && r.seenDate && (
                            <p className="mt-1 nums text-xs text-muted-foreground">
                              <DateText value={r.seenDate} /> {r.seenTime}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('تعميم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="circ-title">{ui('العنوان')}</Label>
              <Input id="circ-title" className="mt-1.5" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="circ-subject">{ui('الموضوع')}</Label>
              <Textarea id="circ-subject" className="mt-1.5" rows={4} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <Label>{ui('المستلمون (اختياري)')}</Label>
              <div className="mt-1.5">
              <MultiSelect
                values={form.empIds}
                onValuesChange={(empIds) => setForm((f) => ({ ...f, empIds }))}
                options={empOptions}
                placeholder={ui('جميع الموظفين أو اختر محددين…')}
                searchPlaceholder={ui('بحث في الموظفين…')}
              />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button permissionAction="create" onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
