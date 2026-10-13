import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/common/combobox';
import { ListPageShell } from '@/components/common/list-page-shell';
import { api, apiError } from '@/lib/api';
import type { EvaluationCategory, EvaluationItem, EvaluationOption } from '@/types/evaluation-management';

export function AddEvaluationPage() {
  const [categoryId, setCategoryId] = useState(''); const [branchId, setBranchId] = useState(''); const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); const [scores, setScores] = useState<Record<number, string>>({});
  const categories = useQuery({ queryKey: ['evaluation-categories'], queryFn: () => api.get<EvaluationCategory[]>('/evaluation-management/categories').then(r => r.data) });
  const branches = useQuery({ queryKey: ['evaluation-branches'], queryFn: () => api.get<EvaluationOption[]>('/evaluation-management/lookups/branches').then(r => r.data) });
  const items = useQuery({ queryKey: ['evaluation-items', categoryId], enabled: !!categoryId, queryFn: () => api.get<EvaluationItem[]>(`/evaluation-management/categories/${categoryId}/items`).then(r => r.data) });
  const employees = useQuery({ queryKey: ['evaluation-employees', categoryId, branchId], enabled: !!categoryId && !!branchId, queryFn: () => api.get<EvaluationOption[]>(`/evaluation-management/categories/${categoryId}/employees`, { params: { branchId } }).then(r => r.data) });
  const selectCategory = (v: string) => { setCategoryId(v); setEmployeeId(''); setScores({}); };
  const valid = items.data?.length && items.data.every(i => { const n = Number(scores[i.id]); return scores[i.id] !== '' && Number.isFinite(n) && n >= 0 && n <= Number(i.maxScore); });
  const save = async () => { try { await api.post('/evaluation-management/evaluations', { categoryId: Number(categoryId), employeeId: Number(employeeId), branchId: Number(branchId), evaluationDate: date, evaluationMonth: month, details: (items.data ?? []).map(i => ({ itemId: i.id, awardedScore: scores[i.id] })) }); toast.success('تم حفظ التقييم'); setEmployeeId(''); setScores({}); } catch (e) { toast.error(apiError(e)); } };
  return <ListPageShell title="إضافة تقييم" description="اختر الفئة والموظف ثم أدخل درجات البنود"><div className="grid gap-4 rounded-xl border p-4 md:grid-cols-2"><div><Label>الفئة</Label><Combobox value={categoryId} onValueChange={selectCategory} options={(categories.data ?? []).map(x => ({ value: String(x.id), label: x.name }))} placeholder="اختر الفئة" /></div><div><Label>الفرع</Label><Combobox value={branchId} onValueChange={v => { setBranchId(v); setEmployeeId(''); }} options={(branches.data ?? []).map(x => ({ value: String(x.id), label: x.name }))} placeholder="اختر الفرع" /></div><div><Label>الموظف</Label><Combobox value={employeeId} onValueChange={setEmployeeId} options={(employees.data ?? []).map(x => ({ value: String(x.id), label: x.name }))} placeholder="اختر الموظف" /></div><div className="grid grid-cols-2 gap-2"><div><Label>التاريخ</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div><div><Label>الشهر</Label><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div></div></div>{categoryId && <div className="mt-5 overflow-hidden rounded-xl border"><table className="w-full text-sm"><thead><tr className="bg-muted"><th className="p-3 text-start">البند</th><th className="p-3">الدرجة العظمى</th><th className="p-3">الدرجة الممنوحة</th></tr></thead><tbody>{(items.data ?? []).map(i => <tr key={i.id} className="border-t"><td className="p-3">{i.name}</td><td className="p-3 text-center">{i.maxScore}</td><td className="p-3"><Input className="mx-auto max-w-32" type="number" min="0" max={i.maxScore} step="0.01" value={scores[i.id] ?? ''} onChange={e => setScores(s => ({ ...s, [i.id]: e.target.value }))} /></td></tr>)}</tbody></table></div>}<Button className="mt-5" disabled={!employeeId || !valid} onClick={() => void save()}>حفظ التقييم</Button></ListPageShell>;
}
