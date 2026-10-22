import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { toast } from 'sonner';

export function SupplierAccount({supplierId,name}:{supplierId:number;name:string}) {
  const [open,setOpen]=useState(false); const [selected,setSelected]=useState(''); const [amount,setAmount]=useState(''); const [date,setDate]=useState(localToday()); const [saving,setSaving]=useState(false);
  const user=useAuth((s)=>s.user); const {data:branches=[]}=useBranches(); const {can}=usePermission(); const qc=useQueryClient();
  const branchId=user?.branch || Number(selected) || branches[0]?.id;
  const {data,isError,isLoading}=useQuery({queryKey:['supplier-statement',supplierId,branchId],enabled:open&&!!branchId,queryFn:async()=> (await api.get<{balance:number;rows:Array<{date:string;reference:string;type:string;debit:number;credit:number;balance:number}>}>(`/supplier-invoices/supplier/${supplierId}/statement`,{params:{branchId}})).data});
  const save=async()=>{
    if (!branchId || !Number.isFinite(Number(amount)) || Number(amount)<=0) return toast.error('أدخل مديونية افتتاحية صحيحة');
    setSaving(true);try {await api.post('/supplier-invoices/opening-balance',{supplierId,branchId,amount:Number(amount),date});setAmount('');await Promise.all([qc.invalidateQueries({queryKey:['supplier-statement']}),qc.invalidateQueries({queryKey:['supplier-debts']})]);toast.success('تم تسجيل المديونية الافتتاحية');} catch(e){toast.error(apiError(e));}finally{setSaving(false);}
  };
  return <><Button variant="outline" className="mt-3 w-full" onClick={()=>setOpen(true)}>كشف الحساب والرصيد الافتتاحي</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent size="xl" className="max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>كشف حساب — {name}</DialogTitle></DialogHeader>
    {!user?.branch?<select aria-label="الفرع" value={branchId??''} onChange={(e)=>setSelected(e.target.value)}>{branches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select>:null}
    <p className="font-bold">الرصيد المستحق: {data?.balance.toFixed(2)??'—'} ج.م {data && data.balance<0?'(لصالحنا)':''}</p>
    {isError?<p role="alert">تعذر تحميل كشف الحساب</p>:isLoading?<p>جاري التحميل…</p>:<table className="w-full text-sm"><thead><tr>{['التاريخ','المستند','الحركة','مستحق للمورد','تخفيض / سداد','الرصيد'].map((h)=><th key={h} className="p-2 text-start">{h}</th>)}</tr></thead><tbody>{data?.rows.map((r)=><tr key={r.reference} className="border-t"><td className="p-2">{r.date}</td><td>{r.reference}</td><td>{r.type}</td><td>{r.debit.toFixed(2)}</td><td>{r.credit.toFixed(2)}</td><td>{r.balance.toFixed(2)}</td></tr>)}</tbody></table>}
    {can('gym-sales.procurement.cafe_purchases:create')?<div className="grid gap-3 rounded-xl border p-3"><Label>مديونية افتتاحية للمورد — تُسجل مرة واحدة لكل فرع</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} /><Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} /><Button disabled={saving} onClick={()=>void save()}>تسجيل الرصيد الافتتاحي</Button></div>:null}
  </DialogContent></Dialog></>;
}
