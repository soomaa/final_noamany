import { useState } from 'react';
import { CircleDollarSign, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { useLocale } from '@/store/locale';

type Method = { id:number; name:string; type:string; destination:string|null; account:string|null; hasSecret:boolean; branchId:number|null; isActive:boolean; displayOrder:number };
type Options = { branches:Array<{id:number;name:string|null}>; canManageGlobal:boolean };
type Form = { name:string; type:string; destination:string; account:string; accountSecret:string; branchId:string; isActive:boolean; displayOrder:string };
const TYPES = [{ value:'instapay', label:'إنستاباي' }, { value:'wallet', label:'محفظة إلكترونية' }, { value:'bank', label:'حساب بنكي' }, { value:'transfer', label:'تحويل آخر' }];
const blank = (branchId = ''): Form => ({ name:'', type:'instapay', destination:'', account:'', accountSecret:'', branchId, isActive:true, displayOrder:'1' });

export function PaymentMethodsPage() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const methods = useQuery({ queryKey:['portal-payment-methods'], queryFn:async() => (await api.get<Method[]>('/portal/payment-methods')).data });
  const options = useQuery({ queryKey:['portal-payment-method-options'], queryFn:async() => (await api.get<Options>('/portal/payment-methods/options')).data });
  const branchName = (branchId:number|null) => branchId == null ? ui('كل الفروع') : options.data?.branches.find((branch) => branch.id === branchId)?.name ?? `${ui('فرع')} ${branchId}`;
  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, branchId: form.branchId === 'global' ? null : Number(form.branchId), displayOrder:Number(form.displayOrder) };
      return id ? api.put(`/portal/payment-methods/${id}`, body) : api.post('/portal/payment-methods', body);
    },
    onSuccess: () => { toast.success(ui('تم حفظ طريقة الدفع')); setOpen(false); void qc.invalidateQueries({ queryKey:['portal-payment-methods'] }); },
    onError: (error) => toast.error(apiError(error)),
  });
  const edit = (method?:Method) => {
    const defaultBranch = options.data?.canManageGlobal ? 'global' : String(options.data?.branches[0]?.id ?? '');
    setId(method?.id ?? null);
    setForm(method ? { name:method.name, type:method.type, destination:method.destination ?? '', account:method.account ?? '', accountSecret:'', branchId:method.branchId == null ? 'global' : String(method.branchId), isActive:method.isActive, displayOrder:String(method.displayOrder) } : blank(defaultBranch));
    setOpen(true);
  };
  const valid = form.name.trim().length >= 2 && !!form.type && !!form.branchId && Number.isInteger(Number(form.displayOrder)) && Number(form.displayOrder) > 0;
  const customType = form.type && !TYPES.some((type) => type.value === form.type) ? form.type : null;

  return <div className="space-y-6">
    <PageHeader title={ui('طرق الدفع الأونلاين')} description={ui('رتّب طرق التحويل التي تظهر للعميل وحدد الفرع الذي تستخدم فيه كل طريقة.')} actions={<Button className="min-h-11" disabled={options.isLoading || options.isError} onClick={() => edit()}><Plus className="me-2 size-4"/>{ui('إضافة طريقة')}</Button>}/>
    {options.isError && <ErrorState message={apiError(options.error)} onRetry={() => void options.refetch()}/>}
    {!options.data?.canManageGlobal && <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary"/><p>{ui('يمكنك إدارة طرق الدفع الخاصة بفروعك فقط. الطرق العامة لكل الفروع يديرها مدير النظام.')}</p></div>}
    {methods.isLoading ? <LoadingState/> : methods.isError ? <ErrorState message={apiError(methods.error)} onRetry={() => void methods.refetch()}/> : !methods.data?.length ? <EmptyState title={ui('لا توجد طرق دفع')} description={ui('أضف طريقة دفع واحدة على الأقل حتى يستطيع العميل إرسال طلبه.')}/> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{methods.data.map((method) => <Card key={method.id} className={method.isActive ? '' : 'opacity-70'}><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><CircleDollarSign className="size-5"/></span><div className="min-w-0"><b className="block truncate">{method.name}</b><small className={method.isActive ? 'text-emerald-700' : 'text-muted-foreground'}>{ui(method.isActive ? 'نشطة وتظهر للعميل' : 'موقوفة')}</small></div></div><Button aria-label={ui(`تعديل ${method.name}`)} size="icon" variant="ghost" onClick={() => edit(method)}><Pencil className="size-4"/></Button></div><div className="space-y-2 border-t pt-3 text-sm"><p><span className="text-muted-foreground">{ui('الفرع')}: </span>{branchName(method.branchId)}</p><p><span className="text-muted-foreground">{ui('الجهة')}: </span>{method.destination || '—'}</p><p><span className="text-muted-foreground">{ui('الحساب الظاهر')}: </span><span dir="ltr">{method.account || '—'}</span></p><p><span className="text-muted-foreground">{ui('الترتيب')}: </span><span className="nums">{method.displayOrder}</span>{method.hasSecret && <span className="ms-2 text-emerald-700">· {ui('بيانات داخلية محفوظة')}</span>}</p></div></CardContent></Card>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{ui(id ? 'تعديل طريقة الدفع' : 'إضافة طريقة دفع')}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label id="payment-field-1">{ui('اسم الطريقة')} *</Label><Input aria-labelledby="payment-field-1" className="mt-1.5 min-h-11" value={form.name} onChange={(event) => setForm({ ...form, name:event.target.value })} placeholder={ui('مثال: إنستاباي النعماني')}/></div><div><Label id="payment-field-2">{ui('النوع')} *</Label><Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}><SelectTrigger aria-labelledby="payment-field-2" className="mt-1.5 min-h-11"><SelectValue/></SelectTrigger><SelectContent>{customType && <SelectItem value={customType}>{customType}</SelectItem>}{TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{ui(type.label)}</SelectItem>)}</SelectContent></Select></div><div><Label id="payment-field-3">{ui('الفرع')} *</Label><Select value={form.branchId} onValueChange={(branchId) => setForm({ ...form, branchId })}><SelectTrigger aria-labelledby="payment-field-3" className="mt-1.5 min-h-11"><SelectValue placeholder={ui('اختر الفرع')}/></SelectTrigger><SelectContent>{options.data?.canManageGlobal && <SelectItem value="global">{ui('كل الفروع')}</SelectItem>}{options.data?.branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name ?? `${ui('فرع')} ${branch.id}`}</SelectItem>)}</SelectContent></Select></div><div><Label id="payment-field-4">{ui('الجهة المستلمة')}</Label><Input aria-labelledby="payment-field-4" className="mt-1.5 min-h-11" value={form.destination} onChange={(event) => setForm({ ...form, destination:event.target.value })} placeholder={ui('اسم صاحب الحساب أو البنك')}/></div><div><Label id="payment-field-5">{ui('رقم/اسم الحساب الظاهر')}</Label><Input aria-labelledby="payment-field-5" className="mt-1.5 min-h-11" dir="ltr" value={form.account} onChange={(event) => setForm({ ...form, account:event.target.value })}/></div><div className="sm:col-span-2"><Label id="payment-field-6">{ui('بيانات داخلية حساسة')}</Label><Input aria-labelledby="payment-field-6" className="mt-1.5 min-h-11" type="password" autoComplete="new-password" value={form.accountSecret} onChange={(event) => setForm({ ...form, accountSecret:event.target.value })} placeholder={id ? ui('اتركها فارغة للاحتفاظ بالقيمة المحفوظة') : ui('اختياري — لا تظهر للعميل')}/><p className="mt-1.5 text-xs text-muted-foreground">{ui('لا تُعرض هذه القيمة في القائمة أو في واجهة الموقع.')}</p></div><div><Label id="payment-field-7">{ui('ترتيب العرض')} *</Label><Input aria-labelledby="payment-field-7" className="mt-1.5 min-h-11" type="number" min="1" step="1" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder:event.target.value })}/></div><label className="flex min-h-11 items-center gap-3 self-end"><Switch checked={form.isActive} onCheckedChange={(isActive) => setForm({ ...form, isActive })}/><span>{ui('مفعّلة للعميل')}</span></label></div><DialogFooter><Button className="min-h-11" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{ui(save.isPending ? 'جاري الحفظ…' : 'حفظ طريقة الدفع')}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
