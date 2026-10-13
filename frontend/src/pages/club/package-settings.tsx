import { Bell, Building2, Calendar, CheckCircle2, ChevronDown, Eye, Hash, Package, Pencil, Plus, Save, Snowflake, Sparkles, Trash2, Users, Wallet, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  isActive: boolean;
};

const emptyForm = (branchIds: number[] = []): SubTypeForm => ({
  name: '', kind: 'package', applyToAllBranches: true, branchIds, price: '', days: '', sessionsCount: '', isPartOfTarget: false,
  invitationsCount: '0', inbodyCount: '0', isForStudents: false, showInApp: false,
  notifyCustomers: false, notifyOnExpiry: false, walletPoints: '0', offerValidity: '',
  isLinkedToFreeze: false, freezeDays: '0', includesSpa: false, spaCount: '0',
  isActive: true,
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
    isActive: type.isActive !== false,
  };
}

function FormField({ label, required, children, className }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className ?? ''}`}><Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>{children}</div>;
}

/* ── Detail row helpers ── */
function DetailRow({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Package;
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${highlight ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function BoolRow({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="flex-1 text-sm">{label}</p>
      {value
        ? <CheckCircle2 className="size-5 text-green-500" />
        : <XCircle className="size-5 text-muted-foreground/40" />}
    </div>
  );
}

/* ── Date formatter ── */
function formatOfferDate(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return toArabicDigits(val);
}

/* ── Package Details Dialog ── */
function PackageDetailsDialog({
  type,
  open,
  onClose,
  branchLabel,
}: {
  type: ClubSubscriptionType | null;
  open: boolean;
  onClose: () => void;
  branchLabel: (t: ClubSubscriptionType) => string;
}) {
  if (!type) return null;

  const isActive = type.isActive !== false;
  const accent = type.isLinkedToSessions ? '#0ea5e9' : '#10b981';
  const accentBg = type.isLinkedToSessions ? 'bg-sky-500/10 text-sky-700' : 'bg-emerald-500/10 text-emerald-700';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-lg overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{type.name}</DialogTitle>

        {/* Scrollable area */}
        <div className="flex max-h-[90vh] flex-col overflow-y-auto">

          {/* Hero header — opaque inline style so dark-mode can't override */}
          <div style={{ background: `linear-gradient(135deg, ${accent} 0%, ${type.isLinkedToSessions ? '#0284c7' : '#059669'} 100%)`, flexShrink: 0 }}>
            <div className="px-6 pb-5 pt-6">
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-md" style={{ background: 'rgba(255,255,255,0.25)' }}>
                  {type.isLinkedToSessions ? <Users className="size-7 text-white" /> : <Package className="size-7 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-extrabold leading-tight text-white drop-shadow-sm">{type.name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: 'rgba(255,255,255,0.22)' }}>
                      {type.isLinkedToSessions ? 'باقة حصص' : 'باقة اشتراك'}
                    </span>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: isActive ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)' }}>
                      {isActive ? '● نشطة' : '● غير نشطة'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price + Duration */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.20)' }}>
                  <p className="text-xs text-white/75">السعر</p>
                  <p className="nums mt-1 text-2xl font-extrabold text-white">{toArabicDigits(type.price)}</p>
                  <p className="text-xs text-white/75">جنيه مصري</p>
                </div>
                <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.20)' }}>
                  <p className="text-xs text-white/75">{type.isLinkedToSessions ? 'الحصص' : 'المدة'}</p>
                  <p className="nums mt-1 text-2xl font-extrabold text-white">
                    {type.isLinkedToSessions ? toArabicDigits(type.sessionsCount ?? 0) : toArabicDigits(type.days)}
                  </p>
                  <p className="text-xs text-white/75">{type.isLinkedToSessions ? 'حصة' : 'يوم'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">التفاصيل الأساسية</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailRow icon={Building2} label="الفرع" value={branchLabel(type)} highlight />
              {type.isLinkedToSessions && (
                <DetailRow icon={Calendar} label="صلاحية الباقة" value={`${toArabicDigits(type.days)} يوم`} />
              )}
              <DetailRow icon={Hash} label="كود الباقة" value={<span className="font-mono">{type.id}</span>} />
              {type.offerValidity && (
                <DetailRow icon={Calendar} label="صلاحية العرض حتى" value={formatOfferDate(type.offerValidity)} highlight />
              )}
            </div>

            <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">المزايا</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailRow icon={Users} label="دعوات" value={`${toArabicDigits(type.invitationsCount ?? 0)} دعوة`} />
              <DetailRow icon={Sparkles} label="جلسات إنبودي" value={`${toArabicDigits(type.inbodyCount ?? 0)} جلسة`} />
              <DetailRow icon={Wallet} label="نقاط المحفظة" value={`${toArabicDigits(type.walletPoints ?? 0)} نقطة`} />
              {type.includesSpa && (
                <DetailRow icon={Sparkles} label="جلسات السبا" value={`${toArabicDigits(type.spaCount ?? 0)} زيارة`} highlight />
              )}
              {type.isLinkedToFreeze && (
                <DetailRow icon={Snowflake} label="أيام الوقف" value={`${toArabicDigits(type.freezeDays ?? 0)} يوم`} highlight />
              )}
            </div>

            <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">الهدف والتارجت</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <BoolRow icon={Package} label="يحتسب في الهدف" value={!!type.isPartOfTarget} />
            </div>

            <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">الخصائص</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <BoolRow icon={Users} label="للطلاب فقط" value={!!type.isForStudents} />
              <BoolRow icon={Bell} label="يظهر في التطبيق" value={!!type.showInApp} />
              <BoolRow icon={Bell} label="إشعار للعملاء" value={!!type.notifyCustomers} />
              <BoolRow icon={Bell} label="إشعار عند الانتهاء" value={!!type.notifyOnExpiry} />
              <BoolRow icon={Snowflake} label="يشمل وقف الاشتراك" value={!!type.isLinkedToFreeze} />
              <BoolRow icon={Sparkles} label="يشمل السبا" value={!!type.includesSpa} />
            </div>
          </div>

          <div className="border-t px-5 py-4">
            <Button variant="outline" className="w-full" onClick={onClose}>إغلاق</Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClubPackageSettingsPage() {
  const ct = useClubT();
  const { user } = useAuth();
  const isAdmin = user?.level === 1;
  const queryClient = useQueryClient();
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const allBranchIds = useMemo(() => (branches ?? []).map((branch) => branch.id), [branches]);

  const { data: allTypes, refetch } = useQuery<ClubSubscriptionType[]>({
    queryKey: ['club-subscription-types', 'settings-all'],
    queryFn: async () => {
      const { data } = await api.get<ClubSubscriptionType[]>('/club-subscription-types', {
        params: { includeInactive: 'true' },
      });
      return data;
    },
  });

  const [filterBranchId, setFilterBranchId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const types = useMemo(() => {
    const base = (allTypes ?? []).filter((type) => !type.isSpecialOffer);
    return base.filter((type) => {
      if (filterBranchId !== 'all') {
        const bid = Number(filterBranchId);
        const inBranch = type.applyToAllBranches ||
          (type.branchIds?.includes(bid)) ||
          (type.branchId === bid);
        if (!inBranch) return false;
      }
      if (filterStatus === 'active' && type.isActive === false) return false;
      if (filterStatus === 'inactive' && type.isActive !== false) return false;
      return true;
    });
  }, [allTypes, filterBranchId, filterStatus]);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SubTypeForm>(emptyForm);
  const patchForm = (patch: Partial<SubTypeForm>) => setForm((current) => ({ ...current, ...patch }));

  const [detailsType, setDetailsType] = useState<ClubSubscriptionType | null>(null);

  useEffect(() => {
    if (open && form.applyToAllBranches) patchForm({ branchIds: allBranchIds });
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
        isActive: form.isActive,
      };
      if (editId) await api.put(`/club-subscription-types/${editId}`, body);
      else await api.post('/club-subscription-types', body);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['club-subscription-types'] });
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

    {/* ── Filters ── */}
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="h-1 w-full bg-brand-gradient" />
      <div className="flex flex-wrap items-end gap-4 p-5">

        {/* Branch filter */}
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">الفرع</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-background pe-9 ps-9 text-sm font-medium shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
            >
              <option value="all">كل الفروع</option>
              {(branches ?? []).map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* Status filter */}
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">الحالة</Label>
          <div className="relative">
            <CheckCircle2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-background pe-9 ps-9 text-sm font-medium shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* Counter badge */}
        <div className="flex flex-col items-center justify-center rounded-xl border bg-primary/5 px-5 py-2.5 text-center">
          <p className="nums text-2xl font-bold text-primary">{toArabicDigits(types.length)}</p>
          <p className="text-xs text-muted-foreground">باقة</p>
        </div>
      </div>
    </div>

    {/* ── Cards grid ── */}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {types.map((type) => {
        const isActive = type.isActive !== false;
        const accent = type.isLinkedToSessions ? '#0ea5e9' : '#10b981';
        return (
          <div
            key={type.id}
            className={`group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${!isActive ? 'opacity-60' : ''}`}
            style={{ borderColor: `${accent}33` }}
          >
            <div className="h-1 w-full" style={{ background: `linear-gradient(to left, ${accent}, ${accent}55)` }} />
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex-1 min-w-0 truncate font-semibold leading-snug">{type.name}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${type.isLinkedToSessions ? 'bg-sky-500/10 text-sky-700' : 'bg-emerald-500/10 text-emerald-700'}`}>
                    {type.isLinkedToSessions ? 'حصص' : 'اشتراك'}
                  </span>
                  {isActive
                    ? <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-700">نشط</span>
                    : <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">غير نشط</span>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 rounded-lg bg-muted/40 px-3 py-1.5 text-center">
                  <p className="text-[10px] text-muted-foreground">السعر</p>
                  <p className="nums text-sm font-bold" style={{ color: accent }}>{toArabicDigits(type.price)} <span className="text-[10px] font-normal text-muted-foreground">ج.م</span></p>
                </div>
                <div className="flex-1 rounded-lg bg-muted/40 px-3 py-1.5 text-center">
                  <p className="text-[10px] text-muted-foreground">{type.isLinkedToSessions ? 'الحصص' : 'المدة'}</p>
                  <p className="nums text-sm font-bold" style={{ color: accent }}>
                    {type.isLinkedToSessions ? toArabicDigits(type.sessionsCount ?? 0) : toArabicDigits(type.days)}
                    <span className="text-[10px] font-normal text-muted-foreground"> {type.isLinkedToSessions ? 'حصة' : 'يوم'}</span>
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground truncate">{branchLabel(type)}</p>
            </div>

            {/* Actions bar */}
            <div className="flex items-center justify-end gap-1 border-t bg-muted/20 px-3 py-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-primary hover:bg-primary/10"
                title="عرض التفاصيل"
                onClick={() => setDetailsType(type)}
              >
                <Eye className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(type)}>
                <Pencil className="size-4" />
              </Button>
              {isAdmin
                ? <Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => void remove(type.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                : null}
            </div>
          </div>
        );
      })}
      {!types.length ? <p className="col-span-full rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">{ct('common.noData')}</p> : null}
    </div>

    {/* ── Edit / Create Dialog ── */}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
        <FormDialogHeader><DialogTitle>{editId ? ct('packages.editSubscriptionType') : ct('packages.addSubscriptionType')}</DialogTitle></FormDialogHeader>
        <FormDialogBody>
          <DialogFormSection title={ct('packages.sectionBasic')} icon={Package}>
            <DialogFormGrid columns={2}>
              <FormField label="نوع الباقة" required>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.kind} onChange={(event) => patchForm({ kind: event.target.value as SubTypeForm['kind'], sessionsCount: event.target.value === 'sessions' ? form.sessionsCount : '' })}>
                  <option value="package">اشتراك</option>
                  <option value="sessions">حصص</option>
                </select>
              </FormField>
              <FormField label={ct('packages.subscriptionName')} required><Input value={form.name} onChange={(event) => patchForm({ name: event.target.value })} /></FormField>
              <FormField label={ct('packages.subscriptionValueEgp')} required><Input type="number" min={0} step="0.01" className="nums" value={form.price} onChange={(event) => patchForm({ price: event.target.value })} /></FormField>
              <FormField label={form.kind === 'sessions' ? 'صلاحية باقة الحصص (بالأيام)' : ct('packages.subscriptionDays')} required><Input type="number" min={1} className="nums" value={form.days} onChange={(event) => patchForm({ days: event.target.value })} /></FormField>
              {form.kind === 'sessions' ? <FormField label="عدد الحصص" required><Input type="number" min={1} className="nums" value={form.sessionsCount} onChange={(event) => patchForm({ sessionsCount: event.target.value })} /></FormField> : null}
              <FormField label={ct('common.branch')} required className="sm:col-span-2">
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <label className="flex items-center gap-2"><Checkbox checked={form.applyToAllBranches} onCheckedChange={(checked) => patchForm({ applyToAllBranches: !!checked, branchIds: checked ? allBranchIds : [] })} /><span className="text-sm font-medium">{ct('common.allBranches')}</span></label>
                  {branchesLoading ? <p className="text-sm text-muted-foreground">{ct('common.loading')}</p> : <div className="grid gap-2 sm:grid-cols-2">{(branches ?? []).map((branch) => <label key={branch.id} className="flex items-center gap-2"><Checkbox disabled={form.applyToAllBranches} checked={form.applyToAllBranches || form.branchIds.includes(branch.id)} onCheckedChange={(checked) => patchForm({ branchIds: checked ? [...new Set([...form.branchIds, branch.id])] : form.branchIds.filter((id) => id !== branch.id) })} /><span className="text-sm">{branch.name}</span></label>)}</div>}
                </div>
              </FormField>
            </DialogFormGrid>
          </DialogFormSection>

          <DialogFormSection title={ct('packages.sectionBenefits')} icon={Sparkles}>
            <DialogFormGrid columns={2}>
              <DialogFormToggle label={ct('packages.isPartOfTarget')} checked={form.isPartOfTarget} onCheckedChange={(value) => patchForm({ isPartOfTarget: value })} />
              <DialogFormToggle label={ct('packages.isForStudents')} checked={form.isForStudents} onCheckedChange={(value) => patchForm({ isForStudents: value })} />
              <FormField label={ct('packages.invitationsCount')}><Input type="number" min={0} className="nums" value={form.invitationsCount} onChange={(event) => patchForm({ invitationsCount: event.target.value })} /></FormField>
              <FormField label={ct('packages.inbodyCount')}><Input type="number" min={0} className="nums" value={form.inbodyCount} onChange={(event) => patchForm({ inbodyCount: event.target.value })} /></FormField>
              <FormField label={ct('packages.walletPoints')}><Input type="number" min={0} className="nums" value={form.walletPoints} onChange={(event) => patchForm({ walletPoints: event.target.value })} /></FormField>
              <FormField label={ct('packages.offerValidity')}><Input type="date" className="nums" value={form.offerValidity} onChange={(event) => patchForm({ offerValidity: event.target.value })} /></FormField>
            </DialogFormGrid>
          </DialogFormSection>

          <DialogFormSection title={ct('packages.sectionApp')} icon={Bell}>
            <div className="grid gap-3 sm:grid-cols-3">
              <DialogFormToggle label={ct('packages.showInApp')} checked={form.showInApp} onCheckedChange={(value) => patchForm({ showInApp: value })} />
              <DialogFormToggle label={ct('packages.notifyCustomers')} checked={form.notifyCustomers} onCheckedChange={(value) => patchForm({ notifyCustomers: value })} />
              <DialogFormToggle label={ct('packages.notifyOnExpiry')} checked={form.notifyOnExpiry} onCheckedChange={(value) => patchForm({ notifyOnExpiry: value })} />
            </div>
          </DialogFormSection>

          <DialogFormSection title="التجميد والخدمات">
            <div className="grid gap-3 sm:grid-cols-2">
              <DialogFormToggle label={ct('packages.isLinkedToFreeze')} checked={form.isLinkedToFreeze} onCheckedChange={(value) => patchForm({ isLinkedToFreeze: value })} />
              <DialogFormToggle label={ct('packages.includesSpa')} checked={form.includesSpa} onCheckedChange={(value) => patchForm({ includesSpa: value })} />
            </div>
            <DialogFormGrid columns={2} className="mt-3">
              {form.isLinkedToFreeze ? <FormField label={ct('packages.freezeDays')}><Input type="number" min={1} className="nums" value={form.freezeDays} onChange={(event) => patchForm({ freezeDays: event.target.value })} /></FormField> : null}
              {form.includesSpa ? <FormField label={ct('packages.spaCount')}><Input type="number" min={1} className="nums" value={form.spaCount} onChange={(event) => patchForm({ spaCount: event.target.value })} /></FormField> : null}
            </DialogFormGrid>
          </DialogFormSection>

          <DialogFormSection title="الحالة">
            <DialogFormToggle label="نشط" checked={form.isActive} onCheckedChange={(value) => patchForm({ isActive: value })} />
          </DialogFormSection>
        </FormDialogBody>
        <FormDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>
          <Button variant="brand" onClick={() => void save()} disabled={saving}><Save className="size-4" /> {ct('common.save')}</Button>
        </FormDialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Details Dialog ── */}
    <PackageDetailsDialog
      type={detailsType}
      open={!!detailsType}
      onClose={() => setDetailsType(null)}
      branchLabel={branchLabel}
    />
  </div>;
}
