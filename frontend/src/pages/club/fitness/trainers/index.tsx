import type { ColumnDef } from '@tanstack/react-table';
import { Clock3, ImagePlus, Loader2, Plus, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Time12Input } from '@/components/common/time-12-input';
import { trainerColor } from '@/components/club/scheduled-class-captain-chip';
import { uploadUrl, useFileUpload } from '@/components/employees/use-uploads';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList, useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import type { ClubTrainerRow } from '@/types/fitness';
import { RowActions } from '../shared';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type AvailabilitySlot = { weekday: number; startTime: string; endTime: string };
const WEEKDAYS = [uiStatic('الأحد'), uiStatic('الاثنين'), uiStatic('الثلاثاء'), uiStatic('الأربعاء'), uiStatic('الخميس'), uiStatic('الجمعة'), uiStatic('السبت')];
const emptySlot = (): AvailabilitySlot => ({ weekday: 0, startTime: '09:00', endTime: '17:00' });
/** The server joins the chips into one VarChar(200) column with `، ` and splits it on these. */
const SPECIALIZATION_SEPARATOR = '، ';
const SPECIALIZATIONS_MAX_LENGTH = 200;
const SPECIALIZATION_FORBIDDEN = /[،,/|]/;

/** Legacy rows only carry the single `specialization` string — split it so old data still shows chips. */
function rowSpecializations(row: ClubTrainerRow): string[] {
  if (Array.isArray(row.specializations) && row.specializations.length) {
    return row.specializations.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(row.specialization ?? '')
    .split(SPECIALIZATION_FORBIDDEN)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Round trainer portrait with replace/clear — the member app shows trainers as circular cards. */
function TrainerPhotoField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { ui } = useLocale();
  const { upload, uploading } = useFileUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = uploadUrl(value);

  const pick = async (file: File | null) => {
    if (!file) return;
    // `trainers` is a public-media category, so the stored reference renders in the app.
    const path = await upload('trainers', file);
    if (path) onChange(path);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-dashed bg-muted/40">
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <UserRound className="size-8 text-muted-foreground" />
        )}
      </span>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" permissionAction={null} disabled={uploading} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-4" />
            {previewUrl ? ui('تغيير الصورة') : ui('رفع صورة')}
          </Button>
          {previewUrl ? (
            <Button type="button" variant="ghost" permissionAction={null} onClick={() => onChange('')}>
              <X className="size-4" />
              {ui('مسح الصورة')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{ui('صورة مربعة وواضحة — تظهر دائرية داخل التطبيق.')}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
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
 * Chip editor for التخصصات: one field plus إضافة (Enter adds too); every value becomes a
 * removable chip. Blanks, duplicates and the separators the server splits on are refused inline.
 */
function SpecializationsField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
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
    if ([...value, next].join(SPECIALIZATION_SEPARATOR).length > SPECIALIZATIONS_MAX_LENGTH) {
      setHint(ui('التخصصات مجتمعة أطول من المسموح — اختصرها أو احذف واحدًا'));
      return;
    }
    onChange([...value, next]);
    setDraft('');
    setHint(null);
  };

  return (
    <div className="space-y-2">
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
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <Button type="button" variant="outline" permissionAction={null} onClick={add}>
          <Plus className="size-4" /> {ui('إضافة')}
        </Button>
      </div>
      {hint ? <p className="text-xs text-destructive">{hint}</p> : null}
      {value.length ? (
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1 text-sm">
              {item}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${ui('حذف التخصص')} ${item}`}
                onClick={() => onChange(value.filter((entry) => entry !== item))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{ui('لم تُضف تخصصات بعد. تظهر التخصصات للأعضاء في ملف المدرب.')}</p>
      )}
    </div>
  );
}

function invalidAvailability(slots: AvailabilitySlot[]): string | null {
  for (const slot of slots) if (!slot.startTime || !slot.endTime || slot.endTime <= slot.startTime) return uiStatic('وقت النهاية يجب أن يكون بعد البداية');
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (slots.some((other, otherIndex) => otherIndex !== index && other.weekday === slot.weekday && slot.startTime < other.endTime && slot.endTime > other.startTime)) return uiStatic('يوجد تداخل في مواعيد اليوم نفسه');
  }
  return null;
}

export function FitnessTrainersPage({
  permissionResource = 'club.fitness.trainers',
  embedded = false,
}: {
  permissionResource?: string;
  embedded?: boolean;
} = {}) {
  const { ui } = useLocale();
  const ft = useFitnessT();
  const { can } = usePermission();
  const canUpdate = can(`${permissionResource}:update`);
  const canDelete = can(`${permissionResource}:delete`);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubTrainerRow>('club-trainers', params);
  const { data: employees } = useArrayResource<{ id: number; name: string }>('employees');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    email: '',
    phone: '',
    specializations: [] as string[],
    color: '',
    experience: '',
    bio: '',
    imageUrl: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-trainers/${id}`),
    { success: ft('common.success'), invalidate: ['club-trainers'] },
  );

  const openEdit = async (row: ClubTrainerRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      employeeId: row.employeeId != null ? String(row.employeeId) : '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      specializations: rowSpecializations(row),
      color: row.color ?? '',
      experience: row.experience ?? '',
      bio: row.bio ?? '',
      imageUrl: row.imageUrl ?? '',
    });
    setOpen(true);
    setAvailabilityLoading(true);
    try {
      const { data: slots } = await api.get<Array<AvailabilitySlot & { isActive?: boolean }>>(`/club-trainers/${row.id}/availability`);
      setAvailability((Array.isArray(slots) ? slots : []).filter((slot) => slot.isActive !== false).map(({ weekday, startTime, endTime }) => ({ weekday, startTime: startTime.slice(0, 5), endTime: endTime.slice(0, 5) })));
    } catch (error) { toast.error(apiError(error)); setAvailability([]); }
    finally { setAvailabilityLoading(false); }
  };

  const save = async () => {
    if (!editId || !canUpdate) return;
    if (!form.name.trim()) {
      toast.error(ft('common.name'));
      return;
    }
    const availabilityError = invalidAvailability(availability);
    if (availabilityError) { toast.error(availabilityError); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        // The list wins over the legacy single column; an empty list clears it.
        specializations: form.specializations,
        // Always sent so clearing the photo persists.
        imageUrl: form.imageUrl || null,
        // Empty clears it back to the derived reception/calendar colour.
        color: form.color || null,
        experience: form.experience || undefined,
        bio: form.bio || undefined,
      };
      const trainerId = editId;
      await api.put<ClubTrainerRow>(`/club-trainers/${trainerId}`, payload);
      await api.put(`/club-trainers/${trainerId}/availability`, { slots: availability });
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubTrainerRow>[]>(
    () => [
      {
        accessorKey: 'imageUrl',
        header: ui('الصورة'),
        cell: ({ getValue }) => {
          const src = uploadUrl(getValue() as string | null);
          return src ? (
            <img src={src} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-4" />
            </span>
          );
        },
      },
      { accessorKey: 'name', header: ft('common.name') },
      {
        accessorKey: 'specialization',
        header: ft('trainers.specialization'),
        cell: ({ row }) => {
          const chips = rowSpecializations(row.original);
          return chips.length ? (
            <div className="flex flex-wrap gap-1">
              {chips.map((chip) => <span key={chip} className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs">{chip}</span>)}
            </div>
          ) : '—';
        },
      },
      { accessorKey: 'phone', header: ft('common.search'), cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="nums">{formatDigits(v)}</span> : '—';
      }},
      {
        accessorKey: 'ratingAvg',
        header: ft('trainers.rating'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ft('common.status'),
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'suspended'} />,
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={canUpdate ? () => void openEdit(row.original) : undefined}
            onDelete={canDelete ? () =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            : undefined}
          />
        ),
      },
    ],
    [ft, ui, canUpdate, canDelete, deleteMutation],
  );

  return (
    <div className="space-y-6">
      {!embedded ? <PageHeader title={ft('trainers.title')} /> : null}
      <DataTable
        exportSource={{ resource: 'club-trainers', params }}
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ft('common.edit')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('trainers.employee')}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.employeeId}
                onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">—</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{ui('صورة المدرب')}</Label>
              <TrainerPhotoField value={form.imageUrl} onChange={(imageUrl) => setForm((f) => ({ ...f, imageUrl }))} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{ft('trainers.specialization')}</Label>
              <SpecializationsField value={form.specializations} onChange={(specializations) => setForm((f) => ({ ...f, specializations }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ui('لون الكابتن')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={ui('لون الكابتن')}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background"
                  value={form.color || trainerColor(editId ?? 0)}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value.toUpperCase() }))}
                />
                <Input dir="ltr" placeholder="#2563EB" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value.toUpperCase() }))} />
              </div>
              <p className="text-xs text-muted-foreground">{ui('يظهر به الكابتن في شاشة تسجيل الدخول والتقويم. اتركه فارغًا للون تلقائي.')}</p>
            </div>
            <div className="grid gap-2">
              <Label>{ft('trainers.experience')}</Label>
              <Input value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input className="nums" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="grid gap-2 sm:col-span-2"><div className="flex items-start justify-between gap-3"><div><Label className="flex items-center gap-2"><Clock3 className="size-4 text-primary" /> {ui('أيام التواجد')}</Label><p className="mt-1 text-xs text-muted-foreground">{ui('هذه المواعيد مستقلة عن جدول الحصص وتظهر للأعضاء في ملف المدرب.')}</p></div><Button type="button" variant="outline" size="sm" disabled={availabilityLoading} onClick={() => setAvailability((current) => [...current, emptySlot()])}><Plus className="size-4" /> {ui('إضافة موعد')}</Button></div>{availabilityLoading ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{ui('جارٍ تحميل المواعيد…')}</p> : availability.length ? <div className="space-y-2">{availability.map((slot, index) => <div key={`${index}-${slot.weekday}-${slot.startTime}`} className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] sm:items-end"><div className="grid gap-1"><Label className="text-xs">{ui('اليوم')}</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={slot.weekday} onChange={(event) => setAvailability((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item))}>{WEEKDAYS.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}</select></div><div className="grid gap-1"><Label className="text-xs">{ui('من')}</Label><Time12Input value={slot.startTime} onValueChange={(startTime) => setAvailability((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startTime } : item))} /></div><div className="grid gap-1"><Label className="text-xs">{ui('إلى')}</Label><Time12Input value={slot.endTime} onValueChange={(endTime) => setAvailability((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endTime } : item))} /></div><Button type="button" variant="ghost" size="icon" aria-label={ui('حذف موعد التواجد')} onClick={() => setAvailability((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4 text-destructive" /></Button></div>)}</div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{ui('لم تُحدد أيام تواجد بعد. يمكن حفظ المدرب بدون مواعيد وإضافتها لاحقًا.')}</p>}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            {canUpdate && <Button variant="brand" onClick={() => void save()} disabled={saving || availabilityLoading}>{ft('common.save')}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
