import type { ColumnDef } from '@tanstack/react-table';
import { CircleMinus, CirclePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { uiStatic } from '@/lib/ui-static';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type PayComponentCategory = 'allowance' | 'deduction';

interface PayComponentRow {
  id: number;
  title?: string;
  category?: PayComponentCategory;
  amount?: number;
  isActive?: boolean;
}

interface PayComponentForm {
  title: string;
  category: PayComponentCategory;
  amount: string;
}

const CATEGORY_TABS = [
  { value: 'allowance', label: uiStatic('بنود استحقاق الراتب') },
  { value: 'deduction', label: uiStatic('البنود المستقطعة') },
] as const;

const EMPTY_FORM: PayComponentForm = {
  title: '',
  category: 'allowance',
  amount: '0',
};

export function PayComponentsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery({ filters: { category: 'allowance' } });
  const activeCategory: PayComponentCategory = params.filters.category === 'deduction' ? 'deduction' : 'allowance';
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PayComponentRow>('payroll/components', params);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PayComponentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/components/${id}`),
    { success: ui('تم حذف البند'), invalidate: ['payroll/components'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, category: activeCategory });
    setDialogOpen(true);
  };

  const openEdit = (row: PayComponentRow) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? '',
      category: row.category ?? activeCategory,
      amount: String(row.amount ?? 0),
    });
    setDialogOpen(true);
  };

  const saveComponent = async () => {
    const title = form.title.trim();
    const amount = Number(form.amount || 0);
    if (!title) {
      toast.error(ui('اسم البند مطلوب'));
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error(ui('القيمة الافتراضية يجب أن تكون صفرًا أو أكبر'));
      return;
    }

    setSaving(true);
    try {
      const payload = { title, category: form.category, amount };
      if (editId != null) await api.patch(`/payroll/components/${editId}`, payload);
      else await api.post('/payroll/components', payload);
      toast.success(ui('تم حفظ البند'));
      setDialogOpen(false);
      if (form.category !== activeCategory) {
        setParams({ filters: { category: form.category }, page: 1, search: '' });
      } else {
        void refetch();
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: PayComponentRow) => {
    const ok = await confirm({
      title: ui('حذف البند'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا البند')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns = useMemo<ColumnDef<PayComponentRow>[]>(() => [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'title',
      header: activeCategory === 'allowance' ? ui('بند الاستحقاق') : ui('البند المستقطع'),
      cell: ({ getValue }) => getValue() ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ui('القيمة الافتراضية'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'isActive',
      header: ui('الحالة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() === false ? 'suspended' : 'active'} />,
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
  ], [activeCategory, params.page, params.pageSize, ui]);

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('الاستحقاقات والاستقطاعات')} />
        <NotImplementedState title={ui('الاستحقاقات والاستقطاعات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={ui('الاستحقاقات والاستقطاعات')}
        description={ui('تعريف بنود استحقاق الراتب والبنود المستقطعة المستخدمة في رواتب الموظفين')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {activeCategory === 'allowance' ? ui('بند استحقاق جديد') : ui('بند استقطاع جديد')}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <CategoryCard
          active={activeCategory === 'allowance'}
          icon={<CirclePlus className="size-5 text-success" />}
          title={ui('بنود استحقاق الراتب')}
          description={ui('الراتب الأساسي والبدلات والمكافآت وكل ما يضاف إلى الراتب')}
          onClick={() => setParams({ filters: { category: 'allowance' }, page: 1, search: '' })}
        />
        <CategoryCard
          active={activeCategory === 'deduction'}
          icon={<CircleMinus className="size-5 text-destructive" />}
          title={ui('البنود المستقطعة')}
          description={ui('التأمينات والجزاءات والخصومات وكل ما يخصم من الراتب')}
          onClick={() => setParams({ filters: { category: 'deduction' }, page: 1, search: '' })}
        />
      </div>

      <Tabs
        value={activeCategory}
        onValueChange={(category) => setParams({ filters: { category }, page: 1, search: '' })}
      >
        <TabsList className="flex h-auto w-full gap-1 sm:w-auto">
          {CATEGORY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1 sm:flex-none">
              {ui(tab.label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FilterBar
        searchPlaceholder={activeCategory === 'allowance' ? ui('بحث في بنود الاستحقاق…') : ui('بحث في البنود المستقطعة…')}
        preserveParams={['category']}
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
        emptyTitle={activeCategory === 'allowance' ? ui('لا توجد بنود استحقاق راتب') : ui('لا توجد بنود مستقطعة')}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editId != null
                ? ui('تعديل البند')
                : form.category === 'allowance'
                  ? ui('بند استحقاق جديد')
                  : ui('بند استقطاع جديد')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-component-category">{ui('نوع البند')}</Label>
              <select
                id="pay-component-category"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as PayComponentCategory }))}
              >
                <option value="allowance">{ui('استحقاق راتب')}</option>
                <option value="deduction">{ui('استقطاع من الراتب')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-component-title">
                {form.category === 'allowance' ? ui('اسم بند الاستحقاق') : ui('اسم البند المستقطع')}
              </Label>
              <Input
                id="pay-component-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-component-amount">{ui('القيمة الافتراضية')}</Label>
              <Input
                id="pay-component-amount"
                type="number"
                min="0"
                step="0.01"
                className="nums"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{ui('يمكن تركها صفرًا وتحديد قيمة البند داخل ملف كل موظف.')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{ui('إلغاء')}</Button>
            <Button variant="brand" onClick={() => void saveComponent()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      className={active ? 'cursor-pointer border-primary/60 bg-primary/[0.04] ring-1 ring-primary/20' : 'cursor-pointer transition-colors hover:border-primary/30'}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick();
      }}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
