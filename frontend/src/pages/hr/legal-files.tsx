import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface LegalFileRow {
  id: number;
  title?: string | null;
  details?: string | null;
  file?: string | null;
  addedDate?: string | null;
  addedTime?: string | null;
  seenCount?: number;
}

interface SeenRow {
  id: number;
  empId?: number | null;
  employeeName?: string;
  seenDate?: string | null;
  seenTime?: string | null;
}

export function LegalFilesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LegalFileRow>(
    'legal-files',
    params,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [seensFileId, setSeensFileId] = useState<number | null>(null);

  const deleteMutation = useMutationWithToast((id: number) => api.delete(`/legal-files/${id}`), {
    success: ui('تم حذف الملف'),
    invalidate: ['legal-files'],
  });

  const ackMutation = useMutationWithToast((id: number) => api.post(`/legal-files/${id}/seen`, {}), {
    success: ui('تم تأكيد الاطلاع'),
    invalidate: ['legal-files'],
  });

  const { data: seens = [], isLoading: seensLoading } = useQuery({
    queryKey: ['legal-files', 'seens', seensFileId],
    queryFn: async () => {
      const { data: d } = await api.get<SeenRow[]>(`/legal-files/${seensFileId}/seens`);
      return d;
    },
    enabled: seensFileId != null,
  });

  const openCreate = () => {
    setEditId(null);
    setTitle('');
    setDetails('');
    setFile(null);
    setFormOpen(true);
  };

  const openEdit = (row: LegalFileRow) => {
    setEditId(row.id);
    setTitle(row.title ?? '');
    setDetails(row.details ?? '');
    setFile(null);
    setFormOpen(true);
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error(ui('عنوان الملف مطلوب'));
      return;
    }
    if (!editId && !file) {
      toast.error(ui('يجب اختيار ملف'));
      return;
    }
    setSaving(true);
    try {
      let filePath: string | undefined;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        const { data: up } = await api.post<{ path: string }>('/uploads/legal', fd);
        filePath = up.path;
      }
      const payload = { title: title.trim(), details: details.trim(), file: filePath };
      if (editId) await api.patch(`/legal-files/${editId}`, payload);
      else await api.post('/legal-files', payload);
      toast.success(ui('تم حفظ الملف'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<LegalFileRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('العنوان') },
    {
      accessorKey: 'details',
      header: ui('التفاصيل'),
      cell: ({ getValue }) => (
        <div className="max-w-xl whitespace-pre-wrap leading-6">
          {(getValue() as string | null) || '—'}
        </div>
      ),
    },
    {
      accessorKey: 'addedDate',
      header: ui('تاريخ الإضافة'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'seenCount',
      header: ui('عدد المطّلعين'),
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="nums"
          onClick={() => setSeensFileId(row.original.id)}
        >
          <Eye className="size-4" /> {toArabicDigits(row.original.seenCount ?? 0)}
        </Button>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.file && (
            <Button variant="ghost" size="icon" aria-label={ui('تنزيل')} asChild>
              <a href={`/uploads/${row.original.file}`} target="_blank" rel="noreferrer" download>
                <Download className="size-4" />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('تأكيد الاطلاع')}
            title={ui('تأكيد الاطلاع')}
            onClick={() => ackMutation.mutate(row.original.id)}
          >
            <CheckCircle2 className="size-4 text-brand-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('تعديل')}
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف الملف'),
                description: ui('هل تريد حذف هذا الملف وكل سجلات الاطلاع عليه؟'),
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
        title={ui('اللوائح والملفات')}
        description={ui('اللوائح التنظيمية والملفات وتأكيد اطلاع الموظفين عليها')}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('ملف جديد')}
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
          emptyTitle={ui('لا توجد ملفات')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل ملف') : ui('ملف جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="legal-title">{ui('العنوان')}</Label>
              <Input
                id="legal-title"
                className="mt-1.5"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="legal-details">{ui('التفاصيل')}</Label>
              <Textarea
                id="legal-details"
                className="mt-1.5 min-h-32 resize-y"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={ui('اكتب تفاصيل الملف…')}
              />
            </div>
            <div>
              <Label htmlFor="legal-file">{editId ? ui('استبدال الملف (اختياري)') : ui('الملف')}</Label>
              <Input
                id="legal-file"
                type="file"
                className="mt-1.5"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seensFileId != null} onOpenChange={(o) => !o && setSeensFileId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('المطّلعون على الملف')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {seensLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{ui('جارٍ التحميل…')}</p>
            ) : seens.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {ui('لا يوجد مطّلعون بعد')}
              </p>
            ) : (
              <ul className="divide-y">
                {seens.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{s.employeeName?.trim() || '—'}</span>
                    <span className="text-muted-foreground">
                      <DateText value={s.seenDate ?? undefined} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeensFileId(null)}>
              {ui('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
