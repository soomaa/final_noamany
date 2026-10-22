import { Lock, Minus, Plus, Search, Package } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PaginatedResponse } from '@/components/common/data-table';
import { api, apiError } from '@/lib/api';
import { confirmWithPreview } from '@/lib/confirm';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { NamedEntity, ProductListItem } from '@/types/inventory';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from './inventory-shell';
import { useBranches } from '@/hooks/use-branches';
import { cafeUnitLabel } from '@/lib/cafe-units';
import { confirm } from '@/lib/confirm';

interface IssueLine {
  productId: number;
  name: string;
  size?: string | null;
  productCode: string;
  quantity: number;
  costPrice: number;
  unit: string;
  available: number;
}

function issueReference() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `GYM-ISSUE-${stamp}-${rand}`;
}

export function InventoryGymIssuePage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [txnDate, setTxnDate] = useState(localToday());
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branch ? String(user.branch) : '');
  const effectiveBranchId = user?.branch ? String(user.branch) : selectedBranchId;

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'gym-issue-options'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<NamedEntity>>('/categories', {
        params: { page: 1, pageSize: 200 },
      });
      return data.data;
    },
  });

  const { data: products, isFetching: productsLoading } = useQuery({
    queryKey: ['products', 'gym-issue', effectiveBranchId, categoryId, search],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: {
          page: 1,
          pageSize: 200,
          branchId: effectiveBranchId || undefined,
          categoryId: categoryId || undefined,
          search: search.trim() || undefined,
          status: 'active',
        },
      });
      return r.data;
    },
    enabled: !!effectiveBranchId,
  });

  const filteredProducts = (products ?? []).slice(0, 24);

  const addProduct = (product: ProductListItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        const step = product.unitOfMeasure === 'piece' ? 1 : 0.1;
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: Math.min(l.available, l.quantity + step) } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.nameAr,
          size: product.size,
          productCode: product.productCode,
          quantity: 1,
          costPrice: product.costPrice,
          unit: product.unitOfMeasure,
          available: product.currentStock ?? 0,
        },
      ];
    });
  };

  const updateQty = (productId: number, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.min(l.available, Math.round((l.quantity + delta) * 1000) / 1000) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const submit = async () => {
    if (!effectiveBranchId) {
      toast.error(ui('حساب المستخدم غير مرتبط بفرع'));
      return;
    }
    if (!lines.length) {
      toast.error(ui('أضف صنفًا واحدًا على الأقل'));
      return;
    }
    const unavailable = lines.find((line) => line.quantity > line.available);
    if (unavailable) {
      toast.error(ui(`الكمية المطلوبة من ${unavailable.name} أكبر من الرصيد المتاح`));
      return;
    }

    const payload = {
      reference: issueReference(),
      txnType: 'issue',
      txnDate,
      branchId: Number(effectiveBranchId),
      reason: ui('صرف مخزون داخل الجيم'),
      notes: notes.trim() || ui('صرف داخلي للجيم/الكافيه بدون معاملة مالية'),
      items: lines.map((l) => ({
        productId: l.productId,
        itemName: l.name,
        quantity: l.quantity,
        price: l.costPrice,
        total: Math.round(l.quantity * l.costPrice * 100) / 100,
      })),
    };

    setSaving(true);
    try {
      const ok = await confirmWithPreview(
        {
          title: ui('تأكيد صرف المخزون'),
          description: ui('سيتم خصم الأصناف من مخزون الفرع كصرف داخلي بدون أي معاملة مالية'),
          confirmLabel: ui('تنفيذ الصرف'),
        },
        async () => ({
          rows: lines.map((l) => ({
            label: l.name,
            after: `${l.quantity} ${cafeUnitLabel(l.unit)}`,
          })),
          warning: ui('سيتم خصم الكميات من المخزون فور التأكيد'),
        }),
        async () => {
          const { data } = await api.post('/inventory-transactions', payload);
          const txnId = (data as { id: number }).id;
          await api.post(`/inventory-transactions/${txnId}/approve`);
        },
      );
      if (ok) {
        toast.success(ui('تم صرف المخزون إلى الجيم بنجاح'));
        setLines([]);
        setNotes('');
        setSearch('');
        setCategoryId('');
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryPageShell
      title={ui('صرف مخزون داخل الجيم')}
      description={ui('صرف بضاعة للاستخدام داخل الجيم/الكافيه بدون معاملة مالية')}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ui('بيانات الصرف')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{ui('الفرع')}</Label>
                {user?.branch ? <div className="flex min-h-10 items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span>{user.branch_name || `${ui('فرع رقم')} ${effectiveBranchId}`}</span><Lock className="size-4 text-muted-foreground" />
                </div> : <select className="min-h-10 rounded-md border bg-background px-3 py-2 text-sm" value={selectedBranchId} onChange={async (event) => {
                  const next = event.target.value;
                  if (lines.length && !await confirm({ title: ui('تغيير الفرع؟'), description: ui('سيتم مسح أصناف الصرف الحالية لأن الأرصدة تختلف من فرع لآخر'), confirmLabel: ui('تغيير ومسح الأصناف') })) return;
                  setSelectedBranchId(next); setLines([]);
                }}><option value="">{ui('اختر الفرع')}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
              </div>
              <div className="grid gap-1.5">
                <Label>{ui('التاريخ')}</Label>
                <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>{ui('ملاحظات')}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ui('اختيار الأصناف')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>{ui('الفئة')}</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={categoryId}
                    onChange={(event) => {
                      setCategoryId(event.target.value);
                      setSearch('');
                    }}
                  >
                    <option value="">{ui('كل الفئات')}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nameAr ?? category.name ?? '—'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>{ui('بحث عن الصنف')}</Label>
                  <div className="relative">
                    <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="ps-9"
                      placeholder={ui('اكتب الاسم أو الكود لعرض الاقتراحات')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{ui('اختر الفئة أولاً أو ابحث بالاسم أو الكود، ثم اضغط على الصنف لإضافته للصرف.')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    disabled={(p.currentStock ?? 0) <= 0}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-start text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="block truncate font-medium">{p.nameAr}</span>
                        {p.size ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary nums">{p.size}</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">{p.productCode}</span>
                      <span className="nums mt-0.5 block text-xs text-primary">{ui('المتاح')} {toArabicDigits(p.currentStock ?? 0)} {cafeUnitLabel(p.unitOfMeasure)}</span>
                    </span>
                    <Plus className="ms-2 h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
              {!productsLoading && filteredProducts.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {ui('لا توجد أصناف متاحة بهذه الفئة أو عبارة البحث في الفرع المحدد')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              {ui('أصناف الصرف')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{ui('لم تُضف أصناف بعد')}</p>
            ) : (
              lines.map((line) => (
                <div key={line.productId} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}{line.size ? ` — ${line.size}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{line.productCode}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(line.productId, line.unit === 'piece' ? -1 : -0.1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input className="nums h-7 w-20 px-1 text-center text-sm" type="number" min={0.001} max={line.available} step={line.unit === 'piece' ? 1 : 0.001} value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Math.min(item.available, Math.max(0, Number(event.target.value))) } : item).filter((item) => item.quantity > 0))} />
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(line.productId, line.unit === 'piece' ? 1 : 0.1)} disabled={line.quantity >= line.available}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">{cafeUnitLabel(line.unit)}</span>
                </div>
              ))
            )}
            <Button className="w-full" disabled={saving || !lines.length} onClick={() => void submit()}>
              {saving ? ui('جاري التنفيذ...') : ui('تنفيذ صرف المخزون')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </InventoryPageShell>
  );
}
