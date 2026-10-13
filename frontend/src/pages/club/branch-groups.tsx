import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DialogFormGrid,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FORM_DIALOG_CONTENT_CLASS,
} from '@/components/common/dialog-form-layout';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';

type BranchGroup = {
  id: number;
  name: string;
  isActive: boolean;
  branchIds: number[];
};

type GroupForm = {
  name: string;
  isActive: boolean;
  branchIds: number[];
};

const emptyForm = (): GroupForm => ({ name: '', isActive: true, branchIds: [] });

function toForm(g: BranchGroup): GroupForm {
  return { name: g.name, isActive: g.isActive, branchIds: [...(g.branchIds ?? [])] };
}

export default function BranchGroupsPage() {
  const qc = useQueryClient();
  const { data: branchesData } = useBranches();
  const branches = Array.isArray(branchesData) ? branchesData : [];

  const { data: groupsData, isLoading } = useQuery<BranchGroup[]>({
    queryKey: ['club-branch-groups'],
    queryFn: () => api.get('/club-branch-groups').then((r) => r.data),
  });
  const groups: BranchGroup[] = Array.isArray(groupsData) ? groupsData : [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BranchGroup | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(g: BranchGroup) {
    setEditTarget(g);
    setForm(toForm(g));
    setDialogOpen(true);
  }

  function toggleBranch(branchId: number, checked: boolean) {
    setForm((f) => ({
      ...f,
      branchIds: checked ? [...f.branchIds, branchId] : f.branchIds.filter((id) => id !== branchId),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('يرجى إدخال اسم المجموعة');
    if (form.branchIds.length < 2) return toast.error('يجب اختيار فرعين على الأقل');

    setSaving(true);
    try {
      if (editTarget) {
        await api.put(`/club-branch-groups/${editTarget.id}`, {
          name: form.name.trim(),
          isActive: form.isActive,
          branchIds: form.branchIds,
        });
        toast.success('تم تحديث المجموعة');
      } else {
        await api.post('/club-branch-groups', {
          name: form.name.trim(),
          branchIds: form.branchIds,
        });
        toast.success('تم إنشاء المجموعة');
      }
      qc.invalidateQueries({ queryKey: ['club-branch-groups'] });
      setDialogOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: BranchGroup) {
    const ok = await confirm({
      title: 'حذف المجموعة',
      description: `هل أنت متأكد من حذف مجموعة "${g.name}"؟`,
    });
    if (!ok) return;
    try {
      await api.delete(`/club-branch-groups/${g.id}`);
      toast.success('تم حذف المجموعة');
      qc.invalidateQueries({ queryKey: ['club-branch-groups'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  function getBranchName(id: number) {
    return branches.find((b) => b.id === id)?.name ?? `فرع ${id}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مجموعات الفروع"
        description="أضف الفروع التي تشترك في قاعدة أعضاء واحدة ليتمكن أعضاؤها من الدخول في أي منها"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 ml-1" />
            مجموعة جديدة
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Network className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">لا توجد مجموعات فروع حتى الآن</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 ml-1" />
            إضافة مجموعة
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border bg-card p-4 shadow-sm flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{g.name}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {g.isActive ? 'نشطة' : 'معطلة'}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(g)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(g)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(g.branchIds ?? []).map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                  >
                    {getBranchName(id)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <FormDialogHeader>
            <DialogTitle>{editTarget ? 'تعديل المجموعة' : 'مجموعة فروع جديدة'}</DialogTitle>
          </FormDialogHeader>

          <FormDialogBody>
            <DialogFormGrid columns={1}>
              <div className="space-y-2">
                <Label>اسم المجموعة</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: مجموعة شبين الكوم"
                  dir="rtl"
                />
              </div>

              {editTarget && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>تفعيل المجموعة</Label>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>الفروع المشمولة <span className="text-muted-foreground text-xs">(اختر فرعين على الأقل)</span></Label>
                <div className="max-h-56 overflow-y-auto rounded-md border p-3 space-y-2">
                  {branches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.branchIds.includes(b.id)}
                        onCheckedChange={(c) => toggleBranch(b.id, !!c)}
                      />
                      <span className="text-sm">{b.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </DialogFormGrid>
          </FormDialogBody>

          <FormDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : editTarget ? 'حفظ التعديلات' : 'إنشاء المجموعة'}
            </Button>
          </FormDialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
