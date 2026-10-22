import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Pencil, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { WarehouseSelect } from '@/components/inventory/warehouse-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { indexColumn } from './simple-crud-tab';
import { type CountSession, isApproved, STATUS_LABELS, StockCountDetailsDialog, shortage, surplus } from './stock-count-shared';

interface SheetProduct {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  availableQuantity: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function StockTakingSheet() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<CountSession>('stock-taking', params);

  // The count report form ("محضر الجرد"): create a new one or edit a draft.
  const formRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<CountSession | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [details, setDetails] = useState<CountSession | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'stock-taking-options'],
    queryFn: async () => {
      const { data: r } = await api.get<{ id: number; nameAr: string; isActive?: boolean }[] | { data: { id: number; nameAr: string; isActive?: boolean }[] }>('/categories', {
        params: { page: 1, pageSize: 200, status: 'active' },
      });
      return Array.isArray(r) ? r : r.data;
    },
  });

  // The sheet lists the chosen category's products in the chosen warehouse.
  const sheetReady = !!warehouseId && !!categoryId;
  const { data: sheet = [], isFetching: loadingSheet } = useQuery({
    queryKey: ['stock-taking', 'sheet', warehouseId, categoryId],
    enabled: sheetReady,
    // Fresh quantities each time a warehouse is picked, but no background refetch while counts are typed.
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => (await api.get<SheetProduct[]>('/stock-taking/sheet', { params: { warehouseId, categoryId } })).data,
  });

  // New report: counted quantity starts equal to the available quantity; edits keep the saved count.
  useEffect(() => {
    if (!sheet.length) return;
    const saved = new Map((editing?.items ?? []).map((i) => [i.productId, i]));
    setCounts(Object.fromEntries(sheet.map((p) => [p.productId, String(saved.get(p.productId)?.countedQuantity ?? p.availableQuantity)])));
    setLineNotes(Object.fromEntries(sheet.map((p) => [p.productId, saved.get(p.productId)?.notes ?? ''])));
  }, [sheet, editing]);

  const resetForm = () => {
    setEditing(null);
    setWarehouseId('');
    setCategoryId('');
    setNotes('');
    setCounts({});
    setLineNotes({});
    setFilter('');
  };

  const shownSheet = filter.trim()
    ? sheet.filter((p) => p.productName.includes(filter.trim()) || p.productCode.includes(filter.trim()))
    : sheet;

  const save = async () => {
    if (!warehouseId) return toast.error(ui('اختر المخزن'));
    if (!categoryId) return toast.error(ui('اختر النوع'));
    if (!sheet.length) return toast.error(ui('لا توجد أصناف في هذا المخزن'));
    const bad = sheet.find((p) => counts[p.productId] === '' || !(Number(counts[p.productId]) >= 0));
    if (bad) return toast.error(`${ui('أدخل كمية صحيحة للصنف')}: ${bad.productName}`);
    const body = {
      notes: notes || undefined,
      items: sheet.map((p) => ({
        productId: p.productId,
        countedQuantity: Number(counts[p.productId]),
        notes: lineNotes[p.productId] || undefined,
      })),
    };
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/stock-taking/${editing.id}`, body);
        toast.success(ui('تم تعديل محضر الجرد'));
      } else {
        await api.post('/stock-taking', { ...body, warehouseId: Number(warehouseId), categoryId: Number(categoryId) });
        toast.success(ui('تم حفظ محضر الجرد'));
      }
      resetForm();
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const loadSession = async (id: number) => (await api.get<CountSession>(`/stock-taking/${id}`)).data;

  const startEdit = async (row: CountSession) => {
    try {
      const session = await loadSession(row.id);
      setEditing(session);
      setWarehouseId(String(session.warehouseId));
      setCategoryId(session.categoryId ? String(session.categoryId) : '');
      setNotes(session.notes ?? '');
      setFilter('');
      formRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const showDetails = async (row: CountSession) => {
    try {
      setDetails(await loadSession(row.id));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (row: CountSession) => {
    const ok = await confirm({ title: ui('حذف محضر الجرد'), description: row.sessionNumber, confirmLabel: ui('حذف'), variant: 'destructive' });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api.delete(`/stock-taking/${row.id}`);
      toast.success(ui('تم الحذف'));
      if (editing?.id === row.id) resetForm();
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusyId(null);
    }
  };

  // Approving replaces stock balances with the counted quantities and posts the variance entry.
  const approve = async (row: CountSession) => {
    const ok = await confirm({
      title: ui('اعتماد محضر الجرد'),
      description: row.sessionNumber,
      warning: ui('سيتم استبدال أرصدة المخزون بالكميات المعدودة'),
      confirmLabel: ui('اعتماد'),
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      let adjustmentId = row.status === 'draft' ? null : (await loadSession(row.id)).adjustmentId;
      if (row.status === 'draft') adjustmentId = (await api.post<{ adjustmentId: number }>(`/stock-taking/${row.id}/finalize`)).data.adjustmentId;
      if (!adjustmentId) throw new Error(ui('تعذر العثور على التسوية'));
      await api.post(`/stock-taking/adjustments/${adjustmentId}/approve`);
      toast.success(ui('تم اعتماد الجرد وتحديث المخزون'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusyId(null);
      void refetch();
    }
  };

  const columns = useMemo<ColumnDef<CountSession>[]>(
    () => [
      { ...indexColumn(params.page, params.pageSize), size: 40 } as ColumnDef<CountSession>,
      { accessorKey: 'sessionNumber', header: ui('رقم محضر الجرد'), size: 170 },
      {
        accessorKey: 'createdAt',
        size: 95,
        header: ui('التاريخ'),
        cell: ({ getValue }) => <span className="nums">{String(getValue()).slice(0, 10)}</span>,
      },
      { accessorKey: 'warehouseName', header: ui('المخزن'), size: 120, cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'categoryName', header: ui('النوع'), size: 80, cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'createdByName', header: ui('اسم الموظف'), size: 90, cell: ({ getValue }) => (getValue() as string) || '—' },
      {
        id: 'itemsCount',
        size: 75,
        header: ui('عدد الأصناف'),
        cell: ({ row }) => <span className="nums">{toArabicDigits(row.original.items?.length ?? 0)}</span>,
      },
      {
        id: 'differences',
        size: 85,
        header: ui('أصناف بها فروق'),
        cell: ({ row }) => <span className="nums">{toArabicDigits((row.original.items ?? []).filter((i) => i.variance !== 0).length)}</span>,
      },
      { accessorKey: 'status', header: ui('الحالة'), size: 90, cell: ({ getValue }) => ui(STATUS_LABELS[getValue() as string] ?? (getValue() as string)) },
      {
        id: 'actions',
        size: 130,
        header: ui('الإجراءات'),
        cell: ({ row }) => {
          const r = row.original;
          const busy = busyId !== null;
          return (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" title={ui('تفاصيل')} onClick={() => void showDetails(r)}>
                <Eye className="h-4 w-4" />
              </Button>
              {r.status === 'draft' && (
                <Button variant="ghost" size="icon" title={ui('تعديل')} onClick={() => void startEdit(r)}>
                  <Pencil className="h-4 w-4 text-primary" />
                </Button>
              )}
              {!isApproved(r.status) && (
                <Button variant="ghost" size="icon" title={ui('اعتماد')} disabled={busy} onClick={() => void approve(r)}>
                  <Check className="h-4 w-4 text-success" />
                </Button>
              )}
              {r.status === 'draft' && (
                <Button variant="ghost" size="icon" title={ui('حذف')} disabled={busy} onClick={() => void remove(r)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [busyId, params.page, params.pageSize, ui],
  );

  const cellInput = 'h-9 text-center nums';

  return (
    <div className="space-y-6">
      <div ref={formRef} className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">{ui(editing ? 'تعديل محضر جرد' : 'إضافة محضر جرد')}</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{ui('رقم محضر الجرد')}</Label>
            <Input readOnly value={editing?.sessionNumber ?? ui('يُنشأ تلقائيًا')} className="bg-muted/50" />
          </div>
          <div className="space-y-1.5">
            <Label>{ui('تاريخ اليوم')}</Label>
            <Input readOnly value={editing ? editing.createdAt.slice(0, 10) : today()} className="nums bg-muted/50" />
          </div>
          <WarehouseSelect
            branchId={user?.branch || undefined}
            value={warehouseId}
            onChange={setWarehouseId}
            label="المخزن"
            emptyLabel="اختر المخزن"
            disabled={!!editing}
          />
          <div className="space-y-1.5">
            <Label htmlFor="count-category">{ui('النوع')}</Label>
            <select
              id="count-category"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={categoryId}
              disabled={!!editing}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{ui('إختر')}</option>
              {categories.filter((c) => c.isActive !== false).map((c) => (
                <option key={c.id} value={c.id}>{c.nameAr}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{ui('اسم الموظف')}</Label>
            <Input readOnly value={editing?.createdByName ?? user?.name ?? ''} className="bg-muted/50" />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label>{ui('ملاحظات')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {sheetReady && (
          <div className="mt-4 space-y-3">
            <div className="relative max-w-xs">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="ps-9" placeholder={ui('بحث عن صنف')} value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="text-center">
                    <th className="p-2">{ui('م')}</th>
                    <th className="p-2 text-start">{ui('اسم الصنف')}</th>
                    <th className="p-2">{ui('الكمية المتاحة')}</th>
                    <th className="p-2">{ui('الكمية')}</th>
                    <th className="p-2">{ui('الزيادة')}</th>
                    <th className="p-2">{ui('العجز')}</th>
                    <th className="p-2">{ui('ملاحظات')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownSheet.map((p, idx) => {
                    const variance = (Number(counts[p.productId]) || 0) - p.availableQuantity;
                    return (
                      <tr key={p.productId} className="border-t text-center even:bg-muted/30">
                        <td className="p-2 nums">{toArabicDigits(idx + 1)}</td>
                        <td className="p-2 text-start">{p.productName}<span className="ms-1 text-xs text-muted-foreground">({p.unit})</span></td>
                        <td className="p-2"><Input readOnly value={p.availableQuantity} className={`${cellInput} bg-muted/50`} /></td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            className={cellInput}
                            value={counts[p.productId] ?? ''}
                            onChange={(e) => setCounts((prev) => ({ ...prev, [p.productId]: e.target.value }))}
                          />
                        </td>
                        <td className="p-2"><Input readOnly value={surplus(variance)} className={`${cellInput} bg-muted/50 ${variance > 0 ? 'text-success' : ''}`} /></td>
                        <td className="p-2"><Input readOnly value={shortage(variance)} className={`${cellInput} bg-muted/50 ${variance < 0 ? 'text-destructive' : ''}`} /></td>
                        <td className="p-2">
                          <Input
                            className="h-9"
                            placeholder={ui('ملاحظات')}
                            value={lineNotes[p.productId] ?? ''}
                            onChange={(e) => setLineNotes((prev) => ({ ...prev, [p.productId]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {!shownSheet.length && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        {ui(loadingSheet ? 'جاري التحميل...' : 'لا توجد أصناف من هذا النوع في المخزن')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {(editing || warehouseId || categoryId) && (
            <Button variant="outline" onClick={resetForm}>
              {ui('إلغاء')}
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving || !sheetReady || !sheet.length}>
            <Save className="ms-1 h-4 w-4" />
            {ui('حفظ')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-bold">{ui('محاضر الجرد')}</h2>
        <DataTable
          columns={columns}
          compact
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
      </div>

      <StockCountDetailsDialog session={details} onClose={() => setDetails(null)} />
    </div>
  );
}
