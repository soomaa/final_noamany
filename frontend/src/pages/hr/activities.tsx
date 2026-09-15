import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, ImagePlus, Images, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface ActivityRow {
  id: number;
  empId?: number | null;
  employeeName?: string;
  title?: string | null;
  date?: string | null;
  time?: string | null;
  status?: number;
  notes?: string | null;
  radNotes?: string | null;
  fileCount?: number;
}

interface ActivityFile {
  id: number;
  fileName: string | null;
  uploadedOn: string | null;
}

interface ActivityDetail extends ActivityRow {
  files: ActivityFile[];
}

// Legacy hr_ansheta.suspend: 0=new/pending, 2=rejected, 4=approved.
function statusMeta(status?: number): { key: StatusKey; label: string } {
  if (status === 4) return { key: 'approved', label: uiStatic('معتمد') };
  if (status === 2) return { key: 'rejected', label: uiStatic('مرفوض') };
  return { key: 'pending', label: uiStatic('قيد المراجعة') };
}

export function ActivitiesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ActivityRow>('activities', params);
  const { data: empOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ empId: '', title: '', notes: '' });

  const [viewOpen, setViewOpen] = useState(false);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/activities/${id}`),
    { success: ui('تم حذف النشاط'), invalidate: ['activities'] },
  );

  const approveMutation = useMutationWithToast(
    (id: number) => api.post(`/activities/${id}/approve`),
    { success: ui('تم اعتماد النشاط'), invalidate: ['activities'] },
  );

  const stats = useMemo(
    () => [{ title: ui('الأنشطة'), value: toArabicDigits(data?.total ?? 0), icon: <Images className="size-5" /> }],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ empId: '', title: '', notes: '' });
    setFormOpen(true);
  };

  const openEdit = (row: ActivityRow) => {
    setEditId(row.id);
    setForm({
      empId: row.empId != null ? String(row.empId) : '',
      title: row.title ?? '',
      notes: row.notes ?? '',
    });
    setFormOpen(true);
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const { data: d } = await api.get<ActivityDetail>(`/activities/${id}`);
      setDetail(d);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const openView = async (row: ActivityRow) => {
    setDetail(null);
    setViewOpen(true);
    await loadDetail(row.id);
  };

  const save = async () => {
    if (!form.empId || !form.title.trim()) {
      toast.error(ui('الموظف وعنوان النشاط مطلوبان'));
      return;
    }
    try {
      const payload = {
        empId: parseInt(form.empId, 10),
        title: form.title.trim(),
        notes: form.notes.trim() || undefined,
      };
      if (editId) await api.patch(`/activities/${editId}`, payload);
      else await api.post('/activities', payload);
      toast.success(ui('تم حفظ النشاط'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const reject = async (id: number) => {
    const ok = await confirm({
      title: ui('رفض النشاط'),
      description: ui('سيتم وضع النشاط كمرفوض. يمكنك إضافة سبب الرفض.'),
      confirmLabel: ui('رفض'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.post(`/activities/${id}/reject`, { radNotes: '' });
      toast.success(ui('تم رفض النشاط'));
      void refetch();
      if (detail?.id === id) await loadDetail(id);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const onPickImage = () => fileInputRef.current?.click();

  const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !detail) return;
    setUploading(true);
    try {
      // 1) upload the raw file to the shared endpoint, 2) store the returned path.
      const fd = new FormData();
      fd.append('file', file);
      const { data: up } = await api.post<{ path: string; filename: string; url: string }>(
        '/uploads/activity',
        fd,
      );
      await api.post(`/activities/${detail.id}/files`, { fileName: up.path });
      toast.success(ui('تمت إضافة الصورة'));
      await loadDetail(detail.id);
      void refetch();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (fileId: number) => {
    if (!detail) return;
    const ok = await confirm({
      title: ui('حذف الصورة'),
      description: ui('هل تريد حذف هذه الصورة؟'),
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/activities/files/${fileId}`);
      toast.success(ui('تم حذف الصورة'));
      await loadDetail(detail.id);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<ActivityRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('النشاط') },
    {
      accessorKey: 'date',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const meta = statusMeta(getValue() as number | undefined);
        return <StatusBadge status={meta.key} label={meta.label} />;
      },
    },
    {
      accessorKey: 'fileCount',
      header: ui('الصور'),
      cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number) ?? 0)}</span>,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('عرض')} onClick={() => void openView(row.original)}>
            <Eye className="size-4" />
          </Button>
          {row.original.status !== 4 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('اعتماد')}
              onClick={() => approveMutation.mutate(row.original.id)}
            >
              <Check className="size-4 text-success" />
            </Button>
          )}
          {row.original.status !== 2 && (
            <Button variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => void reject(row.original.id)}>
              <X className="size-4 text-destructive" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف النشاط'),
                description: ui('سيتم حذف النشاط وجميع صوره. هل تريد المتابعة؟'),
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
        title={ui('الأنشطة')}
        description={ui('أنشطة وفعاليات الموظفين مع معرض الصور')}
        searchPlaceholder={ui('بحث في الأنشطة…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('نشاط جديد')}
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
          emptyTitle={ui('لا توجد أنشطة')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل نشاط') : ui('نشاط جديد')}</DialogTitle>
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
              <Label htmlFor="activity-title">{ui('عنوان النشاط')}</Label>
              <Input
                id="activity-title"
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="activity-notes">{ui('ملاحظات')}</Label>
              <Textarea
                id="activity-notes"
                className="mt-1.5"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{detail?.title ?? ui('تفاصيل النشاط')}</DialogTitle>
          </DialogHeader>

          {detailLoading && !detail ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{ui('جارٍ التحميل…')}</p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{ui('الموظف:')}</span>
                  {detail.employeeName || '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">{ui('التاريخ:')}</span>
                  <DateText value={detail.date ?? undefined} />
                </div>
                <div>
                  <span className="text-muted-foreground">{ui('الحالة:')}</span>
                  <StatusBadge status={statusMeta(detail.status).key} label={statusMeta(detail.status).label} />
                </div>
              </div>

              {detail.notes && (
                <p className="rounded-md bg-muted/40 p-3 text-sm">{detail.notes}</p>
              )}
              {detail.radNotes && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {ui('سبب الرفض:')} {detail.radNotes}
                </p>
              )}

              <div className="flex items-center justify-between">
                <Label>{ui('الصور')}</Label>
                <Button variant="outline" size="sm" disabled={uploading} onClick={onPickImage}>
                  <ImagePlus className="size-4" /> {uploading ? ui('جارٍ الرفع…') : ui('إضافة صورة')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onImageSelected(e)}
                />
              </div>

              {detail.files.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{ui('لا توجد صور بعد')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {detail.files.map((f) => (
                    <div key={f.id} className="group relative overflow-hidden rounded-md border">
                      <img
                        src={`/uploads/${f.fileName ?? ''}`}
                        alt=""
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        aria-label={ui('حذف الصورة')}
                        className="absolute start-1 top-1 size-6 opacity-0 transition group-hover:opacity-100"
                        onClick={() => void removeImage(f.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{ui('تعذّر تحميل التفاصيل')}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>{ui('إغلاق')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
