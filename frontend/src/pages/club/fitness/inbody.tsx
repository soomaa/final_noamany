import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Plus, Upload, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
import { usePermission } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { api, apiError } from '@/lib/api';
import { useFileUpload, uploadUrl } from '@/components/employees/use-uploads';
import { localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { InbodyMeasurementRow } from '@/types/fitness';
import type { ClubMemberListItem } from '@/types/club';
import { RowActions } from './shared';

export function FitnessInbodyPage() {
  const ft = useFitnessT();
  const { user } = useAuth();
  const { superAdmin } = usePermission();
  const title = user?.job_title?.normalize('NFKD') ?? '';
  const todayOnly = !superAdmin && user?.level !== 3 && /(استقبال|ريسيبشن|ريسبشن|reception)/i.test(title) && !/(مدير|مشرف|رئيس|manager|supervisor|head)/i.test(title);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<InbodyMeasurementRow>(
    'club-inbody-measurements',
    params,
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const { data: nextFileNumber } = useQuery({
    queryKey: ['club-inbody-measurements', 'next-file-number'],
    enabled: open && editId == null,
    queryFn: async () => (await api.get<{ nextFileNumber: number }>('/club-inbody-measurements/next-file-number')).data.nextFileNumber,
  });
  const { upload, uploading } = useFileUpload();
  const [form, setForm] = useState({
    memberCode: '',
    measurementDate: localToday(),
    reportUrl: '',
  });

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
      reportUrl: '',
    });
    setOpen(true);
  };

  const openEdit = async (row: InbodyMeasurementRow) => {
    const { data: member } = await api.get<ClubMemberListItem>(`/club-members/measurement-operation-member/${row.memberId}`);
    setSelectedMember(member);
    setEditId(row.id);
    setForm({
      memberCode: row.memberCode ?? String(row.memberId),
      measurementDate: row.measurementDate,
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
    if (!selectedMember || !form.measurementDate || !form.reportUrl) {
      toast.error(!selectedMember ? ft('inbody.selectMemberFirst') : !form.reportUrl ? ft('inbody.uploadFileFirst') : ft('inbody.measurementDateRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: selectedMember.id,
        measurementDate: form.measurementDate,
        reportUrl: form.reportUrl,
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
      {
        accessorKey: 'memberCode',
        header: ft('common.memberCode'),
        cell: ({ getValue }) => <span className="font-mono" dir="ltr">{String(getValue() ?? '—')}</span>,
      },
      {
        accessorKey: 'memberName',
        header: ft('common.member'),
        cell: ({ getValue }) => <span className="font-medium">{String(getValue() ?? '—')}</span>,
      },
      {
        accessorKey: 'measurementDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'reportUrl',
        header: ft('inbody.details'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null | undefined;
          const href = uploadUrl(v);
          return href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              title={ft('inbody.viewFile')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              <FileText className="size-4" /> {ft('inbody.fileLabel')}
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
        title={ft('inbody.memberMeasurementsTitle')}
        description={ft('inbody.memberMeasurementsDescription')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('inbody.addMemberMeasurement')}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('inbody.editMemberMeasurement') : ft('inbody.addMemberMeasurement')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('inbody.fileNumber')}</Label>
              <Input className="nums" readOnly value={editId ? toArabicDigits(editId) : nextFileNumber ? toArabicDigits(nextFileNumber) : ft('inbody.determiningFileNumber')} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <MemberSearchCombobox
                forMeasurementOperation
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
              <Input type="date" className="nums" disabled={todayOnly} value={form.measurementDate} onChange={(e) => setForm((f) => ({ ...f, measurementDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('inbody.file')}</Label>
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
