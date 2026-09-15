import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
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

interface WarningTemplateRow {
  id: number;
  title: string;
  details: string;
  status: string;
}

interface WarningTemplateForm {
  title: string;
  details: string;
}

const emptyForm = (): WarningTemplateForm => ({ title: '', details: '' });

export function WarningTemplatesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<WarningTemplateRow>(
    'hr/warnings/templates',
    params,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<WarningTemplateForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row: WarningTemplateRow) => {
    setEditingId(row.id);
    setForm({ title: row.title, details: row.details });
    setFormOpen(true);
  };

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/warnings/templates/${id}`),
    {
      success: ui('تم حذف نموذج الإنذار'),
      invalidate: ['hr/warnings/templates', 'hr/warnings'],
    },
  );

  const handleDelete = async (row: WarningTemplateRow) => {
    const ok = await confirm({
      title: ui('حذف نموذج الإنذار'),
      description: `${ui('هل تريد حذف نموذج «')}${row.title}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(ui('اسم النموذج مطلوب'));
      return;
    }
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), details: form.details };
      if (editingId !== null) {
        await api.patch(`/hr/warnings/templates/${editingId}`, payload);
      } else {
        await api.post('/hr/warnings/templates', payload);
      }
      toast.success(editingId !== null ? ui('تم تعديل نموذج الإنذار') : ui('تمت إضافة نموذج الإنذار'));
      setFormOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<WarningTemplateRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('اسم النموذج') },
    {
      accessorKey: 'details',
      header: ui('التفاصيل'),
      cell: ({ getValue }) => (
        <div className="max-w-3xl whitespace-pre-wrap leading-7">
          {(getValue() as string) || '—'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
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
            onClick={() => void handleDelete(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={ui('نماذج الإنذارات')}
        description={ui('إدارة نماذج الإنذارات المستخدمة عند تسجيل إنذار للموظف')}
        actions={(
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إضافة نموذج')}
          </Button>
        )}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        searchPlaceholder={ui('بحث باسم النموذج أو التفاصيل…')}
        emptyTitle={ui('لا توجد نماذج إنذارات')}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? ui('تعديل نموذج إنذار') : ui('إضافة نموذج إنذار')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="warning-template-title">{ui('اسم النموذج *')}</Label>
              <Input
                id="warning-template-title"
                value={form.title}
                onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warning-template-details">{ui('التفاصيل')}</Label>
              <Textarea
                id="warning-template-details"
                className="min-h-72 resize-y leading-7"
                value={form.details}
                onChange={(event) => setForm((old) => ({ ...old, details: event.target.value }))}
                placeholder={ui('اكتب نص وتفاصيل نموذج الإنذار…')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" disabled={saving} onClick={() => void save()}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
