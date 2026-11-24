import { LEAD_META_QUERY_KEY } from '@/lib/customer-sources';
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PermissionButton as Button } from '@/components/club/permission-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { PageHeader } from '@/components/common/page-header';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/use-permission';

interface CustomerSourceRow {
  id: number;
  name: string;
  isActive: boolean;
}

/**
 * `embedded` renders it as the «مصادر المعرفة» tab of the potential-members screen: the same
 * list, titled for where it is used, and every lead form's select refreshed on save.
 */
export function ClubCustomerSourcesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('club.subscriptions.customer_sources:create');
  const canUpdate = can('club.subscriptions.customer_sources:update');
  const canDelete = can('club.subscriptions.customer_sources:delete');
  const qc = useQueryClient();
  const { data: sources, isLoading, isError, refetch } = useQuery({
    queryKey: ['club-customer-sources', 'admin'],
    queryFn: async () => {
      const { data } = await api.get<CustomerSourceRow[]>('/club-customer-sources', {
        params: { includeInactive: true },
      });
      return data ?? [];
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-customer-sources/${id}`),
    {
      success: ui('تم الحذف'),
      invalidate: ['club-customer-sources'],
      onSuccess: () => void qc.invalidateQueries({ queryKey: LEAD_META_QUERY_KEY }),
    },
  );

  const openCreate = () => {
    setEditId(null);
    setName('');
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (row: CustomerSourceRow) => {
    setEditId(row.id);
    setName(row.name);
    setIsActive(row.isActive);
    setDialogOpen(true);
  };

  const save = async () => {
    if (editId ? !canUpdate : !canCreate) return;
    if (!name.trim()) {
      toast.error(ui('اسم المصدر مطلوب'));
      return;
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), isActive };
      if (editId) await api.put(`/club-customer-sources/${editId}`, body);
      else await api.post('/club-customer-sources', body);
      toast.success(ui('تم الحفظ'));
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-customer-sources'] });
      // Lead forms read the active list through /club-leads/meta.
      void qc.invalidateQueries({ queryKey: LEAD_META_QUERY_KEY });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<CustomerSourceRow>[]>(
    () => [
      { accessorKey: 'name', header: ui('اسم المصدر') },
      {
        accessorKey: 'isActive',
        header: ui('الحالة'),
        cell: ({ getValue }) => (getValue() ? ui('نشط') : ui('غير نشط')),
      },
      {
        id: 'actions',
        header: ui('إجراءات'),
        cell: ({ row }) => !canUpdate && !canDelete ? null : (
          <div className="flex gap-1">
            {canUpdate ? <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button> : null}
            {canDelete ? <Button
              variant="ghost"
              size="icon"
              aria-label={ui('حذف')}
              onClick={() => {
                void (async () => {
                  const ok = await confirm({
                    title: ui('حذف المصدر'),
                    description: ui('هل تريد حذف هذا المصدر؟'),
                    variant: 'destructive',
                  });
                  if (ok && canDelete) deleteMutation.mutate(row.original.id);
                })();
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button> : null}
          </div>
        ),
      },
    ],
    [ui, deleteMutation, canUpdate, canDelete],
  );

  return (
    <ListPageShell>
      <PageHeader
        title={embedded ? ui('مصادر المعرفة') : ui('مصادر العملاء')}
        description={embedded
          ? ui('الاختيارات التي تظهر في «مصدر المعرفة» عند إضافة عميل محتمل — أضف ما تحتاجه وعطّل غير المستخدم.')
          : ui('إدارة مصادر العملاء المستخدمة في الاشتراكات')}
        actions={canCreate ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {ui('مصدر جديد')}
          </Button>
        ) : undefined}
      />
      <DataTable
        columns={columns}
        data={sources ?? []}
        total={(sources ?? []).length}
        page={1}
        pageSize={(sources ?? []).length || 10}
        onPageChange={() => {}}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ui('لا توجد مصادر')}
        enableExport={false}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل مصدر') : ui('مصدر جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{ui('اسم المصدر')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sourceActive" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="sourceActive">{ui('نشط')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {ui('إلغاء')}
            </Button>
            {(editId ? canUpdate : canCreate) ? <Button permissionAction={editId ? 'update' : 'create'} onClick={() => void save()} disabled={saving}>
              {saving ? ui('جاري الحفظ…') : ui('حفظ')}
            </Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
