import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface FormSettingRow {
  id: number;
  title?: string;
  type?: number;
  typeName?: string;
  maxDegree?: string;
  inOrder?: number;
}

const FORM_TYPES = [
  { value: '1', label: uiStatic('نوع الوظيفة') },
  { value: '2', label: uiStatic('طبيعة العمل بالوظيفة') },
  { value: '4', label: uiStatic('طرق الوصول إلينا') },
  { value: '5', label: uiStatic('الكفاءة') },
  { value: '8', label: uiStatic('عناصر المقابلة الشخصية') },
] as const;

const FORM_TYPE_LABELS = Object.fromEntries(FORM_TYPES.map((t) => [t.value, t.label]));

export function FormsSettingsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery({ filters: { type: '1' } });
  const activeType = params.filters.type ?? '1';
  const { data, isLoading, isError, error, refetch } = usePaginatedList<FormSettingRow>('settings/forms', params);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', typeName: '', maxDegree: '', inOrder: '' });
  const [saving, setSaving] = useState(false);

  const showMaxDegree = activeType === '8';

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/settings/forms/${id}`),
    { success: ui('تم حذف العنصر'), invalidate: ['settings/forms'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ title: '', typeName: FORM_TYPE_LABELS[activeType] ?? '', maxDegree: '0', inOrder: '' });
    setFormOpen(true);
  };

  const openEdit = (row: FormSettingRow) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? '',
      typeName: row.typeName ?? '',
      maxDegree: row.maxDegree ?? '0',
      inOrder: row.inOrder != null ? String(row.inOrder) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(ui('الاسم مطلوب'));
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/settings/forms/${editId}`, {
          title: form.title,
          maxDegree: form.maxDegree || undefined,
          inOrder: form.inOrder ? Number(form.inOrder) : undefined,
        });
      } else {
        await api.post('/settings/forms', {
          title: form.title,
          type: Number(activeType),
          typeName: form.typeName || FORM_TYPE_LABELS[activeType],
          maxDegree: form.maxDegree || '0',
          inOrder: form.inOrder ? Number(form.inOrder) : 0,
        });
      }
      toast.success(ui('تم حفظ العنصر'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: FormSettingRow) => {
    const ok = await confirm({
      title: ui('حذف العنصر'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا العنصر')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns = useMemo<ColumnDef<FormSettingRow>[]>(() => {
    const base: ColumnDef<FormSettingRow>[] = [
      {
        accessorKey: 'id',
        header: ui('م'),
        cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
      },
      {
        accessorKey: 'inOrder',
        header: ui('الترتيب'),
        cell: ({ getValue }) => {
          const v = getValue() as number | undefined;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      { accessorKey: 'title', header: ui('الاسم'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'typeName', header: ui('التصنيف'), cell: ({ getValue }) => getValue() ?? '—' },
    ];
    if (showMaxDegree) {
      base.push({
        accessorKey: 'maxDegree',
        header: ui('الدرجة العظمى'),
        cell: ({ getValue }) => {
          const v = getValue() as string | undefined;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      });
    }
    base.push({
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    });
    return base;
  }, [params.page, params.pageSize, showMaxDegree]);

  return (
    <>
      <ListPageShell
        title={ui('تعريف النماذج والطلبات')}
        description={ui('إعداد نماذج الطلبات والوظائف حسب التصنيف')}
        searchPlaceholder={ui('بحث في النماذج…')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('تعريف النماذج — قيد الإعداد على الخادم')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('عنصر جديد')}
          </Button>
        }
        stats={[
          {
            title: ui('عناصر التصنيف الحالي'),
            value: data?.total ?? 0,
            subtitle: FORM_TYPE_LABELS[activeType],
            icon: <FileText className="size-5" />,
          },
        ]}
        statsLoading={isLoading}
      >
        <Tabs
          value={activeType}
          onValueChange={(v) => setParams({ filters: { type: v }, page: 1, search: '' })}
          className="space-y-4"
        >
          <TabsList className="flex h-auto flex-wrap gap-1">
            {FORM_TYPES.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

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
          emptyTitle={ui('لا توجد عناصر في هذا التصنيف')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل عنصر') : ui('عنصر جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="form-title">{ui('الاسم')}</Label>
              <Input
                id="form-title"
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="form-order">{ui('الترتيب')}</Label>
                <Input
                  id="form-order"
                  type="number"
                  min={0}
                  className="mt-1.5 nums"
                  value={form.inOrder}
                  onChange={(e) => setForm((f) => ({ ...f, inOrder: e.target.value }))}
                />
              </div>
              {showMaxDegree && (
                <div>
                  <Label htmlFor="form-degree">{ui('الدرجة العظمى')}</Label>
                  <Input
                    id="form-degree"
                    type="number"
                    min={0}
                    className="mt-1.5 nums"
                    value={form.maxDegree}
                    onChange={(e) => setForm((f) => ({ ...f, maxDegree: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
