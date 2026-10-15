import {
  BadgePercent,
  Bell,
  CalendarDays,
  ChevronDown,
  Dumbbell,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  MessageSquareText,
  Package,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  DialogFormGrid,
  DialogFormSection,
  DialogFormToggle,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FORM_DIALOG_CONTENT_CLASS,
} from '@/components/common/dialog-form-layout';
import { ClassReportsPanel } from '@/components/club/class-reports-panel';
import { ClassSettingsPanel } from '@/components/club/class-settings-panel';
import { PackageCategoriesPanel, packageCategoryIconSrc } from '@/components/club/package-categories-panel';
import {
  CatalogCard,
  CatalogEmpty,
  CatalogGrid,
  CatalogSearch,
  CatalogSection,
  matchesCatalogSearch,
} from '@/components/club/package-catalog-layout';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { countByCategory, filterPackages } from '@/lib/package-catalog-filter';
import { packagePriceForBranch } from '@/lib/package-price';
import {
  buildDefaultSessionPriceMatrix,
  mergeSessionPriceMatrix,
  type SessionPriceRow,
} from '@/lib/session-price-matrix';
import { cn, toArabicDigits } from '@/lib/utils';
import { UploadField } from '@/components/employees/upload-fields';
import { uploadUrl } from '@/components/employees/use-uploads';
import { getBrandProfile } from '@/ports/brand-registry';
import type { ClubPackageCategoryItem, ClubPrivatePackage, ClubSubscriptionType } from '@/types/club';
import { useLocale } from '@/store/locale';
import { FitnessSchedulingPage } from './fitness/scheduling';

/**
 * One catalog for everything a member can buy: regular packages, private packages and
 * scheduled classes — plus the trainer scheduling/report screens that used to live on
 * /club/subscriptions/special.
 */

/** Regular packages live in club_subscription_types; the `private-*` kinds in club_private_packages. */
type PackageKind = 'package' | 'sessions' | 'private-subscription' | 'private-sessions';
const isPrivateKind = (kind: PackageKind) => kind === 'private-subscription' || kind === 'private-sessions';
const isSessionsKind = (kind: PackageKind) => kind === 'sessions' || kind === 'private-sessions';
/** A `ClubPackageCategoryItem.key` — the app home sections are managed in the الفئات tab. */
type PackageCategoryKey = string;
const APP_NOTES_MAX_LENGTH = 2000;

type SubTypeForm = {
  name: string;
  kind: PackageKind;
  applyToAllBranches: boolean;
  branchIds: number[];
  price: string;
  days: string;
  sessionsCount: string;
  sessionPrices: SessionPriceRow[];
  /** Per-branch sale price, keyed by branch id; blank = the default price. */
  branchPrices: Record<number, string>;
  /** App home sections the package is listed under. */
  categories: PackageCategoryKey[];
  /** Member-facing notes shown on the package in the app. */
  appNotes: string;
  invitationsCount: string;
  inbodyCount: string;
  isLinkedToFreeze: boolean;
  freezeDays: string;
  freezeTotalDays: string;
  includesSpa: boolean;
  spaCount: string;
};

const emptyForm = (branchIds: number[] = [], kind: PackageKind = 'package'): SubTypeForm => ({
  name: '', kind, applyToAllBranches: true, branchIds, price: '', days: '', sessionsCount: '',
  sessionPrices: [], branchPrices: {}, categories: [], appNotes: '',
  invitationsCount: '0', inbodyCount: '0',
  isLinkedToFreeze: false, freezeDays: '0', freezeTotalDays: '0', includesSpa: false, spaCount: '0',
});

function toForm(type: ClubSubscriptionType, allBranchIds: number[]): SubTypeForm {
  const all = !!type.applyToAllBranches;
  const branchIds = all ? allBranchIds : type.branchIds?.length ? type.branchIds : type.branchId ? [type.branchId] : [];
  const price = Number(type.price) || 0;
  const sessionsCount = type.sessionsCount ?? 0;
  const sessionPrices =
    type.isLinkedToSessions && type.sessionPrices?.length
      ? type.sessionPrices.map((row) => ({ sessionsCount: row.sessionsCount, price: row.price }))
      : type.isLinkedToSessions
        ? buildDefaultSessionPriceMatrix(price, sessionsCount)
        : [];
  return {
    name: type.name,
    kind: type.isLinkedToSessions ? 'sessions' : 'package',
    applyToAllBranches: all,
    branchIds,
    price: String(type.price),
    days: String(type.days),
    sessionsCount: type.sessionsCount != null ? String(type.sessionsCount) : '',
    sessionPrices,
    branchPrices: Object.fromEntries((type.branchPrices ?? []).map((row) => [row.branchId, String(row.price)])),
    categories: type.categories ?? [],
    appNotes: type.appNotes ?? '',
    invitationsCount: String(type.invitationsCount ?? 0),
    inbodyCount: String(type.inbodyCount ?? 0),
    isLinkedToFreeze: !!type.isLinkedToFreeze,
    freezeDays: String(type.freezeDays ?? 0),
    freezeTotalDays: String(type.freezeTotalDays ?? 0),
    includesSpa: !!type.includesSpa,
    spaCount: String(type.spaCount ?? 0),
  };
}

function privateToForm(item: ClubPrivatePackage, allBranchIds: number[]): SubTypeForm {
  const sessions = item.kind === 'sessions';
  const price = Number(item.price) || 0;
  const count = item.sessionsCount ?? 0;
  return {
    ...emptyForm(item.branchIds, sessions ? 'private-sessions' : 'private-subscription'),
    name: item.name,
    applyToAllBranches: allBranchIds.length > 0 && allBranchIds.every((id) => item.branchIds.includes(id)),
    price: String(item.price),
    days: String(item.durationDays),
    sessionsCount: count ? String(count) : '',
    sessionPrices: sessions
      ? item.sessionPrices?.length
        ? item.sessionPrices.map((row) => ({ sessionsCount: row.sessionsCount, price: row.price }))
        : buildDefaultSessionPriceMatrix(price, count)
      : [],
  };
}

function FormField({ label, required, children, className }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className ?? ''}`}><Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>{children}</div>;
}

type PromoForm = { enabled: boolean; price: string; discountPercent: string; durationDays: string; image: string | null; marketingMessage: string };
const PROMO_MESSAGE_MAX_LENGTH = 160;
const emptyPromoForm = (): PromoForm => ({ enabled: false, price: '', discountPercent: '', durationDays: '7', image: null, marketingMessage: '' });

type CatalogTab = 'packages' | 'private' | 'classes' | 'categories' | 'scheduling' | 'reports';
const CATALOG_TABS: CatalogTab[] = ['packages', 'private', 'classes', 'scheduling', 'reports', 'categories'];
/**
 * Keeps older links working: `?section=…` from /club/subscriptions/special, and `?tab=catalog`
 * from when regular, private and scheduled packages shared a single tab.
 */
const legacyTab: Record<string, CatalogTab> = {
  catalog: 'packages', private: 'private', classes: 'classes',
  categories: 'categories', scheduling: 'scheduling', reports: 'reports',
};

export function ClubPackageSettingsPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const { can, superAdmin } = usePermission();
  const canCreate = can('club.packages.settings:create');
  const canUpdate = can('club.packages.settings:update');
  const canDelete = can('club.packages.settings:delete');
  const canCreatePrivate = can('club.subscriptions.special:create');
  const canUpdatePrivate = can('club.subscriptions.special:update');
  const canDeletePrivate = can('club.subscriptions.special:delete');
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: allTypes, refetch } = useArrayResource<ClubSubscriptionType>('club-subscription-types');
  const { data: privatePackages, refetch: refetchPrivate } =
    useArrayResource<ClubPrivatePackage>('club-private-subscriptions/packages');
  const { data: packageCategoryRows, refetch: refetchCategories } =
    useArrayResource<ClubPackageCategoryItem>('club-package-categories');
  const packageCategories = useMemo(() => packageCategoryRows ?? [], [packageCategoryRows]);
  const types = useMemo(() => (allTypes ?? []).filter((type) => !type.isSpecialOffer), [allTypes]);
  const privateList = useMemo(() => privatePackages ?? [], [privatePackages]);
  const allBranchIds = useMemo(() => (branches ?? []).map((branch) => branch.id), [branches]);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? searchParams.get('section') ?? '';
  const tab: CatalogTab = (CATALOG_TABS as string[]).includes(rawTab)
    ? (rawTab as CatalogTab)
    : legacyTab[rawTab] ?? 'packages';
  // One search box per catalog tab; clearing on tab change avoids a hidden filter
  // making the next tab look empty.
  const [search, setSearch] = useState('');
  // Regular packages also filter by the app section they belong to; 'all' shows everything.
  const [categoryFilter, setCategoryFilter] = useState<PackageCategoryKey | 'all'>('all');
  const visibleTypes = useMemo(
    () => filterPackages(types, search, categoryFilter),
    [types, search, categoryFilter],
  );
  /** How many packages sit in each section, so an empty filter is obvious before picking it. */
  const categoryCounts = useMemo(() => countByCategory(types), [types]);
  const visiblePrivate = useMemo(
    () => privateList.filter((item) => matchesCatalogSearch(item.name, search)),
    [privateList, search],
  );
  const setTab = (value: string) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set('tab', value);
    next.delete('section');
    setSearch('');
    setCategoryFilter('all');
    return next;
  }, { replace: true });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number; isPrivate: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [branchOverrideEdit, setBranchOverrideEdit] = useState(false);
  const [form, setForm] = useState<SubTypeForm>(() => emptyForm());
  const [matrixOpen, setMatrixOpen] = useState(false);
  const overriddenRef = useRef<Set<number>>(new Set());
  const patchForm = (patch: Partial<SubTypeForm>) => setForm((current) => ({ ...current, ...patch }));
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoTarget, setPromoTarget] = useState<ClubSubscriptionType | null>(null);
  const [promoForm, setPromoForm] = useState<PromoForm>(emptyPromoForm);
  const [promoSaving, setPromoSaving] = useState(false);
  // The scheduled-classes panel owns its own dialog; the catalog section drives it from here.
  const [classesApi, setClassesApi] = useState<{ count: number; openCreate: () => void; canCreate: boolean }>(
    { count: 0, openCreate: () => {}, canCreate: false },
  );
  const [categoriesApi, setCategoriesApi] = useState<{ openCreate: () => void; canCreate: boolean }>(
    { openCreate: () => {}, canCreate: false },
  );

  const editingPrivate = !!editing?.isPrivate;
  const formIsPrivate = isPrivateKind(form.kind);
  const formIsSessions = isSessionsKind(form.kind);
  const mayWrite = formIsPrivate
    ? (editing ? canUpdatePrivate : canCreatePrivate)
    : (editing ? canUpdate : canCreate);

  useEffect(() => {
    if (open && form.applyToAllBranches) patchForm({ branchIds: allBranchIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allBranchIds]);

  // Regenerate defaults when price / session count change; keep manual overrides.
  useEffect(() => {
    if (!isSessionsKind(form.kind)) return;
    const price = Number(form.price);
    const count = Number(form.sessionsCount);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(count) || count < 1) {
      if (form.sessionPrices.length) patchForm({ sessionPrices: [] });
      return;
    }
    setForm((current) => {
      const next = mergeSessionPriceMatrix({
        packagePrice: price,
        sessionsCount: count,
        previous: current.sessionPrices,
        overridden: overriddenRef.current,
      });
      const same =
        next.length === current.sessionPrices.length &&
        next.every(
          (row, i) =>
            row.sessionsCount === current.sessionPrices[i]?.sessionsCount &&
            row.price === current.sessionPrices[i]?.price,
        );
      return same ? current : { ...current, sessionPrices: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind, form.price, form.sessionsCount]);

  const openCreate = (kind: PackageKind = 'package') => {
    if (isPrivateKind(kind) ? !canCreatePrivate : !canCreate) return;
    setEditing(null);
    setBranchOverrideEdit(false);
    overriddenRef.current = new Set();
    setMatrixOpen(isSessionsKind(kind));
    setForm(emptyForm(allBranchIds, kind));
    setOpen(true);
  };

  // Scheduling's "إضافة اشتراك خاص" routes here as ?tab=private&action=create.
  useEffect(() => {
    if (tab !== 'private' || searchParams.get('action') !== 'create') return;
    if (!canCreatePrivate) return;
    openCreate('private-subscription');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('action');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchParams]);

  /** Loaded rows that differ from the default are manual overrides — keep them on regen. */
  const markOverrides = (price: number, count: number, loaded: SessionPriceRow[]) => {
    overriddenRef.current = new Set();
    const defaults = buildDefaultSessionPriceMatrix(price, count);
    for (const row of loaded) {
      const def = defaults.find((d) => d.sessionsCount === row.sessionsCount);
      if (!def || def.price !== row.price) overriddenRef.current.add(row.sessionsCount);
    }
  };
  const openEdit = (type: ClubSubscriptionType) => {
    if (!canUpdate) return;
    const scopedGlobal = !superAdmin && !!type.applyToAllBranches;
    const branchId = allBranchIds.length === 1 ? allBranchIds[0] : null;
    setEditing({ id: type.id, isPrivate: false });
    setBranchOverrideEdit(scopedGlobal);
    setMatrixOpen(Boolean(type.isLinkedToSessions));
    const next = toForm(type, allBranchIds);
    if (scopedGlobal && branchId != null) {
      next.applyToAllBranches = false;
      next.branchIds = [branchId];
      next.price = String(packagePriceForBranch(type, branchId));
      next.branchPrices = {};
    }
    setForm(next);
    markOverrides(Number(type.price) || 0, type.sessionsCount ?? 0, type.sessionPrices ?? []);
    setOpen(true);
  };
  const openEditPrivate = (item: ClubPrivatePackage) => {
    if (!canUpdatePrivate) return;
    setEditing({ id: item.id, isPrivate: true });
    setBranchOverrideEdit(false);
    setMatrixOpen(item.kind === 'sessions');
    setForm(privateToForm(item, allBranchIds));
    markOverrides(Number(item.price) || 0, item.sessionsCount ?? 0, item.sessionPrices ?? []);
    setOpen(true);
  };
  const branchNames = (ids: number[]) =>
    ids.map((id) => branches?.find((branch) => branch.id === id)?.name ?? id).join(' · ');
  const branchLabel = (type: ClubSubscriptionType) => type.applyToAllBranches
    ? ct('common.allBranches')
    : branchNames(type.branchIds?.length ? type.branchIds : type.branchId ? [type.branchId] : []);

  const save = async () => {
    if (!mayWrite) return;
    if (!form.name.trim() || form.price === '' || !Number(form.days) || (formIsSessions && !Number(form.sessionsCount))) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    const branchIds = form.applyToAllBranches ? allBranchIds : form.branchIds;
    if (!branchIds.length) {
      toast.error(ct('packages.selectAtLeastOneBranch'));
      return;
    }
    setSaving(true);
    try {
      if (formIsPrivate) {
        // Private packages have no "all branches" flag — the checkbox just selects them all.
        const body = {
          kind: form.kind === 'private-sessions' ? 'sessions' : 'subscription',
          name: form.name.trim(),
          price: Number(form.price),
          durationDays: Number(form.days),
          sessionsCount: form.kind === 'private-sessions' ? Number(form.sessionsCount) : undefined,
          sessionPrices: form.kind === 'private-sessions' ? form.sessionPrices : [],
          branchIds,
        };
        if (editing) await api.put(`/club-private-subscriptions/packages/${editing.id}`, body);
        else await api.post('/club-private-subscriptions/packages', body);
        toast.success(ct('common.success'));
        setOpen(false);
        void refetchPrivate();
        return;
      }
      const body = {
        name: form.name.trim(),
        applyToAllBranches: form.applyToAllBranches,
        branchIds: form.applyToAllBranches ? [] : form.branchIds,
        price: Number(form.price),
        branchPrices: Object.entries(form.branchPrices)
          .filter(([, price]) => String(price).trim() !== '')
          .map(([branchId, price]) => ({ branchId: Number(branchId), price: Number(price) }))
          .filter((row) => Number.isInteger(row.branchId) && row.branchId > 0 && Number.isFinite(row.price) && row.price >= 0),
        days: Number(form.days),
        categories: form.categories,
        appNotes: form.appNotes.trim(),
        invitationsCount: Number(form.invitationsCount) || 0,
        inbodyCount: Number(form.inbodyCount) || 0,
        isSpecialOffer: false,
        // Every active package is listed in the member app — no per-package switch.
        showInApp: true,
        isLinkedToSessions: form.kind === 'sessions',
        sessionsCount: form.kind === 'sessions' ? Number(form.sessionsCount) : null,
        sessionPrices: form.kind === 'sessions' ? form.sessionPrices : [],
        classTypeIds: [],
        allowMultipleDailyEntries: true,
        isLinkedToFreeze: form.isLinkedToFreeze,
        freezeDays: form.isLinkedToFreeze ? Number(form.freezeDays) || null : null,
        freezeTotalDays: form.isLinkedToFreeze ? Number(form.freezeTotalDays) || null : null,
        includesSpa: form.includesSpa,
        spaCount: form.includesSpa ? Number(form.spaCount) || null : null,
      };
      if (editing) await api.put(`/club-subscription-types/${editing.id}`, body);
      else await api.post('/club-subscription-types', body);
      toast.success(ct('common.success'));
      setOpen(false);
      void refetch();
      // Package counts on the الفئات tab follow the tags just saved.
      void refetchCategories();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!canDelete) return;
    if (!(await confirm({ title: ct('common.confirmDelete'), variant: 'destructive' }))) return;
    try { await api.delete(`/club-subscription-types/${id}`); toast.success(ct('common.success')); void refetch(); }
    catch (error) { toast.error(apiError(error)); }
  };
  const deactivatePrivate = async (id: number) => {
    if (!canDeletePrivate) return;
    if (!(await confirm({ title: ui('هل تريد إيقاف هذه الباقة؟ الاشتراكات المسجلة لن تتأثر.'), variant: 'destructive' }))) return;
    try { await api.delete(`/club-private-subscriptions/packages/${id}`); toast.success(ui('تم إيقاف الباقة')); void refetchPrivate(); }
    catch (error) { toast.error(apiError(error)); }
  };

  const openPromo = (type: ClubSubscriptionType) => {
    if (!canUpdate) return;
    const remainingDays = type.promoEndsAt ? Math.max(1, Math.ceil((new Date(type.promoEndsAt).getTime() - Date.now()) / 86_400_000)) : 7;
    setPromoTarget(type);
    setPromoForm(type.promoEnabled ? { enabled: true, price: type.promoPrice == null ? '' : String(type.promoPrice), discountPercent: type.promoDiscountPercent == null ? '' : String(type.promoDiscountPercent), durationDays: String(remainingDays), image: type.promoImage ?? null, marketingMessage: type.promoMarketingMessage ?? '' } : emptyPromoForm());
    setPromoOpen(true);
  };
  const setPromoPrice = (value: string) => {
    const original = Number(promoTarget?.price ?? 0);
    const price = Number(value);
    const discountPercent = value && original > 0 && Number.isFinite(price) ? String(Math.round(((original - price) / original) * 10_000) / 100) : '';
    setPromoForm((current) => ({ ...current, price: value, discountPercent }));
  };
  const setPromoDiscount = (value: string) => {
    const original = Number(promoTarget?.price ?? 0);
    const discount = Number(value);
    const price = value && original > 0 && Number.isFinite(discount) ? String(Math.round(original * (1 - discount / 100) * 100) / 100) : '';
    setPromoForm((current) => ({ ...current, discountPercent: value, price }));
  };
  const savePromo = async () => {
    if (!promoTarget || !canUpdate) return;
    const price = Number(promoForm.price);
    const durationDays = Number(promoForm.durationDays);
    if (promoForm.enabled && (!Number.isFinite(price) || price <= 0 || price >= promoTarget.price)) { toast.error(ui('سعر العرض يجب أن يكون أكبر من صفر وأقل من السعر الأصلي')); return; }
    if (promoForm.enabled && (!Number.isInteger(durationDays) || durationDays <= 0)) { toast.error(ui('مدة العرض يجب أن تكون عدد أيام صحيحًا')); return; }
    setPromoSaving(true);
    try {
      await api.put(`/club-subscription-types/${promoTarget.id}/promo`, { enabled: promoForm.enabled, price: promoForm.enabled ? price : undefined, discountPercent: promoForm.enabled && promoForm.discountPercent !== '' ? Number(promoForm.discountPercent) : undefined, durationDays: promoForm.enabled ? durationDays : undefined, image: promoForm.image, marketingMessage: promoForm.enabled ? promoForm.marketingMessage.trim() : undefined });
      toast.success(ct('common.success')); setPromoOpen(false); void refetch();
    } catch (error) { toast.error(apiError(error)); }
    finally { setPromoSaving(false); }
  };
  const promoPreviewUrl = uploadUrl(promoForm.image) ?? getBrandProfile().logoSrc;

  const headerAction = (() => {
    if (tab === 'packages' && canCreate) {
      return <Button variant="brand" onClick={() => openCreate('package')}><Plus className="size-4" /> {ui('إضافة اشتراك أو حصة')}</Button>;
    }
    if (tab === 'private' && canCreatePrivate) {
      return <Button permissionResource="club.subscriptions.special" variant="brand" onClick={() => openCreate('private-subscription')}><Plus className="size-4" /> {ui('إضافة اشتراك برايفت')}</Button>;
    }
    if (tab === 'classes' && classesApi.canCreate) {
      return <Button permissionResource="club.subscriptions.special" variant="brand" onClick={classesApi.openCreate}><Plus className="size-4" /> {ui('إضافة حصة مجدولة')}</Button>;
    }
    if (tab === 'categories' && categoriesApi.canCreate) {
      return <Button variant="brand" onClick={categoriesApi.openCreate}><Plus className="size-4" /> {ui('إضافة فئة')}</Button>;
    }
    return undefined;
  })();

  const dialogTitle = editing
    ? (editingPrivate ? ui('تعديل باقة برايفت') : ct('packages.editSubscriptionType'))
    : ct('packages.addSubscriptionType');

  return <div className="space-y-6">
    <PageHeader
      title={ct('packages.settingsTitle')}
      description={ui('كل ما يُباع للعضو في مكان واحد: الاشتراكات والحصص، باقات البرايفت، والحصص المجدولة ومواعيد مدربيها.')}
      actions={headerAction}
    />

    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex justify-center"><TabsList className="h-auto flex-wrap justify-center rounded-xl border bg-muted/40 p-1.5 shadow-sm">
        <TabsTrigger value="packages"><Package className="me-2 size-4" /> {ui('اشتراكات وحصص')}</TabsTrigger>
        <TabsTrigger value="private"><Dumbbell className="me-2 size-4" /> {ui('برايفت')}</TabsTrigger>
        <TabsTrigger value="classes"><GraduationCap className="me-2 size-4" /> {ui('حصص مجدولة')}</TabsTrigger>
        <TabsTrigger value="scheduling"><CalendarDays className="me-2 size-4" /> {ui('الجدولة والحضور')}</TabsTrigger>
        <TabsTrigger value="reports"><ListChecks className="me-2 size-4" /> {ui('تقارير المدربين')}</TabsTrigger>
        <TabsTrigger value="categories"><LayoutGrid className="me-2 size-4" /> {ui('الفئات')}</TabsTrigger>
      </TabsList></div>

      <TabsContent value="packages" className="pt-4">
        <CatalogSection
          title={ui('اشتراكات وحصص')}
          description={ui('الباقات العادية المتاحة لكل الأعضاء — اشتراك بمدة أو باقة حصص بسعر لكل عدد.')}
          icon={Package}
          tone="emerald"
          count={visibleTypes.length}
          search={<CatalogSearch value={search} onChange={setSearch} placeholder={ui('ابحث باسم الباقة…')} clearLabel={ui('مسح البحث')} />}
        >
          {packageCategories.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{ui('قسم التطبيق:')}</span>
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  categoryFilter === 'all'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                {ui('الكل')} <span className="nums opacity-70">({toArabicDigits(types.length)})</span>
              </button>
              {packageCategories.map((category) => {
                const count = categoryCounts.get(category.key) ?? 0;
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setCategoryFilter(category.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      categoryFilter === category.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : count === 0
                          ? 'text-muted-foreground opacity-60 hover:bg-muted'
                          : 'hover:bg-muted',
                    )}
                  >
                    {category.name} <span className="nums opacity-70">({toArabicDigits(count)})</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <CatalogGrid>
            {visibleTypes.map((type) => (
              <CatalogCard
                key={type.id}
                name={type.name}
                badge={type.isLinkedToSessions ? ui('حصص') : ui('اشتراك')}
                badgeTone={type.isLinkedToSessions ? 'sky' : 'emerald'}
                stats={[
                  {
                    label: ui('القيمة'),
                    value: type.promoEnabled && type.promoPrice != null
                      ? <><span className="text-muted-foreground line-through">{toArabicDigits(type.price)}</span>{' '}<span className="text-amber-700">{toArabicDigits(type.promoPrice)} EGP</span></>
                      : <>{toArabicDigits(type.price)} EGP</>,
                  },
                  type.isLinkedToSessions
                    ? { label: ui('عدد الحصص'), value: `${toArabicDigits(type.sessionsCount ?? 0)}${ui(' حصة')}` }
                    : { label: ui('الصلاحية'), value: `${toArabicDigits(type.days)} ${ct('subscriptions.typeDays')}` },
                  ...((type.invitationsCount ?? 0) > 0
                    ? [{ label: ct('packages.invitationsCount'), value: toArabicDigits(type.invitationsCount ?? 0) }]
                    : []),
                  ...(type.isLinkedToFreeze && (type.freezeDays ?? 0) > 0
                    ? [{ label: ct('packages.freezeDays'), value: toArabicDigits(type.freezeDays ?? 0) }]
                    : []),
                  ...(type.isLinkedToFreeze && (type.freezeTotalDays ?? 0) > 0
                    ? [{ label: ct('packages.freezeTotalDays'), value: `${toArabicDigits(type.freezeTotalDays ?? 0)} ${ct('subscriptions.typeDays')}` }]
                    : []),
                ]}
                note={type.promoEnabled ? <span className="inline-flex items-center gap-1 text-amber-700"><BadgePercent className="size-3.5" /> {ui('عرض ترويجي مفعّل')}</span> : undefined}
                footnote={branchLabel(type)}
                actions={
                  <>
                    {canUpdate ? <Button variant="ghost" size="sm" onClick={() => openEdit(type)}><Pencil className="size-4" /> {ui('تعديل')}</Button> : null}
                    {canUpdate ? <Button variant="ghost" size="sm" aria-label={ui('إدارة العرض الترويجي')} className={type.promoEnabled ? 'text-amber-600' : undefined} onClick={() => openPromo(type)}><BadgePercent className="size-4" /> {ui('عرض')}</Button> : null}
                    {canDelete ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(type.id)}><Trash2 className="size-4" /> {ui('حذف')}</Button> : null}
                  </>
                }
              />
            ))}
            {!visibleTypes.length ? (
              <CatalogEmpty
                label={
                  search.trim()
                    ? ui('لا توجد باقة بهذا الاسم.')
                    : categoryFilter !== 'all'
                      ? ui('لا توجد باقات في هذا القسم.')
                      : ct('common.noData')
                }
              />
            ) : null}
          </CatalogGrid>
        </CatalogSection>
      </TabsContent>

      <TabsContent value="private" className="pt-4">
        <CatalogSection
          title={ui('اشتراكات وحصص برايفت')}
          description={ui('باقات التدريب الخاص مع كابتن — بمدة أو بعدد حصص وسعر لكل عدد.')}
          icon={Dumbbell}
          tone="violet"
          count={visiblePrivate.length}
          search={<CatalogSearch value={search} onChange={setSearch} placeholder={ui('ابحث باسم الباقة…')} clearLabel={ui('مسح البحث')} />}
        >
          <CatalogGrid>
            {visiblePrivate.map((item) => (
              <CatalogCard
                key={item.id}
                name={item.name}
                badge={item.kind === 'sessions' ? ui('حصص برايفت') : ui('اشتراك برايفت')}
                badgeTone="violet"
                stats={[
                  { label: ui('القيمة'), value: `${toArabicDigits(item.price)} EGP` },
                  item.kind === 'sessions'
                    ? { label: ui('عدد الحصص'), value: `${toArabicDigits(item.sessionsCount ?? 0)}${ui(' حصة')}` }
                    : { label: ui('الصلاحية'), value: `${toArabicDigits(item.durationDays)} ${ct('subscriptions.typeDays')}` },
                ]}
                footnote={branchNames(item.branchIds) || '—'}
                actions={
                  <>
                    {canUpdatePrivate ? <Button permissionResource="club.subscriptions.special" permissionAction="update" variant="ghost" size="sm" onClick={() => openEditPrivate(item)}><Pencil className="size-4" /> {ui('تعديل')}</Button> : null}
                    {canDeletePrivate ? <Button permissionResource="club.subscriptions.special" permissionAction="delete" variant="ghost" size="sm" className="text-destructive" onClick={() => void deactivatePrivate(item.id)}><Trash2 className="size-4" /> {ui('إيقاف')}</Button> : null}
                  </>
                }
              />
            ))}
            {!visiblePrivate.length ? <CatalogEmpty label={search.trim() ? ui('لا توجد باقة بهذا الاسم.') : ui('لا توجد باقات برايفت بعد.')} /> : null}
          </CatalogGrid>
        </CatalogSection>
      </TabsContent>

      <TabsContent value="classes" className="pt-4">
        <CatalogSection
          title={ui('حصص مجدولة')}
          description={ui('تعريف الحصة وسعرها ومدربيها ومواعيدهم؛ عدد الحصص ومدة الصلاحية يحددهما اشتراك كل عضو.')}
          icon={GraduationCap}
          tone="sky"
          count={classesApi.count}
          search={<CatalogSearch value={search} onChange={setSearch} placeholder={ui('ابحث باسم الحصة…')} clearLabel={ui('مسح البحث')} />}
        >
          <ClassSettingsPanel
            embedded
            search={search}
            onReady={setClassesApi}
            autoOpenCreate={searchParams.get('action') === 'create'}
            onAutoOpenHandled={() => setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('action');
              return next;
            }, { replace: true })}
          />
        </CatalogSection>
      </TabsContent>

      <TabsContent value="scheduling" className="pt-4">
        <FitnessSchedulingPage
          embedded
          onAddSpecialSubscription={() => setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set('tab', 'private');
            next.set('action', 'create');
            return next;
          })}
        />
      </TabsContent>

      <TabsContent value="reports" className="pt-4"><ClassReportsPanel /></TabsContent>

      <TabsContent value="categories" className="pt-4">
        <PackageCategoriesPanel
          categories={packageCategories}
          refetch={refetchCategories}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onReady={setCategoriesApi}
        />
      </TabsContent>
    </Tabs>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}><FormDialogHeader><DialogTitle>{dialogTitle}</DialogTitle></FormDialogHeader><FormDialogBody>
      <DialogFormSection title={ct('packages.sectionBasic')} icon={Package}><DialogFormGrid columns={2}>
        {/* Editing may switch subscription↔sessions, but never across the regular/private divide —
            the two live in different tables. */}
        <FormField label={ui('نوع الباقة')} required><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.kind} onChange={(event) => {
          const kind = event.target.value as PackageKind;
          overriddenRef.current = new Set();
          patchForm({
            kind,
            sessionsCount: isSessionsKind(kind) ? form.sessionsCount : '',
            sessionPrices: isSessionsKind(kind) ? form.sessionPrices : [],
          });
          if (isSessionsKind(kind)) setMatrixOpen(true);
        }}>
          {editing && editingPrivate ? null : (
            <optgroup label={ui('عادي')}>
              <option value="package">{ui('اشتراك')}</option>
              <option value="sessions">{ui('حصص')}</option>
            </optgroup>
          )}
          {editing && !editingPrivate ? null : (
            <optgroup label={ui('برايفت')}>
              <option value="private-subscription">{ui('اشتراك برايفت')}</option>
              <option value="private-sessions">{ui('حصص برايفت')}</option>
            </optgroup>
          )}
        </select></FormField>
        <FormField label={ct('packages.subscriptionName')} required><Input value={form.name} onChange={(event) => patchForm({ name: event.target.value })} /></FormField>
        <FormField label={ct('packages.subscriptionValueEgp')} required><Input type="number" min={0} step="0.01" className="nums" value={form.price} onChange={(event) => {
          overriddenRef.current = new Set();
          patchForm({ price: event.target.value });
        }} /></FormField>
        <FormField label={formIsSessions ? ui('صلاحية باقة الحصص (بالأيام)') : ct('packages.subscriptionDays')} required><Input type="number" min={1} className="nums" value={form.days} onChange={(event) => patchForm({ days: event.target.value })} /></FormField>
        {formIsSessions ? <FormField label={ui('عدد الحصص')} required><Input type="number" min={1} className="nums" value={form.sessionsCount} onChange={(event) => {
          overriddenRef.current = new Set(
            [...overriddenRef.current].filter((n) => n <= Number(event.target.value)),
          );
          patchForm({ sessionsCount: event.target.value });
        }} /></FormField> : null}
        <FormField label={ct('common.branch')} required className="sm:col-span-2"><div className="space-y-3 rounded-lg border bg-muted/20 p-3"><label className="flex items-center gap-2"><Checkbox checked={form.applyToAllBranches} onCheckedChange={(checked) => patchForm({ applyToAllBranches: !!checked, branchIds: checked ? allBranchIds : [] })} /><span className="text-sm font-medium">{ct('common.allBranches')}</span></label>{branchesLoading ? <p className="text-sm text-muted-foreground">{ct('common.loading')}</p> : <div className="grid gap-2 sm:grid-cols-2">{(branches ?? []).map((branch) => <label key={branch.id} className="flex items-center gap-2"><Checkbox disabled={form.applyToAllBranches} checked={form.applyToAllBranches || form.branchIds.includes(branch.id)} onCheckedChange={(checked) => patchForm({ branchIds: checked ? [...new Set([...form.branchIds, branch.id])] : form.branchIds.filter((id) => id !== branch.id) })} /><span className="text-sm">{branch.name}</span></label>)}</div>}</div></FormField>
      </DialogFormGrid>

      {formIsSessions ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-sky-500/20 bg-sky-500/[0.04]">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
            onClick={() => setMatrixOpen((v) => !v)}
          >
            <div>
              <p className="text-sm font-semibold">{ui('أسعار الحصص')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                يُحسب تلقائيًا من قيمة الاشتراك ÷ عدد الحصص. عدّل أي صف يدويًا — عند تغيير السعر أو العدد تُحدَّث القيم غير المعدَّلة فقط.
              </p>
            </div>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', matrixOpen && 'rotate-180')} />
          </button>
          {matrixOpen ? (
            <div className="border-t border-sky-500/15 px-4 py-3">
              <div className="max-h-56 space-y-1.5 overflow-y-auto pe-1">
                {form.sessionPrices.map((row) => (
                  <div
                    key={row.sessionsCount}
                    className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 rounded-lg bg-background/80 px-2.5 py-1.5"
                  >
                    <span className="text-sm nums">
                      {toArabicDigits(row.sessionsCount)} حصة
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 nums text-sm"
                      value={String(row.price)}
                      onChange={(event) => {
                        const price = Number(event.target.value);
                        overriddenRef.current.add(row.sessionsCount);
                        patchForm({
                          sessionPrices: form.sessionPrices.map((item) =>
                            item.sessionsCount === row.sessionsCount
                              ? { ...item, price: Number.isFinite(price) ? price : 0 }
                              : item,
                          ),
                        });
                      }}
                    />
                  </div>
                ))}
                {!form.sessionPrices.length ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">{ui('أدخل قيمة الاشتراك وعدد الحصص لبناء الجدول')}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {/* App sections and per-branch prices belong to regular packages only. */}
      {formIsPrivate ? null : (
        <FormField label={ui('أقسام التطبيق')} className="mt-4">
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              {ui('حدّد الأقسام التي تظهر فيها الباقة على الشاشة الرئيسية للتطبيق. يمكن اختيار أكثر من قسم، وباقة بدون أقسام لا تظهر داخل أي مربع.')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {packageCategories.map((category) => {
                const iconSrc = packageCategoryIconSrc(category);
                return (
                  <label key={category.key} className={cn('flex items-center gap-2', !category.isActive && 'opacity-60')}>
                    <Checkbox
                      checked={form.categories.includes(category.key)}
                      onCheckedChange={(checked) =>
                        patchForm({
                          categories: checked
                            ? [...new Set([...form.categories, category.key])]
                            : form.categories.filter((key) => key !== category.key),
                        })
                      }
                    />
                    {iconSrc ? <img src={iconSrc} alt="" className="size-6 shrink-0 rounded-md bg-zinc-900 object-contain p-0.5" /> : null}
                    <span className="text-sm">{category.name}</span>
                    {!category.isActive ? <span className="text-[11px] text-muted-foreground">({ui('مخفية')})</span> : null}
                  </label>
                );
              })}
            </div>
            {!packageCategories.length ? (
              <p className="text-xs text-muted-foreground">{ui('لا توجد فئات — أضفها من تبويب «الفئات».')}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {ui('قسم «عروض» يضيف نفسه تلقائيًا لأي باقة عليها عرض ساري، حتى لو لم يُحدَّد هنا.')}
            </p>
          </div>
        </FormField>
      )}

      {formIsPrivate ? null : (() => {
        const pricedBranches = (branches ?? []).filter((branch) =>
          form.applyToAllBranches || form.branchIds.includes(branch.id),
        );
        if (pricedBranches.length < 2) return null;
        return (
          <div className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-3">
            <div>
              <p className="text-sm font-semibold">{ui('سعر كل فرع')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ui('اترك الحقل فارغًا لاستخدام السعر الافتراضي أعلاه. تعديل فرع لا يغيّر سعر الفرع الآخر.')}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {pricedBranches.map((branch) => (
                <label key={branch.id} className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{branch.name}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="nums h-9"
                    placeholder={form.price || '0'}
                    value={form.branchPrices[branch.id] ?? ''}
                    onChange={(event) =>
                      patchForm({
                        branchPrices: { ...form.branchPrices, [branch.id]: event.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })()}
      </DialogFormSection>
      {formIsPrivate ? null : <>
        <DialogFormSection title={ct('packages.sectionBenefits')} icon={Sparkles}><DialogFormGrid columns={2}><FormField label={ct('packages.invitationsCount')}><Input type="number" min={0} className="nums" value={form.invitationsCount} onChange={(event) => patchForm({ invitationsCount: event.target.value })} /></FormField><FormField label={ct('packages.inbodyCount')}><Input type="number" min={0} className="nums" value={form.inbodyCount} onChange={(event) => patchForm({ inbodyCount: event.target.value })} /></FormField></DialogFormGrid></DialogFormSection>
        <DialogFormSection title={ct('packages.sectionApp')} icon={Bell}><p className="text-sm text-muted-foreground">{ct('packages.appAnnounceHint')}</p></DialogFormSection>
        <DialogFormSection title={ui('ملاحظات تظهر في التطبيق')} icon={MessageSquareText}>
          <Textarea
            rows={4}
            maxLength={APP_NOTES_MAX_LENGTH}
            value={form.appNotes}
            placeholder={ui('مثال: الاشتراك ساري من 1 أكتوبر حتى 31 ديسمبر، ويشمل استخدام الساونا مرتين أسبوعيًا.')}
            onChange={(event) => patchForm({ appNotes: event.target.value })}
          />
          <p className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{ui('تظهر للأعضاء في صفحة الباقة كما كتبتها، بأسطرها. اتركها فارغة لإخفائها.')}</span>
            <span className="nums shrink-0">{toArabicDigits(form.appNotes.length)} / {toArabicDigits(APP_NOTES_MAX_LENGTH)}</span>
          </p>
        </DialogFormSection>
        <DialogFormSection title={ui('التجميد والخدمات')}><div className="grid gap-3 sm:grid-cols-2"><DialogFormToggle label={ct('packages.isLinkedToFreeze')} checked={form.isLinkedToFreeze} onCheckedChange={(value) => patchForm({ isLinkedToFreeze: value })} /><DialogFormToggle label={ct('packages.includesSpa')} checked={form.includesSpa} onCheckedChange={(value) => patchForm({ includesSpa: value })} /></div><DialogFormGrid columns={2} className="mt-3">{form.isLinkedToFreeze ? <FormField label={ct('packages.freezeDays')}><Input type="number" min={1} className="nums" value={form.freezeDays} onChange={(event) => patchForm({ freezeDays: event.target.value })} /></FormField> : null}{form.isLinkedToFreeze ? <FormField label={ct('packages.freezeTotalDays')}><Input type="number" min={0} className="nums" value={form.freezeTotalDays} onChange={(event) => patchForm({ freezeTotalDays: event.target.value })} /><p className="text-xs text-muted-foreground">{ct('packages.freezeTotalDaysHint')}</p></FormField> : null}{form.includesSpa ? <FormField label={ct('packages.spaCount')}><Input type="number" min={1} className="nums" value={form.spaCount} onChange={(event) => patchForm({ spaCount: event.target.value })} /></FormField> : null}</DialogFormGrid></DialogFormSection>
      </>}
    </FormDialogBody><FormDialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{ct('common.cancel')}</Button>{mayWrite ? <Button permissionResource={formIsPrivate ? 'club.subscriptions.special' : undefined} permissionAction={editing ? 'update' : 'create'} variant="brand" onClick={() => void save()} disabled={saving}><Save className="size-4" /> {ct('common.save')}</Button> : null}</FormDialogFooter></DialogContent></Dialog>

    <Dialog open={promoOpen} onOpenChange={setPromoOpen}><DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}><DialogHeader><DialogTitle className="flex items-center gap-2"><BadgePercent className="size-5 text-amber-600" /> {ui('عرض ترويجي —')}{promoTarget?.name}</DialogTitle></DialogHeader><div className="space-y-5"><div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4"><div><Label htmlFor="promo-enabled">{ui('تفعيل العرض')}</Label><p className="mt-1 text-xs text-muted-foreground">{ui('يظهر للأعضاء حتى نهاية المدة المحددة.')}</p></div><Switch id="promo-enabled" checked={promoForm.enabled} onCheckedChange={(enabled) => setPromoForm((current) => ({ ...current, enabled }))} /></div>{promoForm.enabled ? <><p className="text-sm text-muted-foreground nums">السعر الأصلي: {toArabicDigits(promoTarget?.price ?? 0)} ج.م</p><div className="grid gap-4 sm:grid-cols-2"><FormField label={ui('سعر العرض')} required><Input type="number" min={0.01} step="0.01" className="nums" value={promoForm.price} onChange={(event) => setPromoPrice(event.target.value)} /></FormField><FormField label={ui('نسبة الخصم %')}><Input type="number" min={0.01} max={99.99} step="0.01" className="nums" value={promoForm.discountPercent} onChange={(event) => setPromoDiscount(event.target.value)} /></FormField><FormField label={ui('مدة العرض (بالأيام)')} required><Input type="number" min={1} step={1} className="nums" value={promoForm.durationDays} onChange={(event) => setPromoForm((current) => ({ ...current, durationDays: event.target.value }))} /></FormField><FormField label={ui('صورة العرض')}><UploadField category="club-package-promo" value={promoForm.image} onChange={(image) => setPromoForm((current) => ({ ...current, image }))} /></FormField></div><FormField label={ui('رسالة العرض')}><Textarea rows={3} maxLength={PROMO_MESSAGE_MAX_LENGTH} value={promoForm.marketingMessage} placeholder={ui('ابدأ رحلتك واستفد من العرض قبل انتهائه')} onChange={(event) => setPromoForm((current) => ({ ...current, marketingMessage: event.target.value }))} /><p className="mt-1 text-end text-xs text-muted-foreground nums">{toArabicDigits(promoForm.marketingMessage.length)} / {toArabicDigits(PROMO_MESSAGE_MAX_LENGTH)}</p></FormField><div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">{promoPreviewUrl ? <img src={promoPreviewUrl} alt="" className="size-16 shrink-0 rounded-lg border bg-background object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">ONE80</div>}<div className="min-w-0"><p className="break-words font-medium">{promoTarget?.name}</p><p className="nums text-sm"><span className="text-muted-foreground line-through">{toArabicDigits(promoTarget?.price ?? 0)}</span>{' '}<span className="font-semibold text-amber-700">{toArabicDigits(promoForm.price || 0)} ج.م</span></p>{promoForm.marketingMessage.trim() ? <p className="mt-1 break-words text-xs text-muted-foreground">{promoForm.marketingMessage.trim()}</p> : null}</div></div></> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{ui('حفظ العرض وهو موقوف يزيله فورًا من تطبيق الأعضاء.')}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setPromoOpen(false)}>{ct('common.cancel')}</Button><Button permissionAction="update" variant="brand" disabled={promoSaving} onClick={() => void savePromo()}><Save className="size-4" /> {ct('common.save')}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
