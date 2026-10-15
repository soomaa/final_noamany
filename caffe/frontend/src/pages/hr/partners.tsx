import type { ColumnDef } from '@tanstack/react-table';
import { Handshake, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { queryClient } from '@/lib/query';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface PartnerPhone {
  id?: number;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

interface PartnerRow {
  id: number;
  partnerCode: string;
  name: string;
  nationalId: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  primaryPhone: string | null;
  phones: PartnerPhone[];
}

interface PartnerForm {
  partnerCode: string;
  name: string;
  nationalId: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
  phones: Array<{ phone: string; label: string; isPrimary: boolean }>;
}

const emptyForm = (): PartnerForm => ({
  partnerCode: '',
  name: '',
  nationalId: '',
  email: '',
  address: '',
  notes: '',
  isActive: true,
  phones: [{ phone: '', label: 'جوال', isPrimary: true }],
});

const phonePattern = /^\+?[0-9]{7,15}$/;
const normalizePhone = (value: string) => value.trim().replace(/[\s()-]/g, '');

export function HrPartnersPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<PartnerRow>('hr/partners', params);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const filters: FilterField[] = [
    { key: 'status', label: ui('الحالة'), type: 'select', options: [
      { value: 'active', label: ui('نشط') },
      { value: 'inactive', label: ui('غير نشط') },
    ] },
  ];

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (partner: PartnerRow) => {
    setEditingId(partner.id);
    setForm({
      partnerCode: partner.partnerCode,
      name: partner.name,
      nationalId: partner.nationalId ?? '',
      email: partner.email ?? '',
      address: partner.address ?? '',
      notes: partner.notes ?? '',
      isActive: partner.isActive,
      phones: partner.phones.length
        ? partner.phones.map((item) => ({ phone: item.phone, label: item.label ?? 'جوال', isPrimary: item.isPrimary }))
        : [{ phone: partner.primaryPhone ?? '', label: 'جوال', isPrimary: true }],
    });
    setOpen(true);
  };

  const addPhone = () => setForm((current) => ({
    ...current,
    phones: [...current.phones, { phone: '', label: 'جوال', isPrimary: false }],
  }));

  const updatePhone = (index: number, patch: Partial<PartnerForm['phones'][number]>) => setForm((current) => ({
    ...current,
    phones: current.phones.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }));

  const markPrimary = (index: number) => setForm((current) => ({
    ...current,
    phones: current.phones.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })),
  }));

  const removePhone = (index: number) => setForm((current) => {
    if (current.phones.length === 1) return current;
    const phones = current.phones.filter((_, itemIndex) => itemIndex !== index);
    if (!phones.some((item) => item.isPrimary)) phones[0] = { ...phones[0], isPrimary: true };
    return { ...current, phones };
  });

  const save = async () => {
    if (!form.name.trim()) return toast.error(ui('اسم الشريك مطلوب'));
    const phones = form.phones
      .map((item) => ({ ...item, phone: normalizePhone(item.phone), label: item.label.trim() || undefined }))
      .filter((item) => item.phone);
    if (!phones.length) return toast.error(ui('أضف رقم هاتف واحدًا على الأقل'));
    if (phones.some((item) => !phonePattern.test(item.phone))) return toast.error(ui('راجع أرقام الهواتف: يجب أن يحتوي الرقم من 7 إلى 15 رقمًا'));
    if (new Set(phones.map((item) => item.phone)).size !== phones.length) return toast.error(ui('لا يمكن تكرار نفس رقم الهاتف'));
    setSaving(true);
    try {
      const payload = {
        partnerCode: form.partnerCode.trim() || undefined,
        name: form.name.trim(),
        nationalId: form.nationalId.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
        isActive: form.isActive,
        phones,
      };
      if (editingId) await api.put(`/hr/partners/${editingId}`, payload);
      else await api.post('/hr/partners', payload);
      toast.success(ui(editingId ? 'تم تحديث بيانات الشريك' : 'تمت إضافة الشريك'));
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hr/partners'] }),
        queryClient.invalidateQueries({ queryKey: ['cafe-partners'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (partner: PartnerRow) => {
    const accepted = await confirm({
      title: ui('إيقاف الشريك؟'),
      description: ui('سيختفي من اختيارات نقطة البيع، مع الاحتفاظ بكل فواتيره وتسوياته السابقة.'),
      confirmLabel: ui('إيقاف'),
      variant: 'destructive',
    });
    if (!accepted) return;
    try {
      await api.delete(`/hr/partners/${partner.id}`);
      toast.success(ui('تم إيقاف الشريك'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hr/partners'] }),
        queryClient.invalidateQueries({ queryKey: ['cafe-partners'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<PartnerRow>[]>(() => [
    {
      id: 'index',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'partnerCode', header: ui('كود الشريك'), cell: ({ getValue }) => <span className="nums font-semibold">{getValue() as string}</span> },
    { accessorKey: 'name', header: ui('اسم الشريك'), cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span> },
    {
      id: 'phones',
      header: ui('أرقام الهاتف'),
      cell: ({ row }) => <div className="space-y-1">{row.original.phones.map((item) => <div key={item.id ?? item.phone} className="flex items-center gap-1 text-xs"><Phone className="size-3 text-muted-foreground" /><span className="nums">{toArabicDigits(item.phone)}</span>{item.isPrimary ? <Star className="size-3 fill-amber-400 text-amber-400" /> : null}</div>)}</div>,
    },
    { accessorKey: 'nationalId', header: ui('رقم الهوية'), cell: ({ getValue }) => getValue() ? <span className="nums">{toArabicDigits(getValue() as string)}</span> : '—' },
    { accessorKey: 'isActive', header: ui('الحالة'), cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'suspended'} /> },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row.original)}><Pencil className="size-4" />{ui('تعديل')}</Button>{row.original.isActive ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void deactivate(row.original)}><Trash2 className="size-4" />{ui('إيقاف')}</Button> : null}</div>,
    },
  ], [params.page, params.pageSize, ui]);

  return <div>
    <PageHeader
      title={ui('الشركاء')}
      description={ui('ملفات الشركاء وأرقام التواصل وربطها بمبيعات وتسويات الكافيه')}
      actions={<Button variant="brand" onClick={openCreate}><Plus className="size-4" />{ui('شريك جديد')}</Button>}
    />
    <FilterBar fields={filters} searchPlaceholder={ui('ابحث باسم الشريك أو الكود أو رقم الهاتف أو الهوية…')} />
    <DataTable
      columns={columns}
      data={data?.data ?? []}
      total={data?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      search={params.search}
      onSearchChange={(search) => setParams({ search, page: 1 })}
      emptyTitle={ui('لا يوجد شركاء')}
      emptyDescription={ui('أضف أول شريك ليظهر في بحث نقطة البيع.')}
      emptyAction={<Button onClick={openCreate}><Handshake className="size-4" />{ui('إضافة شريك')}</Button>}
    />

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{ui(editingId ? 'تعديل بيانات الشريك' : 'إضافة شريك جديد')}</DialogTitle>
          <DialogDescription>{ui('سيمكن البحث عن الشريك في نقطة البيع بالاسم أو الكود أو أي رقم هاتف مسجل.')}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto pe-1 md:grid-cols-2">
          <div><Label>{ui('اسم الشريك')} *</Label><Input className="mt-1" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div><Label>{ui('كود الشريك')}</Label><Input className="nums mt-1" value={form.partnerCode} onChange={(event) => setForm((current) => ({ ...current, partnerCode: event.target.value }))} placeholder={ui('يُنشأ تلقائيًا إذا تُرك فارغًا')} /></div>
          <div><Label>{ui('رقم الهوية')}</Label><Input className="nums mt-1" value={form.nationalId} onChange={(event) => setForm((current) => ({ ...current, nationalId: event.target.value }))} /></div>
          <div><Label>{ui('البريد الإلكتروني')}</Label><Input className="mt-1" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div>
          <div className="md:col-span-2"><Label>{ui('العنوان')}</Label><Input className="mt-1" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></div>

          <section className="space-y-3 rounded-2xl border bg-muted/20 p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">{ui('أرقام الهاتف')}</h3><p className="text-xs text-muted-foreground">{ui('أضف أي عدد من الأرقام وحدد الرقم الأساسي.')}</p></div><Button type="button" variant="outline" size="sm" onClick={addPhone}><Plus className="size-4" />{ui('رقم آخر')}</Button></div>
            <div className="space-y-2">{form.phones.map((item, index) => <div key={index} className={`grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_140px_auto_auto] ${item.isPrimary ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' : 'bg-background'}`}>
              <div><Label className="text-xs">{ui('رقم الهاتف')}</Label><Input className="nums mt-1" type="tel" inputMode="tel" value={item.phone} onChange={(event) => updatePhone(index, { phone: event.target.value })} placeholder="01012345678" /></div>
              <div><Label className="text-xs">{ui('الوصف')}</Label><Input className="mt-1" value={item.label} onChange={(event) => updatePhone(index, { label: event.target.value })} placeholder={ui('جوال / واتساب')} /></div>
              <Button type="button" variant={item.isPrimary ? 'default' : 'outline'} size="sm" onClick={() => markPrimary(index)}><Star className={`size-4 ${item.isPrimary ? 'fill-current' : ''}`} />{item.isPrimary ? ui('أساسي') : ui('اجعله أساسي')}</Button>
              <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={form.phones.length === 1} onClick={() => removePhone(index)} aria-label={ui('حذف الرقم')}><Trash2 className="size-4" /></Button>
            </div>)}</div>
          </section>

          <div className="md:col-span-2"><Label>{ui('ملاحظات')}</Label><Textarea className="mt-1" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>{ui('الشريك نشط ويظهر في نقطة البيع')}</span></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button onClick={() => void save()} disabled={saving}>{saving ? ui('جاري الحفظ…') : ui('حفظ الشريك')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
