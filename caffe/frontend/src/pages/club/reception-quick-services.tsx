import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { formatMoney } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { RowActions, SELECT_CLS } from '@/pages/club/fitness/shared';
import { useLocale } from '@/store/locale';

export type ClubQuickServiceRow = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  branchId: number | null;
  sortOrder: number;
  isActive: boolean;
};

export function ClubReceptionQuickServicesPage() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubQuickServiceRow>(
    'club-quick-services',
    params,
  );
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    branchId: '',
    sortOrder: '0',
    isActive: true,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-quick-services/${id}`),
    { success: ui('تم الحفظ'), invalidate: ['club-quick-services'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '',
      description: '',
      price: '',
      branchId: '',
      sortOrder: '0',
      isActive: true,
    });
    setOpen(true);
  };

  const openEdit = (row: ClubQuickServiceRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? '',
      price: String(row.price),
      branchId: row.branchId != null ? String(row.branchId) : '',
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.price) {
      toast.error(ui('الاسم والسعر مطلوبان'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || undefined,
        price: Number(form.price),
        branchId: form.branchId ? Number(form.branchId) : null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (editId) await api.put(`/club-quick-services/${editId}`, payload);
      else await api.post('/club-quick-services', payload);
      toast.success(ui('تم الحفظ'));
      setOpen(false);
      // Also refreshes the reception button grid, which reads the same resource key.
      void qc.invalidateQueries({ queryKey: ['club-quick-services'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubQuickServiceRow>[]>(
    () => [
      { accessorKey: 'name', header: ui('الاسم') },
      {
        accessorKey: 'price',
        header: ui('السعر'),
        cell: ({ getValue }) => (
          <span className="nums font-medium">{formatMoney(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'sortOrder',
        header: ui('الترتيب'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ui('الحالة'),
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="text-emerald-700 dark:text-emerald-300">{ui('نشط')}</span>
          ) : (
            <span className="text-muted-foreground">{ui('موقوف')}</span>
          ),
      },
      {
        id: 'actions',
        header: ui('إجراءات'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ui('تعديل')}
            deleteLabel={ui('إيقاف')}
            onEdit={() => openEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ui('إيقاف هذه الخدمة من الاستقبال؟'), variant: 'destructive' }).then(
                (ok) => {
                  if (ok) deleteMutation.mutate(row.original.id);
                },
              )
            }
          />
        ),
      },
    ],
    [ui, deleteMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('خدمات سريعة')}
        description={ui('أزرار البيع السريع في شاشة الاستقبال — حصة فردية، كارنيه، وغيرها')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إضافة خدمة')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
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
        emptyTitle={ui('لا توجد خدمات')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل خدمة') : ui('إضافة خدمة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ui('الاسم')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={ui('مثال: حصة فردية')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ui('السعر')}</Label>
                <Input
                  className="nums"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ui('الترتيب')}</Label>
                <Input
                  className="nums"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ui('الفرع (اختياري)')}</Label>
              <select
                className={SELECT_CLS}
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">{ui('كل الفروع')}</option>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ui('وصف')}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border px-3 py-2">
              <Label>{ui('ظاهرة في الاستقبال')}</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(isActive) => setForm((f) => ({ ...f, isActive }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
