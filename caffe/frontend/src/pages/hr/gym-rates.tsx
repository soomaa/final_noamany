import type { ColumnDef } from '@tanstack/react-table';
import { Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface GymRateRow {
  id: number;
  ttype?: string;
  forUser?: number;
  forGym?: number;
  createdAt?: string;
}

const GYM_TYPES = [
  { value: 'target', label: uiStatic('تارجت') },
  { value: 'proten', label: uiStatic('بروتين') },
  { value: 'classes', label: uiStatic('الكلاسات') },
] as const;

const GYM_TYPE_LABELS = Object.fromEntries(GYM_TYPES.map((t) => [t.value, t.label]));

export function GymRatesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<GymRateRow>('hr/gym-rates', params);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ttype: '', forUser: '', forGym: '' });
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/gym-rates/${id}`),
    { success: ui('تم حذف إعداد الجيم'), invalidate: ['hr/gym-rates'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ttype: '', forUser: '', forGym: '' });
    setFormOpen(true);
  };

  const openEdit = (row: GymRateRow) => {
    setEditId(row.id);
    setForm({
      ttype: row.ttype ?? '',
      forUser: row.forUser != null ? String(row.forUser) : '',
      forGym: row.forGym != null ? String(row.forGym) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.ttype) {
      toast.error(ui('يرجى اختيار النوع'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ttype: form.ttype,
        forUser: Number(form.forUser) || 0,
        forGym: Number(form.forGym) || 0,
      };
      if (editId) await api.patch(`/hr/gym-rates/${editId}`, payload);
      else await api.post('/hr/gym-rates', payload);
      toast.success(ui('تم حفظ إعداد الجيم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: GymRateRow) => {
    const label = GYM_TYPE_LABELS[row.ttype ?? ''] ?? row.ttype ?? ui('هذا الإعداد');
    const ok = await confirm({
      title: ui('حذف إعداد الجيم'),
      description: `${ui('هل تريد حذف «')}${label}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<GymRateRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'ttype',
      header: ui('النوع'),
      cell: ({ getValue }) => GYM_TYPE_LABELS[getValue() as string] ?? (getValue() as string) ?? '—',
    },
    {
      accessorKey: 'forUser',
      header: ui('نسبة الموظف'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}٪</span> : '—';
      },
    },
    {
      accessorKey: 'forGym',
      header: ui('نسبة الجيم'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}٪</span> : '—';
      },
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
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
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('إعدادات نسب الجيم')}
        description={ui('نسب العمولات للموظف والجيم حسب نوع الخدمة')}
        searchPlaceholder={ui('بحث في الإعدادات…')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('إعدادات نسب الجيم — قيد الإعداد على الخادم')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إعداد جديد')}
          </Button>
        }
        stats={[
          {
            title: ui('إجمالي الإعدادات'),
            value: data?.total ?? 0,
            subtitle: ui('أنواع الخدمات المسجّلة'),
            icon: <Dumbbell className="size-5" />,
          },
        ]}
        statsLoading={isLoading}
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
          emptyTitle={ui('لا توجد إعدادات جيم')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل إعداد الجيم') : ui('إعداد جيم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="gym-type">{ui('النوع')}</Label>
              <Select value={form.ttype} onValueChange={(v) => setForm((f) => ({ ...f, ttype: v }))}>
                <SelectTrigger id="gym-type" className="mt-1.5">
                  <SelectValue placeholder={ui('اختر النوع…')} />
                </SelectTrigger>
                <SelectContent>
                  {GYM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="gym-user">{ui('نسبة الموظف ٪')}</Label>
                <Input
                  id="gym-user"
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1.5 nums"
                  value={form.forUser}
                  onChange={(e) => setForm((f) => ({ ...f, forUser: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="gym-gym">{ui('نسبة الجيم ٪')}</Label>
                <Input
                  id="gym-gym"
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1.5 nums"
                  value={form.forGym}
                  onChange={(e) => setForm((f) => ({ ...f, forGym: e.target.value }))}
                />
              </div>
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
