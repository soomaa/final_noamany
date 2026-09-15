import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Calendar, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { formatTime, localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubHallBookingRow, ClubHallRow } from '@/types/fitness';
import { RowActions, SELECT_CLS, memberColumnDef } from './shared';

export function FitnessRoomBookingsPage() {
  const ft = useFitnessT();
  const [tab, setTab] = useState('halls');
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const hallQuery = useListQuery();
  const bookingQuery = useListQuery();
  const { data: halls, isLoading: hallsLoading, isError: hallsError, refetch: refetchHalls } =
    usePaginatedList<ClubHallRow>('club-halls', hallQuery.params);
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } =
    usePaginatedList<ClubHallBookingRow>('club-hall-bookings', bookingQuery.params);

  const hallFilters: FilterField[] = [
    { key: 'branch', label: ft('common.branch'), type: 'select', options: branchOptions },
  ];

  const [hallOpen, setHallOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [hallEditId, setHallEditId] = useState<number | null>(null);
  const [bookingEditId, setBookingEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [hallForm, setHallForm] = useState({
    name: '',
    hallNumber: '',
    capacity: '',
    branchId: '',
    description: '',
    status: 'available',
  });

  const [bookingForm, setBookingForm] = useState({
    hallId: '',
    memberId: '',
    customerName: '',
    bookingDate: localToday(),
    startTime: '09:00',
    endTime: '10:00',
    numberOfPeople: '1',
    notes: '',
  });

  const deleteHallMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-halls/${id}`),
    { success: ft('common.success'), invalidate: ['club-halls'] },
  );
  const deleteBookingMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-hall-bookings/${id}`),
    { success: ft('common.success'), invalidate: ['club-hall-bookings'] },
  );

  const openHallCreate = () => {
    setHallEditId(null);
    setHallForm({
      name: '',
      hallNumber: '',
      capacity: '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      description: '',
      status: 'available',
    });
    setHallOpen(true);
  };

  const openHallEdit = (row: ClubHallRow) => {
    setHallEditId(row.id);
    setHallForm({
      name: row.name,
      hallNumber: row.hallNumber,
      capacity: String(row.capacity),
      branchId: String(row.branchId),
      description: row.description ?? '',
      status: row.status,
    });
    setHallOpen(true);
  };

  const saveHall = async () => {
    if (!hallForm.name.trim() || !hallForm.hallNumber || !hallForm.capacity || !hallForm.branchId) {
      toast.error(ft('roomBookings.halls'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: hallForm.name.trim(),
        hallNumber: hallForm.hallNumber.trim(),
        capacity: Number(hallForm.capacity),
        branchId: Number(hallForm.branchId),
        description: hallForm.description || undefined,
        status: hallForm.status,
      };
      if (hallEditId) await api.put(`/club-halls/${hallEditId}`, payload);
      else await api.post('/club-halls', payload);
      toast.success(ft('common.success'));
      setHallOpen(false);
      void refetchHalls();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openBookingCreate = () => {
    setBookingEditId(null);
    setBookingForm({
      hallId: halls?.data?.[0] ? String(halls.data[0].id) : '',
      memberId: '',
      customerName: '',
      bookingDate: localToday(),
      startTime: '09:00',
      endTime: '10:00',
      numberOfPeople: '1',
      notes: '',
    });
    setBookingOpen(true);
  };

  const openBookingEdit = (row: ClubHallBookingRow) => {
    setBookingEditId(row.id);
    setBookingForm({
      hallId: String(row.hallId),
      memberId: row.memberId != null ? String(row.memberId) : '',
      customerName: row.customerName ?? '',
      bookingDate: row.bookingDate,
      startTime: row.startTime,
      endTime: row.endTime,
      numberOfPeople: String(row.numberOfPeople),
      notes: row.notes ?? '',
    });
    setBookingOpen(true);
  };

  const saveBooking = async () => {
    if (!bookingForm.hallId || !bookingForm.bookingDate || !bookingForm.startTime || !bookingForm.endTime) {
      toast.error(ft('roomBookings.bookings'));
      return;
    }
    if (bookingForm.startTime >= bookingForm.endTime) {
      toast.error(ft('classes.endTime'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        hallId: Number(bookingForm.hallId),
        memberId: bookingForm.memberId ? Number(bookingForm.memberId) : undefined,
        customerName: bookingForm.customerName || undefined,
        bookingDate: bookingForm.bookingDate,
        startTime: bookingForm.startTime,
        endTime: bookingForm.endTime,
        numberOfPeople: Number(bookingForm.numberOfPeople) || 1,
        notes: bookingForm.notes || undefined,
      };
      if (bookingEditId) await api.put(`/club-hall-bookings/${bookingEditId}`, payload);
      else await api.post('/club-hall-bookings', payload);
      toast.success(ft('common.success'));
      setBookingOpen(false);
      void refetchBookings();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const hallColumns = useMemo<ColumnDef<ClubHallRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      { accessorKey: 'hallNumber', header: ft('roomBookings.hallNumber'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
      {
        accessorKey: 'capacity',
        header: ft('common.capacity'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'status', header: ft('common.status') },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={() => openHallEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteHallMutation.mutate(row.original.id);
              })
            }
          />
        ),
      },
    ],
    [ft],
  );

  const bookingColumns = useMemo<ColumnDef<ClubHallBookingRow>[]>(
    () => [
      {
        accessorKey: 'hall',
        header: ft('roomBookings.halls'),
        cell: ({ row }) => row.original.hall?.name ?? `#${row.original.hallId}`,
      },
      {
        accessorKey: 'bookingDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        id: 'time',
        header: ft('common.time'),
        cell: ({ row }) => (
          <span className="nums">
            {formatTime(row.original.startTime)} – {formatTime(row.original.endTime)}
          </span>
        ),
      },
      {
        accessorKey: 'numberOfPeople',
        header: ft('roomBookings.people'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      memberColumnDef<ClubHallBookingRow>(ft('common.member')),
      { accessorKey: 'status', header: ft('common.status') },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={() => openBookingEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteBookingMutation.mutate(row.original.id);
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
      <PageHeader title={ft('roomBookings.title')} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="halls"><Building2 className="size-4" /> {ft('roomBookings.halls')}</TabsTrigger>
          <TabsTrigger value="bookings"><Calendar className="size-4" /> {ft('roomBookings.bookings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="halls" className="space-y-4 pt-4">
          <Button variant="brand" onClick={openHallCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button>
          <FilterBar fields={hallFilters} />
          <DataTable
            columns={hallColumns}
            data={halls?.data ?? []}
            total={halls?.total ?? 0}
            page={hallQuery.params.page}
            pageSize={hallQuery.params.pageSize}
            onPageChange={(page) => hallQuery.setParams({ page })}
            onPageSizeChange={(pageSize) => hallQuery.setParams({ pageSize, page: 1 })}
            search={hallQuery.params.search}
            onSearchChange={(search) => hallQuery.setParams({ search, page: 1 })}
            isLoading={hallsLoading}
            isError={hallsError}
            onRetry={() => void refetchHalls()}
            emptyTitle={ft('common.noData')}
          />
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4 pt-4">
          <Button variant="brand" onClick={openBookingCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button>
          <DataTable
            columns={bookingColumns}
            data={bookings?.data ?? []}
            total={bookings?.total ?? 0}
            page={bookingQuery.params.page}
            pageSize={bookingQuery.params.pageSize}
            onPageChange={(page) => bookingQuery.setParams({ page })}
            onPageSizeChange={(pageSize) => bookingQuery.setParams({ pageSize, page: 1 })}
            search={bookingQuery.params.search}
            onSearchChange={(search) => bookingQuery.setParams({ search, page: 1 })}
            isLoading={bookingsLoading}
            isError={bookingsError}
            onRetry={() => void refetchBookings()}
            emptyTitle={ft('common.noData')}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={hallOpen} onOpenChange={setHallOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{hallEditId ? ft('common.edit') : ft('common.add')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={hallForm.name} onChange={(e) => setHallForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('roomBookings.hallNumber')}</Label>
              <Input className="nums" value={hallForm.hallNumber} onChange={(e) => setHallForm((f) => ({ ...f, hallNumber: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.capacity')}</Label>
              <Input className="nums" value={hallForm.capacity} onChange={(e) => setHallForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.branch')}</Label>
              <select className={SELECT_CLS} value={hallForm.branchId} onChange={(e) => setHallForm((f) => ({ ...f, branchId: e.target.value }))}>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.status')}</Label>
              <select className={SELECT_CLS} value={hallForm.status} onChange={(e) => setHallForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="available">available</option>
                <option value="maintenance">maintenance</option>
                <option value="unavailable">unavailable</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHallOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveHall()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{bookingEditId ? ft('common.edit') : ft('common.add')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('roomBookings.halls')}</Label>
              <select className={SELECT_CLS} value={bookingForm.hallId} onChange={(e) => setBookingForm((f) => ({ ...f, hallId: e.target.value }))}>
                {(halls?.data ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.name} ({h.hallNumber})</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.date')}</Label>
              <Input type="date" className="nums" value={bookingForm.bookingDate} onChange={(e) => setBookingForm((f) => ({ ...f, bookingDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('classes.startTime')}</Label>
                <Time12Input value={bookingForm.startTime} onValueChange={(value) => setBookingForm((f) => ({ ...f, startTime: value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('classes.endTime')}</Label>
                <Time12Input value={bookingForm.endTime} onValueChange={(value) => setBookingForm((f) => ({ ...f, endTime: value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.memberCode')}</Label>
              <Input className="nums" value={bookingForm.memberId} onChange={(e) => setBookingForm((f) => ({ ...f, memberId: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={bookingForm.customerName} onChange={(e) => setBookingForm((f) => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('roomBookings.people')}</Label>
              <Input className="nums" value={bookingForm.numberOfPeople} onChange={(e) => setBookingForm((f) => ({ ...f, numberOfPeople: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveBooking()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
