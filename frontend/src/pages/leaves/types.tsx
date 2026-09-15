import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface LeaveTypeRow {
  id: number;
  title?: string;
  minDays?: number;
  maxDays?: number;
  agazaTtype?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  hasSubstitute?: boolean;
  isActive?: boolean;
}

interface LeaveTypeForm {
  title: string;
  minDays: string;
  maxDays: string;
  agazaTtype: 0 | 1;
  hasSubstitute: boolean;
  isActive: boolean;
}

const EMPTY_FORM: LeaveTypeForm = {
  title: '',
  minDays: '',
  maxDays: '',
  agazaTtype: 0,
  hasSubstitute: false,
  isActive: true,
};

export function LeaveTypesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveTypeRow>('leaves/types', params);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<LeaveTypeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [officialSettingsFor, setOfficialSettingsFor] = useState<LeaveTypeRow | null>(null);
  const [officialDates, setOfficialDates] = useState({ dateFrom: '', dateTo: '' });
  const [savingOfficialSettings, setSavingOfficialSettings] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/leaves/types/${id}`),
    { success: ui('تم حذف نوع الإجازة'), invalidate: ['leaves/types'] },
  );

  const handleDelete = async (row: LeaveTypeRow) => {
    const ok = await confirm({
      title: ui('حذف نوع الإجازة'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا النوع')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: LeaveTypeRow) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? '',
      minDays: row.minDays != null ? String(row.minDays) : '',
      maxDays: row.maxDays != null ? String(row.maxDays) : '',
      agazaTtype: row.agazaTtype === 1 ? 1 : 0,
      hasSubstitute: row.hasSubstitute ?? false,
      isActive: row.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const saveType = async () => {
    const title = form.title.trim();
    if (!title) {
      toast.error(ui('اسم نوع الإجازة مطلوب'));
      return;
    }

    const minDays = form.minDays === '' ? 0 : Number(form.minDays);
    const maxDays = form.maxDays === '' ? 0 : Number(form.maxDays);
    if (!Number.isInteger(minDays) || minDays < 0 || !Number.isInteger(maxDays) || maxDays < 0) {
      toast.error(ui('أدخل عدد أيام صحيحًا'));
      return;
    }
    if (maxDays > 0 && minDays > maxDays) {
      toast.error(ui('الحد الأدنى لا يمكن أن يتجاوز الحد الأقصى'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        minDays,
        maxDays,
        agazaTtype: form.agazaTtype,
        hasSubstitute: form.hasSubstitute,
        isActive: form.isActive,
      };
      if (editId != null) await api.patch(`/leaves/types/${editId}`, payload);
      else await api.post('/leaves/types', payload);
      toast.success(ui('تم حفظ نوع الإجازة'));
      setDialogOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openOfficialSettings = (row: LeaveTypeRow) => {
    setOfficialSettingsFor(row);
    setOfficialDates({ dateFrom: row.dateFrom ?? '', dateTo: row.dateTo ?? '' });
  };

  const saveOfficialSettings = async () => {
    if (!officialSettingsFor) return;
    if (!officialDates.dateFrom || !officialDates.dateTo) {
      toast.error(ui('حدد تاريخ بداية ونهاية الإجازة الرسمية'));
      return;
    }
    if (officialDates.dateFrom > officialDates.dateTo) {
      toast.error(ui('تاريخ البداية يجب أن يسبق أو يساوي تاريخ النهاية'));
      return;
    }

    setSavingOfficialSettings(true);
    try {
      await api.patch(`/leaves/types/${officialSettingsFor.id}`, officialDates);
      toast.success(ui('تم حفظ إعدادات الإجازة الرسمية'));
      setOfficialSettingsFor(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingOfficialSettings(false);
    }
  };

  const columns: ColumnDef<LeaveTypeRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('النوع') },
    {
      accessorKey: 'agazaTtype',
      header: ui('فئة الإجازة'),
      cell: ({ getValue }) => (getValue() === 1 ? ui('رسمية') : ui('خاصة بالموظف')),
    },
    {
      accessorKey: 'maxDays',
      header: ui('الحد الأقصى (يوم)'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'hasSubstitute',
      header: ui('يتطلب بديلًا'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'info'} label={getValue() ? ui('نعم') : ui('لا')} />,
    },
    {
      accessorKey: 'isActive',
      header: ui('الحالة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'suspended'} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.agazaTtype === 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openOfficialSettings(row.original)}
              className="gap-1"
            >
              <Settings2 className="size-4" />
              {ui('إعدادات الإجازة الرسمية')}
            </Button>
          )}
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

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('أنواع الإجازات')} />
        <NotImplementedState title={ui('أنواع الإجازات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('أنواع الإجازات')}
        description={ui('تعريف أنواع الإجازات وحدودها')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('نوع جديد')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في أنواع الإجازات…')} />
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
        emptyTitle={ui('لا توجد أنواع إجازات')}
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل نوع الإجازة') : ui('نوع إجازة جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="leave-type-title">{ui('اسم نوع الإجازة')}</Label>
              <Input
                id="leave-type-title"
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave-type-category">{ui('فئة الإجازة')}</Label>
              <Select
                value={String(form.agazaTtype)}
                onValueChange={(value) => setForm((current) => ({ ...current, agazaTtype: value === '1' ? 1 : 0 }))}
              >
                <SelectTrigger id="leave-type-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{ui('خاصة بالموظف')}</SelectItem>
                  <SelectItem value="1">{ui('رسمية')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-type-min-days">{ui('الحد الأدنى')}</Label>
                <Input
                  id="leave-type-min-days"
                  type="number"
                  min="0"
                  className="nums"
                  value={form.minDays}
                  onChange={(e) => setForm((current) => ({ ...current, minDays: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-type-max-days">{ui('الحد الأقصى (يوم)')}</Label>
                <Input
                  id="leave-type-max-days"
                  type="number"
                  min="0"
                  className="nums"
                  value={form.maxDays}
                  onChange={(e) => setForm((current) => ({ ...current, maxDays: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="leave-type-substitute">{ui('يتطلب موظفًا بديلًا')}</Label>
              <Switch
                id="leave-type-substitute"
                checked={form.hasSubstitute}
                onCheckedChange={(hasSubstitute) => setForm((current) => ({ ...current, hasSubstitute }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="leave-type-active">{ui('نشط')}</Label>
              <Switch
                id="leave-type-active"
                checked={form.isActive}
                onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void saveType()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={officialSettingsFor != null} onOpenChange={(open) => !open && setOfficialSettingsFor(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{ui('إعدادات الإجازة الرسمية')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{officialSettingsFor?.title}</p>
            <div className="space-y-2">
              <Label htmlFor="official-leave-date-from">{ui('المدة من')}</Label>
              <Input
                id="official-leave-date-from"
                type="date"
                className="nums"
                value={officialDates.dateFrom}
                max={officialDates.dateTo || undefined}
                onChange={(event) => setOfficialDates((current) => ({ ...current, dateFrom: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="official-leave-date-to">{ui('المدة إلى')}</Label>
              <Input
                id="official-leave-date-to"
                type="date"
                className="nums"
                value={officialDates.dateTo}
                min={officialDates.dateFrom || undefined}
                onChange={(event) => setOfficialDates((current) => ({ ...current, dateTo: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfficialSettingsFor(null)} disabled={savingOfficialSettings}>
              {ui('Ø¥Ù„ØºØ§Ø¡')}
            </Button>
            <Button variant="brand" onClick={() => void saveOfficialSettings()} disabled={savingOfficialSettings}>
              {savingOfficialSettings ? ui('Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦') : ui('Ø­ÙØ¸')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
