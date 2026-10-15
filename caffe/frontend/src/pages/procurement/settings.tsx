import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import type {
  PaymentTermRow,
  ProcurementSettings,
  SupplierCategoryRow,
  SupplyRegionRow,
} from '@/types/gym-sales';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import { uiStatic } from '@/lib/ui-static';

type SettingsTab = 'general' | 'categories' | 'regions' | 'payment-terms';

function SettingsCrudTab<T extends { id: number }>({
  resource,
  fields,
  columns,
  emptyForm,
  mapRowToForm,
  mapFormToPayload,
}: {
  resource: string;
  fields: Array<{ key: string; label: string; type?: 'text' | 'number' }>;
  columns: ColumnDef<T>[];
  emptyForm: Record<string, string>;
  mapRowToForm: (row: T) => Record<string, string>;
  mapFormToPayload: (form: Record<string, string>) => Record<string, unknown>;
}) {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<T>(resource, params);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/${resource}/${id}`),
    { success: uiStatic('تم الحذف'), invalidate: [resource] },
  );

  const tableColumns = useMemo<ColumnDef<T>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<T>,
      ...columns,
      {
        id: 'actions',
        header: uiStatic('الإجراءات'),
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
            <Button variant="ghost" size="icon" onClick={() => void deleteMutation.mutate(row.original.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [columns, deleteMutation, mapRowToForm, params.page, params.pageSize, ui],
  );

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error(uiStatic('الاسم مطلوب'));
      return;
    }
    setSaving(true);
    try {
      const payload = mapFormToPayload(form);
      if (editId) await api.put(`/${resource}/${editId}`, payload);
      else await api.post(`/${resource}`, payload);
      toast.success(uiStatic(editId ? 'تم التحديث' : uiStatic('تم الإنشاء')));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setEditId(null);
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('إضافة')}
        </Button>
      </div>
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
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{uiStatic(editId ? 'تعديل' : 'إضافة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {fields.map((f) => (
              <div key={f.key} className="grid gap-1">
                <Label>{uiStatic(f.label)}</Label>
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GeneralSettingsTab() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['procurement-settings'],
    queryFn: async () => {
      const { data: s } = await api.get<ProcurementSettings>('/procurement-settings');
      return s;
    },
  });
  const [form, setForm] = useState<Partial<ProcurementSettings>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/procurement-settings', {
        branchId: form.branchId ?? undefined,
        requireApproval: form.requireApproval,
        approvalThreshold: form.approvalThreshold,
        maxOrderAmount: form.maxOrderAmount ?? undefined,
        requireVendorEvaluation: form.requireVendorEvaluation,
        minQuotations: form.minQuotations,
        enableInventoryIntegration: form.enableInventoryIntegration,
        enableThreeWayMatch: form.enableThreeWayMatch,
        matchTolerancePercent: form.matchTolerancePercent,
        notifyEmail: form.notifyEmail,
        notifySms: form.notifySms,
        notifyInSystem: form.notifyInSystem,
      });
      toast.success(uiStatic('تم حفظ الإعدادات'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !data) {
    return <p className="text-sm text-muted-foreground">{uiStatic('جاري التحميل…')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>{uiStatic('الفرع الافتراضي')}</Label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={form.branchId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, branchId: Number(e.target.value) || null }))}
          >
            <option value="">{uiStatic('—')}</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label>{uiStatic('حد الموافقة')}</Label>
          <Input
            type="number"
            className="nums"
            value={form.approvalThreshold ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, approvalThreshold: Number(e.target.value) }))}
          />
        </div>
        <div className="grid gap-1">
          <Label>{uiStatic('الحد الأقصى لأمر الشراء')}</Label>
          <Input
            type="number"
            className="nums"
            value={form.maxOrderAmount ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, maxOrderAmount: Number(e.target.value) || null }))}
          />
        </div>
        <div className="grid gap-1">
          <Label>{uiStatic('الحد الأدنى لعروض الأسعار')}</Label>
          <Input
            type="number"
            className="nums"
            value={form.minQuotations ?? 1}
            onChange={(e) => setForm((f) => ({ ...f, minQuotations: Number(e.target.value) }))}
          />
        </div>
        <div className="grid gap-1">
          <Label>{uiStatic('نسبة تسامح المطابقة %')}</Label>
          <Input
            type="number"
            className="nums"
            value={form.matchTolerancePercent ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, matchTolerancePercent: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['requireApproval', uiStatic('يتطلب موافقة')],
            ['requireVendorEvaluation', uiStatic('تقييم المورد')],
            ['enableInventoryIntegration', uiStatic('تكامل المخزون')],
            ['enableThreeWayMatch', uiStatic('المطابقة الثلاثية')],
            ['notifyEmail', uiStatic('إشعار بريد')],
            ['notifySms', uiStatic('إشعار SMS')],
            ['notifyInSystem', uiStatic('إشعار داخل النظام')],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form[key])}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
            />
            {uiStatic(label)}
          </label>
        ))}
      </div>
      <Button onClick={() => void save()} disabled={saving}>
        {uiStatic('حفظ الإعدادات')}
      </Button>
    </div>
  );
}

export function ProcurementSettingsPage() {
  const { ui } = useLocale();
  const [tab, setTab] = useState<SettingsTab>('general');

  const categoryColumns = useMemo<ColumnDef<SupplierCategoryRow>[]>(
    () => [
      { accessorKey: 'name', header: ui('الاسم') },
      { accessorKey: 'description', header: ui('الوصف'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'active',
        header: ui('نشط'),
        cell: ({ getValue }) => (getValue() ? ui('نعم') : ui('لا')),
      },
    ],
    [ui],
  );

  const regionColumns = useMemo<ColumnDef<SupplyRegionRow>[]>(
    () => [
      { accessorKey: 'name', header: ui('الاسم') },
      { accessorKey: 'city', header: ui('المدينة'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'country', header: ui('الدولة'), cell: ({ getValue }) => getValue() ?? '—' },
    ],
    [ui],
  );

  const paymentColumns = useMemo<ColumnDef<PaymentTermRow>[]>(
    () => [
      { accessorKey: 'name', header: ui('الاسم') },
      { accessorKey: 'days', header: ui('الأيام'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'type', header: ui('النوع'), cell: ({ getValue }) => getValue() ?? '—' },
    ],
    [ui],
  );

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('إعدادات المشتريات')}
      description={ui('سياسات الموافقة وتصنيفات الموردين وشروط الدفع')}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="general">{ui('الإعدادات العامة')}</TabsTrigger>
          <TabsTrigger value="categories">{ui('تصنيفات الموردين')}</TabsTrigger>
          <TabsTrigger value="regions">{ui('مناطق التوريد')}</TabsTrigger>
          <TabsTrigger value="payment-terms">{ui('شروط الدفع')}</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettingsTab />
        </TabsContent>
        <TabsContent value="categories">
          <SettingsCrudTab<SupplierCategoryRow>
            resource="supplier-settings/supplier-categories"
            fields={[
              { key: 'name', label: ui('الاسم') },
              { key: 'description', label: ui('الوصف') },
            ]}
            columns={categoryColumns}
            emptyForm={{ name: '', description: '' }}
            mapRowToForm={(r) => ({ name: r.name, description: r.description ?? '' })}
            mapFormToPayload={(f) => ({ name: f.name, description: f.description || undefined, active: true })}
          />
        </TabsContent>
        <TabsContent value="regions">
          <SettingsCrudTab<SupplyRegionRow>
            resource="supplier-settings/supply-regions"
            fields={[
              { key: 'name', label: ui('الاسم') },
              { key: 'city', label: ui('المدينة') },
              { key: 'country', label: ui('الدولة') },
            ]}
            columns={regionColumns}
            emptyForm={{ name: '', city: '', country: ui('مصر') }}
            mapRowToForm={(r) => ({
              name: r.name,
              city: r.city ?? '',
              country: r.country ?? ui('مصر'),
            })}
            mapFormToPayload={(f) => ({
              name: f.name,
              city: f.city || undefined,
              country: f.country || ui('مصر'),
              active: true,
            })}
          />
        </TabsContent>
        <TabsContent value="payment-terms">
          <SettingsCrudTab<PaymentTermRow>
            resource="supplier-settings/payment-terms"
            fields={[
              { key: 'name', label: ui('الاسم') },
              { key: 'days', label: ui('الأيام'), type: 'number' },
              { key: 'type', label: ui('النوع') },
            ]}
            columns={paymentColumns}
            emptyForm={{ name: '', days: '30', type: '' }}
            mapRowToForm={(r) => ({
              name: r.name,
              days: r.days != null ? String(r.days) : '',
              type: r.type ?? '',
            })}
            mapFormToPayload={(f) => ({
              name: f.name,
              days: f.days ? Number(f.days) : undefined,
              type: f.type || undefined,
              active: true,
            })}
          />
        </TabsContent>
      </Tabs>
    </GymSalesPageShell>
  );
}
