import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, Landmark, Pencil, Plus, Save, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type BaseMethod = 'cash' | 'card' | 'wallet' | 'transfer';

interface PaymentMethodRow {
  id: number;
  name: string;
  code: string;
  baseMethod: BaseMethod;
  supportsMixedPayment: boolean;
  requiresReference: boolean;
  isEnabled: boolean;
  fees: number;
}

interface PaymentForm {
  id?: number;
  name: string;
  code?: string;
  baseMethod: BaseMethod;
  supportsMixedPayment: boolean;
  requiresReference: boolean;
}

const emptyForm: PaymentForm = {
  name: '',
  baseMethod: 'card',
  supportsMixedPayment: true,
  requiresReference: false,
};

const methodMeta: Record<BaseMethod, { label: string; icon: typeof CreditCard; className: string }> = {
  cash: { label: 'نقدي', icon: Banknote, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200' },
  card: { label: 'بطاقة / فيزا', icon: CreditCard, className: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200' },
  wallet: { label: 'محفظة إلكترونية', icon: WalletCards, className: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200' },
  transfer: { label: 'تحويل', icon: Landmark, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200' },
};

export function PosPaymentMethodsEditor({
  ui,
  canCreate,
  canUpdate,
}: {
  ui: (text: string) => string;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PaymentForm | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['pos-payment-methods'],
    queryFn: async () => (await api.get<{ data: PaymentMethodRow[] }>('/pos-payment-methods', { params: { pageSize: 100 } })).data.data ?? [],
  });
  const methods = data ?? [];

  useEffect(() => {
    if (form?.id && !methods.some((method) => method.id === form.id)) setForm(null);
  }, [form?.id, methods]);

  const save = useMutation({
    mutationFn: async (draft: PaymentForm) => {
      const code = draft.code || `${draft.baseMethod}-${Date.now().toString(36)}`;
      const payload = {
        name: draft.name.trim(),
        code,
        baseMethod: draft.baseMethod,
        supportsMixedPayment: draft.supportsMixedPayment,
        requiresReference: draft.requiresReference,
      };
      return draft.id
        ? api.put(`/pos-payment-methods/${draft.id}`, payload)
        : api.post('/pos-payment-methods', payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos-payment-methods'] });
      setForm(null);
      toast.success(ui('تم حفظ طريقة الدفع'));
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => api.patch(`/pos-payment-methods/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos-payment-methods'] }),
    onError: (error) => toast.error(apiError(error)),
  });

  const edit = (row: PaymentMethodRow) => setForm({
    id: row.id,
    name: row.name,
    code: row.code,
    baseMethod: row.baseMethod,
    supportsMixedPayment: row.supportsMixedPayment,
    requiresReference: row.requiresReference,
  });

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b bg-primary/[0.035]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{ui('طرق الدفع')}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{ui('الاسم الذي تكتبه هنا يظهر كما هو في الكاشير وتقرير إغلاق الوردية')}</p>
            </div>
            {canCreate ? (
              <Button onClick={() => setForm({ ...emptyForm })} disabled={form != null}>
                <Plus className="size-4" />{ui('إضافة طريقة دفع')}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {form ? (
            <div className="mb-4 rounded-2xl border border-primary/25 bg-primary/[0.025] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-black">{ui(form.id ? 'تعديل طريقة الدفع' : 'طريقة دفع جديدة')}</h3>
                <Button variant="ghost" size="icon" onClick={() => setForm(null)} aria-label={ui('إغلاق')}><X className="size-4" /></Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>{ui('الاسم الظاهر للكاشير')}</Label>
                  <Input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={ui('مثال: InstaPay أو SnapPay')} autoFocus />
                </div>
                <div>
                  <Label>{ui('التصنيف المحاسبي')}</Label>
                  <select className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-sm" aria-label={ui('التصنيف المحاسبي')} value={form.baseMethod} onChange={(event) => setForm({ ...form, baseMethod: event.target.value as BaseMethod })}>
                    {(Object.keys(methodMeta) as BaseMethod[]).map((key) => <option key={key} value={key}>{ui(methodMeta[key].label)}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3 text-sm">
                  <span><b className="block">{ui('تُستخدم في تقسيم الدفع')}</b><small className="text-muted-foreground">{ui('مثال: جزء كاش وجزء InstaPay')}</small></span>
                  <Switch checked={form.supportsMixedPayment} onCheckedChange={(checked) => setForm({ ...form, supportsMixedPayment: checked })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3 text-sm">
                  <span><b className="block">{ui('تطلب رقم مرجع')}</b><small className="text-muted-foreground">{ui('مفيد للتحويل والمحفظة')}</small></span>
                  <Switch checked={form.requiresReference} onCheckedChange={(checked) => setForm({ ...form, requiresReference: checked })} />
                </label>
              </div>
              <Button className="mt-4 w-full sm:w-auto" onClick={() => form.name.trim() && save.mutate(form)} disabled={!form.name.trim() || save.isPending || (form.id ? !canUpdate : !canCreate)}>
                <Save className="size-4" />{ui('حفظ طريقة الدفع')}
              </Button>
            </div>
          ) : null}

          {isLoading ? <p className="p-6 text-center text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : methods.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {methods.map((method) => {
                const meta = methodMeta[method.baseMethod] ?? methodMeta.card;
                const Icon = meta.icon;
                return (
                  <article key={method.id} className={`rounded-2xl border p-4 transition ${method.isEnabled ? 'bg-background shadow-sm' : 'bg-muted/30 opacity-70'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${meta.className}`}><Icon className="size-5" /></span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-black">{method.name}</h4>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{ui(meta.label)} · <span className="nums">{method.code}</span></p>
                      </div>
                      {canUpdate ? <Switch checked={method.isEnabled} onCheckedChange={() => toggle.mutate(method.id)} disabled={toggle.isPending} /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      {method.supportsMixedPayment ? <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{ui('يدعم التقسيم')}</span> : null}
                      {method.requiresReference ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">{ui('مرجع مطلوب')}</span> : null}
                      <span className={`rounded-full px-2 py-1 ${method.isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{ui(method.isEnabled ? 'مفعّلة' : 'متوقفة')}</span>
                    </div>
                    {canUpdate ? <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => edit(method)}><Pencil className="size-3.5" />{ui('تعديل')}</Button> : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{ui('لا توجد طرق دفع. أضف أول طريقة ليبدأ الكاشير.')}</div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
        <b>{ui('حساب الموظفين والشركاء (CL)')}</b>
        <p className="mt-1 text-xs leading-5">{ui('يظهر تلقائيًا في تقرير الوردية من فواتير الموظفين والشركاء المؤجلة، ولا يُسجل كتحصيل نقدي حتى تظل الخزينة صحيحة.')}</p>
      </div>
    </div>
  );
}
