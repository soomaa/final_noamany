import { Bell, Package, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DialogFormGrid,
  DialogFormSection,
  DialogFormToggle,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FORM_DIALOG_CONTENT_CLASS,
} from '@/components/common/dialog-form-layout';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import type { ClubSubscriptionType } from '@/types/club';

type SubTypeForm = {
  name: string;
  kind: 'package' | 'sessions';
  applyToAllBranches: boolean;
  branchIds: number[];
  price: string;
  days: string;
  sessionsCount: string;
  isPartOfTarget: boolean;
  invitationsCount: string;
  inbodyCount: string;
  isForStudents: boolean;
  showInApp: boolean;
  notifyCustomers: boolean;
  notifyOnExpiry: boolean;
  walletPoints: string;
  offerValidity: string;
  isLinkedToFreeze: boolean;
  freezeDays: string;
  includesSpa: boolean;
  spaCount: string;
};

const emptyForm = (branchIds: number[] = []): SubTypeForm => ({
  name: '', kind: 'package', applyToAllBranches: true, branchIds, price: '', days: '', sessionsCount: '', isPartOfTarget: false,
  invitationsCount: '0', inbodyCount: '0', isForStudents: false, showInApp: false,
  notifyCustomers: false, notifyOnExpiry: false, walletPoints: '0', offerValidity: '',
  isLinkedToFreeze: false, freezeDays: '0', includesSpa: false, spaCount: '0',
});

function toForm(type: ClubSubscriptionType, allBranchIds: number[]): SubTypeForm {
  const all = !!type.applyToAllBranches;
  const branchIds = all ? allBranchIds : type.branchIds?.length ? type.branchIds : type.branchId ? [type.branchId] : [];
  return {
    name: type.name,
    kind: type.isLinkedToSessions ? 'sessions' : 'package',
    applyToAllBranches: all,
    branchIds,
    price: String(type.price),
    days: String(type.days),
    sessionsCount: type.sessionsCount != null ? String(type.sessionsCount) : '',
    isPartOfTarget: !!type.isPartOfTarget,
    invitationsCount: String(type.invitationsCount ?? 0),
    inbodyCount: String(type.inbodyCount ?? 0),
    isForStudents: !!type.isForStudents,
    showInApp: !!type.showInApp,
    notifyCustomers: !!type.notifyCustomers,
    notifyOnExpiry: !!type.notifyOnExpiry,
    walletPoints: String(type.walletPoints ?? 0),
    offerValidity: type.offerValidity ?? '',
    isLinkedToFreeze: !!type.isLinkedToFreeze,
    freezeDays: String(type.freezeDays ?? 0),
    includesSpa: !!type.includesSpa,
    spaCount: String(type.spaCount ?? 0),
  };
}

function FormField({ label, required, children, className }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className ?? ''}`}><Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>{children}</div>;
}

export function ClubPackageSettingsPage() {
  const ct = useClubT();
  const { user } = useAuth();
  const isAdmin = user?.level === 1;
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: allTypes, refetch } = useArrayResource<ClubSubscriptionType>('club-subscription-types');
  const types = useMemo(() => (allTypes ?? []).filter((type) => !type.isSpecialOffer), [allTypes]);
  const allBranchIds = useMemo(() => (branches ?? []).map((branch) => branch.id), [branches]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SubTypeForm>(emptyForm);
  const patchForm = (patch: Partial<SubTypeForm>) => setForm((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (open && form.applyToAllBranches) patchForm({ branchIds: allBranchIds });
    // The branch catalog is stable during one dialog; avoid re-running for local form edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allBranchIds]);

  const openCreate = () => { setEditId(null); setForm(emptyForm(allBranchIds)); setOpen(true); };
  const openEdit = (type: ClubSubscriptionType) => { setEditId(type.id); setForm(toForm(type, allBranchIds)); setOpen(true); };
  const branchLabel = (type: ClubSubscriptionType) => type.applyToAllBranches
    ? ct('common.allBranches')
    : (type.branchIds?.length ? type.branchIds : type.branchId ? [type.branchId] : []).map((id) => branches?.find((branch) => branch.id === id)?.name ?? id).join(' · ');

  const save = async () => {
    if (!form.name.trim() || form.price === '' || !Number(form.days) || (form.kind === 'sessions' && !Number(form.sessionsCount))) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (!form.applyToAllBranches && !form.branchIds.length) {
      toast.error(ct('packages.selectAtLeastOneBranch'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        applyToAllBranches: form.applyToAllBranches,
        branchIds: form.applyToAllBranches ? [] : form.branchIds,
        price: Number(form.price),
        days: Number(form.days),
        isPartOfTarget: form.isPartOfTarget,
        invitationsCount: Number(form.invitationsCount) || 0,
        inbodyCount: Number(form.inbodyCount) || 0,
        isSpecialOffer: false,
        isForStudents: form.isForStudents,
        showInApp: form.showInApp,
        notifyCustomers: form.notifyCustomers,
        notifyOnExpiry: form.notifyOnExpiry,
        walletPoints: Number(form.walletPoints) || 0,
        offerValidity: form.offerValidity || null,
        isLinkedToSessions: form.kind === 'sessions',
        sessionsCount: form.kind === 'sessions' ? Number(form.sessionsCount) : null,
        classTypeIds: [],
        allowMultipleDailyEntries: true,
        isLinkedToFreeze: form.isLinkedToFreeze,
        freezeDays: form.isLinkedToFreeze ? Number(form.freezeDays) || null : null,
        includesSpa: form.includesSpa,
        spaCount: form.includesSpa ? Number(form.spaCount) || null : null,
      };
      if (editId) await api.put(`/club-subscription-types/${editId}`, body);
      else await api.post('/club-subscription-types', body);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!(await confirm({ title: ct('common.confirmDelete'), variant: 'destructive' }))) return;
    try { await api.delete(`/club-subscription-types/${id}`); toast.success(ct('common.success')); void refetch(); }
    catch (error) { toast.error(apiError(error)); }
  };

  return <div className="space-y-6">
    <PageHeader title={ct('packages.settingsTitle')} description="إدارة باقات الاشتراك العادية وباقات الحصص، مع بقاء الاشتراكات الخاصة منفصلة." actions={<Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ct('subscriptions.newType')}</Button>} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{types.map((type) => <div key={type.id} className="flex items-start justify-between rounded-xl border bg-card p-4 shadow-sm"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{type.name}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${type.isLinkedToSessions ? 'bg-sky-500/10 text-sky-700' : 'bg-emerald-500/10 text-emerald-700'}`}>{type.isLinkedToSessions ? 'حصص' : 'اشتراك'}</span></div><p className="mt-1 text-sm text-muted-foreground nums">{toArabicDigits(type.price)} ج.م · {type.isLinkedToSessions ? `${toArabicDigits(type.sessionsCount ?? 0)} حصة` : `${toArabicDigits(type.days)} ${ct('subscriptions.typeDays')}`}</p><p className="mt-1 text-xs text-muted-foreground">{branchLabel(type)}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(type)}><Pencil className="size-4" /></Button>{isAdmin ? <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(type.id)}><Trash2 className="size-4" /></Button> : null}</div></div>)}{!types.length ? <p className="col-span-full rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">{ct('common.noData')}</p> : null}</div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}><FormDialogHeader><DialogTitle>{editId ? ct('packages.editSubscriptionType') : ct('packages.addSubscriptionType')}</DialogTitle></FormDialogHeader><FormDialogBody>
      <DialogFormSection title={ct('packages.sectionBasic')} icon={Package}><DialogFormGrid columns={2}>
        <FormField label="نوع الباقة" required><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.kind} onChange={(event) => patchForm({ kind: event.target.value as SubTypeForm['kind'], sessionsCount: event.target.value === 'sessions' ? form.sessionsCount : '' })}><option value="package">اشتراك</option><option value="sessions">حصص</option></select></FormField>
        <FormField label={ct('packages.subscriptionName')} required><Input value={form.name} onChange={(event) => patchForm({ name: event.target.value })} /></FormField>
        <FormField label={ct('packages.subscriptionValueEgp')} required><Input type="number" min={0} step="0.01" className="nums" value={form.price} onChange={(event) => patchForm({ price: event.target.value })} /></FormField>
        <FormField label={form.kind === 'sessions' ? 'صلاحية باقة الحصص (بالأيام)' : ct('packages.subscriptionDays')} required><Input type="number" min={1} className="nums" value={form.days} onChange={(event) => patchForm({ days: event.target.value })} /></FormField>
        {form.kind === 'sessions' ? <FormField label="عدد الحصص" required><Input type="number" min={1} className="nums" value={form.sessionsCount} onChange={(event) => patchForm({ sessionsCount: event.target.value })} /></FormField> : null}
        <FormField label={ct('common.branch')} required className="sm:col-span-2"><div className="space-y-3 rounded-lg border bg-muted/20 p-3"><label className="flex items-center gap-2"><Checkbox checked={form.applyToAllBranches} onCheckedChange={(checked) => patchForm({ applyToAllBranches: !!checked, branchIds: checked ? allBranchIds : [] })} /><span className="text-sm font-medium">{ct('common.allBranches')}</span></label>{branchesLoading ? <p className="text-sm text-muted-foreground">{ct('common.loading')}</p> : <div className="grid gap-2 sm:grid-cols-2">{(branches ?? []).map((branch) => <label key={branch.id} className="flex items-center gap-2"><Checkbox disabled={form.applyToAllBranches} checked={form.applyToAllBranches || form.branchIds.includes(branch.id)} onCheckedChange={(checked) => patchForm({ branchIds: checked ? [...new Set([...form.branchIds, branch.id])] : form.branchIds.filter((id) => id !== branch.id) })} /><span className="text-sm">{branch.name}</span></label>)}</div>}</div></FormField>
      </DialogFormGrid></DialogFormSection>
      <DialogFormSection title={ct('packages.sectionBenefits')} icon={Sparkles}><DialogFormGrid columns={2}><DialogFormToggle label={ct('packages.isPartOfTarget')} checked={form.isPartOfTarget} onCheckedChange={(value) => patchForm({ isPartOfTarget: value })} /><DialogFormToggle label={ct('packages.isForStudents')} checked={form.isForStudents} onCheckedChange={(value) => patchForm({ isForStudents: value })} /><FormField label={ct('packages.invitationsCount')}><Input type="number" min={0} className="nums" value={form.invitationsCount} onChange={(event) => patchForm({ invitationsCount: event.target.value })} /></FormField><FormField label={ct('packages.inbodyCount')}><Input type="number" min={0} className="nums" value={form.inbodyCount} onChange={(event) => patchForm({ inbodyCount: event.target.value })} /></FormField><FormField label={ct('packages.walletPoints')}><Input type="number" min={0} className="nums" value={form.walletPoints} onChange={(event) => patchForm({ walletPoints: event.target.value })} /></FormField><FormField label={ct('packages.offerValidity')}><Input type="date" className="nums" value={form.offerValidity} onChange={(event) => patchForm({ offerValidity: event.target.value })} /></FormField></DialogFormGrid></DialogFormSection>
      <DialogFormSection title={ct('packages.sectionApp')} icon={Bell}><div className="grid gap-3 sm:grid-cols-3"><DialogFormToggle label={ct('packages.showInApp')} checked={form.showInApp} onCheckedChange={(value) => patchForm({ showInApp: value })} /><DialogFormToggle label={ct('packages.notifyCustomers')} checked={form.notifyCustomers} onCheckedChange={(value) => patchForm({ notifyCustomers: value })} /><DialogFormToggle label={ct('packages.notifyOnExpiry')} checked={form.notifyOnExpiry} onCheckedChange={(value) => patchForm({ notifyOnExpiry: value })} /></div></DialogFormSection>
      <DialogFormSection title="التجميد والخدمات"><div className="grid gap-3 sm:grid-cols-2"><DialogFormToggle label={ct('packages.isLinkedToFreeze')} checked={form.isLinkedToFreeze} onCheckedChange={(value) => patchForm({ isLinkedToFreeze: value })} /><DialogFormToggle label={ct('packages.includesSpa')} checked={form.includesSpa} onCheckedChange={(value) => patchForm({ includesSpa: value })} /></div><DialogFormGrid columns={2} className="mt-3">{form.isLinkedToFreeze ? <FormField label={ct('packages.freezeDays')}><Input type="number" min={1} className="nums" value={form.freezeDays} onChange={(event) => patchForm({ freezeDays: event.target.value })} /></FormField> : null}{form.includesSpa ? <FormField label={ct('packages.spaCount')}><Input type="number" min={1} className="nums" value={form.spaCount} onChange={(event) => patchForm({ spaCount: event.target.value })} /></FormField> : null}</DialogFormGrid></DialogFormSection>
    </FormDialogBody><FormDialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button><Button variant="brand" onClick={() => void save()} disabled={saving}><Save className="size-4" /> {ct('common.save')}</Button></FormDialogFooter></DialogContent></Dialog>
  </div>;
}
