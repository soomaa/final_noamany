import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
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
import { api, apiError } from '@/lib/api';
import { uiStatic } from '@/lib/ui-static';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface CrudField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea';
  required?: boolean;
}

interface SimpleCrudTabProps<T extends { id: number }> {
  resource: string;
  title: string;
  fields: CrudField[];
  columns: ColumnDef<T>[];
  mapRowToForm: (row: T) => Record<string, string>;
  mapFormToPayload: (form: Record<string, string>) => Record<string, unknown>;
  emptyForm: Record<string, string>;
  extraActions?: ReactNode;
}

export function SimpleCrudTab<T extends { id: number }>({
  resource,
  title,
  fields,
  columns,
  mapRowToForm,
  mapFormToPayload,
  emptyForm,
  extraActions,
}: SimpleCrudTabProps<T>) {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<T>(resource, params);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/${resource}/${id}`),
    { success: ui('تم الحذف'), invalidate: [resource] },
  );

  const actionColumns = useMemo<ColumnDef<T>[]>(
    () => [
      ...columns,
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditId(row.original.id);
                setForm(mapRowToForm(row.original));
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void deleteMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [columns, deleteMutation, mapRowToForm, ui],
  );

  const save = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key]?.trim()) {
        toast.error(ui(`${f.label} مطلوب`));
        return;
      }
    }
    setSaving(true);
    try {
      const payload = mapFormToPayload(form);
      if (editId) await api.patch(`/${resource}/${editId}`, payload);
      else await api.post(`/${resource}`, payload);
      toast.success(ui(editId ? 'تم التحديث' : ui('تم الإنشاء')));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ListPageShell
      title={title}
      isError={isError}
      error={error}
      isLoading={isLoading}
      onRetry={() => void refetch()}
      actions={
        <div className="flex gap-2">
          {extraActions}
          <Button
            onClick={() => {
              setEditId(null);
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="ms-1 h-4 w-4" />
            {ui('إضافة')}
          </Button>
        </div>
      }
    >
      <DataTable
        columns={actionColumns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ui(editId ? 'تعديل' : 'إضافة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {fields.map((f) => (
              <div key={f.key} className="grid gap-1">
                <label className="text-sm font-medium">{ui(f.label)}</label>
                {f.type === 'textarea' ? (
                  <textarea
                    className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}

export function indexColumn(page: number, pageSize: number) {
  return {
    id: 'index',
    header: uiStatic('م'),
    cell: ({ row }: { row: { index: number } }) =>
      toArabicDigits((page - 1) * pageSize + row.index + 1),
  } satisfies ColumnDef<{ id: number }>;
}
