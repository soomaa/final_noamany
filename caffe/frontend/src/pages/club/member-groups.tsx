import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface GroupRow {
  id: number;
  name: string;
  category: string;
  max_members: number;
  current_members: number;
  is_active: boolean;
}

export function ClubMemberGroupsPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const { data: groups, refetch } = useArrayResource<GroupRow>('club-member-groups');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', category: '', maxMembers: '' });
  const [assignGroupId, setAssignGroupId] = useState<number | null>(null);
  const [assignMemberId, setAssignMemberId] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        category: form.category || ui('عام'),
        maxMembers: form.maxMembers ? Number(form.maxMembers) : 0,
      };
      if (editId) {
        await api.put(`/club-member-groups/${editId}`, body);
      } else {
        await api.post('/club-member-groups', body);
      }
      toast.success(ct('common.success'));
      setOpen(false);
      setEditId(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive' });
    if (!ok) return;
    try {
      await api.delete(`/club-member-groups/${id}`);
      toast.success(ct('common.success'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const assignMember = async () => {
    if (!assignGroupId || !assignMemberId.trim()) return;
    try {
      await api.post(`/club-member-groups/${assignGroupId}/members`, {
        memberId: Number(assignMemberId),
      });
      toast.success(ct('common.success'));
      setAssignGroupId(null);
      setAssignMemberId('');
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', category: '', maxMembers: '' });
    setOpen(true);
  };

  const openEdit = (g: GroupRow) => {
    setEditId(g.id);
    setForm({ name: g.name, category: g.category, maxMembers: String(g.max_members) });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('members.groupsTitle')}
        description={ct('members.groupsDesc')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ct('common.add')}
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(groups ?? []).map((g) => (
          <div key={g.id} className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <Users className="size-4" />
                {g.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{g.category}</p>
              <p className="mt-1 text-xs nums text-muted-foreground">
                {toArabicDigits(g.current_members)} / {g.max_members > 0 ? toArabicDigits(g.max_members) : '∞'}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" title={ui('إضافة عضو')} onClick={() => { setAssignGroupId(g.id); setAssignMemberId(''); }}>
                <Users className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(g.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ct('common.edit') : ct('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{ct('members.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('members.typeName')}</Label>
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <Input
              className="nums"
              placeholder={ct('members.groupsMaxMembers')}
              value={form.maxMembers}
              onChange={(e) => setForm((f) => ({ ...f, maxMembers: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={assignGroupId != null} onOpenChange={(v) => !v && setAssignGroupId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('إضافة عضو للمجموعة')}</DialogTitle>
          </DialogHeader>
          <Input
            className="nums"
            placeholder={ui('رقم العضو')}
            value={assignMemberId}
            onChange={(e) => setAssignMemberId(e.target.value)}
          />
          <DialogFooter>
            <Button variant="brand" onClick={() => void assignMember()}>
              {ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
