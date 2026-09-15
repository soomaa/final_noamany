import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { formatTime, localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubSpaBookingRow, ClubSpaServiceRow } from '@/types/fitness';
import { RowActions, SELECT_CLS, useFitnessResourceList, memberColumnDef } from '../shared';

const BOOKING_STATUS_MAP = {
  pending: 'pending',
  confirmed: 'active',
  completed: 'active',
  cancelled: 'expired',
} as const;

export function FitnessSpaBookingsPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubSpaBookingRow>(
    'club-spa-bookings',
    params,
  );
  const { data: branches } = useBranches();
  const { items: services } = useFitnessResourceList<ClubSpaServiceRow>('club-spa-services');
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const filters: FilterField[] = [
    { key: 'branch', label: ft('common.branch'), type: 'select', options: branchOptions },
  ];

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    memberId: '',
    customerName: '',
    customerPhone: '',
    serviceId: '',
    branchId: '',
    bookingDate: localToday(),
    bookingTime: '10:00',
    notes: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-spa-bookings/${id}`),
    { success: ft('common.success'), invalidate: ['club-spa-bookings'] },
  );

  const openCreate = () => {
    setEditId(null);
    const svc = services?.[0];
    setForm({
      memberId: '',
      customerName: '',
      customerPhone: '',
      serviceId: svc ? String(svc.id) : '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      bookingDate: localToday(),
      bookingTime: '10:00',
      notes: '',
    });
    setOpen(true);
  };

  const openEdit = (row: ClubSpaBookingRow) => {
    setEditId(row.id);
    setForm({
      memberId: row.memberId != null ? String(row.memberId) : '',
      customerName: row.customerName ?? '',
      customerPhone: row.customerPhone ?? '',
      serviceId: String(row.serviceId),
      branchId: String(row.branchId),
      bookingDate: row.bookingDate,
      bookingTime: row.bookingTime,
      notes: row.notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.serviceId || !form.branchId || !form.bookingDate || !form.bookingTime) {
      toast.error(ft('spaBookings.title'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: form.memberId ? Number(form.memberId) : undefined,
        customerName: form.customerName || undefined,
        customerPhone: form.customerPhone || undefined,
        serviceId: Number(form.serviceId),
        branchId: Number(form.branchId),
        bookingDate: form.bookingDate,
        bookingTime: form.bookingTime,
        notes: form.notes || undefined,
      };
      if (editId) await api.put(`/club-spa-bookings/${editId}`, payload);
      else await api.post('/club-spa-bookings', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubSpaBookingRow>[]>(
    () => [
      {
        accessorKey: 'bookingNumber',
        header: ft('spaBookings.bookingNumber'),
        cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span>,
      },
      {
        accessorKey: 'service',
        header: ft('spaServices.title'),
        cell: ({ row }) => row.original.service?.name ?? `#${row.original.serviceId}`,
      },
      {
        accessorKey: 'bookingDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'bookingTime',
        header: ft('common.time'),
        cell: ({ getValue }) => <span className="nums">{formatTime(getValue() as string)}</span>,
      },
      memberColumnDef<ClubSpaBookingRow>(ft('common.customer')),
      {
        accessorKey: 'status',
        header: ft('common.status'),
        cell: ({ row }) => (
          <StatusBadge status={BOOKING_STATUS_MAP[row.original.status as keyof typeof BOOKING_STATUS_MAP] ?? 'pending'} />
        ),
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={() => openEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            }
          />
        ),
      },
    ],
    [ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('spaBookings.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button>
        }
      />
      <FilterBar fields={filters} />
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
        emptyTitle={ft('common.noData')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.memberCode')}</Label>
              <Input className="nums" value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.customer')}</Label>
              <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('spaBookings.phone')}</Label>
              <Input className="nums" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('spaServices.title')}</Label>
              <select className={SELECT_CLS} value={form.serviceId} onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}>
                {(services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.branch')}</Label>
              <select className={SELECT_CLS} value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('common.date')}</Label>
                <Input type="date" className="nums" value={form.bookingDate} onChange={(e) => setForm((f) => ({ ...f, bookingDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('common.time')}</Label>
                <Time12Input value={form.bookingTime} onValueChange={(value) => setForm((f) => ({ ...f, bookingTime: value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
