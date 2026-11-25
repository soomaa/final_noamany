import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { formatDisplayNumber } from '@/lib/number-display';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { useTrainingAccess } from './access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EquipmentThumb, equipmentCategories, groupEquipment } from '@/components/training/equipment';
import type { Exercise, TrainingEquipment } from './model';

interface Form { id?: number; name: string; imageUrl: string; category: string; branchId: string }

export function EquipmentLibraryPanel({
  equipment,
  exercises,
  ar,
  canCreate,
  canUpdate,
  loading,
  onSaved,
}: {
  equipment: TrainingEquipment[];
  exercises: Exercise[];
  ar: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  loading: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const tr = (a: string, e: string) => (ar ? a : e);
  const { base } = useTrainingAccess();
  const user = useAuth(s => s.user);
  const branches = useBranches();
  const branchList = branches.data ?? [];
  const multiBranch = new Set(equipment.map(e => e.branchId)).size > 1 || branchList.length > 1;
  const [branch, setBranch] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const branchName = (id: number) => branchList.find(b => b.id === id)?.name ?? `#${id}`;
  const usage = (item: TrainingEquipment) => exercises.filter(e => e.equipment?.some(x => x.name.trim() === item.name.trim())).length;
  const visible = equipment.filter(e => (!branch || e.branchId === Number(branch)) && (!search.trim() || e.name.includes(search.trim())));

  async function save() {
    if (!form || !form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), imageUrl: form.imageUrl || null, category: form.category || null };
      if (form.id) await api.put(`${base}/equipment/${form.id}`, payload);
      else await api.post(`${base}/equipment`, { ...payload, branchId: Number(form.branchId) });
      await onSaved();
      toast.success(tr('تم حفظ الجهاز', 'Equipment saved'));
      setForm(null);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{tr('مكتبة الأجهزة', 'Equipment library')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {tr('كل جهاز باسمه وصورته. اربطه بالتمارين، ويظهر بالصورة في تطبيق العضو وبالاسم في ورقة البرنامج المطبوعة.', 'Each machine with its name and photo. Link it to exercises; members see the photo in the app and the printed sheet shows the name.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && <Button onClick={() => setForm({ name: '', imageUrl: '', category: '', branchId: String(branch || user?.branch || branchList[0]?.id || '') })}><Plus className="size-4" />{tr('جهاز جديد', 'New equipment')}</Button>}
          {canUpdate && <Button asChild variant="outline"><Link to="/club/fitness/equipment">{tr('الوحدات والصيانة', 'Units & maintenance')}</Link></Button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" aria-label={tr('ابحث في الأجهزة', 'Search equipment')} placeholder={tr('ابحث عن جهاز…', 'Search equipment…')} value={search} onChange={e => setSearch(e.target.value)} />
        {multiBranch && (
          <select aria-label={tr('الفرع', 'Branch')} className="min-h-11 rounded-lg border bg-background px-3 text-sm" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">{tr('كل الفروع', 'All branches')}</option>
            {branchList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      {loading ? <p role="status">{tr('تحميل الأجهزة…', 'Loading equipment…')}</p> : !visible.length ? (
        <p className="rounded-xl border bg-card p-6 text-muted-foreground">
          {equipment.length ? tr('لا توجد أجهزة مطابقة.', 'No matching equipment.') : tr('لم تُضف أجهزة بعد.', 'No equipment added yet.')}
        </p>
      ) : groupEquipment(visible).map(({ group, items }) => (
        <section key={group.id} className="space-y-3">
          <h3 className="font-semibold">{ar ? group.ar : group.en} <span className="text-sm font-normal text-muted-foreground">· {formatDisplayNumber(items.length)}</span></h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {items.map(item => {
              const count = usage(item);
              return (
                <li key={item.id} className="overflow-hidden rounded-xl border bg-card">
                  <EquipmentThumb item={item} className="aspect-[4/3] w-full rounded-none" />
                  <div className="space-y-1 p-3">
                    <p className="font-medium leading-snug">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {multiBranch && `${branchName(item.branchId)} · `}
                      {count === 0 ? tr('غير مرتبط بتمارين', 'Not linked to exercises') : count === 1 ? tr('في تمرين واحد', 'In 1 exercise') : count === 2 ? tr('في تمرينين', 'In 2 exercises') : tr(`في ${formatDisplayNumber(count)} تمارين`, `In ${formatDisplayNumber(count)} exercises`)}
                    </p>
                    {canUpdate && (
                      <Button size="sm" variant="ghost" className="-ms-2 mt-1" onClick={() => setForm({ id: item.id, name: item.name, imageUrl: item.imageUrl ?? '', category: item.category ?? '', branchId: String(item.branchId) })}>
                        <Pencil className="size-3.5" />{tr('تعديل', 'Edit')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {form && (
        <Dialog open onOpenChange={open => { if (!open && !saving) setForm(null); }}>
          <DialogContent size="md" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>{form.id ? tr('تعديل الجهاز', 'Edit equipment') : tr('جهاز جديد', 'New equipment')}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <EquipmentPhotoField base={base} ar={ar} value={form.imageUrl} onChange={value => setForm(f => f && { ...f, imageUrl: value })} />
              <div className="grid gap-2">
                <Label htmlFor="equipment-library-name">{tr('اسم الجهاز', 'Equipment name')}</Label>
                <Input id="equipment-library-name" maxLength={200} value={form.name} onChange={e => setForm(f => f && { ...f, name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="equipment-library-category">{tr('التصنيف', 'Category')}</Label>
                <select id="equipment-library-category" className="min-h-11 rounded-lg border bg-background px-3" value={form.category} onChange={e => setForm(f => f && { ...f, category: e.target.value })}>
                  <option value="">{tr('أخرى', 'Other')}</option>
                  {equipmentCategories.map(c => <option key={c.id} value={c.id}>{ar ? c.ar : c.en}</option>)}
                </select>
              </div>
              {!form.id && (
                <div className="grid gap-2">
                  <Label htmlFor="equipment-library-branch">{tr('الفرع', 'Branch')}</Label>
                  <select id="equipment-library-branch" className="min-h-11 rounded-lg border bg-background px-3" value={form.branchId} onChange={e => setForm(f => f && { ...f, branchId: e.target.value })}>
                    {branchList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {form.id && <p className="text-xs text-muted-foreground">{tr('الاسم والصورة والتصنيف تُطبَّق على كل وحدات هذا الجهاز في الفرع. البرامج المحفوظة تحتفظ بالاسم القديم.', 'Name, photo and category apply to every unit of this machine in the branch. Saved programs keep the earlier name.')}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>{tr('إلغاء', 'Cancel')}</Button>
              <Button variant="brand" disabled={saving || !form.name.trim() || (!form.id && !form.branchId)} onClick={() => void save()}>{saving ? tr('حفظ…', 'Saving…') : tr('حفظ', 'Save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

/** Photo upload for a library machine (stored under /uploads/club/equipment by the training API). */
function EquipmentPhotoField({ base, ar, value, onChange }: { base: string; ar: boolean; value: string; onChange: (value: string) => void }) {
  const tr = (a: string, e: string) => (ar ? a : e);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ imageUrl: string }>(`${base}/equipment/photo`, fd);
      onChange(data.imageUrl);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor="equipment-library-photo">{tr('صورة الجهاز', 'Equipment photo')}</Label>
      <div className="flex items-center gap-3">
        <EquipmentThumb item={{ imageUrl: value || null }} className="size-20" />
        <div className="grid flex-1 gap-2">
          <Input id="equipment-library-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e => void upload(e.target.files?.[0])} />
          {value && <Button type="button" size="sm" variant="ghost" className="justify-self-start" disabled={uploading} onClick={() => onChange('')}>{tr('إزالة الصورة', 'Remove photo')}</Button>}
          {uploading && <p role="status" className="text-xs text-muted-foreground">{tr('جارٍ رفع الصورة…', 'Uploading photo…')}</p>}
        </div>
      </div>
    </div>
  );
}
