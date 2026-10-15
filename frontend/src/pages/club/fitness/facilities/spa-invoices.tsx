import { formatDisplayNumber } from '@/lib/number-display';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { ClubSpaInvoiceRow, ClubSpaServiceRow } from '@/types/fitness';
import { SELECT_CLS, useFitnessResourceList, memberColumnDef } from '../shared';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { printThermalFinancialReceiptWithFallback } from '@/components/club/thermal-receipt-print';
import { runAutoPrintOnce } from '@/lib/club-printing';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type BenefitResponse = {
  member: { id: number; memberCode: string; name: string; branchId: number };
  inbody: { remaining: number };
  spa: { remaining: number };
};

const PAYMENT_METHODS = [
  ['cash', uiStatic('نقدي')],
  ['card', uiStatic('بطاقة')],
  ['wallet', uiStatic('محفظة')],
  ['transfer', uiStatic('تحويل بنكي')],
] as const;

export function FitnessSpaInvoicesPage() {
  const { ui } = useLocale();
  const { user } = useAuth();
  const { policy, shouldPrint } = useClubPrintingPolicy();
  const ft = useFitnessT();
  const { can } = usePermission();
  const canCreate = can('club.fitness.spa_invoices:create');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubSpaInvoiceRow>('club-spa-invoices', params);
  const { data: branches } = useBranches();
  const { items } = useFitnessResourceList<ClubSpaServiceRow>('club-spa-services');
  const services = (items ?? []).filter((service) => service.isActive);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [benefits, setBenefits] = useState<BenefitResponse | null>(null);
  const [form, setForm] = useState({
    serviceId: '',
    branchId: '',
    quantity: '1',
    invoiceDate: localToday(),
    paymentMethod: 'cash',
    useSubscriptionBenefit: true,
  });
  const selectedService = services.find((service) => String(service.id) === form.serviceId);
  const quantity = Math.max(1, Number(form.quantity) || 1);
  const hasEnoughBenefits = (benefits?.spa.remaining ?? 0) >= quantity;

  const selectMember = async (member: ClubMemberListItem) => {
    setSelectedMember(member);
    setForm((current) => ({ ...current, branchId: String(member.branchId), useSubscriptionBenefit: true }));
    try {
      const { data: response } = await api.get<BenefitResponse>('/club-spa-invoices/member-benefits/by-code', {
        params: { memberCode: member.memberCode },
      });
      setBenefits(response);
    } catch (error) {
      setBenefits(null);
      toast.error(apiError(error));
    }
  };

  const openCreate = () => {
    setSelectedMember(null);
    setBenefits(null);
    setForm({
      serviceId: services[0] ? String(services[0].id) : '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      quantity: '1',
      invoiceDate: localToday(),
      paymentMethod: 'cash',
      useSubscriptionBenefit: true,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!canCreate) return;
    if (!selectedMember || !form.serviceId || !form.branchId) {
      toast.error(ui('العضو والخدمة والفرع مطلوبة'));
      return;
    }
    setSaving(true);
    try {
      const { data: invoice } = await api.post<ClubSpaInvoiceRow>('/club-spa-invoices', {
        memberId: selectedMember.id,
        serviceId: Number(form.serviceId),
        branchId: Number(form.branchId),
        quantity,
        invoiceDate: form.invoiceDate,
        paymentMethod: form.paymentMethod,
        useSubscriptionBenefit: form.useSubscriptionBenefit && hasEnoughBenefits,
      });
      toast.success(ft('common.success'));
      if (shouldPrint('spa', invoice.totalAmount, invoice.invoiceNumber)) {
        runAutoPrintOnce('spa', invoice.invoiceNumber, () => printThermalFinancialReceiptWithFallback({
          documentNumber: invoice.invoiceNumber,
          transactionLabel: 'SPA service',
          itemName: invoice.service?.name || selectedService?.name || 'SPA',
          customerName: selectedMember.name,
          memberCode: selectedMember.memberCode,
          branchName: branches?.find((branch) => branch.id === invoice.branchId)?.name,
          collectedAmount: invoice.totalAmount,
          paymentMethod: invoice.paymentMethod || form.paymentMethod,
          operatorName: user?.name,
        }, policy));
      }
      setOpen(false);
      await refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubSpaInvoiceRow>[]>(() => [
    { accessorKey: 'invoiceNumber', header: ft('spaInvoices.invoiceNumber'), cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span> },
    memberColumnDef<ClubSpaInvoiceRow>(ft('common.member')),
    { accessorKey: 'service', header: ft('spaServices.title'), cell: ({ row }) => row.original.service?.name ?? `#${row.original.serviceId}` },
    { accessorKey: 'quantity', header: ft('spaInvoices.quantity'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'totalAmount', header: ft('spaInvoices.total'), cell: ({ getValue }) => <span className="nums font-medium">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'status', header: ui('طريقة التسوية'), cell: ({ row }) => row.original.coveredBySubscription ? ui('ضمن الاشتراك') : ui('مدفوع') },
    { accessorKey: 'invoiceDate', header: ft('common.date'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
  ], [ft]);

  return (
    <div className="space-y-6">
      <PageHeader title={ft('spaInvoices.title')} actions={canCreate ? <Button variant="brand" onClick={openCreate}><Plus className="size-4" />{ui('فاتورة جديدة')}</Button> : undefined} />
      <DataTable
        exportSource={{ resource: 'club-spa-invoices', params }} columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle={ft('common.noData')} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('فاتورة SPA جديدة')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2"><Label>{ui('ابحث بكود العضو أو الاسم')}</Label><MemberSearchCombobox selectedMember={selectedMember} onSelect={(member) => void selectMember(member)} onClear={() => { setSelectedMember(null); setBenefits(null); }} /></div>
            {selectedMember && <div className="rounded-lg border bg-muted/40 p-3 text-sm">{ui('رصيد SPA المتبقي في الاشتراكات:')}<strong className="nums">{toArabicDigits(benefits?.spa.remaining ?? 0)}</strong></div>}
            <div className="grid gap-2"><Label>{ft('spaServices.title')}</Label><select className={SELECT_CLS} value={form.serviceId} onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}><option value="">{ui('اختر خدمة')}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} — {formatDisplayNumber(service.price)}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>{ft('spaInvoices.quantity')}</Label><Input type="number" min="1" className="nums" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{ui('السعر من الإعدادات')}</Label><Input disabled className="nums" value={selectedService?.price ?? ''} /></div>
            </div>
            {selectedMember && hasEnoughBenefits && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.useSubscriptionBenefit} onChange={(event) => setForm((current) => ({ ...current, useSubscriptionBenefit: event.target.checked }))} />{ui('خصم الخدمة من الاشتراك (بدون تحصيل نقدي)')}</label>}
            {selectedMember && !hasEnoughBenefits && (benefits?.spa.remaining ?? 0) > 0 && <p className="text-sm text-amber-700">{ui('الرصيد المتبقي لا يكفي الكمية المطلوبة؛ ستُسجل الفاتورة مدفوعة.')}</p>}
            <div className="grid gap-2"><Label>{ft('common.branch')}</Label><select className={SELECT_CLS} value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? '—'}</option>)}</select></div>
            {(!form.useSubscriptionBenefit || !hasEnoughBenefits) && <div className="grid gap-2"><Label>{ui('طريقة الدفع')}</Label><select className={SELECT_CLS} value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
            <p className="text-sm text-muted-foreground">{ui('الإجمالي:')}<span className="nums font-medium">{toArabicDigits(form.useSubscriptionBenefit && hasEnoughBenefits ? 0 : quantity * (selectedService?.price ?? 0))}</span></p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>{canCreate && <Button permissionAction="create" variant="brand" onClick={() => void save()} disabled={saving || services.length === 0}>{ft('common.save')}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
