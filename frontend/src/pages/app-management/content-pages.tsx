import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BadgePercent,
  CalendarClock,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm, type Control, type FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { TrainerRatingsPanel, RatingStars, averageRating, buildRatingDistribution } from '@/components/club/trainer-ratings-panel';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { FieldWrapper } from '@/components/common/form-fields';
import { ErrorState } from '@/components/common/states';
import { Time12Input } from '@/components/common/time-12-input';
import { UploadField } from '@/components/employees/upload-fields';
import { uploadUrl, useFileUpload } from '@/components/employees/use-uploads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useArrayResource, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { buildAdPayload, buildExerciseCategoryPayload, buildExercisePayload, buildNewsPayload } from '@/lib/app-content-payloads';
import { buildPromoUpdate, toPromoSummary, type AppPromotionDraft } from '@/lib/app-promotion-model';
import { confirm } from '@/lib/confirm';
import { formatDate } from '@/lib/formatters';
import { getBrandProfile } from '@/ports/brand-registry';
import { uiStatic } from '@/lib/ui-static';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import type { ClubSubscriptionType } from '@/types/club';
import type { TrainerWorkspaceRating } from '@/types/fitness';
import { indexColumn } from '../inventory/simple-crud-tab';
import { AppCrudPage } from './app-crud';
import { AppManagementShell } from './app-shell';

interface PromoRow {
  type: ClubSubscriptionType;
  /** Enabled AND not past `promo_ends_at` — exactly what the member app shows. */
  isLive: boolean;
  /** Whole days left; null when the promo carries no end date, negative once it has passed. */
  daysRemaining: number | null;
  discountPercent: number | null;
}

type PromoDraft = AppPromotionDraft;

const emptyPromoDraft = (): PromoDraft => ({ price: '', discountPercent: '', durationDays: '', image: null });

function toPromoRow(type: ClubSubscriptionType, now: number): PromoRow {
  return { type, ...toPromoSummary(type, now) };
}

/**
 * إدارة العروض — the club's real discounts live on the packages themselves
 * (`club_subscription_types.promo_*`), NOT in the standalone `am_offers` table.
 *
 * WHY this page no longer uses `am_offers`: the club ended up with two unrelated notions of
 * "offer". This screen used to CRUD `am_offers` via /api/app/offers, while the discounts the
 * club actually runs were created per package from صفحة الباقات والأسعار
 * (/club/packages/settings) as promos. The member app now reads its "العروض" screen, its home
 * strip and its "اشتراكاتي" strip from GET /api/member/packages and shows any package whose
 * promo is enabled and not past `promo_ends_at` — so nothing written to `am_offers` reaches a
 * member anywhere. Every row left in it was stale (is_active = false, end_date in the past,
 * auto-generated filler description), which made dead entries look like live offers to admins.
 *
 * So this page now manages package promos through the SAME endpoint the packages-settings
 * screen uses (PUT /api/club-subscription-types/:id/promo) and the SAME permission that
 * endpoint enforces (`club.packages.settings:update`), so a discount is created and edited in
 * one place and the change shows everywhere. `am_offers` and its /api/app/offers routes still
 * exist; this UI simply no longer reads or writes them.
 */
export function AppOffersPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canUpdate = can('club.packages.settings:update');
  const { user } = useAuth();
  const brandLogoSrc = getBrandProfile().opaqueLogoSrc ?? getBrandProfile().logoSrc ?? undefined;
  const isAdmin = user?.level === 1;
  const { data: types, isLoading, isError, refetch } = useArrayResource<ClubSubscriptionType>('club-subscription-types');

  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [draft, setDraft] = useState<PromoDraft>(emptyPromoDraft);
  const [saving, setSaving] = useState(false);

  // A package assigned to every branch is system-admin-only to edit — the same rule
  // packages-settings applies and `updatePromo` re-checks on the server.
  const isEditable = (type: ClubSubscriptionType) => canUpdate && (isAdmin || !type.applyToAllBranches);

  const { live, expired } = useMemo(() => {
    const now = Date.now();
    const rows = (types ?? []).filter((type) => type.promoEnabled).map((type) => toPromoRow(type, now));
    const byRemaining = (a: PromoRow, b: PromoRow) => (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER);
    return {
      live: rows.filter((row) => row.isLive).sort(byRemaining),
      expired: rows.filter((row) => !row.isLive).sort((a, b) => byRemaining(b, a)),
    };
  }, [types]);

  const promotable = useMemo(
    () => (types ?? []).filter((type) => !type.promoEnabled && isEditable(type)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types, canUpdate, isAdmin],
  );

  const target = useMemo(() => (types ?? []).find((type) => type.id === targetId) ?? null, [types, targetId]);
  const originalPrice = Number(target?.price ?? 0);

  const setPrice = (value: string) => {
    const price = Number(value);
    const discount = originalPrice > 0 && value !== '' && Number.isFinite(price)
      ? String(Math.round(((originalPrice - price) / originalPrice) * 10000) / 100)
      : '';
    setDraft((current) => ({ ...current, price: value, discountPercent: discount }));
  };

  const setDiscount = (value: string) => {
    const percent = Number(value);
    const price = originalPrice > 0 && value !== '' && Number.isFinite(percent)
      ? String(Math.round(originalPrice * (1 - percent / 100) * 100) / 100)
      : '';
    setDraft((current) => ({ ...current, discountPercent: value, price }));
  };

  const openCreate = () => {
    if (!canUpdate) return;
    setTargetId(null);
    setDraft(emptyPromoDraft());
    setOpen(true);
  };

  const openEdit = (row: PromoRow) => {
    if (!isEditable(row.type)) return;
    setTargetId(row.type.id);
    setDraft({
      price: row.type.promoPrice != null ? String(row.type.promoPrice) : '',
      discountPercent: row.discountPercent != null ? String(row.discountPercent) : '',
      // The endpoint takes a duration, not an end date: an expired promo restarts from today.
      durationDays: row.daysRemaining != null && row.daysRemaining > 0 ? String(row.daysRemaining) : '',
      image: row.type.promoImage ?? null,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!target || !isEditable(target)) return;
    let payload: ReturnType<typeof buildPromoUpdate>;
    try {
      payload = buildPromoUpdate(draft, originalPrice);
    } catch (error) {
      toast.error(ui(error instanceof Error ? error.message : ui('بيانات العرض غير صحيحة')));
      return;
    }
    setSaving(true);
    try {
      // Same endpoint + payload shape as the promo modal in /club/packages/settings.
      await api.put(`/club-subscription-types/${target.id}/promo`, payload);
      toast.success(ui('تم الحفظ'));
      setOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const clearPromo = async (row: PromoRow) => {
    if (!isEditable(row.type)) return;
    const ok = await confirm({
      title: ui('إزالة العرض؟'),
      description: ui('هيتشال الخصم من الباقة ومش هيظهر للأعضاء في التطبيق. سعر الباقة الأصلي هيرجع زي ما هو.'),
      confirmLabel: ui('إزالة العرض'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.put(`/club-subscription-types/${row.type.id}/promo`, { enabled: false });
      toast.success(ui('تم إزالة العرض'));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const renderCard = (row: PromoRow) => {
    const { type } = row;
    const editable = isEditable(type);
    return (
      <div
        key={type.id}
        className={`rounded-xl border p-4 shadow-sm ${row.isLive ? 'border-emerald-500/40 bg-card' : 'border-dashed border-muted-foreground/30 bg-muted/40'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`truncate font-medium ${row.isLive ? '' : 'text-muted-foreground'}`}>{type.name}</p>
              {row.isLive
                ? <Badge variant="success"><BadgePercent className="size-3" /> {ui('شغال دلوقتي')}</Badge>
                : <Badge variant="destructive"><CalendarClock className="size-3" /> {ui('منتهي')}</Badge>}
            </div>
            <p className="text-sm nums">
              <span className="text-muted-foreground line-through">{toArabicDigits(type.price)}</span>{' '}
              <span className={`font-semibold ${row.isLive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {toArabicDigits(type.promoPrice ?? type.price)} {ui('ج.م')}
              </span>
              {row.discountPercent != null
                ? <span className="ms-2 text-muted-foreground">({ui('خصم')} {toArabicDigits(row.discountPercent)}%)</span>
                : null}
            </p>
          </div>
          {type.promoImage
            ? <img src={uploadUrl(type.promoImage) ?? brandLogoSrc} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
            : null}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">{ui('ينتهي في')}</dt>
            <dd className="nums font-medium">{type.promoEndsAt ? formatDate(type.promoEndsAt) : ui('بدون تاريخ انتهاء')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{ui('الأيام المتبقية')}</dt>
            <dd className="nums font-medium">
              {row.daysRemaining == null
                ? ui('مفتوح')
                : row.isLive
                  ? `${toArabicDigits(row.daysRemaining)} ${ui('يوم')}`
                  : `${ui('انتهى من')} ${toArabicDigits(Math.abs(row.daysRemaining))} ${ui('يوم')}`}
            </dd>
          </div>
        </dl>

        {editable ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              permissionResource="club.packages.settings"
              permissionAction="update"
              variant="outline"
              size="sm"
              onClick={() => openEdit(row)}
            >
              <Pencil className="size-4" /> {row.isLive ? ui('تعديل العرض') : ui('إعادة تشغيل العرض')}
            </Button>
            <Button
              permissionResource="club.packages.settings"
              permissionAction="update"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void clearPromo(row)}
            >
              <Trash2 className="size-4" /> {ui('إزالة العرض')}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{ui('التعديل على باقة متاحة لكل الفروع مسموح لمدير النظام فقط')}</p>
        )}
      </div>
    );
  };

  return (
    <AppManagementShell
      title={ui('إدارة العروض')}
      description={ui('الخصومات دي متسجلة على الباقات نفسها — ودي نفس العروض بالظبط اللي بيشوفها الأعضاء في التطبيق، وأي تعديل هنا بيظهر لهم على طول.')}
      actions={canUpdate ? (
        <Button permissionResource="club.packages.settings" permissionAction="update" variant="brand" onClick={openCreate}>
          <Plus className="size-4" /> {ui('عرض جديد على باقة')}
        </Button>
      ) : undefined}
    >
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          <p>{ui('تعذر تحميل الباقات. العروض متسجلة على الباقات، فمحتاج صلاحية عرض الباقات والأسعار.')}</p>
          <Button permissionAction={null} variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            {ui('إعادة المحاولة')}
          </Button>
        </div>
      ) : !live.length && !expired.length ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Tag className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {ui('مفيش عروض شغالة. اعمل خصم على أي باقة وهيظهر للأعضاء في التطبيق على طول.')}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{ui('عروض شغالة دلوقتي')}</h2>
              <Badge variant="success" className="nums">{toArabicDigits(live.length)}</Badge>
              <span className="text-xs text-muted-foreground">{ui('ظاهرة للأعضاء في التطبيق')}</span>
            </div>
            {live.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{live.map(renderCard)}</div>
            ) : (
              <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                {ui('مفيش عروض شغالة. اعمل خصم على أي باقة وهيظهر للأعضاء في التطبيق على طول.')}
              </p>
            )}
          </section>

          {expired.length ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-muted-foreground">{ui('عروض منتهية')}</h2>
                <Badge variant="destructive" className="nums">{toArabicDigits(expired.length)}</Badge>
                <span className="text-xs text-muted-foreground">{ui('مش ظاهرة للأعضاء — لسه متسجلة على الباقة')}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{expired.map(renderCard)}</div>
            </section>
          ) : null}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgePercent className="size-4 text-amber-600" />
              {target ? `${ui('عرض ترويجي')} — ${target.name}` : ui('عرض جديد على باقة')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{ui('الباقة')}</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={targetId != null ? String(targetId) : ''}
                onChange={(event) => {
                  setTargetId(event.target.value ? Number(event.target.value) : null);
                  setDraft(emptyPromoDraft());
                }}
              >
                <option value="">{ui('— اختر الباقة —')}</option>
                {target && !promotable.some((type) => type.id === target.id) ? (
                  <option value={String(target.id)}>{target.name}</option>
                ) : null}
                {promotable.map((type) => (
                  <option key={type.id} value={String(type.id)}>{type.name}</option>
                ))}
              </select>
            </div>

            {target ? (
              <>
                <p className="text-sm text-muted-foreground nums">
                  {ui('السعر الأصلي')}: {toArabicDigits(originalPrice)} {ui('ج.م')}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{ui('السعر بعد الخصم')}<span className="text-destructive"> *</span></Label>
                    <Input type="number" min={0} step="0.01" className="nums" value={draft.price} onChange={(event) => setPrice(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{ui('نسبة الخصم %')}</Label>
                    <Input type="number" min={0} max={99} step="0.1" className="nums" value={draft.discountPercent} onChange={(event) => setDiscount(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{ui('مدة العرض (بالأيام)')}<span className="text-destructive"> *</span></Label>
                  <Input type="number" min={1} className="nums" value={draft.durationDays} onChange={(event) => setDraft((current) => ({ ...current, durationDays: event.target.value }))} />
                  <p className="text-xs text-muted-foreground">{ui('المدة بتتحسب من دلوقتي — تاريخ الانتهاء بيتظبط تلقائي.')}</p>
                </div>
                <div className="space-y-2">
                  <Label>{ui('صورة العرض (اختياري)')}</Label>
                  <UploadField category="club-package-promo" value={draft.image} onChange={(path) => setDraft((current) => ({ ...current, image: path }))} />
                </div>
                <div className="space-y-2">
                  <Label>{ui('معاينة الظهور في التطبيق')}</Label>
                  <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                    <img src={uploadUrl(draft.image) ?? brandLogoSrc} alt="" className="size-16 shrink-0 rounded-lg border object-cover" />
                    <div>
                      <p className="font-medium">{target.name}</p>
                      <p className="text-sm nums">
                        <span className="text-muted-foreground line-through">{toArabicDigits(originalPrice)}</span>{' '}
                        <span className="font-semibold text-amber-700">{toArabicDigits(draft.price || 0)} {ui('ج.م')}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{ui('اختر الباقة اللي عايز تعمل عليها الخصم.')}</p>
            )}
          </div>
          <DialogFooter>
            <Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button>
            <Button
              permissionResource="club.packages.settings"
              permissionAction="update"
              variant="brand"
              disabled={saving || !target}
              onClick={() => void save()}
            >
              <Save className="size-4" /> {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppManagementShell>
  );
}

/**
 * Row shape the trainers table needs. `specializations` is the list the member app reads;
 * `specialization` is the legacy single VarChar the API still returns beside it.
 */
interface TrainerAdminRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  specializations?: string[] | null;
  experience: string | null;
  bio: string | null;
  imageUrl: string | null;
  ratingAvg?: number | null;
  isActive: boolean;
}

/** One `${ui('أيام التواجد')}` window. The API stores `HH:MM:SS`; the form works in `HH:MM`. */
interface TrainerAvailabilitySlot {
  weekday: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

const TRAINERS_RESOURCE = 'club-trainers';
/**
 * ClubTrainersController accepts EITHER permission family on every trainer write
 * (`club.fitness.trainers:*` OR `app-management.trainers:*`) since /app/trainers was
 * repointed at `club_trainers`. Gating on the club key alone would leave an
 * app-management-only role staring at a read-only page for records the API lets it edit.
 */
const TRAINER_CLUB_RESOURCE = 'club.fitness.trainers';
const TRAINER_APP_RESOURCE = 'app-management.trainers';

const TRAINER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const TRAINER_PHONE_PATTERN = /^[\d+][\d\s()-]{6,19}$/;
const TRAINER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The server joins the chips back into one VarChar(200) column with this separator. */
const SPECIALIZATION_SEPARATOR = uiStatic('،');
const SPECIALIZATIONS_MAX_LENGTH = 200;
/** …and splits that column on these, so a single chip may never contain one. */
const SPECIALIZATION_FORBIDDEN = /[،,/|]/;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** `HH:MM` out of `HH:MM`, `H:MM` or `HH:MM:SS`; empty string when unparseable. */
function toHourMinute(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function minutesOfDay(value: string): number {
  const hm = toHourMinute(value);
  return hm ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : Number.NaN;
}

/** Literal `ui()` calls so `npm run i18n:map` registers every weekday name. */
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

/** Legacy rows only carry the single `specialization` string — split it so old data still shows chips. */
function rowSpecializations(row: TrainerAdminRow): string[] {
  if (Array.isArray(row.specializations) && row.specializations.length) {
    return row.specializations.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(row.specialization ?? '')
    .split(SPECIALIZATION_FORBIDDEN)
    .map((item) => item.trim())
    .filter(Boolean);
}

const availabilitySlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(TRAINER_TIME_PATTERN, uiStatic('أدخل وقت بداية صحيح')),
  endTime: z.string().regex(TRAINER_TIME_PATTERN, uiStatic('أدخل وقت نهاية صحيح')),
  isActive: z.boolean(),
});

const trainerSchema = z
  .object({
    name: z.string().trim().min(2, uiStatic('اسم المدرب مطلوب')),
    phone: z
      .string()
      .trim()
      .refine((value) => !value || TRAINER_PHONE_PATTERN.test(value), uiStatic('أدخل رقم هاتف صحيح')),
    email: z
      .string()
      .trim()
      .refine((value) => !value || TRAINER_EMAIL_PATTERN.test(value), uiStatic('أدخل بريدًا إلكترونيًا صحيحًا')),
    // club_trainers.experience is free text (e.g. ٥ سنوات لياقة), never a number.
    experience: z.string().trim().max(100, uiStatic('الخبرة يجب ألا تتجاوز 100 حرف')),
    specializations: z
      .array(z.string().trim().min(1))
      // Optional on purpose: the trainers already in the system were created
      // before this field existed and have none, so requiring one would block
      // editing any of them until a specialisation was invented for each.
      .refine(
        (items) => items.join(SPECIALIZATION_SEPARATOR).length <= SPECIALIZATIONS_MAX_LENGTH,
        uiStatic('التخصصات مجتمعة أطول من المسموح — اختصرها أو احذف واحدًا'),
      ),
    bio: z.string().trim().max(1000, uiStatic('النبذة يجب ألا تتجاوز 1000 حرف')),
    imageUrl: z.string().nullable(),
    isActive: z.boolean(),
    slots: z.array(availabilitySlotSchema),
  })
  .superRefine((values, ctx) => {
    values.slots.forEach((slot, index) => {
      const start = minutesOfDay(slot.startTime);
      const end = minutesOfDay(slot.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      if (start >= end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slots', index, 'endTime'],
          message: uiStatic('وقت النهاية يجب أن يكون بعد وقت البداية'),
        });
      }
    });
    // Two windows on the same weekday may touch but never overlap — the server enforces the
    // same rule (and a unique index), so catching it here saves a round-trip and a raw 400.
    for (let first = 0; first < values.slots.length; first += 1) {
      for (let second = first + 1; second < values.slots.length; second += 1) {
        const a = values.slots[first];
        const b = values.slots[second];
        if (a.weekday !== b.weekday) continue;
        const bounds = [
          minutesOfDay(a.startTime),
          minutesOfDay(a.endTime),
          minutesOfDay(b.startTime),
          minutesOfDay(b.endTime),
        ];
        if (!bounds.every((value) => Number.isFinite(value))) continue;
        if (bounds[0] < bounds[3] && bounds[2] < bounds[1]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', second, 'startTime'],
            message: uiStatic('هذا الموعد يتعارض مع موعد آخر في نفس اليوم'),
          });
        }
      }
    }
  });

type TrainerFormValues = z.infer<typeof trainerSchema>;

const EMPTY_TRAINER: TrainerFormValues = {
  name: '',
  phone: '',
  email: '',
  experience: '',
  specializations: [],
  bio: '',
  imageUrl: null,
  isActive: true,
  slots: [],
};

/** Titled block inside the trainer form — at this field count a flat stack stops being readable. */
function TrainerFormSection({
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl border bg-muted/10 p-4', className)}>
      <header className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Round photo with replace/clear — the member app shows trainers as circular hero cards. */
function TrainerPhotoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { ui } = useLocale();
  const { upload, uploading } = useFileUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = uploadUrl(value);

  const pick = async (file: File | null) => {
    if (!file) return;
    const path = await upload('trainers', file);
    if (path) onChange(path);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-dashed bg-muted/40">
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <UserRound className="size-9 text-muted-foreground" />
        )}
      </span>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Local file picker, not a permissioned action — the save button owns the gate. */}
          <Button
            type="button"
            variant="outline"
            permissionAction={null}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {previewUrl ? ui('تغيير الصورة') : ui('رفع صورة')}
          </Button>
          {previewUrl ? (
            <Button type="button" variant="ghost" permissionAction={null} onClick={() => onChange(null)}>
              <X className="size-4" />
              {ui('مسح الصورة')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {ui('صورة مربعة وواضحة — تظهر دائرية داخل التطبيق.')}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void pick(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Repeatable chip editor for التخصصات: one text field plus إضافة, Enter adds too, and every
 * value becomes a removable chip. Blanks, duplicates and the separators the server splits on
 * are refused inline instead of being silently swallowed.
 */
function SpecializationsField({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const { ui } = useLocale();
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  const add = () => {
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next) {
      setHint(ui('اكتب اسم التخصص أولاً'));
      return;
    }
    if (SPECIALIZATION_FORBIDDEN.test(next)) {
      setHint(ui('أضف كل تخصص بمفرده بدون فاصلة أو شرطة مائلة'));
      return;
    }
    if (value.some((item) => item.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      setHint(ui('هذا التخصص مضاف بالفعل'));
      return;
    }
    onChange([...value, next]);
    setDraft('');
    setHint(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          value={draft}
          placeholder={ui('مثال: تدريب شخصي')}
          onChange={(event) => {
            setDraft(event.target.value);
            if (hint) setHint(null);
          }}
          onKeyDown={(event) => {
            // Enter adds the chip; without preventDefault it would submit the whole dialog.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <Button type="button" variant="outline" permissionAction={null} onClick={add}>
          <Plus className="size-4" />
          {ui('إضافة')}
        </Button>
      </div>

      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm shadow-sm"
            >
              <span>{item}</span>
              <button
                type="button"
                aria-label={`${ui('إزالة')} ${item}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onChange(value.filter((_, position) => position !== index))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {ui('لا توجد تخصصات بعد — اكتب التخصص واضغط إضافة.')}
        </p>
      )}

      {hint ? <p className="text-xs text-warning">{hint}</p> : null}
      {error && !hint ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * Repeatable weekday/from/to rows for أيام التواجد, saved through the availability endpoint.
 * The field array itself lives in the page so a single `useFieldArray` owns `slots` — the
 * availability GET replaces the whole set from there once it lands.
 */
function AvailabilityEditor({
  control,
  errors,
  fields,
  onAppend,
  onRemove,
}: {
  control: Control<TrainerFormValues>;
  errors: FieldErrors<TrainerFormValues>;
  fields: { id: string }[];
  onAppend: () => void;
  onRemove: (index: number) => void;
}) {
  const { ui } = useLocale();
  const weekdayLabel = useWeekdayLabel();

  return (
    <div className="space-y-3">
      {fields.length ? (
        fields.map((field, index) => {
          const rowErrors = errors.slots?.[index];
          return (
            <div key={field.id} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">{ui('اليوم')}</Label>
                  <Controller
                    control={control}
                    name={`slots.${index}.weekday`}
                    render={({ field: weekdayField }) => (
                      <Select
                        value={String(weekdayField.value)}
                        onValueChange={(next) => weekdayField.onChange(Number(next))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((weekday) => (
                            <SelectItem key={weekday} value={String(weekday)}>
                              {weekdayLabel(weekday)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{ui('من')}</Label>
                  <Controller
                    control={control}
                    name={`slots.${index}.startTime`}
                    render={({ field: startField }) => (
                      <Time12Input
                        value={startField.value}
                        onValueChange={startField.onChange}
                        aria-label={ui('وقت البداية')}
                      />
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{ui('إلى')}</Label>
                  <Controller
                    control={control}
                    name={`slots.${index}.endTime`}
                    render={({ field: endField }) => (
                      <Time12Input
                        value={endField.value}
                        onValueChange={endField.onChange}
                        aria-label={ui('وقت النهاية')}
                      />
                    )}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    permissionAction={null}
                    aria-label={ui('حذف اليوم')}
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {rowErrors?.startTime?.message || rowErrors?.endTime?.message ? (
                <p className="mt-2 text-xs text-destructive">
                  {rowErrors?.endTime?.message ?? rowErrors?.startTime?.message}
                </p>
              ) : null}
            </div>
          );
        })
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          {ui('لم تُحدد أيام تواجد — الأعضاء لن يروا مواعيد لهذا المدرب.')}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        permissionAction={null}
        onClick={onAppend}
      >
        <Plus className="size-4" />
        {ui('إضافة يوم تواجد')}
      </Button>
    </div>
  );
}

/**
 * Per-trainer ratings, reusing the very same panel the club trainer profile renders in its
 * التقييمات tab — one component, so stars, distribution and member comments never drift.
 */
function TrainerRatingsDialog({
  trainer,
  onClose,
}: {
  trainer: TrainerAdminRow | null;
  onClose: () => void;
}) {
  const { ui } = useLocale();
  const trainerId = trainer?.id ?? null;
  const ratingsQuery = useQuery({
    queryKey: [TRAINERS_RESOURCE, trainerId, 'ratings'],
    queryFn: async ({ signal }) =>
      (await api.get<TrainerWorkspaceRating[]>(`/${TRAINERS_RESOURCE}/${trainerId}/ratings`, { signal })).data,
    enabled: trainerId != null,
    retry: false,
  });
  const rows = useMemo(
    () => (Array.isArray(ratingsQuery.data) ? ratingsQuery.data : []),
    [ratingsQuery.data],
  );

  return (
    <Dialog open={trainer != null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent size="form" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {ui('تقييمات المدرب')} — {trainer?.name}
          </DialogTitle>
        </DialogHeader>
        {ratingsQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : ratingsQuery.isError ? (
          <ErrorState onRetry={() => void ratingsQuery.refetch()} />
        ) : (
          <TrainerRatingsPanel
            ratings={rows}
            ratingAvg={averageRating(rows)}
            ratingCount={rows.length}
            distribution={buildRatingDistribution(rows)}
          />
        )}
        <DialogFooter>
          <Button variant="outline" permissionAction={null} onClick={onClose}>
            {ui('إغلاق')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Trainers shown in the mobile app.
 *
 * This page used to CRUD `am_trainers` via /api/app/trainers, but nothing ever read that
 * table: the app loads trainers from `club_trainers` through GET /api/member/trainers, so
 * every trainer entered here was invisible to members. It now manages `club_trainers` via
 * /api/club-trainers (the same records as صفحة مدربي النادي) and gates actions on the
 * permissions that controller enforces. The `am_trainers` table and its /app/trainers routes
 * still exist; the UI just no longer writes to them.
 *
 * The form is a wide DIALOG rather than a side sheet: the availability editor needs a
 * weekday + from + to row on one line (the app's Sheet is capped at `sm:max-w-md`, which
 * would wrap every row into three), and a centred modal keeps the four titled sections and
 * the photo preview side by side instead of in one long narrow scroll.
 */
export function AppTrainersPage() {
  const { ui } = useLocale();
  const { can } = usePermission();

  const canTrainer = (action: string) =>
    can(`${TRAINER_CLUB_RESOURCE}:${action}`) || can(`${TRAINER_APP_RESOURCE}:${action}`);
  /** Point each Button at whichever family actually grants it, so its own gate agrees with ours. */
  const trainerResource = (action: string) =>
    can(`${TRAINER_CLUB_RESOURCE}:${action}`) ? TRAINER_CLUB_RESOURCE : TRAINER_APP_RESOURCE;
  const canCreate = canTrainer('create');
  const canUpdate = canTrainer('update');
  const canDelete = canTrainer('delete');

  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<TrainerAdminRow>(TRAINERS_RESOURCE, params);
  const rows = data?.data ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [ratingsTrainer, setRatingsTrainer] = useState<TrainerAdminRow | null>(null);
  /** Serialized slots as loaded from the API — the yardstick for "did the owner touch them?". */
  const [baselineSlots, setBaselineSlots] = useState<string | null>(null);
  const [slotsLoadedFor, setSlotsLoadedFor] = useState<number | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TrainerFormValues>({ resolver: zodResolver(trainerSchema), defaultValues: EMPTY_TRAINER });
  const { fields: slotFields, append: appendSlot, remove: removeSlot, replace } = useFieldArray({ control, name: 'slots' });

  const imageUrl = watch('imageUrl');
  const specializations = watch('specializations');
  const isActive = watch('isActive');

  const availabilityQuery = useQuery({
    queryKey: [TRAINERS_RESOURCE, editId, 'availability'],
    queryFn: async ({ signal }) => {
      const { data: payload } = await api.get<TrainerAvailabilitySlot[] | { slots: TrainerAvailabilitySlot[] }>(
        `/${TRAINERS_RESOURCE}/${editId}/availability`,
        { signal },
      );
      // The endpoint returns a bare array; tolerate the `{ slots }` envelope too.
      return Array.isArray(payload) ? payload : (payload?.slots ?? []);
    },
    enabled: dialogOpen && editId != null,
    retry: false,
  });

  useEffect(() => {
    if (!dialogOpen || editId == null || slotsLoadedFor === editId || !availabilityQuery.data) return;
    const loaded = availabilityQuery.data.map((slot) => ({
      weekday: Number(slot.weekday) || 0,
      startTime: toHourMinute(slot.startTime),
      endTime: toHourMinute(slot.endTime),
      isActive: slot.isActive !== false,
    }));
    replace(loaded);
    setBaselineSlots(JSON.stringify(loaded));
    setSlotsLoadedFor(editId);
  }, [availabilityQuery.data, dialogOpen, editId, replace, slotsLoadedFor]);

  const saveMutation = useMutationWithToast(
    async (values: TrainerFormValues) => {
      const body = {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        specializations: values.specializations,
        experience: values.experience || null,
        bio: values.bio || null,
        imageUrl: values.imageUrl || null,
        isActive: values.isActive,
      };
      let trainerId = editId;
      if (trainerId != null) {
        await api.put(`/${TRAINERS_RESOURCE}/${trainerId}`, body);
      } else {
        // Availability hangs off the trainer id, so the record has to exist first.
        const created = await api.post<{ id: number }>(`/${TRAINERS_RESOURCE}`, body);
        trainerId = created.data?.id ?? null;
      }

      const nextSlots = JSON.stringify(values.slots);
      // Never PUT an empty set we never actually loaded — a failed GET must not wipe the
      // trainer's existing days just because the owner opened and saved the dialog.
      const shouldSaveAvailability =
        trainerId != null
        && (baselineSlots == null ? values.slots.length > 0 : nextSlots !== baselineSlots);
      if (shouldSaveAvailability) {
        try {
          await api.put(`/${TRAINERS_RESOURCE}/${trainerId}/availability`, { slots: values.slots });
        } catch (error) {
          // The trainer itself is already saved; report the partial failure instead of
          // rejecting, which would invite a resubmit and duplicate the trainer.
          toast.error(`${ui('تم حفظ بيانات المدرب لكن تعذر حفظ أيام التواجد')} — ${apiError(error)}`);
          return;
        }
      }
      toast.success(editId != null ? ui('تم تحديث المدرب') : ui('تم إضافة المدرب'));
    },
    {
      invalidate: [TRAINERS_RESOURCE],
      onSuccess: () => {
        setDialogOpen(false);
        setEditId(null);
        setBaselineSlots(null);
        setSlotsLoadedFor(null);
        reset(EMPTY_TRAINER);
      },
    },
  );

  const openCreate = () => {
    setEditId(null);
    setBaselineSlots(null);
    setSlotsLoadedFor(null);
    reset(EMPTY_TRAINER);
    setDialogOpen(true);
  };

  const openEdit = (row: TrainerAdminRow) => {
    setEditId(row.id);
    setBaselineSlots(null);
    setSlotsLoadedFor(null);
    reset({
      name: row.name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      experience: row.experience ?? '',
      specializations: rowSpecializations(row),
      bio: row.bio ?? '',
      imageUrl: row.imageUrl ?? null,
      isActive: row.isActive,
      slots: [],
    });
    setDialogOpen(true);
  };

  const askDelete = (row: TrainerAdminRow) => {
    void (async () => {
      const ok = await confirm({
        title: `${ui('حذف المدرب')} — ${row.name}`,
        description: ui('لن يظهر هذا المدرب في التطبيق بعد الحذف.'),
        variant: 'destructive',
        confirmLabel: ui('حذف'),
      });
      if (!ok || !canDelete) return;
      try {
        await api.delete(`/${TRAINERS_RESOURCE}/${row.id}`);
        toast.success(ui('تم حذف المدرب'));
        void refetch();
      } catch (error) {
        toast.error(apiError(error));
      }
    })();
  };

  const columns = useMemo<ColumnDef<TrainerAdminRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<TrainerAdminRow>,
      {
        id: 'photo',
        header: ui('الصورة'),
        cell: ({ row }) => {
          const url = uploadUrl(row.original.imageUrl);
          return url ? (
            <img src={url} alt="" className="size-10 rounded-full border object-cover" />
          ) : (
            <span className="grid size-10 place-items-center rounded-full border bg-muted text-muted-foreground">
              <UserRound className="size-5" />
            </span>
          );
        },
      },
      {
        accessorKey: 'name',
        header: ui('المدرب'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.phone ? (
              <p className="nums text-xs text-muted-foreground" dir="ltr">
                {formatDigits(row.original.phone)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'specializations',
        header: ui('التخصصات'),
        cell: ({ row }) => {
          const items = rowSpecializations(row.original);
          if (!items.length) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex max-w-[18rem] flex-wrap gap-1">
              {items.slice(0, 3).map((item) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))}
              {items.length > 3 ? (
                <Badge variant="outline">+{toArabicDigits(items.length - 3)}</Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'rating',
        header: ui('التقييم'),
        cell: ({ row }) => {
          const value = Number(row.original.ratingAvg ?? 0);
          return (
            <div className="flex items-center gap-2">
              <RatingStars value={value} />
              <span className="nums text-sm font-semibold">{toArabicDigits(value)}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'isActive',
        header: ui('الحالة'),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'secondary'}>
            {row.original.isActive ? ui('نشط') : ui('موقوف')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: ui('إجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              permissionAction={null}
              aria-label={ui('التقييمات')}
              title={ui('التقييمات')}
              onClick={() => setRatingsTrainer(row.original)}
            >
              <Star className="size-4 text-primary" />
            </Button>
            {canUpdate ? (
              <Button
                variant="ghost"
                size="icon"
                permissionResource={trainerResource('update')}
                permissionAction="update"
                aria-label={ui('تعديل')}
                onClick={() => openEdit(row.original)}
              >
                <Pencil className="size-4" />
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="icon"
                permissionResource={trainerResource('delete')}
                permissionAction="delete"
                aria-label={ui('حذف')}
                onClick={() => askDelete(row.original)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canDelete, canUpdate, params.page, params.pageSize, ui],
  );

  const onSubmit = (values: TrainerFormValues) => {
    if (editId != null ? !canUpdate : !canCreate) return;
    saveMutation.mutate(values);
  };

  return (
    <AppManagementShell
      title={ui('إدارة المدربين')}
      description={ui('ملف كل مدرب كما يراه العضو في التطبيق — الصورة والتخصصات والنبذة وأيام التواجد والتقييمات.')}
      actions={
        canCreate ? (
          <Button permissionResource={trainerResource('create')} permissionAction="create" variant="brand" onClick={openCreate}>
            <Plus className="size-4" />
            {ui('إضافة مدرب')}
          </Button>
        ) : undefined
      }
    >
      <FilterBar
        searchPlaceholder={ui('ابحث باسم المدرب…')}
        fields={[
          {
            key: 'isActive',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'true', label: ui('نشط') },
              { value: 'false', label: ui('موقوف') },
            ],
          },
        ]}
      />
      <DataTable
        exportSource={{ resource: TRAINERS_RESOURCE, params }}
        columns={columns}
        data={rows}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ui('لا يوجد مدربون بعد')}
        emptyDescription={ui('أضف أول مدرب ليظهر في تطبيق الأعضاء بصورته وتخصصاته.')}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditId(null);
        }}
      >
        <DialogContent size="form" className="max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل بيانات مدرب') : ui('إضافة مدرب جديد')}</DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <TrainerFormSection
              icon={UserRound}
              title={ui('الملف الشخصي')}
              description={ui('الاسم والصورة وبيانات التواصل التي تظهر في بطاقة المدرب.')}
            >
              <div className="space-y-4">
                <TrainerPhotoField value={imageUrl} onChange={(next) => setValue('imageUrl', next)} />
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldWrapper label={ui('الاسم')} error={errors.name?.message} required>
                    <Input {...register('name')} placeholder={ui('مثال: كابتن أحمد')} />
                  </FieldWrapper>
                  <FieldWrapper label={ui('رقم الهاتف')} error={errors.phone?.message}>
                    <Input {...register('phone')} dir="ltr" className="nums" inputMode="tel" />
                  </FieldWrapper>
                  <FieldWrapper label={ui('البريد الإلكتروني')} error={errors.email?.message}>
                    <Input {...register('email')} dir="ltr" inputMode="email" />
                  </FieldWrapper>
                  <FieldWrapper
                    label={ui('الخبرة')}
                    error={errors.experience?.message}
                    hint={ui('نص حر كما يقرأه العضو، مثل: ٧ سنوات تدريب لياقة')}
                  >
                    <Input {...register('experience')} placeholder={ui('مثال: ٧ سنوات')} />
                  </FieldWrapper>
                  <div className="md:col-span-2">
                    <FieldWrapper
                      label={ui('نبذة')}
                      error={errors.bio?.message}
                      hint={ui('سطران أو ثلاثة عن أسلوب المدرب وإنجازاته.')}
                    >
                      <Textarea {...register('bio')} rows={3} />
                    </FieldWrapper>
                  </div>
                </div>
              </div>
            </TrainerFormSection>

            <TrainerFormSection
              icon={Sparkles}
              title={ui('التخصصات')}
              description={ui('كل تخصص يُضاف بمفرده ويظهر كوسم في التطبيق.')}
            >
              <SpecializationsField
                value={specializations}
                onChange={(next) => setValue('specializations', next, { shouldValidate: true })}
                error={errors.specializations?.message}
              />
            </TrainerFormSection>

            <TrainerFormSection
              icon={CalendarClock}
              title={ui('أيام التواجد')}
              description={ui('مواعيد تواجد المدرب أسبوعيًا — لا يجوز تعارض موعدين في نفس اليوم.')}
            >
              {availabilityQuery.isFetching && editId != null && slotsLoadedFor !== editId ? (
                <Skeleton className="h-20 w-full rounded-xl" />
              ) : (
                <AvailabilityEditor
                  control={control}
                  errors={errors}
                  fields={slotFields}
                  onAppend={() => appendSlot({ weekday: 0, startTime: '17:00', endTime: '20:00', isActive: true })}
                  onRemove={removeSlot}
                />
              )}
            </TrainerFormSection>

            <TrainerFormSection
              icon={Smartphone}
              title={ui('الظهور في التطبيق')}
              description={ui('أوقف المدرب مؤقتًا بدل حذفه عند انقطاعه.')}
            >
              <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-3">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="trainer-active">{ui('نشط')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {isActive ? ui('يظهر الآن لأعضاء التطبيق') : ui('مخفي عن الأعضاء حتى إعادة التفعيل')}
                  </p>
                </div>
                <Switch
                  id="trainer-active"
                  checked={isActive}
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                />
              </div>
            </TrainerFormSection>
          </form>

          <DialogFooter>
            <Button variant="outline" permissionAction={null} onClick={() => setDialogOpen(false)}>
              {ui('إلغاء')}
            </Button>
            {(editId != null ? canUpdate : canCreate) ? (
              <Button
                permissionResource={trainerResource(editId != null ? 'update' : 'create')}
                permissionAction={editId != null ? 'update' : 'create'}
                variant="brand"
                disabled={saveMutation.isPending}
                onClick={handleSubmit(onSubmit)}
              >
                {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {ui('حفظ')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TrainerRatingsDialog trainer={ratingsTrainer} onClose={() => setRatingsTrainer(null)} />
    </AppManagementShell>
  );
}

export function ExerciseCategoriesPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; name: string; description: string | null; isActive: boolean }>
      title={ui('إدارة تصنيفات التمارين')}
      description={ui('تصنيفات مكتبة التمارين')}
      resource="app/exercise-categories"
      permissionResource="app-management.exercise-categories"
      emptyForm={{ name: '', description: '', isActive: true }}
      columns={[
        { key: 'name', header: ui('التصنيف') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={buildExerciseCategoryPayload}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('الاسم')}</Label><Input value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('الوصف')}</Label><Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      )}
    />
  );
}

export function AppExercisesPage() {
  const { ui } = useLocale();
  const { data: categoriesRes } = useQuery({
    queryKey: ['app', 'exercise-categories'],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>('/app/exercise-categories', {
        params: { page: 1, pageSize: 200 },
      });
      return data.data ?? [];
    },
  });
  const categories = categoriesRes ?? [];

  return (
    <AppCrudPage<{ id: number; name: string; categoryName: string; difficulty: string | null; isActive: boolean }>
      title={ui('إدارة التمارين')}
      description={ui('تمارين مكتبة اللياقة في التطبيق')}
      resource="app/exercises"
      permissionResource="app-management.exercises"
      emptyForm={{ name: '', categoryId: '', description: '', instructions: '', duration: '', difficulty: 'easy', isActive: true }}
      columns={[
        { key: 'name', header: ui('التمرين') },
        { key: 'categoryName', header: ui('التصنيف') },
        { key: 'difficulty', header: ui('الصعوبة') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={buildExercisePayload}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('الاسم')}</Label><Input value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-1">
            <Label>{ui('التصنيف')}</Label>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={String(form.categoryId ?? '')}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">{ui('— اختر التصنيف —')}</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1"><Label>{ui('الوصف')}</Label><Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('التعليمات')}</Label><Textarea value={String(form.instructions ?? '')} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>{ui('المدة (د)')}</Label><Input className="nums" type="number" value={String(form.duration ?? '')} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            <div className="grid gap-1">
              <Label>{ui('الصعوبة')}</Label>
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={String(form.difficulty ?? 'easy')} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">{ui('سهل')}</option>
                <option value="medium">{ui('متوسط')}</option>
                <option value="hard">{ui('صعب')}</option>
              </select>
            </div>
          </div>
        </div>
      )}
    />
  );
}

export function AppNewsPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; title: string; publishDate: string | null; isPublished: boolean }>
      title={ui('إدارة الأخبار')}
      description={ui('أخبار النادي في التطبيق')}
      resource="app/news"
      permissionResource="app-management.news"
      emptyForm={{ title: '', content: '', publishDate: '', isPublished: false, imageUrl: '' }}
      columns={[
        { key: 'title', header: ui('العنوان') },
        { key: 'publishDate', header: ui('تاريخ النشر') },
        { key: 'isPublished', header: ui('منشور'), render: (r) => (r.isPublished ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={buildNewsPayload}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('العنوان')}</Label><Input value={String(form.title ?? '')} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('المحتوى')}</Label><Textarea rows={5} value={String(form.content ?? '')} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('تاريخ النشر')}</Label><Input className="nums" type="date" value={String(form.publishDate ?? '')} onChange={(e) => setForm({ ...form, publishDate: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />{ui('منشور')}</label>
        </div>
      )}
    />
  );
}

export function AppAdsPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; title: string; linkUrl: string | null; isActive: boolean }>
      title={ui('إدارة الإعلانات')}
      description={ui('إعلانات البنر في التطبيق')}
      resource="app/ads"
      permissionResource="app-management.ads"
      emptyForm={{ title: '', description: '', linkUrl: '', startDate: '', endDate: '', isActive: false, imageUrl: '' }}
      columns={[
        { key: 'title', header: ui('العنوان') },
        { key: 'linkUrl', header: ui('الرابط') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={buildAdPayload}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('العنوان')}</Label><Input value={String(form.title ?? '')} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('الوصف')}</Label><Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('رابط')}</Label><Input value={String(form.linkUrl ?? '')} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>{ui('من')}</Label><Input className="nums" type="date" value={String(form.startDate ?? '')} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="grid gap-1"><Label>{ui('إلى')}</Label><Input className="nums" type="date" value={String(form.endDate ?? '')} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
        </div>
      )}
    />
  );
}
