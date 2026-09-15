import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, Plus, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useFileUpload, uploadUrl } from '@/components/employees/use-uploads';
import { localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { InbodyMeasurementRow } from '@/types/fitness';
import type { ClubMemberListItem } from '@/types/club';
import { InbodyMemberDetailDialog } from './inbody-member-detail-dialog';
import { RowActions, memberColumnDef } from './shared';

function numCell(v: number | null | undefined) {
  return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
}

export function FitnessInbodyPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyMeasurementRow>(
    'club-inbody-measurements',
    params,
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailMemberId, setDetailMemberId] = useState<number | null>(null);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const { upload, uploading } = useFileUpload();
  const [form, setForm] = useState({
    memberCode: '',
    measurementDate: localToday(),
    weight: '',
    heightCm: '',
    bodyFat: '',
    muscleMass: '',
    bmi: '',
    notes: '',
    reportUrl: '',
  });

  const computedBmi = (() => {
    const w = Number(form.weight);
    const h = Number(form.heightCm);
    if (!w || !h) return '';
    const bmi = w / ((h / 100) * (h / 100));
    return String(Math.round(bmi * 100) / 100);
  })();

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-inbody-measurements/${id}`),
    { success: ft('common.success'), invalidate: ['club-inbody-measurements'] },
  );

  const openCreate = () => {
    setEditId(null);
    setSelectedMember(null);
    setForm({
      memberCode: '',
      measurementDate: localToday(),
      weight: '',
      heightCm: '',
      bodyFat: '',
      muscleMass: '',
      bmi: '',
      notes: '',
      reportUrl: '',
    });
    setOpen(true);
  };

  const openEdit = async (row: InbodyMeasurementRow) => {
    const { data: member } = await api.get<ClubMemberListItem>(`/club-members/${row.memberId}`);
    setSelectedMember(member);
    setEditId(row.id);
    setForm({
      memberCode: row.memberCode ?? String(row.memberId),
      measurementDate: row.measurementDate,
      weight: row.weight != null ? String(row.weight) : '',
      heightCm: row.heightCm != null ? String(row.heightCm) : '',
      bodyFat: row.bodyFat != null ? String(row.bodyFat) : '',
      muscleMass: row.muscleMass != null ? String(row.muscleMass) : '',
      bmi: row.bmi != null ? String(row.bmi) : '',
      notes: row.notes ?? '',
      reportUrl: row.reportUrl ?? '',
    });
    setOpen(true);
  };

  const onPickReport = async (file: File | undefined) => {
    if (!file) return;
    const path = await upload('inbody', file);
    if (path) setForm((f) => ({ ...f, reportUrl: path }));
  };

  const save = async () => {
    if (!selectedMember || !form.measurementDate) {
      toast.error(ft('common.member'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: selectedMember.id,
        measurementDate: form.measurementDate,
        weight: form.weight ? Number(form.weight) : undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        muscleMass: form.muscleMass ? Number(form.muscleMass) : undefined,
        bmi: computedBmi ? Number(computedBmi) : undefined,
        notes: form.notes || undefined,
        reportUrl: form.reportUrl || null,
      };
      if (editId) await api.put(`/club-inbody-measurements/${editId}`, payload);
      else await api.post('/club-inbody-measurements', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<InbodyMeasurementRow>[]>(
    () => [
      memberColumnDef<InbodyMeasurementRow>(ft('common.member')),
      {
        accessorKey: 'measurementDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'weight',
        header: ft('progress.weight'),
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'heightCm',
        header: ft('inbody.height'),
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'bmi',
        header: ft('inbody.bmi'),
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'bodyFat',
        header: ft('progress.bodyFat'),
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'muscleMass',
        header: ft('inbody.muscleMass'),
        cell: ({ getValue }) => numCell(getValue() as number | null),
      },
      {
        accessorKey: 'notes',
        header: ft('common.notes'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? <span className="max-w-[120px] truncate">{v}</span> : '—';
        },
      },
      {
        accessorKey: 'reportUrl',
        header: ft('inbody.report'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null | undefined;
          const href = uploadUrl(v);
          return href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              title={ft('inbody.viewReport')}
              className="inline-flex text-brand"
            >
              <FileText className="size-4" />
            </a>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title={ft('inbody.viewDetails')}
              onClick={() => setDetailMemberId(row.original.memberId)}
            >
              <Eye className="size-4" />
            </Button>
            <RowActions
              editLabel={ft('common.edit')}
              deleteLabel={ft('common.delete')}
              onEdit={() => void openEdit(row.original)}
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
    [ft, deleteMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('inbody.title')}
        description={ft('inbody.searchMemberHint')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button>
        }
      />
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

      <InbodyMemberDetailDialog
        memberId={detailMemberId}
        open={detailMemberId != null}
        onOpenChange={(v) => { if (!v) setDetailMemberId(null); }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.memberCode')}</Label>
              <MemberSearchCombobox
                selectedMember={selectedMember}
                onSelect={(member) => {
                  setSelectedMember(member);
                  setForm((current) => ({ ...current, memberCode: member.memberCode }));
                }}
                onClear={() => {
                  setSelectedMember(null);
                  setForm((current) => ({ ...current, memberCode: '' }));
                }}
                disabled={Boolean(editId)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.date')}</Label>
              <Input type="date" className="nums" value={form.measurementDate} onChange={(e) => setForm((f) => ({ ...f, measurementDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('progress.weight')}</Label>
                <Input className="nums" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbody.height')}</Label>
                <Input className="nums" value={form.heightCm} onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbody.bmi')}</Label>
                <Input className="nums" readOnly value={computedBmi || form.bmi} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('progress.bodyFat')}</Label>
                <Input className="nums" value={form.bodyFat} onChange={(e) => setForm((f) => ({ ...f, bodyFat: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbody.muscleMass')}</Label>
                <Input className="nums" value={form.muscleMass} onChange={(e) => setForm((f) => ({ ...f, muscleMass: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('inbody.report')}</Label>
              {form.reportUrl ? (
                <div className="flex items-center gap-2">
                  <a
                    href={uploadUrl(form.reportUrl) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-brand underline"
                  >
                    <FileText className="size-4" /> {ft('inbody.viewReport')}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={ft('common.delete')}
                    onClick={() => setForm((f) => ({ ...f, reportUrl: '' }))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  <Upload className="size-4" />
                  {uploading ? ft('inbody.uploading') : ft('inbody.uploadReport')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void onPickReport(e.target.files?.[0])}
                  />
                </label>
              )}
              <span className="text-xs text-muted-foreground">{ft('inbody.reportHint')}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving || uploading}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
