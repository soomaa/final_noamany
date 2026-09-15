import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Eye, Paperclip, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FileDropzone } from '@/components/common/file-dropzone';
import { uploadUrl, useFileUpload } from '@/components/employees/use-uploads';
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
  time?: string;
  department?: string;
  section?: string;
  seen?: boolean;
  canEdit?: boolean;
}

interface WarningType {
  id: number;
  title: string;
  details?: string;
}

interface WarningDetail extends WarningRow {
  empId?: number;
  typeId?: number;
  date?: string;
  type?: string;
  hrNotes?: string;
  attachments?: Array<{ id: number; title?: string; file?: string }>;
  history?: Array<{ id: number; from?: string; to?: string; action?: string; date?: string; time?: string }>;
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
  const { upload, uploading } = useFileUpload();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    empId: '', typeId: '', details: '', date: new Date().toISOString().slice(0, 10),
    attachment: null as File | null,
  });

  const { data: detail } = useQuery({
    queryKey: ['hr/warnings', detailId],
    queryFn: async () => (await api.get<WarningDetail>(`/hr/warnings/${detailId}`)).data,
    enabled: detailId != null,
  });

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

  const openCreate = () => {
    setEditId(null);
    setForm({
      empId: '', typeId: '', details: '', date: new Date().toISOString().slice(0, 10), attachment: null,
    });
    setDialogOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const { data: current } = await api.get<WarningDetail>(`/hr/warnings/${id}`);
      setEditId(id);
      setForm({
        empId: String(current.empId ?? ''),
        typeId: String(current.typeId ?? ''),
        details: current.details ?? '',
        date: current.date ?? new Date().toISOString().slice(0, 10),
        attachment: null,
      });
      setDialogOpen(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const createWarning = async () => {
    if (!form.empId || !form.typeId) {
      toast.error(ui('اختر الموظف ونوع الإنذار'));
      return;
    }
    try {
      const attachmentPath = form.attachment ? await upload('warning', form.attachment) : null;
      if (form.attachment && !attachmentPath) return;
      const payload = {
        empId: Number(form.empId),
        typeId: Number(form.typeId),
        details: form.details || undefined,
        date: form.date,
        attachments: attachmentPath ? [{ title: form.attachment?.name ?? 'مرفق', file: attachmentPath }] : undefined,
      };
      if (editId) await api.patch(`/hr/warnings/${editId}`, payload);
      else await api.post('/hr/warnings', payload);
      toast.success(editId ? ui('تم تعديل الإنذار') : ui('تم تسجيل الإنذار'));
      setDialogOpen(false);
      setForm({ empId: '', typeId: '', details: '', date: new Date().toISOString().slice(0, 10), attachment: null });
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
    { accessorKey: 'id', id: 'warningNo', header: ui('رقم الإنذار'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('نوع الإنذار') },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    { accessorKey: 'time', header: ui('الوقت') },
    { accessorKey: 'department', header: ui('الإدارة') },
    { accessorKey: 'section', header: ui('القسم') },
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
          <Button variant="ghost" size="icon" aria-label={ui('عرض')} onClick={() => setDetailId(row.original.id)}>
            <Eye className="size-4" />
          </Button>
          {row.original.canEdit !== false && (
            <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => void openEdit(row.original.id)}>
              <Pencil className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={ui('طباعة')} onClick={() => {
            setDetailId(row.original.id);
            setTimeout(() => window.print(), 250);
          }}>
            <Printer className="size-4" />
          </Button>
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
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
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
          onSearchChange={(search) => setParams({ search, page: 1 })}
          emptyTitle={ui('لا توجد إنذارات')}
        />
      </ListPageShell>

      <Sheet open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg print:max-w-none print:border-0">
          <SheetHeader>
            <SheetTitle>{detail?.type ?? ui('تفاصيل الإنذار')}</SheetTitle>
            <SheetDescription>{detail ? `${detail.employeeName ?? ''} — ${detail.date ?? ''} ${detail.time ?? ''}` : ''}</SheetDescription>
          </SheetHeader>
          {detail && <div className="mt-6 space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-4">
              <div><span className="text-muted-foreground">{ui('رقم الإنذار')}:</span> {toArabicDigits(detail.id)}</div>
              <div><span className="text-muted-foreground">{ui('الموظف')}:</span> {detail.employeeName ?? '—'}</div>
              <div><span className="text-muted-foreground">{ui('الإدارة')}:</span> {detail.department ?? '—'}</div>
              <div><span className="text-muted-foreground">{ui('القسم')}:</span> {detail.section ?? '—'}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 whitespace-pre-wrap">{detail.details ?? '—'}</div>
            {(detail.attachments ?? []).length > 0 && <div className="space-y-2">
              <h4 className="font-medium">{ui('المرفقات')}</h4>
              {detail.attachments!.map((file) => <a key={file.id} href={uploadUrl(file.file) ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                <Paperclip className="size-4" /> {file.title ?? ui('فتح المرفق')}
              </a>)}
            </div>}
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> {ui('طباعة')}</Button>
          </div>}
        </SheetContent>
      </Sheet>

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
                onValueChange={(v: string) => {
                  const selected = types?.find((type) => String(type.id) === v);
                  setForm((f) => ({ ...f, typeId: v, details: selected?.details ?? f.details }));
                }}
                placeholder={ui('اختر النوع')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warning-date">{ui('تاريخ الإنذار')}</Label>
              <Input id="warning-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
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
            <div className="space-y-2">
              <Label>{ui('مرفق (اختياري)')}</Label>
              <FileDropzone
                value={form.attachment}
                onChange={(attachment) => setForm((current) => ({ ...current, attachment }))}
                accept="image/*,.pdf,.doc,.docx"
                maxSizeMb={20}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" disabled={uploading} onClick={() => void createWarning()}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
