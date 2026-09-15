import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { indexColumn } from '../inventory/simple-crud-tab';
import { AppManagementShell } from './app-shell';

export interface CrudColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface AppCrudPageProps<T extends { id: number }> {
  title: string;
  description: string;
  resource: string;
  columns: CrudColumn<T>[];
  emptyForm: Record<string, unknown>;
  renderForm: (
    form: Record<string, unknown>,
    setForm: (v: Record<string, unknown>) => void,
    editMode: boolean,
  ) => ReactNode;
  toPayload: (form: Record<string, unknown>) => Record<string, unknown>;
  canCreate?: boolean;
}

export function AppCrudPage<T extends { id: number }>({
  title,
  description,
  resource,
  columns,
  emptyForm,
  renderForm,
  toPayload,
  canCreate = true,
}: AppCrudPageProps<T>) {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<T>(resource, params);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm);
  const [saving, setSaving] = useState(false);

  const tableColumns = useMemo<ColumnDef<T>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<T>,
      ...columns.map((c) => ({
        accessorKey: c.key as string,
        header: ui(c.header),
        cell: ({ row }: { row: { original: T } }) =>
          c.render ? c.render(row.original) : String((row.original as Record<string, unknown>)[c.key as string] ?? '—'),
      })),
      {
        id: 'actions',
        header: ui('إجراءات'),
        cell: ({ row }: { row: { original: T } }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditId(row.original.id);
                setForm({ ...emptyForm, ...row.original });
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                if (!(await confirm({ title: ui('تأكيد الحذف؟') }))) return;
                try {
                  await api.delete(`/${resource}/${row.original.id}`);
                  toast.success(ui('تم الحذف'));
                  void refetch();
                } catch (e) {
                  toast.error(apiError(e));
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [columns, emptyForm, params.page, params.pageSize, refetch, resource, ui],
  );

  async function save() {
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editId != null) {
        await api.put(`/${resource}/${editId}`, payload);
        toast.success(ui('تم التحديث'));
      } else {
        await api.post(`/${resource}`, payload);
        toast.success(ui('تم الإنشاء'));
      }
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppManagementShell
      title={title}
      description={description}
      actions={
        canCreate ? (
          <Button
            variant="brand"
            onClick={() => {
              setEditId(null);
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {ui('إضافة')}
          </Button>
        ) : undefined
      }
    >
      <FilterBar searchPlaceholder={ui('بحث…')} />
      <DataTable
        columns={tableColumns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل') : ui('إضافة')}</DialogTitle>
          </DialogHeader>
          {renderForm(form, setForm, editId != null)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" disabled={saving} onClick={() => void save()}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppManagementShell>
  );
}
