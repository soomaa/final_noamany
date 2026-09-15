import type { ColumnDef } from '@tanstack/react-table';
import { Plus, RotateCcw, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { formatTime, localToday } from '@/lib/formatters';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { validateNotPastDate } from '@/lib/validators';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import { usePermission } from '@/hooks/use-permission';

interface BookingRow {
  id: number;
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  bookingDate: string;
  bookingTime: string;
  finalAmount: number;
  status: string;
  paymentStatus: string;
  paidAmount: number;
  refundedAmount: number;
  netCollected: number;
  outstandingAmount: number;
  service?: { name: string; price: number };
  salesEmployeeId?: number | null;
}

interface BookingService {
  id: number;
  name: string;
  price: number;
}

interface EmployeeOption {
  id: number;
  name: string;
}

export function SalesBookingsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.sales.bookings:create');
  const canUpdate = can('gym-sales.sales.bookings:update');
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('');
  const effectiveBranch = branchId || String(branches?.[0]?.id ?? '');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<BookingRow>('bookings', {
    ...params,
    filters: effectiveBranch ? { branchId: effectiveBranch } : {},
  });

  const [open, setOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentKind, setPaymentKind] = useState<'payment' | 'refund'>('payment');
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', paymentDate: localToday(), notes: '' });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    serviceId: '',
    salesEmployeeId: '',
    bookingDate: localToday(),
    bookingTime: '10:00',
    notes: '',
  });

  const { data: services } = useQuery({
    queryKey: ['booking-services', effectiveBranch],
    queryFn: async () => {
      const { data: r } = await api.get<BookingService[]>('/bookings/services', {
        params: effectiveBranch ? { branchId: effectiveBranch } : undefined,
      });
      return r;
    },
    enabled: !!effectiveBranch,
  });

  const { data: employees } = useQuery({
    queryKey: ['employees', 'sales-booking'],
    queryFn: async () => {
      const { data: r } = await api.get<{ data: EmployeeOption[] }>('/employees', {
        params: { page: 1, pageSize: 200 },
      });
      return (r.data ?? []).map((e) => ({ id: e.id, name: (e as { employee?: string }).employee ?? e.name }));
    },
  });

  const selectedService = services?.find((s) => String(s.id) === form.serviceId);

  const columns = useMemo<ColumnDef<BookingRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<BookingRow>,
      { accessorKey: 'bookingNumber', header: ui('رقم الحجز') },
      { accessorKey: 'customerName', header: ui('العميل') },
      {
        accessorKey: 'service.name',
        header: ui('الخدمة'),
        cell: ({ row }) => row.original.service?.name ?? '—',
      },
      {
        accessorKey: 'finalAmount',
        header: ui('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'bookingDate', header: ui('التاريخ') },
      {
        accessorKey: 'bookingTime',
        header: ui('الوقت'),
        cell: ({ getValue }) => <span className="nums">{formatTime(String(getValue() ?? ''))}</span>,
      },
      { accessorKey: 'status', header: ui('الحالة') },
      { accessorKey: 'paymentStatus', header: ui('حالة الدفع') },
      {
        accessorKey: 'netCollected',
        header: ui('المحصل فعليًا'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {canUpdate && row.original.outstandingAmount > 0 && row.original.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => openPayment(row.original, 'payment')}><Wallet className="size-3" />{ui('تحصيل')}</Button>}
            {canUpdate && row.original.netCollected > 0 && <Button size="sm" variant="outline" onClick={() => openPayment(row.original, 'refund')}><RotateCcw className="size-3" />{ui('استرداد')}</Button>}
          </div>
        ),
      },
    ],
    [canUpdate, params.page, params.pageSize, ui],
  );

  const openPayment = (booking: BookingRow, kind: 'payment' | 'refund') => {
    if (!canUpdate) return;
    setSelectedBooking(booking);
    setPaymentKind(kind);
    setPaymentForm({
      amount: String(kind === 'payment' ? booking.outstandingAmount : booking.netCollected),
      method: 'cash',
      paymentDate: localToday(),
      notes: '',
    });
    setPaymentOpen(true);
  };

  const savePayment = async () => {
    if (!canUpdate || !selectedBooking || Number(paymentForm.amount) <= 0) return;
    setSaving(true);
    try {
      const endpoint = paymentKind === 'payment' ? 'payments' : 'refunds';
      await api.post(`/bookings/${selectedBooking.id}/${endpoint}`, {
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        paymentDate: paymentForm.paymentDate,
        notes: paymentForm.notes || undefined,
      });
      toast.success(ui(paymentKind === 'payment' ? 'تم تسجيل الدفعة وربطها بالحسابات' : 'تم تسجيل الاسترداد وعكس أثره المحاسبي'));
      setPaymentOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!canCreate) return;
    const dateErr = validateNotPastDate(form.bookingDate);
    if (dateErr) {
      toast.error(ui(dateErr));
      return;
    }
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.serviceId || !effectiveBranch) {
      toast.error(ui('أكمل الحقول المطلوبة'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/bookings', {
        branchId: Number(effectiveBranch),
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        serviceId: Number(form.serviceId),
        salesEmployeeId: form.salesEmployeeId ? Number(form.salesEmployeeId) : undefined,
        bookingDate: form.bookingDate,
        bookingTime: form.bookingTime,
        notes: form.notes || undefined,
      });
      toast.success(ui('تم إنشاء الحجز'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GymSalesPageShell
      section="sales"
      title={ui('حجوزات المبيعات')}
      description={ui('حجز خدمات من الكتالوج مع ربط موظف المبيعات')}
      actions={
        canCreate ? <Button onClick={() => setOpen(true)}>
          <Plus className="ms-1 h-4 w-4" />
          {ui('حجز جديد')}
        </Button> : null
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <Label>{ui('الفرع')}</Label>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={effectiveBranch}
          onChange={(e) => setBranchId(e.target.value)}
        >
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={canCreate && open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui('حجز جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input
              placeholder={ui('اسم العميل')}
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
            />
            <Input
              placeholder={ui('جوال العميل')}
              value={form.customerPhone}
              onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
            />
            <div className="grid gap-1">
              <Label>{ui('الخدمة')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.serviceId}
                onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
              >
                <option value="">{ui('—')}</option>
                {(services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {toArabicDigits(s.price)}
                  </option>
                ))}
              </select>
            </div>
            {selectedService && (
              <p className="text-sm text-muted-foreground">
                {ui('السعر')}: <span className="nums font-medium">{toArabicDigits(selectedService.price)}</span>
              </p>
            )}
            <div className="grid gap-1">
              <Label>{ui('موظف المبيعات')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.salesEmployeeId}
                onChange={(e) => setForm((f) => ({ ...f, salesEmployeeId: e.target.value }))}
              >
                <option value="">{ui('—')}</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>{ui('التاريخ')}</Label>
                <Input
                  type="date"
                  className="nums"
                  min={localToday()}
                  value={form.bookingDate}
                  onChange={(e) => setForm((f) => ({ ...f, bookingDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('الوقت')}</Label>
                <Time12Input value={form.bookingTime} onValueChange={(value) => setForm((f) => ({ ...f, bookingTime: value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button permissionAction="create" onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canUpdate && paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{ui(paymentKind === 'payment' ? 'تحصيل دفعة حجز' : 'استرداد دفعة حجز')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">{selectedBooking?.bookingNumber} — {selectedBooking?.customerName}</p>
            <div className="grid gap-1"><Label>{ui('المبلغ')}</Label><Input type="number" min="0.01" step="0.01" className="nums" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></div>
            <div className="grid gap-1"><Label>{ui('طريقة الدفع')}</Label><select className="rounded-md border bg-background px-3 py-2 text-sm" value={paymentForm.method} onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))}><option value="cash">{ui('نقدي')}</option><option value="card">{ui('بطاقة')}</option><option value="wallet">{ui('محفظة')}</option><option value="transfer">{ui('تحويل')}</option></select></div>
            <div className="grid gap-1"><Label>{ui('التاريخ')}</Label><Input type="date" className="nums" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} /></div>
            <div className="grid gap-1"><Label>{ui('ملاحظات')}</Label><Input value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>{ui('إلغاء')}</Button><Button permissionAction="update" onClick={() => void savePayment()} disabled={saving}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}
