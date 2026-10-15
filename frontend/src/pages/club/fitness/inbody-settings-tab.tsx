import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Loader2, PackagePlus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import type { InbodyBranchSettings, InbodyOffer } from '@/types/fitness';
import { SELECT_CLS } from './shared';
import { useLocale } from '@/store/locale';

const EMPTY_PACKAGE = { name: '', measurementCount: '', price: '', validityDays: '', isActive: true };

export function InbodySettingsTab() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const { can } = usePermission();
  const canCreate = can('club.fitness.inbody_invoices:create');
  const canUpdate = can('club.fitness.inbody_invoices:update');
  const canDelete = can('club.fitness.inbody_invoices:delete');
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [singlePrice, setSinglePrice] = useState('');
  const [allowStandalone, setAllowStandalone] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<InbodyOffer | null>(null);
  const [packageForm, setPackageForm] = useState(EMPTY_PACKAGE);
  const [savingPackage, setSavingPackage] = useState(false);

  useEffect(() => {
    if (!branchId && branches?.[0]) setBranchId(String(branches[0].id));
  }, [branches, branchId]);

  const settingsQuery = useQuery({
    queryKey: ['club-inbody-settings', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const { data } = await api.get<InbodyBranchSettings>(`/club-inbody-settings/${branchId}`);
      return data;
    },
  });

  const settings = settingsQuery.data;
  const singleOffer = settings?.offers.find((offer) => offer.measurementCount === 1 && offer.isActive !== false);
  const packages = settings?.offers.filter((offer) => offer.measurementCount > 1) ?? [];

  useEffect(() => {
    setAllowStandalone(settings?.allowWithoutActiveMembership ?? false);
    setSinglePrice(singleOffer ? String(singleOffer.price) : '');
  }, [settings, singleOffer?.id, singleOffer?.price]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['club-inbody-settings', branchId] });
    await queryClient.invalidateQueries({ queryKey: ['club-inbody-services'] });
  };

  const savePolicy = async () => {
    if (!branchId || !canUpdate) return;
    setSavingPolicy(true);
    try {
      await api.put(`/club-inbody-settings/${branchId}`, {
        allowWithoutActiveMembership: allowStandalone,
      });
      toast.success(ui('تم حفظ سياسة بيع InBody للفرع'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSavingPolicy(false);
    }
  };

  const saveSinglePrice = async () => {
    const price = Number(singlePrice);
    if (!branchId || !Number.isFinite(price) || price < 0) {
      toast.error(ui('أدخل سعرًا صحيحًا للقياس الواحد'));
      return;
    }
    setSavingPrice(true);
    try {
      const payload = {
        name: ui('قياس InBody واحد'),
        measurementCount: 1,
        price,
        validityDays: null,
        branchId: Number(branchId),
        isActive: true,
      };
      if (singleOffer) await api.put(`/club-inbody-services/${singleOffer.id}`, payload);
      else await api.post('/club-inbody-services', payload);
      toast.success(ui('تم حفظ سعر القياس الواحد'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSavingPrice(false);
    }
  };

  const openPackageCreate = () => {
    setEditingOffer(null);
    setPackageForm(EMPTY_PACKAGE);
    setPackageOpen(true);
  };

  const openPackageEdit = (offer: InbodyOffer) => {
    setEditingOffer(offer);
    setPackageForm({
      name: offer.name,
      measurementCount: String(offer.measurementCount),
      price: String(offer.price),
      validityDays: offer.validityDays != null ? String(offer.validityDays) : '',
      isActive: offer.isActive !== false,
    });
    setPackageOpen(true);
  };

  const savePackage = async () => {
    const measurementCount = Number(packageForm.measurementCount);
    const price = Number(packageForm.price);
    const validityDays = packageForm.validityDays ? Number(packageForm.validityDays) : null;
    if (!branchId || !packageForm.name.trim() || !Number.isInteger(measurementCount) || measurementCount < 2 || !Number.isFinite(price) || price < 0 || (validityDays != null && (!Number.isInteger(validityDays) || validityDays <= 0))) {
      toast.error(ui('اسم الباقة وعدد قياسات أكبر من واحد وسعر صحيح مطلوبة'));
      return;
    }
    setSavingPackage(true);
    try {
      const payload = {
        name: packageForm.name.trim(),
        measurementCount,
        price,
        validityDays,
        branchId: Number(branchId),
        isActive: packageForm.isActive,
      };
      if (editingOffer) await api.put(`/club-inbody-services/${editingOffer.id}`, payload);
      else await api.post('/club-inbody-services', payload);
      toast.success(editingOffer ? ui('تم تحديث الباقة') : ui('تمت إضافة الباقة'));
      setPackageOpen(false);
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSavingPackage(false);
    }
  };

  const removePackage = async (offer: InbodyOffer) => {
    const ok = await confirm({
      title: `${ui('إيقاف ')}${offer.name}${ui('؟')}`,
      description: ui('لن تظهر الباقة في المبيعات الجديدة، ولن تتأثر أرصدة الأعضاء المشتراة سابقًا.'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/club-inbody-services/${offer.id}`);
      toast.success(ui('تم إيقاف الباقة'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  return (
    <div className="space-y-7">
      <div className="max-w-sm space-y-2">
        <Label>{ui('الفرع')}</Label>
        <select className={SELECT_CLS} value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? '—'}</option>)}
        </select>
      </div>

      {settingsQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {ui('جارٍ تحميل إعدادات الفرع…')}
        </div>
      ) : settingsQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          تعذر تحميل إعدادات InBody. <Button variant="link" className="h-auto px-1 text-destructive" onClick={() => void settingsQuery.refetch()}>{ui('إعادة المحاولة')}</Button>
        </div>
      ) : branchId ? (
        <>
          <section className="grid gap-5 border-b pb-7 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-end">
            <div>
              <h3 className="font-semibold">{ui('سعر القياس الواحد')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{ui('يُستخدم تلقائيًا عندما لا يملك العضو رصيدًا ويختار دفع قياس واحد.')}</p>
            </div>
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-2">
                <Label htmlFor="inbody-single-price">{ui('السعر')}</Label>
                <Input id="inbody-single-price" type="number" min="0" className="nums" value={singlePrice} onChange={(event) => setSinglePrice(event.target.value)} placeholder="0.00" />
              </div>
              {(singleOffer ? canUpdate : canCreate) && (
                <Button variant="brand" onClick={() => void saveSinglePrice()} disabled={savingPrice}>
                  {savingPrice ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {ui('حفظ السعر')}
                </Button>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-4 border-b pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h3 className="font-semibold">{ui('البيع بدون اشتراك جيم فعّال')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{ui('عند التفعيل يمكن بيع قياس أو باقة InBody لعضو ليس لديه اشتراك جيم فعّال.')}</p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <Switch checked={allowStandalone} onCheckedChange={setAllowStandalone} disabled={!canUpdate || savingPolicy} aria-label={ui('السماح بالبيع بدون اشتراك جيم فعّال')} />
              {canUpdate && (
                <Button variant="outline" onClick={() => void savePolicy()} disabled={savingPolicy || allowStandalone === settings?.allowWithoutActiveMembership}>
                  {savingPolicy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {ui('حفظ')}
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{ui('باقات القياسات')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{ui('حدد عدد القياسات والسعر ومدة الصلاحية لكل باقة في هذا الفرع.')}</p>
              </div>
              {canCreate && <Button variant="brand" onClick={openPackageCreate}><PackagePlus className="size-4" /> {ui('إضافة باقة')}</Button>}
            </div>

            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[minmax(0,1fr)_100px_110px_120px_88px] gap-3 bg-muted/60 px-4 py-3 text-xs font-medium text-muted-foreground max-md:hidden">
                <span>{ui('اسم الباقة')}</span><span>{ui('القياسات')}</span><span>{ui('السعر')}</span><span>{ui('الصلاحية')}</span><span>{ui('الإجراءات')}</span>
              </div>
              {packages.length ? packages.map((offer) => (
                <div key={offer.id} className="grid gap-3 border-t px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_100px_110px_120px_88px] md:items-center">
                  <div><span className="font-medium">{offer.name}</span>{offer.isActive === false ? <span className="ms-2 text-xs text-muted-foreground">{ui('موقوفة')}</span> : null}</div>
                  <div className="text-sm nums"><span className="me-2 text-xs text-muted-foreground md:hidden">{ui('القياسات:')}</span>{toArabicDigits(offer.measurementCount)}</div>
                  <div className="text-sm nums"><span className="me-2 text-xs text-muted-foreground md:hidden">{ui('السعر:')}</span>{toArabicDigits(offer.price)}</div>
                  <div className="text-sm nums"><span className="me-2 text-xs text-muted-foreground md:hidden">{ui('الصلاحية:')}</span>{offer.validityDays ? `${toArabicDigits(offer.validityDays)}${ui(' يوم')}` : ui('بدون انتهاء')}</div>
                  <div className="flex items-center gap-1">
                    {canUpdate && <Button variant="ghost" size="icon" title={ui('تعديل الباقة')} onClick={() => openPackageEdit(offer)}><Edit3 className="size-4" /></Button>}
                    {canDelete && <Button variant="ghost" size="icon" title={ui('إيقاف الباقة')} className="text-destructive" onClick={() => void removePackage(offer)}><Trash2 className="size-4" /></Button>}
                  </div>
                </div>
              )) : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">{ui('لا توجد باقات قياسات لهذا الفرع.')}</div>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="py-12 text-center text-sm text-muted-foreground">{ui('لا توجد فروع متاحة.')}</div>
      )}

      <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editingOffer ? ui('تعديل باقة InBody') : ui('إضافة باقة InBody')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2"><Label>{ui('اسم الباقة')}</Label><Input value={packageForm.name} onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))} placeholder={ui('مثال: باقة 5 قياسات')} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>{ui('عدد القياسات')}</Label><Input type="number" min="2" className="nums" value={packageForm.measurementCount} onChange={(event) => setPackageForm((current) => ({ ...current, measurementCount: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{ui('السعر الإجمالي')}</Label><Input type="number" min="0" className="nums" value={packageForm.price} onChange={(event) => setPackageForm((current) => ({ ...current, price: event.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>{ui('مدة الصلاحية بالأيام')}<span className="font-normal text-muted-foreground">{ui('(اختياري)')}</span></Label><Input type="number" min="1" className="nums" value={packageForm.validityDays} onChange={(event) => setPackageForm((current) => ({ ...current, validityDays: event.target.value }))} placeholder={ui('اتركها فارغة لعدم تحديد انتهاء')} /></div>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-sm"><span>{ui('الباقة مفعلة')}</span><Switch checked={packageForm.isActive} onCheckedChange={(checked) => setPackageForm((current) => ({ ...current, isActive: checked }))} /></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackageOpen(false)} disabled={savingPackage}>{ui('إلغاء')}</Button>
            <Button variant="brand" permissionAction={editingOffer ? 'update' : 'create'} onClick={() => void savePackage()} disabled={savingPackage}>
              {savingPackage ? <Loader2 className="size-4 animate-spin" /> : null} {ui('حفظ الباقة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
