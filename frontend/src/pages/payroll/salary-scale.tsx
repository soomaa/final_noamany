import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Money, Num } from '@/components/common/formatters';
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

interface SalaryScaleRow {
  id: number;
  mo2hel?: string;
  martba?: string;
  dawamType?: string;
  salaryStart?: number;
  yearBonusValue?: number;
}

const MO2HEL_OPTIONS = [
  uiStatic('فوق الجامعي'),
  uiStatic('جامعي'),
  uiStatic('دبلوم فوق الثانوي'),
  uiStatic('ثانوي'),
  uiStatic('متوسط'),
  uiStatic('إبتدائي'),
  uiStatic('المستخدمين والسائقين وما دون الابتدائي'),
  uiStatic('العمال'),
];

const MARTBA_OPTIONS = [uiStatic('الاولي'), uiStatic('الثانيه'), uiStatic('الثالثة'), uiStatic('الرابعة'), uiStatic('الخامسه'), uiStatic('السادسة'), uiStatic('السابعة')];

const DAWAM_OPTIONS = [uiStatic('جزئي'), uiStatic('كامل')];

const emptyForm = () => ({
  mo2hel: '',
  martba: '',
  dawamType: '',
  salaryStart: '',
  yearBonusValue: '',
});

export function SalaryScalePage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<SalaryScaleRow>('payroll/salary-scale', params);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/salary-scale/${id}`),
    { success: ui('تم حذف بند سلم الرواتب'), invalidate: ['payroll/salary-scale'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row: SalaryScaleRow) => {
    setEditId(row.id);
    setForm({
      mo2hel: row.mo2hel ?? '',
      martba: row.martba ?? '',
      dawamType: row.dawamType ?? '',
      salaryStart: row.salaryStart != null ? String(row.salaryStart) : '',
      yearBonusValue: row.yearBonusValue != null ? String(row.yearBonusValue) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.mo2hel || !form.martba || !form.dawamType) {
      toast.error(ui('يرجى تعبئة المؤهل والمرتبة ونوع الدوام'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        mo2hel: form.mo2hel,
        martba: form.martba,
        dawamType: form.dawamType,
        salaryStart: Number(form.salaryStart) || 0,
        yearBonusValue: Number(form.yearBonusValue) || 0,
      };
      if (editId) await api.patch(`/payroll/salary-scale/${editId}`, payload);
      else await api.post('/payroll/salary-scale', payload);
      toast.success(ui('تم حفظ بند سلم الرواتب'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SalaryScaleRow) => {
    const ok = await confirm({
      title: ui('حذف بند سلم الرواتب'),
      description: `${ui('هل تريد حذف «')}${row.mo2hel ?? ''} — ${row.martba ?? ''}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<SalaryScaleRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'mo2hel', header: ui('المؤهل العلمي'), cell: ({ getValue }) => getValue() ?? '—' },
    { accessorKey: 'martba', header: ui('المرتبة'), cell: ({ getValue }) => getValue() ?? '—' },
    { accessorKey: 'dawamType', header: ui('نوع الدوام'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'salaryStart',
      header: ui('بداية الراتب'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'yearBonusValue',
      header: ui('العلاوة السنوية'),
      cell: ({ getValue }) => <Num value={getValue() as number | undefined} />,
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
        title={ui('سلم الرواتب')}
        description={ui('درجات ومراتب الرواتب حسب اللائحة')}
        searchPlaceholder={ui('بحث في سلم الرواتب…')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('سلم الرواتب — قيد الإعداد على الخادم')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('بند جديد')}
          </Button>
        }
        stats={[
          {
            title: ui('إجمالي البنود'),
            value: data?.total ?? 0,
            subtitle: ui('درجات ومراتب مسجّلة'),
            icon: <Scale className="size-5" />,
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
          emptyTitle={ui('لا توجد بنود في سلم الرواتب')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل بند سلم الرواتب') : ui('بند جديد في سلم الرواتب')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ss-mo2hel">{ui('المؤهل العلمي')}</Label>
              <Select value={form.mo2hel} onValueChange={(v) => setForm((f) => ({ ...f, mo2hel: v }))}>
                <SelectTrigger id="ss-mo2hel" className="mt-1.5">
                  <SelectValue placeholder={ui('اختر المؤهل…')} />
                </SelectTrigger>
                <SelectContent>
                  {MO2HEL_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ss-martba">{ui('المرتبة')}</Label>
              <Select value={form.martba} onValueChange={(v) => setForm((f) => ({ ...f, martba: v }))}>
                <SelectTrigger id="ss-martba" className="mt-1.5">
                  <SelectValue placeholder={ui('اختر المرتبة…')} />
                </SelectTrigger>
                <SelectContent>
                  {MARTBA_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ss-dawam">{ui('نوع الدوام')}</Label>
              <Select value={form.dawamType} onValueChange={(v) => setForm((f) => ({ ...f, dawamType: v }))}>
                <SelectTrigger id="ss-dawam" className="mt-1.5">
                  <SelectValue placeholder={ui('اختر نوع الدوام…')} />
                </SelectTrigger>
                <SelectContent>
                  {DAWAM_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ss-start">{ui('بداية الراتب')}</Label>
                <Input
                  id="ss-start"
                  type="number"
                  min={0}
                  className="mt-1.5 nums"
                  value={form.salaryStart}
                  onChange={(e) => setForm((f) => ({ ...f, salaryStart: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ss-bonus">{ui('العلاوة السنوية')}</Label>
                <Input
                  id="ss-bonus"
                  type="number"
                  min={0}
                  className="mt-1.5 nums"
                  value={form.yearBonusValue}
                  onChange={(e) => setForm((f) => ({ ...f, yearBonusValue: e.target.value }))}
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
