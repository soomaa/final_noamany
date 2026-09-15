import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarDays, HandCoins, Lock, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from '@/pages/inventory/inventory-shell';
import { useAuth } from '@/store/auth';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';

interface SupplierDebt {
  supplierId: number;
  supplierName: string;
  totalPurchases: number;
  paid: number;
  remaining: number;
  lastPaymentDate: string | null;
}

const money = (value: number) => `${toArabicDigits(value.toFixed(2))} ج.م`;

export function CafeSupplierPaymentsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.procurement.supplier_payments:create');
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  const effectiveBranchId = user?.branch && user.branch > 0
    ? String(user.branch)
    : branchId || String(branches[0]?.id ?? '');

  const { data: debts = [], isLoading } = useQuery({
    queryKey: ['supplier-debts', effectiveBranchId],
    queryFn: async () => {
      const { data } = await api.get<SupplierDebt[]>('/supplier-reports/reports/debts', { params: { branchId: effectiveBranchId } });
      return data;
    },
    enabled: !!effectiveBranchId,
  });
  const selected = useMemo(
    () => debts.find((row) => row.supplierId === Number(supplierId)),
    [debts, supplierId],
  );

  const settle = async () => {
    if (!canCreate) return;
    const paid = Number(amount);
    if (!selected) return toast.error(ui('اختر المورد'));
    if (!effectiveBranchId) return toast.error(ui('اختر الفرع'));
    if (!Number.isFinite(paid) || paid <= 0) return toast.error(ui('أدخل مبلغ سداد صحيح'));
    if (paid > selected.remaining) return toast.error(ui('المبلغ أكبر من المديونية الحالية'));
    setSaving(true);
    try {
      const { data } = await api.post<{ remaining: number }>('/supplier-payments/settle', {
        supplierId: selected.supplierId,
        branchId: Number(effectiveBranchId),
        paymentAmount: paid,
        paymentDate,
        paymentMethod,
      });
      toast.success(`${ui('تم تسجيل دفعة المورد، المتبقي')} ${money(data.remaining)}`);
      setAmount('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['supplier-debts'] }),
        queryClient.invalidateQueries({ queryKey: ['supplier-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryPageShell
      title={ui('سداد مديونية الموردين')}
      description={ui('اختر المورد وسجّل الدفعة؛ يتم توزيعها على أقدم الفواتير وتحديث المديونية والخزينة تلقائياً')}
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3">
        <Label className="shrink-0">{ui('فرع المديونية')}</Label>
        {user?.branch && user.branch > 0 ? <div className="flex min-h-10 flex-1 items-center justify-between rounded-md bg-muted/50 px-3 text-sm"><span>{user.branch_name || `${ui('فرع رقم')} ${effectiveBranchId}`}</span><Lock className="size-4 text-muted-foreground" /></div> : <select className="min-h-10 flex-1 rounded-md border bg-background px-3 text-sm" value={effectiveBranchId} onChange={(event) => { setBranchId(event.target.value); setSupplierId(''); setAmount(''); }}><option value="">{ui('اختر الفرع')}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HandCoins className="size-5 text-primary" />
              {ui('مديونيات الموردين')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">{ui('المورد')}</th>
                    <th className="p-3 text-center">{ui('إجمالي المشتريات')}</th>
                    <th className="p-3 text-center">{ui('المدفوع')}</th>
                    <th className="p-3 text-center">{ui('المتبقي')}</th>
                    <th className="p-3 text-center">{ui('آخر سداد')}</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {debts.map((row) => (
                    <tr key={row.supplierId} className="border-t transition hover:bg-muted/30">
                      <td className="p-3 font-medium">{row.supplierName}</td>
                      <td className="nums p-3 text-center">{money(row.totalPurchases)}</td>
                      <td className="nums p-3 text-center text-emerald-700">{money(row.paid)}</td>
                      <td className="nums p-3 text-center font-bold text-amber-700">{money(row.remaining)}</td>
                      <td className="nums p-3 text-center text-muted-foreground">{row.lastPaymentDate ?? '—'}</td>
                      <td className="p-3 text-end">
                        {canCreate ? <Button
                          permissionAction="create"
                          size="sm"
                          variant={supplierId === String(row.supplierId) ? 'default' : 'outline'}
                          disabled={row.remaining <= 0}
                          onClick={() => {
                            setSupplierId(String(row.supplierId));
                            setAmount(row.remaining > 0 ? String(row.remaining) : '');
                          }}
                        >
                          {ui('سداد')}
                        </Button> : null}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && !debts.length && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{ui('لا توجد مديونيات موردين')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Banknote className="size-5 text-primary" />
              {ui('تسجيل دفعة جديدة')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label>{ui('المورد')}</Label>
              <select className="rounded-lg border bg-background px-3 py-2.5" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">{ui('اختر المورد')}</option>
                {debts.filter((row) => row.remaining > 0).map((row) => (
                  <option key={row.supplierId} value={row.supplierId}>{row.supplierName}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/25 p-3 text-sm">
              <div><span className="block text-muted-foreground">{ui('إجمالي المديونية')}</span><strong className="nums mt-1 block text-lg">{money(selected?.remaining ?? 0)}</strong></div>
              <div><span className="block text-muted-foreground">{ui('بعد هذه الدفعة')}</span><strong className="nums mt-1 block text-lg text-emerald-700">{money(Math.max(0, (selected?.remaining ?? 0) - (Number(amount) || 0)))}</strong></div>
            </div>

            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/70 p-3 dark:bg-emerald-950/20">
              <Label className="mb-2 flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                <WalletCards className="size-4" /> {ui('المبلغ المدفوع للمورد')}
              </Label>
              <Input className="nums h-12 text-center text-lg font-bold" type="number" min={0.01} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <Label className="flex items-center gap-2"><CalendarDays className="size-4" />{ui('تاريخ السداد')}</Label>
              <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{ui('طريقة الدفع')}</Label>
              <select className="rounded-lg border bg-background px-3 py-2.5" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="cash">{ui('نقدي')}</option>
                <option value="bank">{ui('تحويل بنكي')}</option>
                <option value="card">{ui('بطاقة')}</option>
                <option value="wallet">{ui('محفظة')}</option>
              </select>
            </div>
            {canCreate ? <Button permissionAction="create" className="h-12 w-full text-base" disabled={saving || !selected} onClick={() => void settle()}>
              {saving ? ui('جارٍ تسجيل الدفعة…') : ui('حفظ وسداد المديونية')}
            </Button> : null}
          </CardContent>
        </Card>
      </div>
    </InventoryPageShell>
  );
}
