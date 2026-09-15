import type { ColumnDef } from '@tanstack/react-table';
import { Plus, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ClubStatCard } from '@/components/club/stat-card';
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
import type { ClubClassDetail, ClubClassRow, ClubClassStatistics, ClubHallRow, ClubTrainerRow } from '@/types/fitness';
import { MemberCell } from '@/components/club/member-cell';
import { RowActions, SELECT_CLS, useFitnessResourceList } from './shared';

export interface FitnessClassesPageProps {
  personalOnly?: boolean;
}

export function FitnessClassesPage({ personalOnly = false }: FitnessClassesPageProps = {}) {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery(
    personalOnly ? { filters: { personalOnly: 'true' } } : undefined,
  );
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubClassRow>('club-classes', params);
  const { data: branches } = useBranches();
  const { items: trainers } = useFitnessResourceList<ClubTrainerRow>('club-trainers');
  const { items: halls } = useFitnessResourceList<ClubHallRow>('club-halls');

  const { data: stats } = useQuery({
    queryKey: ['club-classes', 'statistics'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubClassStatistics>('/club-classes/statistics');
      return s;
    },
    enabled: !personalOnly,
  });

  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const filters: FilterField[] = [
    { key: 'branch', label: ft('common.branch'), type: 'select', options: branchOptions },
    {
      key: 'status',
      label: ft('common.status'),
      type: 'select',
      options: [
        { value: 'scheduled', label: ft('classes.statusScheduled') },
        { value: 'ongoing', label: ft('classes.statusOngoing') },
        { value: 'completed', label: ft('classes.statusCompleted') },
        { value: 'cancelled', label: ft('classes.statusCancelled') },
      ],
    },
  ];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterClassId, setRosterClassId] = useState<number | null>(null);
  const [enrollClassId, setEnrollClassId] = useState<number | null>(null);
  const [memberIdInput, setMemberIdInput] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    className: '',
    trainerId: '',
    branchId: '',
    hallId: '',
    classDate: localToday(),
    startTime: '09:00',
    endTime: '10:00',
    maxCapacity: personalOnly ? '1' : '10',
    price: '0',
    description: '',
    notes: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-classes/${id}`),
    { success: ft('common.success'), invalidate: ['club-classes'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      className: '',
      trainerId: trainers?.[0] ? String(trainers[0].id) : '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      hallId: '',
      classDate: localToday(),
      startTime: '09:00',
      endTime: '10:00',
      maxCapacity: personalOnly ? '1' : '10',
      price: '0',
      description: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (row: ClubClassRow) => {
    setEditId(row.id);
    setForm({
      className: row.className,
      trainerId: String(row.trainerId),
      branchId: String(row.branchId),
      hallId: row.hallId ? String(row.hallId) : '',
      classDate: row.classDate,
      startTime: row.startTime,
      endTime: row.endTime,
      maxCapacity: String(row.maxCapacity),
      price: String(row.price),
      description: row.description ?? '',
      notes: row.notes ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.className.trim() || !form.trainerId || !form.branchId) {
      toast.error(ft('classes.className'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        className: form.className.trim(),
        trainerId: Number(form.trainerId),
        branchId: Number(form.branchId),
        hallId: form.hallId ? Number(form.hallId) : undefined,
        classDate: form.classDate,
        startTime: form.startTime,
        endTime: form.endTime,
        maxCapacity: Number(form.maxCapacity),
        price: Number(form.price),
        description: form.description || undefined,
        notes: form.notes || undefined,
      };
      if (editId) await api.put(`/club-classes/${editId}`, payload);
      else await api.post('/club-classes', payload);
      toast.success(ft('common.success'));
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-classes'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const { data: rosterClass, refetch: refetchRoster } = useQuery({
    queryKey: ['club-class-roster', rosterClassId],
    enabled: rosterClassId != null && rosterOpen,
    queryFn: async () => {
      const { data: cls } = await api.get<ClubClassDetail>(`/club-classes/${rosterClassId}`);
      return cls;
    },
  });

  const openRoster = (classId: number) => {
    setRosterClassId(classId);
    setRosterOpen(true);
  };

  const markAttendance = async (memberId: number, status: 'attended' | 'absent') => {
    if (!rosterClassId) return;
    setSaving(true);
    try {
      await api.patch(`/club-classes/${rosterClassId}/attendance/${memberId}`, {
        attendanceStatus: status,
        attendanceTime: new Date().toTimeString().slice(0, 5),
      });
      toast.success(ft('common.success'));
      void refetchRoster();
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const unenroll = async (memberId: number) => {
    if (!rosterClassId) return;
    const ok = await confirm({ title: ft('classes.unenrollConfirm'), variant: 'destructive' });
    if (!ok) return;
    setSaving(true);
    try {
      await api.delete(`/club-classes/${rosterClassId}/enroll/${memberId}`);
      toast.success(ft('common.success'));
      void refetchRoster();
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openEnroll = (classId: number) => {
    setEnrollClassId(classId);
    setMemberIdInput('');
    setEnrollOpen(true);
  };

  const enroll = async (waitlistIfFull = false) => {
    if (!enrollClassId || !memberIdInput.trim()) {
      toast.error(ft('common.member'));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-classes/${enrollClassId}/enroll/${memberIdInput.trim()}`, null, {
        params: waitlistIfFull ? { waitlistIfFull: 'true' } : undefined,
      });
      toast.success(ft('common.success'));
      setEnrollOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-classes'] });
    } catch (e) {
      const err = e as { response?: { data?: { code?: string; waitlistAvailable?: boolean } } };
      if (err.response?.data?.code === 'CLASS_FULL' || err.response?.data?.waitlistAvailable) {
        const ok = await confirm({ title: ft('classes.waitlistPrompt') });
        if (ok) await enroll(true);
        return;
      }
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubClassRow>[]>(
    () => [
      { accessorKey: 'className', header: ft('classes.className') },
      {
        accessorKey: 'classDate',
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
        accessorKey: 'trainer',
        header: ft('common.trainer'),
        cell: ({ row }) => row.original.trainer?.name ?? '—',
      },
      {
        id: 'capacity',
        header: ft('common.capacity'),
        cell: ({ row }) => (
          <span className="nums">
            {toArabicDigits(row.original.enrollmentCount)} / {toArabicDigits(row.original.maxCapacity)}
          </span>
        ),
      },
      {
        accessorKey: 'price',
        header: ft('common.price'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'status',
        header: ft('common.status'),
        cell: ({ row }) => {
          const map = { scheduled: 'pending', completed: 'active', cancelled: 'expired', ongoing: 'active' } as const;
          return <StatusBadge status={map[row.original.status] ?? 'pending'} />;
        },
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => openRoster(row.original.id)}>
              <Users className="size-4" /> {ft('classes.roster')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openEnroll(row.original.id)}>
              <UserPlus className="size-4" /> {ft('common.enroll')}
            </Button>
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
          </div>
        ),
      },
    ],
    [ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={personalOnly ? ft('personalSessions.title') : ft('classes.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {personalOnly ? ft('personalSessions.newSession') : ft('classes.newClass')}
          </Button>
        }
      />

      {stats && !personalOnly && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ClubStatCard label={ft('classes.statsTotal')} value={stats.totalClasses} />
          <ClubStatCard label={ft('classes.statsScheduled')} value={stats.scheduledClasses} />
          <ClubStatCard label={ft('classes.statsEnrollments')} value={stats.totalEnrollments} />
          <ClubStatCard label={ft('classes.statsAttendanceRate')} value={Math.round(stats.attendanceRate)} suffix="%" />
        </div>
      )}

      {!personalOnly && <FilterBar fields={filters} />}

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
        emptyTitle={ft('common.noData')}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : personalOnly ? ft('personalSessions.newSession') : ft('classes.newClass')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('classes.className')}</Label>
              <Input value={form.className} onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.trainer')}</Label>
              <select className={SELECT_CLS} value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}>
                <option value="">—</option>
                {(trainers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.branch')}</Label>
              <select className={SELECT_CLS} value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">—</option>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('roomBookings.halls')}</Label>
              <select className={SELECT_CLS} value={form.hallId} onChange={(e) => setForm((f) => ({ ...f, hallId: e.target.value }))}>
                <option value="">—</option>
                {(halls ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.name} ({h.hallNumber})</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.date')}</Label>
              <Input type="date" className="nums" value={form.classDate} onChange={(e) => setForm((f) => ({ ...f, classDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('classes.startTime')}</Label>
                <Time12Input value={form.startTime} onValueChange={(value) => setForm((f) => ({ ...f, startTime: value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('classes.endTime')}</Label>
                <Time12Input value={form.endTime} onValueChange={(value) => setForm((f) => ({ ...f, endTime: value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('classes.maxCapacity')}</Label>
                <Input
                  className="nums"
                  value={form.maxCapacity}
                  disabled={personalOnly}
                  onChange={(e) => setForm((f) => ({ ...f, maxCapacity: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ft('common.price')}</Label>
                <Input className="nums" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ft('common.enroll')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>{ft('common.memberCode')}</Label>
            <Input className="nums" value={memberIdInput} onChange={(e) => setMemberIdInput(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void enroll()} disabled={saving}>{ft('common.enroll')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {ft('classes.roster')}
              {rosterClass ? ` — ${rosterClass.className}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {(rosterClass?.enrollments ?? [])
              .filter((e) => e.attendanceStatus !== 'cancelled')
              .map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <MemberCell
                      name={e.memberName}
                      code={e.memberCode}
                      memberId={e.memberId}
                    />
                    <p className="text-muted-foreground">{e.attendanceStatus}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => void markAttendance(e.memberId, 'attended')}>
                      {ft('classes.markPresent')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void markAttendance(e.memberId, 'absent')}>
                      {ft('classes.markAbsent')}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={saving} onClick={() => void unenroll(e.memberId)}>
                      {ft('classes.unenroll')}
                    </Button>
                  </div>
                </div>
              ))}
            {(rosterClass?.enrollments ?? []).filter((e) => e.attendanceStatus !== 'cancelled').length === 0 && (
              <p className="text-sm text-muted-foreground">{ft('common.noData')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
