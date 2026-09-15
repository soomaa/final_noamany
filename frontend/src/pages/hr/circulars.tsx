import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Eye, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { Combobox, MultiSelect } from '@/components/common/combobox';
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
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { FileDropzone } from '@/components/common/file-dropzone';
import { uploadUrl, useFileUpload } from '@/components/employees/use-uploads';

interface CircularRow {
  id: number;
  title?: string;
  subject?: string;
  createdAt?: string;
  recipientCount?: number;
  readCount?: number;
}

interface CircularDetail {
  id: number;
  title?: string;
  subject?: string;
  date?: string;
  image?: string;
  details?: {
    id: number;
    empId?: number;
    empCode?: number;
    empName?: string;
    seen?: number;
    seenDate?: string;
    seenTime?: string;
  }[];
  attachments?: { id: number; title?: string; file?: string }[];
}

export function CircularsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<CircularRow>('hr/circulars', params);
  const { data: empOptions = [] } = useEmployeeOptions();
  const { data: departmentOptions = [] } = useQuery({
    queryKey: ['hr/circulars', 'recipient-departments'],
    queryFn: async () => {
      const { data: rows } = await api.get<Array<{ id: number; title?: string }>>('/hr/circulars/recipients/departments');
      return rows.map((row) => ({ value: String(row.id), label: row.title ?? String(row.id) }));
    },
  });
  const { upload, uploading } = useFileUpload();

  const [detailId, setDetailId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    subject: '',
    date: new Date().toISOString().slice(0, 10),
    recipientMode: 'employees' as 'all' | 'employees' | 'departments',
    empIds: [] as string[],
    departmentIds: [] as string[],
    attachment: null as File | null,
  });

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

  const openCreate = () => {
    setEditId(null);
    setForm({
      title: '', subject: '', date: new Date().toISOString().slice(0, 10),
      recipientMode: 'employees', empIds: [], departmentIds: [], attachment: null,
    });
    setFormOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const { data: current } = await api.get<CircularDetail>(`/hr/circulars/${id}`);
      setEditId(id);
      setForm({
        title: current.title ?? '',
        subject: current.subject ?? '',
        date: current.date ?? new Date().toISOString().slice(0, 10),
        recipientMode: 'employees',
        empIds: (current.details ?? []).flatMap((item) => item.empId != null ? [String(item.empId)] : []),
        departmentIds: [],
        attachment: null,
      });
      setFormOpen(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(ui('عنوان التعميم مطلوب'));
      return;
    }
    if (form.recipientMode === 'employees' && form.empIds.length === 0) {
      toast.error(ui('اختاري موظفًا واحدًا على الأقل'));
      return;
    }
    if (form.recipientMode === 'departments' && form.departmentIds.length === 0) {
      toast.error(ui('اختاري إدارة واحدة على الأقل'));
      return;
    }
    try {
      const attachmentPath = form.attachment ? await upload('circular', form.attachment) : null;
      if (form.attachment && !attachmentPath) return;
      const payload = {
        title: form.title,
        subject: form.subject || undefined,
        date: form.date,
        image: attachmentPath ?? undefined,
        sendToAll: form.recipientMode === 'all',
        recipientType: form.recipientMode === 'departments' ? 1 : 2,
        empIds: form.recipientMode === 'employees' ? form.empIds.map((id) => parseInt(id, 10)) : undefined,
        edaraIds: form.recipientMode === 'departments' ? form.departmentIds.map((id) => parseInt(id, 10)) : undefined,
        attachments: attachmentPath
          ? [{ title: form.attachment?.name ?? 'مرفق', file: attachmentPath }]
          : undefined,
      };
      if (editId) await api.patch(`/hr/circulars/${editId}`, payload);
      else await api.post('/hr/circulars', payload);
      toast.success(editId ? ui('تم تعديل التعميم') : ui('تم إنشاء التعميم'));
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
      accessorKey: 'subject',
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
      accessorKey: 'readCount',
      header: ui('تم الاطلاع'),
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
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => void openEdit(row.original.id)}>
            <Pencil className="size-4" />
          </Button>
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
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('التعاميم')}
        description={ui('تعاميم وقرارات إدارية للموظفين')}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('تعميم جديد')}
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
          onSearchChange={(search) => setParams({ search, page: 1 })}
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
                <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">{detail.subject}</div>
              )}
              {(detail.attachments ?? []).length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium">{ui('المرفقات')}</h4>
                  <div className="space-y-2">
                    {detail.attachments!.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={uploadUrl(attachment.file) ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-primary hover:bg-muted"
                      >
                        <Paperclip className="size-4" /> {attachment.title ?? ui('فتح المرفق')}
                      </a>
                    ))}
                  </div>
                </div>
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
              <Label htmlFor="circ-date">{ui('تاريخ التعميم')}</Label>
              <Input id="circ-date" type="date" className="mt-1.5" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="circ-subject">{ui('الموضوع')}</Label>
              <Textarea id="circ-subject" className="mt-1.5" rows={4} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <Label>{ui('إرسال إلى')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.recipientMode}
                  onValueChange={(recipientMode) => setForm((f) => ({ ...f, recipientMode: recipientMode as typeof f.recipientMode }))}
                  options={[
                    { value: 'all', label: ui('جميع الموظفين') },
                    { value: 'employees', label: ui('موظفون محددون') },
                    { value: 'departments', label: ui('إدارات محددة') },
                  ]}
                />
              </div>
            </div>
            {form.recipientMode === 'employees' && <div>
              <Label>{ui('الموظفون')}</Label>
              <div className="mt-1.5">
              <MultiSelect
                values={form.empIds}
                onValuesChange={(empIds) => setForm((f) => ({ ...f, empIds }))}
                options={empOptions}
                placeholder={ui('جميع الموظفين أو اختر محددين…')}
                searchPlaceholder={ui('بحث في الموظفين…')}
              />
              </div>
            </div>}
            {form.recipientMode === 'departments' && <div>
              <Label>{ui('الإدارات')}</Label>
              <div className="mt-1.5">
                <MultiSelect
                  values={form.departmentIds}
                  onValuesChange={(departmentIds) => setForm((f) => ({ ...f, departmentIds }))}
                  options={departmentOptions}
                  placeholder={ui('اختاري الإدارات…')}
                  searchPlaceholder={ui('بحث في الإدارات…')}
                />
              </div>
            </div>}
            <div>
              <Label>{ui('مرفق (اختياري)')}</Label>
              <FileDropzone
                className="mt-1.5"
                value={form.attachment}
                onChange={(attachment) => setForm((current) => ({ ...current, attachment }))}
                accept="image/*,.pdf,.doc,.docx"
                maxSizeMb={20}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button disabled={uploading} onClick={() => void save()}>
              {uploading ? ui('جارٍ رفع المرفق…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
