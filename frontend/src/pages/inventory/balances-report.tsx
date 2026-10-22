import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {WarehouseSelect} from '@/components/inventory/warehouse-select';
import {InventoryPageShell} from './inventory-shell';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {api} from '@/lib/api';
import {localToday} from '@/lib/formatters';
import {downloadExcel} from '@/lib/export';

const fields=[['name','الصنف'],['category','الفئة'],['warehouse','المخزن / البار'],['unit','الوحدة'],['opening','رصيد البداية'],['purchases','المشتريات'],['transfersIn','تحويل وارد'],['sales','صرف للبيع والطلبات المعلقة'],['drawings','مسحوبات الإدارة'],['transfersOut','تحويل صادر'],['purchaseReturns','مرتجع شراء'],['salesReturns','مرتجع بيع'],['adjustments','افتتاحي وتسويات وصرف آخر'],['closing','رصيد النهاية']] as const;
export function InventoryBalancesReportPage(){
  const [warehouseId,setWarehouseId]=useState('');const [from,setFrom]=useState(localToday());const [to,setTo]=useState(localToday());const [category,setCategory]=useState('');
  const {data=[],isLoading,isError}=useQuery({queryKey:['inventory-balances-report',warehouseId,from,to],queryFn:async()=>(await api.get<Array<Record<string,string|number>>>('/inventory-movements/reports/balances',{params:{warehouseId:warehouseId||undefined,dateFrom:from||undefined,dateTo:to||undefined}})).data});
  const categories=[...new Set(data.map((r)=>String(r.category)))].filter(Boolean);const rows=category?data.filter((r)=>r.category===category):data;
  return <InventoryPageShell title="حركة وأرصدة الأصناف" description="رصيد كل صنف في كل مكان، مع فصل المبيعات والمسحوبات والتحويلات والمرتجعات">
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4"><WarehouseSelect value={warehouseId} onChange={setWarehouseId} emptyLabel="كل المخازن" /><div><Label>من تاريخ</Label><Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></div><div><Label>إلى تاريخ</Label><Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></div><div><Label>الفئة</Label><select className="h-10 w-full rounded-md border bg-background" value={category} onChange={(e)=>setCategory(e.target.value)}><option value="">كل الفئات</option>{categories.map((c)=><option key={c}>{c}</option>)}</select></div></div>
    <div className="flex gap-2"><Button disabled={isLoading||isError} onClick={()=>void downloadExcel(rows,fields.map(([key,header])=>({key,header})),'حركة-وأرصدة-الأصناف')}>تصدير Excel</Button><Button variant="outline" onClick={()=>window.print()}>طباعة</Button></div>
    {isError?<p role="alert">تعذر تحميل التقرير</p>:isLoading?<p>جاري التحميل…</p>:<div className="overflow-auto rounded-xl border"><table className="w-full whitespace-nowrap bg-card text-sm"><thead><tr>{fields.map(([key,title])=><th key={key} className="p-3 text-start">{title}</th>)}</tr></thead><tbody>{rows.map((r)=><tr className="border-t" key={`${r.productId}:${r.warehouseId}`}>{fields.map(([key])=><td key={key} className="p-3">{r[key]}</td>)}</tr>)}{!rows.length?<tr><td colSpan={fields.length} className="p-5">لا توجد أرصدة مطابقة</td></tr>:null}</tbody></table></div>}
  </InventoryPageShell>;
}
