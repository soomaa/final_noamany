import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { ClubInbodyInvoiceRow } from '@/types/fitness';
import { SELECT_CLS, memberColumnDef } from '../shared';

type ServiceRow = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  branchId: number | null;
  isActive: boolean;
};

type BenefitResponse = {
  member: { id: number; memberCode: string; name: string; branchId: number };
  inbody: { remaining: number };
  spa: { remaining: number };
};

const PAYMENT_METHODS = [
  ['cash', 'نقدي'],
  ['card', 'بطاقة'],
  ['wallet', 'محفظة'],
  ['transfer', 'تحويل بنكي'],
] as const;

export function FitnessInbodyInvoicesPage() {
  const ft = useFitnessT();
  const queryClient = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubInbodyInvoiceRow>('club-inbody-invoices', params);
  const { data: branches } = useBranches();
  const [tab, setTab] = useState('invoices');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [serviceEditId, setServiceEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [benefits, setBenefits] = useState<BenefitResponse | null>(null);
  const [form, setForm] = useState({
    isMember: true,
    customerName: '',
    branchId: '',
    serviceId: '',
    invoiceDate: localToday(),
    paymentMethod: 'cash',
    useSubscriptionBenefit: true,
  });
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', price: '', branchId: '', isActive: true });

  const servicesQuery = useQuery({
    queryKey: ['club-inbody-services', 'settings'],
    queryFn: async () => {
      const { data: response } = await api.get<{ data: ServiceRow[] }>('/club-inbody-services', { params: { page: 1, pageSize: 100 } });
      return response.data;
    },
  });
  const services = servicesQuery.data ?? [];
  const activeServices = services.filter((service) => service.isActive);
  const selectedService = activeServices.find((service) => String(service.id) === form.serviceId);

  const selectMember = async (member: ClubMemberListItem) => {
    setSelectedMember(member);
    setForm((current) => ({ ...current, branchId: String(member.branchId), useSubscriptionBenefit: true }));
    try {
      const { data: result } = await api.get<BenefitResponse>('/club-inbody-invoices/member-benefits/by-code', {
        params: { memberCode: member.memberCode },
      });
      setBenefits(result);
    } catch (error) {
      setBenefits(null);
      toast.error(apiError(error));
    }
  };

  const openCreate = () => {
    setSelectedMember(null);
    setBenefits(null);
    setForm({
      isMember: true,
      customerName: '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      serviceId: activeServices[0] ? String(activeServices[0].id) : '',
      invoiceDate: localToday(),
      paymentMethod: 'cash',
      useSubscriptionBenefit: true,
    });
    setInvoiceOpen(true);
  };

  const saveInvoice = async () => {
    if (!form.branchId || !form.serviceId || (form.isMember ? !selectedMember : !form.customerName.trim())) {
      toast.error('العضو/العميل والخدمة والفرع مطلوبة');
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-inbody-invoices', {
        isMember: form.isMember,
        memberId: form.isMember ? selectedMember?.id : undefined,
        customerName: form.isMember ? selectedMember?.name : form.customerName.trim(),
        branchId: Number(form.branchId),
        serviceId: Number(form.serviceId),
        invoiceDate: form.invoiceDate,
        paymentMethod: form.paymentMethod,
        useSubscriptionBenefit:
          form.isMember && form.useSubscriptionBenefit && (benefits?.inbody.remaining ?? 0) > 0,
      });
      toast.success(ft('common.success'));
      setInvoiceOpen(false);
      await refetch();
      if (selectedMember) await selectMember(selectedMember);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openServiceCreate = () => {
    setServiceEditId(null);
    setServiceForm({ name: '', description: '', price: '', branchId: '', isActive: true });
    setServiceOpen(true);
  };

  const openServiceEdit = (service: ServiceRow) => {
    setServiceEditId(service.id);
    setServiceForm({
      name: service.name,
      description: service.description ?? '',
      price: String(service.price),
      branchId: service.branchId != null ? String(service.branchId) : '',
      isActive: service.isActive,
    });
    setServiceOpen(true);
  };

  const saveService = async () => {
    const price = Number(serviceForm.price);
    if (!serviceForm.name.trim() || !Number.isFinite(price) || price < 0) {
      toast.error('اسم الخدمة والسعر الصحيح مطلوبان');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: serviceForm.name.trim(),
        description: serviceForm.description.trim() || undefined,
        price,
        branchId: serviceForm.branchId ? Number(serviceForm.branchId) : null,
        isActive: serviceForm.isActive,
      };
      if (serviceEditId) await api.put(`/club-inbody-services/${serviceEditId}`, payload);
      else await api.post('/club-inbody-services', payload);
      toast.success(ft('common.success'));
      setServiceOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['club-inbody-services'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const invoiceColumns = useMemo<ColumnDef<ClubInbodyInvoiceRow>[]>(() => [
    { accessorKey: 'invoiceNumber', header: 'رقم الفاتورة', cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span> },
    memberColumnDef<ClubInbodyInvoiceRow>(ft('common.member')),
    { accessorKey: 'totalAmount', header: ft('spaInvoices.total'), cell: ({ getValue }) => <span className="nums font-medium">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'status', header: 'طريقة التسوية', cell: ({ row }) => row.original.coveredBySubscription ? 'ضمن الاشتراك' : 'مدفوع' },
    { accessorKey: 'invoiceDate', header: ft('common.date'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
  ], [ft]);

  const serviceColumns = useMemo<ColumnDef<ServiceRow>[]>(() => [
    { accessorKey: 'name', header: ft('common.name') },
    { accessorKey: 'price', header: ft('common.price'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'isActive', header: 'الحالة', cell: ({ getValue }) => getValue() ? 'مفعلة' : 'موقوفة' },
    { id: 'actions', header: ft('common.actions'), cell: ({ row }) => <Button size="sm" variant="outline" onClick={() => openServiceEdit(row.original)}>{ft('common.edit')}</Button> },
  ], [ft]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('inbodyInvoices.title')}
        actions={<Button variant="brand" onClick={tab === 'invoices' ? openCreate : openServiceCreate}><Plus className="size-4" /> {tab === 'invoices' ? 'فاتورة جديدة' : 'خدمة جديدة'}</Button>}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="invoices">الفواتير والإيصالات</TabsTrigger><TabsTrigger value="settings">إعدادات الخدمات</TabsTrigger></TabsList>
        <TabsContent value="invoices" className="mt-4">
          <DataTable columns={invoiceColumns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle={ft('common.noData')} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <DataTable columns={serviceColumns} data={services} total={services.length} page={1} pageSize={100} onPageChange={() => undefined} isLoading={servicesQuery.isLoading} isError={servicesQuery.isError} onRetry={() => void servicesQuery.refetch()} emptyTitle="لا توجد خدمات. أضف أول خدمة InBody." />
        </TabsContent>
      </Tabs>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>فاتورة InBody جديدة</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isMember} onChange={(event) => { setSelectedMember(null); setBenefits(null); setForm((current) => ({ ...current, isMember: event.target.checked })); }} />عضو بالنادي</label>
            {form.isMember ? (
              <div className="grid gap-2"><Label>ابحث بكود العضو أو الاسم</Label><MemberSearchCombobox selectedMember={selectedMember} onSelect={(member) => void selectMember(member)} onClear={() => { setSelectedMember(null); setBenefits(null); }} /></div>
            ) : (
              <div className="grid gap-2"><Label>اسم العميل</Label><Input value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></div>
            )}
            {selectedMember && <div className="rounded-lg border bg-muted/40 p-3 text-sm">رصيد InBody المتبقي في الاشتراكات: <strong className="nums">{toArabicDigits(benefits?.inbody.remaining ?? 0)}</strong></div>}
            {selectedMember && (benefits?.inbody.remaining ?? 0) > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.useSubscriptionBenefit} onChange={(event) => setForm((current) => ({ ...current, useSubscriptionBenefit: event.target.checked }))} />خصم الجلسة من الاشتراك (بدون تحصيل نقدي)</label>}
            <div className="grid gap-2"><Label>الخدمة</Label><select className={SELECT_CLS} value={form.serviceId} onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}><option value="">اختر خدمة</option>{activeServices.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price}</option>)}</select></div>
            {selectedService && <p className="text-sm text-muted-foreground">السعر من الإعدادات: <span className="nums font-medium">{toArabicDigits(selectedService.price)}</span></p>}
            <div className="grid gap-2"><Label>{ft('common.branch')}</Label><select className={SELECT_CLS} value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? '—'}</option>)}</select></div>
            {(!form.useSubscriptionBenefit || (benefits?.inbody.remaining ?? 0) === 0 || !selectedMember) && <div className="grid gap-2"><Label>طريقة الدفع</Label><select className={SELECT_CLS} value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setInvoiceOpen(false)}>{ft('common.cancel')}</Button><Button variant="brand" onClick={() => void saveInvoice()} disabled={saving || activeServices.length === 0}>{ft('common.save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{serviceEditId ? 'تعديل خدمة InBody' : 'إضافة خدمة InBody'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2"><Label>اسم الخدمة</Label><Input value={serviceForm.name} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="grid gap-2"><Label>الوصف</Label><Input value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="grid gap-2"><Label>السعر</Label><Input className="nums" type="number" min="0" value={serviceForm.price} onChange={(event) => setServiceForm((current) => ({ ...current, price: event.target.value }))} /></div>
            <div className="grid gap-2"><Label>{ft('common.branch')}</Label><select className={SELECT_CLS} value={serviceForm.branchId} onChange={(event) => setServiceForm((current) => ({ ...current, branchId: event.target.value }))}><option value="">كل الفروع</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? '—'}</option>)}</select></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={serviceForm.isActive} onChange={(event) => setServiceForm((current) => ({ ...current, isActive: event.target.checked }))} />الخدمة مفعلة</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setServiceOpen(false)}>{ft('common.cancel')}</Button><Button variant="brand" onClick={() => void saveService()} disabled={saving}>{ft('common.save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
