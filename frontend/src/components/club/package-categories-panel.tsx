import { ArrowDown, ArrowUp, EyeOff, ImageOff, LayoutGrid, Lock, Pencil, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UploadField } from '@/components/employees/upload-fields';
import { uploadUrl } from '@/components/employees/use-uploads';
import { CatalogEmpty, CatalogSection } from '@/components/club/package-catalog-layout';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubPackageCategoryItem } from '@/types/club';

/** Sections whose artwork ships inside the app; used until an admin uploads a replacement. */
const BUNDLED_ICON_KEYS = new Set([
  'men_gym', 'women_gym', 'combat', 'offers', 'private', 'classes', 'physiotherapy', 'nutrition', 'kids',
]);

/** Uploaded artwork, else the app's bundled artwork for the original sections, else nothing. */
export function packageCategoryIconSrc(category: Pick<ClubPackageCategoryItem, 'key' | 'icon'>): string | null {
  return uploadUrl(category.icon) ?? (BUNDLED_ICON_KEYS.has(category.key) ? `/package-sections/${category.key}.png` : null);
}

/**
 * The tile as the member app draws it: a dark rounded plate with the artwork contained at
 * 88% of the plate (never cropped) and a two-line label beneath. Same proportions as the
 * app's home grid, so what the admin sees here is what members get.
 */
export function PackageCategoryTile({
  name,
  iconSrc,
  muted,
  className,
}: {
  name: string;
  iconSrc: string | null;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex w-24 shrink-0 flex-col items-center gap-2', muted && 'opacity-45', className)}>
      <div className="grid aspect-square w-full place-items-center rounded-[20px] border border-amber-200/15 bg-gradient-to-b from-zinc-800 to-zinc-950 shadow-inner">
        {iconSrc ? (
          <img src={iconSrc} alt="" className="size-[88%] object-contain" loading="lazy" />
        ) : (
          <ImageOff className="size-7 text-zinc-500" />
        )}
      </div>
      <span className="line-clamp-2 min-h-[2.2em] text-center text-[11.5px] font-bold leading-tight">{name || '—'}</span>
    </div>
  );
}

type CategoryForm = { name: string; nameEn: string; icon: string | null; isActive: boolean };
const emptyForm = (): CategoryForm => ({ name: '', nameEn: '', icon: null, isActive: true });

export function PackageCategoriesPanel({
  categories,
  refetch,
  canCreate,
  canUpdate,
  canDelete,
  onReady,
}: {
  categories: ClubPackageCategoryItem[];
  refetch: () => unknown;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onReady?: (api: { openCreate: () => void; canCreate: boolean }) => void;
}) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubPackageCategoryItem | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const patch = (next: Partial<CategoryForm>) => setForm((current) => ({ ...current, ...next }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  useEffect(() => {
    onReady?.({ openCreate, canCreate });
    // The parent only needs a fresh API when the permission changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);
  const openEdit = (category: ClubPackageCategoryItem) => {
    setEditing(category);
    setForm({ name: category.name, nameEn: category.nameEn ?? '', icon: category.icon ?? null, isActive: category.isActive });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ui('اكتب اسم الفئة'));
      return;
    }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), nameEn: form.nameEn.trim(), icon: form.icon, isActive: form.isActive };
      if (editing) await api.put(`/club-package-categories/${editing.id}`, body);
      else await api.post('/club-package-categories', body);
      toast.success(ui('تم حفظ الفئة'));
      setOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (category: ClubPackageCategoryItem, isActive: boolean) => {
    setBusyId(category.id);
    try {
      await api.put(`/club-package-categories/${category.id}`, { isActive });
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map((category) => category.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusyId(categories[index].id);
    try {
      await api.put('/club-package-categories/reorder', { ids });
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (category: ClubPackageCategoryItem) => {
    const count = category.packageCount ?? 0;
    const title = count
      ? `${ui('حذف الفئة')} «${category.name}»؟ ${ui('ستُزال من')} ${toArabicDigits(count)} ${ui('باقة.')}`
      : `${ui('حذف الفئة')} «${category.name}»؟`;
    if (!(await confirm({ title, variant: 'destructive' }))) return;
    try {
      await api.delete(`/club-package-categories/${category.id}`);
      toast.success(ui('تم حذف الفئة'));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const visible = categories.filter((category) => category.isActive);
  const formIconSrc = packageCategoryIconSrc({ key: editing?.key ?? '', icon: form.icon });

  return (
    <>
      <CatalogSection
        title={ui('الفئات')}
        description={ui('مربعات الشاشة الرئيسية في تطبيق الأعضاء. أضف فئة باسم وصورة وستظهر في التطبيق فورًا، ثم اخترها لأي باقة من نموذج الباقة.')}
        icon={LayoutGrid}
        tone="sky"
        count={categories.length}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-2">
            {categories.map((category, index) => (
              <div
                key={category.id}
                className={cn(
                  'flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-3 transition-colors sm:flex-nowrap',
                  !category.isActive && 'bg-muted/30',
                )}
              >
                <PackageCategoryTile
                  name={category.name}
                  iconSrc={packageCategoryIconSrc(category)}
                  muted={!category.isActive}
                  className="w-16"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words font-semibold">{category.name}</p>
                    {category.nameEn ? <span className="text-xs text-muted-foreground" dir="ltr">{category.nameEn}</span> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="nums">{toArabicDigits(category.packageCount ?? 0)} {ui('باقة')}</span>
                    {category.isSystem ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300"><Lock className="size-3" /> {ui('أساسية')}</span> : null}
                    {!category.isActive ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><EyeOff className="size-3" /> {ui('مخفية من التطبيق')}</span> : null}
                    {!packageCategoryIconSrc(category) ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">{ui('بدون صورة')}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canUpdate ? (
                    <>
                      <Button variant="ghost" size="icon" aria-label={ui('تحريك لأعلى')} disabled={index === 0 || busyId !== null} onClick={() => void move(index, -1)}><ArrowUp className="size-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={ui('تحريك لأسفل')} disabled={index === categories.length - 1 || busyId !== null} onClick={() => void move(index, 1)}><ArrowDown className="size-4" /></Button>
                      <Switch
                        aria-label={ui('إظهار في التطبيق')}
                        checked={category.isActive}
                        disabled={busyId !== null}
                        onCheckedChange={(checked) => void toggleActive(category, checked)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => openEdit(category)}><Pencil className="size-4" /> {ui('تعديل')}</Button>
                    </>
                  ) : null}
                  {canDelete && !category.isSystem ? (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(category)}><Trash2 className="size-4" /> {ui('حذف')}</Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!categories.length ? <CatalogEmpty label={ui('لا توجد فئات بعد.')} /> : null}
          </div>

          <aside className="h-fit space-y-3 rounded-3xl border bg-zinc-950 p-4 text-zinc-100 lg:sticky lg:top-4">
            <p className="text-sm font-semibold">{ui('معاينة التطبيق')}</p>
            <p className="text-xs text-zinc-400">{ui('الفئات الظاهرة بنفس ترتيبها وشكلها على الشاشة الرئيسية.')}</p>
            <div className="grid grid-cols-3 justify-items-center gap-x-3 gap-y-4">
              {visible.map((category) => (
                <PackageCategoryTile key={category.id} name={category.name} iconSrc={packageCategoryIconSrc(category)} className="w-full" />
              ))}
            </div>
            {!visible.length ? <p className="py-6 text-center text-xs text-zinc-500">{ui('لا توجد فئات ظاهرة.')}</p> : null}
          </aside>
        </div>
      </CatalogSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? ui('تعديل فئة') : ui('إضافة فئة')}</DialogTitle></DialogHeader>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{ui('اسم الفئة')}<span className="text-destructive"> *</span></Label>
                <Input value={form.name} maxLength={100} placeholder={ui('مثال: سباحة')} onChange={(event) => patch({ name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{ui('الاسم بالإنجليزية (اختياري)')}</Label>
                <Input dir="ltr" value={form.nameEn} maxLength={100} placeholder="Swimming" onChange={(event) => patch({ nameEn: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{ui('صورة الأيقونة')}</Label>
                <UploadField category="club-package-category" accept="image/png,image/jpeg,image/webp" preview={false} value={form.icon} onChange={(icon) => patch({ icon })} />
                <p className="text-xs text-muted-foreground">{ui('يُفضّل PNG بخلفية شفافة ومقاس مربع 320×320 بكسل أو أكبر. تُعرض الصورة كاملة داخل المربع بدون قص، بنفس مقاس باقي الأيقونات.')}</p>
                {form.icon ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => patch({ icon: null })}><Trash2 className="size-4" /> {ui('إزالة الصورة')}</Button> : null}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3">
                <div><Label>{ui('إظهار في التطبيق')}</Label><p className="mt-1 text-xs text-muted-foreground">{ui('الفئة المخفية تبقى محفوظة على باقاتها ولا تظهر للأعضاء.')}</p></div>
                <Switch checked={form.isActive} onCheckedChange={(isActive) => patch({ isActive })} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-zinc-950 p-3 text-zinc-100">
              <span className="text-xs text-zinc-400">{ui('معاينة')}</span>
              <PackageCategoryTile name={form.name.trim()} iconSrc={formIconSrc} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button>
            <Button variant="brand" permissionAction={editing ? 'update' : 'create'} disabled={saving} onClick={() => void save()}><Save className="size-4" /> {ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
