import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, Clock, Loader2, MapPin, Pencil, Phone, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common/states';
import { UploadField } from '@/components/employees/upload-fields';
import { uploadUrl } from '@/components/employees/use-uploads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { AppManagementShell } from './app-shell';

const PERMISSION_RESOURCE = 'app-management.branches';
const QUERY_KEY = 'app-branch-profiles';
const UPLOAD_CATEGORY = 'branch-photo';

interface WorkingHoursDay {
  weekday: number;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

interface BranchProfile {
  branchId: number;
  branchName: string;
  displayName: string | null;
  displayNameEn: string | null;
  publicName: string;
  publicNameEn: string;
  tagline: string | null;
  about: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  mapUrl: string | null;
  coverImage: string | null;
  gallery: string[];
  workingHours: WorkingHoursDay[];
  facebookUrl: string | null;
  instagramUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
  hasProfile: boolean;
}

type FormState = {
  displayName: string;
  displayNameEn: string;
  tagline: string;
  about: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  mapUrl: string;
  coverImage: string;
  gallery: string[];
  facebookUrl: string;
  instagramUrl: string;
  isPublished: boolean;
  sortOrder: string;
  workingHours: WorkingHoursDay[];
};

/** Literal `ui()` calls so `npm run i18n:map` registers every weekday name. Sunday first. */
function useWeekdayLabel(): (weekday: number) => string {
  const { ui } = useLocale();
  return (weekday: number) => {
    switch (weekday) {
      case 0:
        return ui('الأحد');
      case 1:
        return ui('الاثنين');
      case 2:
        return ui('الثلاثاء');
      case 3:
        return ui('الأربعاء');
      case 4:
        return ui('الخميس');
      case 5:
        return ui('الجمعة');
      default:
        return ui('السبت');
    }
  };
}

function emptyWeek(): WorkingHoursDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, closed: true, opensAt: null, closesAt: null }));
}

function toForm(profile: BranchProfile): FormState {
  const week = emptyWeek();
  for (const day of profile.workingHours ?? []) {
    if (day.weekday >= 0 && day.weekday < 7) week[day.weekday] = { ...day };
  }
  return {
    displayName: profile.displayName ?? '',
    displayNameEn: profile.displayNameEn ?? '',
    tagline: profile.tagline ?? '',
    about: profile.about ?? '',
    address: profile.address ?? '',
    phone: profile.phone ?? '',
    whatsapp: profile.whatsapp ?? '',
    email: profile.email ?? '',
    mapUrl: profile.mapUrl ?? '',
    coverImage: profile.coverImage ?? '',
    gallery: [...(profile.gallery ?? [])],
    facebookUrl: profile.facebookUrl ?? '',
    instagramUrl: profile.instagramUrl ?? '',
    isPublished: profile.isPublished,
    sortOrder: String(profile.sortOrder ?? 0),
    workingHours: week,
  };
}

/**
 * Multi-image upload for the branch gallery. Each photo is uploaded the moment it is picked
 * (public `branch-photo` media) and stored as its reference; order is editable because the app
 * slides through them in sequence and the first one is the one most people see.
 */
function GalleryEditor({ images, onChange }: { images: string[]; onChange: (images: string[]) => void }) {
  const { ui } = useLocale();
  const add = (path: string | null) => {
    if (!path || images.includes(path)) return;
    onChange([...images, path]);
  };
  const removeAt = (index: number) => onChange(images.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {images.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {images.map((path, index) => (
            <div key={`${path}-${index}`} className="relative overflow-hidden rounded-lg border bg-muted/20">
              <img src={uploadUrl(path) ?? ''} alt="" className="h-28 w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/85 px-1.5 py-1">
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    permissionAction={null}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={ui('تقديم الصورة')}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    permissionAction={null}
                    disabled={index === images.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={ui('تأخير الصورة')}
                  >
                    <ArrowLeft className="size-3.5" />
                  </Button>
                  <span className="nums text-[11px] text-muted-foreground">{toArabicDigits(index + 1)}</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-destructive"
                  permissionAction={null}
                  onClick={() => removeAt(index)}
                  aria-label={ui('حذف الصورة')}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <UploadField
        category={UPLOAD_CATEGORY}
        accept="image/jpeg,image/png,image/webp"
        preview={false}
        label={ui('اسحب صور الفرع هنا أو انقر للاختيار')}
        value={null}
        onChange={add}
      />
      <p className="text-xs text-muted-foreground">{ui('تظهر الصور في التطبيق متتالية بنفس هذا الترتيب.')}</p>
    </div>
  );
}

/**
 * الفروع — the app-facing profile of every branch: the names, contact details, map, photos and
 * working hours that members and guests see. The operational branch name used by HR, stock and
 * reports is never changed from here.
 */
export function AppBranchesPage() {
  const { ui } = useLocale();
  const weekdayLabel = useWeekdayLabel();
  const { can } = usePermission();
  const canUpdate = can(`${PERMISSION_RESOURCE}:update`);
  const [editing, setEditing] = useState<BranchProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<BranchProfile[]>({
    queryKey: [QUERY_KEY],
    queryFn: async () => (await api.get<BranchProfile[]>('/club-branch-profiles')).data,
  });

  useEffect(() => {
    setForm(editing ? toForm(editing) : null);
  }, [editing]);

  const patch = (changes: Partial<FormState>) => setForm((current) => (current ? { ...current, ...changes } : current));
  const patchDay = (weekday: number, changes: Partial<WorkingHoursDay>) =>
    setForm((current) =>
      current
        ? { ...current, workingHours: current.workingHours.map((day) => (day.weekday === weekday ? { ...day, ...changes } : day)) }
        : current,
    );

  const save = async () => {
    if (!editing || !form || !canUpdate) return;
    setSaving(true);
    try {
      await api.put(`/club-branch-profiles/${editing.branchId}`, {
        displayName: form.displayName.trim() || null,
        displayNameEn: form.displayNameEn.trim() || null,
        tagline: form.tagline.trim() || null,
        about: form.about.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        mapUrl: form.mapUrl.trim() || null,
        coverImage: form.coverImage.trim() || null,
        facebookUrl: form.facebookUrl.trim() || null,
        instagramUrl: form.instagramUrl.trim() || null,
        gallery: form.gallery,
        isPublished: form.isPublished,
        sortOrder: Number(form.sortOrder) || 0,
        workingHours: form.workingHours,
      });
      toast.success(ui('تم حفظ بيانات الفرع'));
      setEditing(null);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppManagementShell
      title="الفروع"
      description="بيانات الفروع التي تظهر للأعضاء وللزائرين في التطبيق قبل الاشتراك."
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState title={ui('لا توجد فروع')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((branch) => {
            const openDays = branch.workingHours?.filter((day) => !day.closed).length ?? 0;
            const cover = uploadUrl(branch.coverImage);
            return (
              <Card key={branch.branchId} className="overflow-hidden">
                {cover ? <img src={cover} alt="" className="h-28 w-full object-cover" /> : null}
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{branch.publicName}</span>
                    </CardTitle>
                    {branch.displayName ? (
                      <p className="text-xs text-muted-foreground">
                        {ui('الاسم في النظام')}: {branch.branchName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {branch.isPublished ? null : <Badge variant="outline">{ui('مخفي')}</Badge>}
                    {branch.hasProfile ? null : <Badge variant="secondary">{ui('غير مكتمل')}</Badge>}
                    {canUpdate ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing(branch)}>
                        <Pencil className="size-4" />
                        {ui('تعديل')}
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {branch.tagline ? <p className="font-medium">{branch.tagline}</p> : null}
                  {branch.address ? (
                    <p className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      {branch.address}
                    </p>
                  ) : null}
                  {branch.phone ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4 shrink-0" />
                      <span className="nums" dir="ltr">{branch.phone}</span>
                    </p>
                  ) : null}
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="size-4 shrink-0" />
                    {openDays
                      ? `${ui('أيام العمل المحددة')}: ${toArabicDigits(openDays)}`
                      : ui('مواعيد العمل غير محددة')}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? `${ui('بيانات الفرع')}: ${editing.publicName}` : ''}</DialogTitle>
          </DialogHeader>

          {form ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{ui('اسم الفرع بالعربي')}</Label>
                  <Input
                    value={form.displayName}
                    maxLength={120}
                    placeholder={editing?.branchName}
                    onChange={(event) => patch({ displayName: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{ui('اسم الفرع بالإنجليزي')}</Label>
                  <Input
                    dir="ltr"
                    value={form.displayNameEn}
                    maxLength={120}
                    placeholder="ONE80"
                    onChange={(event) => patch({ displayNameEn: event.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {ui('يظهر الاسمان للأعضاء والزائرين حسب لغة التطبيق. إذا تُرك الاسم الإنجليزي فارغًا يظهر الاسم العربي، ويبقى اسم الفرع في النظام والتقارير كما هو.')}
                </p>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{ui('وصف مختصر')}</Label>
                  <Input value={form.tagline} maxLength={160} onChange={(event) => patch({ tagline: event.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{ui('نبذة عن الفرع')}</Label>
                  <Textarea rows={4} maxLength={4000} value={form.about} onChange={(event) => patch({ about: event.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{ui('العنوان')}</Label>
                  <Input value={form.address} maxLength={255} onChange={(event) => patch({ address: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('رقم التليفون')}</Label>
                  <Input className="nums" dir="ltr" value={form.phone} maxLength={30} onChange={(event) => patch({ phone: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('رقم الواتساب')}</Label>
                  <Input className="nums" dir="ltr" value={form.whatsapp} maxLength={30} onChange={(event) => patch({ whatsapp: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('البريد الإلكتروني')}</Label>
                  <Input dir="ltr" type="email" value={form.email} maxLength={120} onChange={(event) => patch({ email: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('رابط الخريطة')}</Label>
                  <Input dir="ltr" value={form.mapUrl} maxLength={500} placeholder="https://maps.google.com/…" onChange={(event) => patch({ mapUrl: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('رابط فيسبوك')}</Label>
                  <Input dir="ltr" value={form.facebookUrl} maxLength={500} onChange={(event) => patch({ facebookUrl: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('رابط إنستجرام')}</Label>
                  <Input dir="ltr" value={form.instagramUrl} maxLength={500} onChange={(event) => patch({ instagramUrl: event.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{ui('صورة الغلاف')}</Label>
                  <UploadField
                    category={UPLOAD_CATEGORY}
                    accept="image/jpeg,image/png,image/webp"
                    value={form.coverImage || null}
                    onChange={(path) => patch({ coverImage: path ?? '' })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{ui('صور الفرع')}</Label>
                  <GalleryEditor images={form.gallery} onChange={(gallery) => patch({ gallery })} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-semibold">{ui('مواعيد العمل')}</p>
                <div className="space-y-2">
                  {form.workingHours.map((day) => (
                    <div key={day.weekday} className="grid grid-cols-[5.5rem_auto_1fr_1fr] items-center gap-2">
                      <span className="text-sm">{weekdayLabel(day.weekday)}</span>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={!day.closed}
                          onCheckedChange={(checked) =>
                            patchDay(day.weekday, {
                              closed: !checked,
                              ...(checked
                                ? { opensAt: day.opensAt ?? '10:00', closesAt: day.closesAt ?? '23:00' }
                                : { opensAt: null, closesAt: null }),
                            })
                          }
                        />
                        {ui('مفتوح')}
                      </label>
                      <Input
                        type="time"
                        aria-label={ui('من')}
                        className="nums h-9"
                        disabled={day.closed}
                        value={day.opensAt ?? ''}
                        onChange={(event) => patchDay(day.weekday, { opensAt: event.target.value || null })}
                      />
                      <Input
                        type="time"
                        aria-label={ui('إلى')}
                        className="nums h-9"
                        disabled={day.closed}
                        value={day.closesAt ?? ''}
                        onChange={(event) => patchDay(day.weekday, { closesAt: event.target.value || null })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{ui('ظاهر في التطبيق')}</p>
                    <p className="text-xs text-muted-foreground">{ui('عند إيقافه لا يظهر الفرع للزائرين.')}</p>
                  </div>
                  <Switch checked={form.isPublished} onCheckedChange={(checked) => patch({ isPublished: checked })} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('ترتيب الظهور')}</Label>
                  <Input type="number" className="nums" value={form.sortOrder} onChange={(event) => patch({ sortOrder: event.target.value })} />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving || !canUpdate}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppManagementShell>
  );
}
