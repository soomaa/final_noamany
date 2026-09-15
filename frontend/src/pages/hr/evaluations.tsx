import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Award, Eye, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface EvaluationRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

interface EvaluationDetail {
  id: number;
  employeeName?: string;
  totalDegree?: string;
  taqdeer?: string;
  resultTagraba?: string;
  date?: string;
  details?: { id: number; title?: string; maxDegree?: string; empDegree?: string }[];
}

export function EvaluationsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<EvaluationRow>('hr/evaluations', params);
  const { data: empOptions = [] } = useEmployeeOptions();

  const [detailId, setDetailId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ empId: '', totalDegree: '', taqdeer: '' });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['hr/evaluations', detailId],
    queryFn: async () => {
      const { data: d } = await api.get<EvaluationDetail>(`/hr/evaluations/${detailId}`);
      return d;
    },
    enabled: detailId != null,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/evaluations/${id}`),
    { success: ui('تم حذف التقييم'), invalidate: ['hr/evaluations'] },
  );

  const stats = useMemo(
    () => [
      { title: ui('التقييمات'), value: toArabicDigits(data?.total ?? 0), icon: <Award className="size-5" /> },
    ],
    [data],
  );

  const openCreate = () => {
    setForm({ empId: '', totalDegree: '', taqdeer: '' });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.empId) {
      toast.error(ui('يرجى اختيار الموظف'));
      return;
    }
    try {
      await api.post('/hr/evaluations', {
        empId: parseInt(form.empId, 10),
        totalDegree: form.totalDegree || undefined,
        taqdeer: form.taqdeer || undefined,
        criteria: [],
      });
      toast.success(ui('تم إنشاء التقييم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<EvaluationRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'employeeName',
      header: ui('الموظف'),
      cell: ({ row, getValue }) => (
        <button type="button" className="text-start font-medium text-primary hover:underline" onClick={() => setDetailId(row.original.id)}>
          {(getValue() as string | undefined) ?? '—'}
        </button>
      ),
    },
    {
      accessorKey: 'title',
      header: ui('التقدير / الدرجة'),
      cell: ({ getValue }) => (
        <span className="inline-flex items-center gap-1">
          <Star className="size-3.5 text-amber-500" />
          {(getValue() as string | undefined) ?? '—'}
        </span>
      ),
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
          <Button variant="ghost" size="icon" aria-label={ui('عرض')} onClick={() => setDetailId(row.original.id)}>
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف التقييم'),
                description: ui('هل تريد حذف هذا التقييم؟'),
                confirmLabel: ui('حذف'),
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.id);
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
        title={ui('تقييم الموظفين')}
        description={ui('تقييم فترة التجربة والأداء')}
        searchPlaceholder={ui('بحث في التقييمات…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('تقييم جديد')}
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
          emptyTitle={ui('لا توجد تقييمات')}
        />
      </ListPageShell>

      <Sheet open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{ui('تقييم')} {detail?.employeeName ?? '…'}</SheetTitle>
            <SheetDescription>
              {detail?.date && <DateText value={detail.date} />}
            </SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{ui('الدرجة الكلية')}</p>
                  <p className="mt-1 text-lg font-semibold nums">{detail.totalDegree ?? '—'}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{ui('التقدير')}</p>
                  <p className="mt-1 text-lg font-semibold">{detail.taqdeer ?? '—'}</p>
                </div>
              </div>
              {detail.resultTagraba && (
                <p className="text-sm text-muted-foreground">{ui('نتيجة التجربة:')} {detail.resultTagraba}</p>
              )}
              {(detail.details ?? []).length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium">{ui('معايير التقييم')}</h4>
                  <div className="space-y-2">
                    {detail.details!.map((d) => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span>{d.title ?? '—'}</span>
                        <span className="nums font-medium">
                          {d.empDegree ?? '—'} / {d.maxDegree ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('تقييم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.empId}
                  onValueChange={(empId) => setForm((f) => ({ ...f, empId }))}
                  options={empOptions}
                  placeholder={ui('اختر الموظف…')}
                  searchPlaceholder={ui('بحث في الموظفين…')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="eval-degree">{ui('الدرجة الكلية')}</Label>
              <Input id="eval-degree" className="mt-1.5" value={form.totalDegree} onChange={(e) => setForm((f) => ({ ...f, totalDegree: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="eval-taqdeer">{ui('التقدير')}</Label>
              <Input id="eval-taqdeer" className="mt-1.5" value={form.taqdeer} onChange={(e) => setForm((f) => ({ ...f, taqdeer: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
